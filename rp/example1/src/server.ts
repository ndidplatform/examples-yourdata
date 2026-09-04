import http from 'http';
import express from 'express';
import type { Request, Response } from 'express';
import morgan from 'morgan';
import { Server as SocketIOServer } from 'socket.io';

import * as API from './api';
import { eventEmitter as ndidCallbackEvent } from './callbackHandler';
import * as config from './config';
import type {
  NdidCallback,
  YourDataRequestStatusCallback,
  YourDataDecryptionKeyRetryRequestStatusCallback,
  PreConsentCreateBody,
  CompleteConsentCreateBody,
  DataRequestCreateBody,
  RevokeCreateBody,
  RetryDecryptionKeyBody,
  YourDataTokenPayload,
  YourDataAccountItem,
} from './types';

// Import callback handler to start callback server
import './callbackHandler';

process.on('unhandledRejection', (reason: unknown) => {
  console.error('Unhandled Rejection:', reason);
});

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(express.urlencoded({ extended: false, limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('combined'));

// Global CORS — allow the Vite dev origin (and any other browser origin)
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type, Authorization');
  if (_req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

// ─── WebSocket ────────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log('Frontend connected via WebSocket');

  socket.on('disconnect', () => {
    console.log('Frontend disconnected');
  });
});

// ─── Broadcast NDID callbacks to frontend ────────────────────────────────────

ndidCallbackEvent.on('ndid_callback', (data: NdidCallback) => {
  console.log('NDID callback:', data.type, data.request_id);
  io.emit('ndid_update', data);
});

ndidCallbackEvent.on(
  'yourdata_callback',
  (data: YourDataRequestStatusCallback) => {
    console.log('Your Data callback:', data.status, data.request_id);
    io.emit('yourdata_update', data);
  },
);

ndidCallbackEvent.on(
  'yourdata_retry_callback',
  (data: YourDataDecryptionKeyRetryRequestStatusCallback) => {
    console.log('Your Data retry callback:', data.status, data.request_id);
    io.emit('yourdata_retry_update', data);
  },
);

// ─── Token Store ──────────────────────────────────────────────────────────────
// The RP server keeps consent tokens server-side and never forwards them to
// the front end, which only ever sees opaque ids it already has (dpId /
// accountId). An in-memory Map stands in for a real session/database store.

// Pre-consent as_token(s), keyed by pre-consent request_id. The same AS node
// can issue more than one token per request (e.g. serving both deposit and
// credit card pre-consent together), so each entry also records the full
// account item objects it covers — complete-consent resolves the right
// token by matching as_node_id plus accountId overlap, and later matches
// each returned consent_token back to an account by visible_identifier.
interface PreConsentTokenEntry {
  asNodeId: string;
  token: string;
  accounts: YourDataAccountItem[];
}
const asTokenStore = new Map<string, PreConsentTokenEntry[]>();

interface ConsentTokenEntry {
  serviceIds?: string[];
  token: string;
  tokenId?: string;
  asNodeId?: string;
}
const consentTokenStore = new Map<string, ConsentTokenEntry[]>();

const completeConsentCandidatesStore = new Map<string, YourDataAccountItem[]>();

function resolveConsentToken(accountId: string, serviceId?: string): string | undefined {
  const entries = consentTokenStore.get(accountId) ?? [];
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (!e.serviceIds || (serviceId !== undefined && e.serviceIds.includes(serviceId))) {
      return e.token;
    }
  }
  return undefined;
}

/**
 * Every distinct token_id issued for accountId, across all its services,
 * paired with the as_node_id that issued it. Used only by revoke — the raw
 * JWT is never resent; the AS looks up its own token by token_id instead.
 */
function allConsentTokenRefs(accountId: string): { tokenId: string; asNodeId?: string }[] {
  return (consentTokenStore.get(accountId) ?? [])
    .filter((e): e is ConsentTokenEntry & { tokenId: string } => !!e.tokenId)
    .map((e) => ({ tokenId: e.tokenId, asNodeId: e.asNodeId }));
}

function matchAccountByToken(
  payload: YourDataTokenPayload | null,
  candidates: YourDataAccountItem[],
): YourDataAccountItem | undefined {
  const claim = payload?.sub_identity_list?.[0];
  if (!claim) return candidates.length === 1 ? candidates[0] : undefined;
  // The AS reveals the real (unmasked) account number in visible_identifier
  // on the issued consent token, which will never equal the masked
  // visible_identifier candidates were selected with at pre-consent — so
  // match on namespace + identifier_extension instead, which are unchanged
  // between pre-consent and complete-consent.
  const byNamespace = candidates.filter((c) => c.namespace === claim.namespace);
  if (byNamespace.length <= 1) return byNamespace[0];
  return (
    byNamespace.find((c) => (c.identifier_extension ?? undefined) === (claim.identifier_extension ?? undefined)) ??
    byNamespace[0]
  );
}

function decodeTokenPayload(token: string): YourDataTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

/** service_version the token authorizes for a given service_id, if any. */
function resolveServiceVersion(payload: YourDataTokenPayload | null, serviceId: string): string | undefined {
  return payload?.service_id_list?.find((s) => s.service_id === serviceId)?.service_version;
}

// ─── Pre-consent Flow ─────────────────────────────────────────────────────────
// Uses standard NDID consent (on-chain with IDP). service_id = pre_consent_xxx
// mode: 2, request_type: 'AuthenOnly', min_ial: 2.3, min_aal: 2.1, min_idp: 1, min_as: 0.

app.post('/pre-consent/create', async (req: Request, res: Response) => {
  const {
    namespace,
    identifier,
    data_request_list,
    idp_id_list,
    min_idp,
    request_timeout,
  } = req.body as PreConsentCreateBody;

  const referenceId = `pre-consent-${Date.now()}`;

  const requestList = data_request_list.map((item) => ({
    service_id: item.service_id,
    as_id_list: item.as_id_list ?? [],
    min_as: item.min_as ?? 0,
    request_params: item.request_params,
  }));

  try {
    // Mode 2 + request_type 'AuthenOnly': identity is confirmed via the IdP,
    // no data is exchanged as part of this on-chain request itself — the
    // actual account/data exchange happens over the off-chain YourData API
    // (pre_consent_xxx service calls to the AS) once the IdP has responded.
    const result = await API.createNdidRequest({
      mode: 2,
      namespace,
      identifier,
      reference_id: referenceId,
      idp_id_list: idp_id_list ?? [],
      callback_url: `http://${config.ndidApiCallbackIp}:${config.ndidApiCallbackPort}/rp/request/${referenceId}`,
      data_request_list: requestList,
      request_message: `Please consent to share your data (REF: ${referenceId})`,
      min_ial: 2.3,
      min_aal: 2.1,
      min_idp: min_idp ?? 1,
      request_type: 'AuthenOnly',
      request_timeout: request_timeout ?? 300, // 5 minutes
    });

    res.status(200).json({
      request_id: result.request_id,
      reference_id: referenceId,
    });
  } catch (error) {
    console.error('Error creating pre-consent request:', error);
    res.status(500).json(error);
  }
});

interface PreConsentDataItem {
  source_node_id: string;
  service_id: string;
  data: string;
  [key: string]: unknown;
}

app.get('/pre-consent/data/:requestId', async (req: Request, res: Response) => {
  const requestId = req.params.requestId as string;
  try {
    const data = await API.getNdidRequestData(requestId);

    if (Array.isArray(data)) {
      // Rebuilt on every poll — getNdidRequestData already returns the full
      // accumulated set of AS responses so far, not just new ones.
      const entries: PreConsentTokenEntry[] = [];
      const sanitized = (data as PreConsentDataItem[]).map((item) => {
        try {
          const parsed = JSON.parse(item.data) as {
            authorization?: string;
            sub_identity_list?: YourDataAccountItem[];
            [key: string]: unknown;
          };
          if (typeof parsed.authorization === 'string') {
            entries.push({
              asNodeId: item.source_node_id,
              token: parsed.authorization,
              accounts: parsed.sub_identity_list ?? [],
            });
            const { authorization: _authorization, ...rest } = parsed;
            return { ...item, data: JSON.stringify(rest) };
          }
        } catch {
          // Not JSON (or no authorization field) — return unchanged.
        }
        return item;
      });
      asTokenStore.set(requestId, entries);
      res.status(200).json(sanitized);
      return;
    }

    res.status(200).json(data);
  } catch (error) {
    console.error('Error getting pre-consent data:', error);
    res.status(500).json(error);
  }
});

// ─── Complete-consent Flow ────────────────────────────────────────────────────
// Uses Your Data API. No IDP involvement. service_id = complete_consent

app.post('/complete-consent/create', async (req: Request, res: Response) => {
  const { as_node_id, namespace, identifier, pre_consent_request_id, selected_accounts, request_timeout } =
    req.body as CompleteConsentCreateBody;

  const referenceId = `complete-consent-${Date.now()}`;

  // Resolve the as_token server-side instead of receiving it from the client.
  const submittedAccountIds = new Set((selected_accounts ?? []).map((a) => a.identifier));
  const candidateEntries = (asTokenStore.get(pre_consent_request_id) ?? []).filter(
    (entry) => entry.asNodeId === as_node_id,
  );
  // Empty selected_accounts means "consent to all accounts" for whichever
  // single token this AS node issued — otherwise disambiguate by accountId.
  const tokenEntry =
    submittedAccountIds.size > 0
      ? candidateEntries.find((entry) => entry.accounts.some((a) => submittedAccountIds.has(a.identifier)))
      : candidateEntries[0];
  const authorization = tokenEntry?.token;
  if (!authorization) {
    res.status(400).json({
      error: {
        message: `No pre-consent token found for as_node_id "${as_node_id}" on request "${pre_consent_request_id}" covering the selected account(s). Call GET /pre-consent/data/:requestId first.`,
      },
    });
    return;
  }

  const service_version = resolveServiceVersion(
    decodeTokenPayload(authorization),
    '900.complete_consent_001',
  );

  try {
    const result = await API.createYourDataRequest({
      service_id: '900.complete_consent_001',
      ...(service_version ? { service_version } : {}),
      as_node_id,
      reference_id: referenceId,
      callback_url: `http://${config.ndidApiCallbackIp}:${config.ndidApiCallbackPort}/yourdata/rp/request_status_update`,
      namespace,
      identifier,
      // Per spec (YourData_Schema_Common /YourData/service/complete_consent),
      // request_params is a JSON-stringified array of the full selected account item
      // objects (namespace, identifier, visible_identifier, identifier_extension)
      // returned from pre-consent. Empty array [] = consent to all accounts.
      request_params: JSON.stringify(
        selected_accounts && selected_accounts.length > 0 ? selected_accounts : [],
      ),
      authorization,
      request_timeout: request_timeout ?? 900, // 15 minutes
    });

    completeConsentCandidatesStore.set(
      result.request_id,
      selected_accounts && selected_accounts.length > 0 ? selected_accounts : tokenEntry.accounts,
    );

    res.status(200).json({
      request_id: result.request_id,
      reference_id: referenceId,
    });
  } catch (error) {
    console.error('Error creating complete-consent request:', error);
    res.status(500).json(error);
  }
});

interface CompleteConsentDataItem {
  source_node_id: string;
  service_id: string;
  data: string;
  [key: string]: unknown;
}

app.get(
  '/complete-consent/data/:requestId',
  async (req: Request, res: Response) => {
    const requestId = req.params.requestId as string;
    try {
      // Despite the declared YourDataItem (singular) return type, a
      // multi-AS request actually responds with an array.
      const data = (await API.getYourDataRequestData(requestId)) as unknown;
      const items = Array.isArray(data) ? (data as CompleteConsentDataItem[]) : [data as CompleteConsentDataItem];
      const candidates = completeConsentCandidatesStore.get(requestId) ?? [];
      const sanitized = items.map((item) => {
        let tokens: unknown;
        try {
          tokens = JSON.parse(item.data);
        } catch {
          return item;
        }
        if (!Array.isArray(tokens) || tokens.length === 0) return item;

        const resolvedAccountIds = new Set<string>();
        for (const token of tokens) {
          if (typeof token !== 'string') continue;
          const payload = decodeTokenPayload(token);
          const account = matchAccountByToken(payload, candidates);
          if (!account) {
            console.warn(`Could not match a returned consent_token to any candidate account for request ${requestId}`);
            continue;
          }
          const serviceIds = payload?.service_id_list?.map((s) => s.service_id);
          const existing = consentTokenStore.get(account.identifier) ?? [];
          existing.push({ token, tokenId: payload?.token_id, asNodeId: payload?.as_node_id, serviceIds });
          consentTokenStore.set(account.identifier, existing);
          resolvedAccountIds.add(account.identifier);
        }

        return { ...item, data: JSON.stringify(Array.from(resolvedAccountIds)) };
      });

      res.status(200).json(Array.isArray(data) ? sanitized : sanitized[0]);
    } catch (error) {
      console.error('Error getting complete-consent data:', error);
      res.status(500).json(error);
    }
  },
);

// ─── Data Request Flow ────────────────────────────────────────────────────────
// Uses Your Data API. No IDP involvement. service_id = <dataset>_<api>

app.post('/data-request/create', async (req: Request, res: Response) => {
  const {
    service_id,
    as_node_id,
    namespace,
    identifier,
    account_id,
    request_timeout,
    request_params,
    service_extension,
  } = req.body as DataRequestCreateBody;

  const referenceId = `data-request-${Date.now()}`;

  // Resolve the consent_token server-side from accountId + service_id — an
  // account can have more than one token when the AS split a one_time
  // consent per service_id, so service_id disambiguates which one to use.
  const authorization = resolveConsentToken(account_id, service_id);
  if (!authorization) {
    res.status(400).json({
      error: { message: `No consent token found for account "${account_id}" and service "${service_id}". Complete consent for this account/service first.` },
    });
    return;
  }

  const service_version = resolveServiceVersion(decodeTokenPayload(authorization), service_id);

  try {
    const result = await API.createYourDataRequest({
      service_id,
      ...(service_version ? { service_version } : {}),
      as_node_id,
      reference_id: referenceId,
      callback_url: `http://${config.ndidApiCallbackIp}:${config.ndidApiCallbackPort}/yourdata/rp/request_status_update`,
      namespace,
      identifier,
      request_params: request_params ?? JSON.stringify({}),
      authorization,
      request_timeout: request_timeout ?? 900, // 15 minutes
      ...(service_extension ? { service_extension } : {}),
    });

    res.status(200).json({
      request_id: result.request_id,
      reference_id: referenceId,
    });
  } catch (error) {
    console.error('Error creating data request:', error);
    res.status(500).json(error);
  }
});

app.get(
  '/data-request/data/:requestId',
  async (req: Request, res: Response) => {
    try {
      const data = await API.getYourDataRequestData(
        req.params.requestId as string,
      );
      res.status(200).json(data);
    } catch (error) {
      console.error('Error getting request data:', error);
      res.status(500).json(error);
    }
  },
);

app.post(
  '/data-request/retry-decryption-key',
  async (req: Request, res: Response) => {
    const { request_id, request_timeout } = req.body as RetryDecryptionKeyBody;

    const referenceId = `retry-decrypt-${Date.now()}`;

    try {
      await API.retryDecryptionKeyRequest({
        request_id,
        reference_id: referenceId,
        callback_url: `http://${config.ndidApiCallbackIp}:${config.ndidApiCallbackPort}/yourdata/rp/data_decryption_key_retry_request_status_update`,
        request_timeout: request_timeout ?? 900, // 15 minutes, matches data-request default
      });
      res.status(204).end();
    } catch (error) {
      console.error('Error retrying decryption key request:', error);
      res.status(500).json(error);
    }
  },
);

// ─── Revoke Flow ──────────────────────────────────────────────────────────────
// Uses standard NDID consent (on-chain with IDP). service_id = revoke_consent
// mode: 2, request_type: 'AuthenOnly', min_ial: 2.3, min_aal: 2.1, min_idp: 1, min_as: 0.

app.post('/revoke/create', async (req: Request, res: Response) => {
  const {
    namespace,
    identifier,
    account_ids,
    idp_id_list,
    min_idp,
    request_timeout,
  } = req.body as RevokeCreateBody;

  const referenceId = `revoke-${Date.now()}`;

  const tokenRefs = account_ids.flatMap((accountId) => allConsentTokenRefs(accountId));
  const token_ids = tokenRefs.map((r) => r.tokenId);

  if (token_ids.length === 0) {
    res.status(400).json({
      error: { message: 'No consent tokens found for the given account_ids.' },
    });
    return;
  }

  // as_id_list must name the AS node(s) that actually issued the tokens
  // being revoked, read from the as_node_id stored alongside each token_id
  // when the RP first decoded the token (never re-decoded here — token_ids
  // are opaque UUIDs, not JWTs).
  const as_id_list = Array.from(
    new Set(tokenRefs.map((r) => r.asNodeId).filter((asNodeId): asNodeId is string => !!asNodeId)),
  );

  try {
    // Mode 2 + request_type 'AuthenOnly': identity is confirmed via the IdP,
    // no data is exchanged as part of this on-chain request itself — the AS
    // acknowledges which tokens it revoked over the off-chain YourData API
    // (revoke_consent_001) once the IdP has responded.
    const result = await API.createNdidRequest({
      mode: 2,
      namespace,
      identifier,
      reference_id: referenceId,
      idp_id_list: idp_id_list ?? [],
      callback_url: `http://${config.ndidApiCallbackIp}:${config.ndidApiCallbackPort}/rp/request/${referenceId}`,
      data_request_list: [
        {
          service_id: '900.revoke_consent_001',
          as_id_list,
          min_as: 0,
          // Per spec (YourData_Schema_Common), revoke request_params is a JSON-stringified
          // array of token_id strings: '["token-1","token-2"]'
          request_params: JSON.stringify(token_ids),
        },
      ],
      request_message: `Please approve revoking your consent (REF: ${referenceId})`,
      min_ial: 2.3,
      min_aal: 2.1,
      min_idp: min_idp ?? 1,
      request_type: 'AuthenOnly',
      request_timeout: request_timeout ?? 86400,
    });

    res.status(200).json({
      request_id: result.request_id,
      reference_id: referenceId,
    });
  } catch (error) {
    console.error('Error creating revoke request:', error);
    res.status(500).json(error);
  }
});

// ─── Identity / IDP Discovery ─────────────────────────────────────────────────
// Front-end calls this to get the list of IDP nodes registered for a user,
// then passes the chosen idp_id in idp_id_list when creating a pre-consent
// or revoke request.

app.options('/identity/:namespace/:identifier', (_req: Request, res: Response) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type');
  res.status(204).end();
});

app.get(
  '/identity/:namespace/:identifier',
  async (req: Request, res: Response) => {
    try {
      const namespace = req.params.namespace as string;
      const identifier = req.params.identifier as string;
      const data = await API.getIdentityIdpList(namespace, identifier);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(200).json(data);
    } catch (error) {
      console.error('Error getting identity IDP list:', error);
      res.status(500).json(error);
    }
  },
);

// ─── AS Service Discovery ─────────────────────────────────────────────────────
// Thin proxy over GET /utility/as/{service_id} — lets the front end check
// which AS nodes are actually registered for a service before showing them
// as pickable providers, instead of trusting a static list unconditionally.

app.get(
  '/service-as-list/:service_id',
  async (req: Request, res: Response) => {
    try {
      const serviceId = req.params.service_id as string;
      const data = await API.getServiceAsList(serviceId);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(200).json(data);
    } catch (error) {
      console.error('Error getting AS list for service:', error);
      res.status(500).json(error);
    }
  },
);

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', service: 'rp-example' });
});

// ─── Start Server ─────────────────────────────────────────────────────────────

server.listen(config.serverPort, () => {
  console.log(`RP example server running on port ${config.serverPort}`);
});

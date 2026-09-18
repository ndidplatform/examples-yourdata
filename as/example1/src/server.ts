import express from 'express';
import type { Request, Response } from 'express';
import morgan from 'morgan';

import * as API from './api';
import { eventEmitter as ndidCallbackEvent } from './callbackHandler';
import * as config from './config';
import type {
  NdidAsCallback,
  NdidDataRequestCallback,
  NdidSendDataResultCallback,
  NdidServiceUpdateResultCallback,
  NdidRequestStatusCallback,
  YourDataAsDataRequestCallback,
  YourDataAsRequestStatusCallback,
  SubIdentity,
  ConsentIntent,
  YourDataUsageType,
  NdidApiErrorBody,
  DateRangeParams,
} from './types';

// Import callback handler to start callback server
import './callbackHandler';

process.on('unhandledRejection', (reason: unknown) => {
  console.error('Unhandled Rejection:', reason);
});

// ─── Register Services on Startup ────────────────────────────────────────────

async function registerServices(): Promise<void> {
  // Register standard NDID services handled by this AS (deposit + credit card)
  // Service IDs per NDID_YourData_ErrorCodes-ServiceID-ServiceExtension sheet "3_Service ID"
  const ndidServices = [
    '900.pre_consent_deposit_001',
    '900.pre_consent_cardpayment_001',
    '900.revoke_consent_001',
  ];

  for (const service_id of ndidServices) {
    for (;;) {
      try {
        const referenceId = `register-${service_id}-${Date.now()}`;
        await API.registerNdidService({
          service_id,
          reference_id: referenceId,
          callback_url: `http://${config.ndidApiCallbackIp}:${config.ndidApiCallbackPort}/as/service`,
          min_ial: 2.3,
          min_aal: 2.1,
          url: `http://${config.ndidApiCallbackIp}:${config.ndidApiCallbackPort}/as/service/${service_id}`,
          supported_namespace_list: ['citizen_id'],
        });
        console.log(`Registered NDID service: ${service_id}`);
        break;
      } catch (error: unknown) {
        const err = error as NdidApiErrorBody;
        // Error code 25005 = already registered
        if (err.error?.code === 25005) {
          console.log(`NDID service already registered: ${service_id}`);
          break;
        }
        console.error(
          `Error registering NDID service ${service_id}, retrying...`,
          error,
        );
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  // Set Your Data callbacks
  for (;;) {
    try {
      await API.setYourDataCallbacks({
        incoming_request_status_update_url: `http://${config.ndidApiCallbackIp}:${config.ndidApiCallbackPort}/yourdata/as/request_status_update`,
      });
      console.log('Your Data callbacks set');
      break;
    } catch (error) {
      console.error('Error setting Your Data callbacks, retrying...', error);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  // Register Your Data services.
  // complete_consent is always called with the pre-consent as_token, which is
  // one_time — so only token_one_time is supported for it.
  // Data services (deposit, credit card) support both one_time and continuous tokens.
  const yourDataServiceAuthorizations: Record<string, Array<'token_one_time' | 'token_continuous_with_expire' | 'token_continuous_no_expire'>> = {
    '900.complete_consent_001': ['token_one_time'],
    '900.deposit_transactions_basic_001': ['token_one_time', 'token_continuous_with_expire'],
    '900.deposit_transactions_basic_002': ['token_one_time', 'token_continuous_with_expire'],
    '900.deposit_transactions_detail_001': ['token_one_time', 'token_continuous_with_expire'],
    '900.deposit_transactions_detail_002': ['token_one_time', 'token_continuous_with_expire'],
    '900.cardpayment_transactions_basic_001': ['token_one_time', 'token_continuous_with_expire'],
    '900.cardpayment_transactions_basic_002': ['token_one_time', 'token_continuous_with_expire'],
    '900.cardpayment_transactions_detail_001': ['token_one_time', 'token_continuous_with_expire'],
    '900.cardpayment_transactions_detail_002': ['token_one_time', 'token_continuous_with_expire'],
  };

  for (const service_id of Object.keys(yourDataServiceAuthorizations)) {
    for (;;) {
      try {
        await API.registerYourDataService({
          service_id,
          service_url: `http://${config.ndidApiCallbackIp}:${config.ndidApiCallbackPort}/yourdata/as/request/${service_id}`,
          supported_namespace_list: ['citizen_id'],
          supported_authorization: yourDataServiceAuthorizations[service_id],
          service_availability: true,
        });
        console.log(`Registered Your Data service: ${service_id}`);
        break;
      } catch (error: unknown) {
        const err = error as NdidApiErrorBody;
        if (err.error?.code === 25005) {
          console.log(`Your Data service already registered: ${service_id}`);
          break;
        }
        console.error(
          `Error registering Your Data service ${service_id}, retrying...`,
          error,
        );
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }
}

registerServices().catch(console.error);

// ─── Auto Error Responses ─────────────────────────────────────────────────────
// Tell the NDID platform to auto-respond for requests this AS cannot handle:
//   40740 — unsupported_service: service_id not registered by this AS
//   40750 — service_not_available: service temporarily unavailable
//   40760 — unsupported_namespace: e.g. not citizen_id
//   40770 — unsupported_authorization: e.g. authorization type not supported

(async () => {
  for (;;) {
    try {
      await API.setAutoErrorResponse({
        unsupported_service: { error_code: 40740, error_message: 'Unsupported service' },
        service_not_available: { error_code: 40750, error_message: 'Service not available' },
        unsupported_namespace: { error_code: 40760, error_message: 'Unsupported namespace' },
        unsupported_authorization: { error_code: 40770, error_message: 'Unsupported authorization' },
      });
      console.log('Auto error responses configured');
      break;
    } catch (error) {
      console.error('Error setting auto error responses, retrying...', error);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
})();

// ─── Token Store ──────────────────────────────────────────────────────────────
// Per spec (NDID_YourData_ErrorCodes sheet 1_Member_Node_Errors):
//   40720 — AS must validate token revocation status before processing
//   40730 — AS must store and check whether the one-time token has been consumed
// In production, both sets would be persisted in a database.

const revokedTokens = new Set<string>();
const usedOneTimeTokens = new Set<string>();
const usedPreConsentTokens = new Set<string>();
const pendingPreConsentTokenByRequestId = new Map<string, string>();
const pendingOneTimeConsentTokenByRequestId = new Map<string, string>();

const ownTokenStore = new Map<string, { token: string; asNodeId: string }>();

const consentIntentMap = new Map<string, ConsentIntent>();

// Maps consent_token → the single account it is scoped to.
// Populated at complete-consent when per-account tokens are issued.
// Used by data request handlers to return account-specific mock data.
const tokenAccountMap = new Map<string, SubIdentity>();

// Maps the opaque identifier exchanged with RP/DC to the real, unmasked
// account/card number the consent token itself must carry. The masked
// visible_identifier shown at pre-consent (below) is derived from this via
// maskAccountNumber(), so the two can never drift apart.
const ACCOUNT_REAL_NUMBER: Record<string, string> = {
  'alpha-dep-a1b2c3d4': '1234561234',
  'alpha-dep-e5f6a7b8': '2345675678',
  'alpha-card-x1y2z3w4': '4111111111111111',
  'alpha-card-m5n6p7q8': '5500005555552222',
};

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Mask a real account/card number down to its last 4 digits, e.g.
 * "123-456-1234" -> "***-***-1234". Separators are preserved as-is. */
function maskAccountNumber(real: string, visibleCount = 4): string {
  const chars = real.split('');
  let seen = 0;
  for (let i = chars.length - 1; i >= 0; i--) {
    if (chars[i] === '-') continue;
    if (seen < visibleCount) {
      seen++;
      continue;
    }
    chars[i] = '*';
  }
  return chars.join('');
}

/**
 * Decode a JWT payload without verifying the signature.
 * The NDID platform has already verified the token before forwarding the request.
 * Returns null if the value is not a valid JWT (e.g. 'no_token_needed').
 */
function decodeTokenPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

/**
 * Parse the data level ('basic' | 'detail') and lookback window encoded
 * directly in a Your Data service_id, e.g.
 * '900.deposit_transactions_detail_002' -> { level: 'detail', lookbackMonths: 12 }.
 * Per the service ID catalog: *_basic_001 / *_detail_001 = 6 months,
 * *_basic_002 / *_detail_002 = 12 months. Level and lookback are encoded in
 * the service_id itself — no longer read from service_extension.
 */
function parseServiceIdLevel(
  serviceId: string,
): { level: 'basic' | 'detail'; lookbackMonths: number } | undefined {
  const match = /_(basic|detail)_(001|002)$/.exec(serviceId);
  if (!match) return undefined;
  return {
    level: match[1] as 'basic' | 'detail',
    lookbackMonths: match[2] === '002' ? 12 : 6,
  };
}

/**
 * Resolve the account a consent_token was issued for. Prefers our own
 * tokenAccountMap cache (populated when this same process handled
 * complete-consent for it), falling back to the token's own embedded
 * sub_identity_list — safe to trust because the platform already verified
 * this token's signature and content before ever invoking our service_url
 * (see the guide's §10.2 validation checklist). This fallback matters for
 * any consent_token this exact process didn't itself issue: a server
 * restart, or a token created via a separate complete-consent call (e.g.
 * an isolated conformance/SIT test).
 */
function resolveTokenAccount(authorization: string): SubIdentity | undefined {
  const cached = tokenAccountMap.get(authorization);
  if (cached) return cached;
  const payload = decodeTokenPayload(authorization) as { sub_identity_list?: SubIdentity[] } | null;
  return payload?.sub_identity_list?.[0];
}

/**
 * Validate the authorization token from a Your Data data request.
 * Returns an error object if invalid, or null if valid.
 */
function validateToken(authorization: string): { error_code: number; error_message: string } | null {
  // no_token_needed — skip token validation entirely
  if (authorization === 'no_token_needed') return null;

  const payload = decodeTokenPayload(authorization);

  // Reject revoked tokens (error 40720)
  const tokenId = payload?.token_id as string | undefined;
  if (tokenId && revokedTokens.has(tokenId)) {
    return { error_code: 40720, error_message: 'Consent Token Revoked' };
  }

  // Reject already-used one-time tokens (error 40730).
  // Per spec, the AS is responsible for tracking and enforcing one-time token usage.
  if (payload?.usage_type === 'one_time' && usedOneTimeTokens.has(authorization)) {
    return { error_code: 40730, error_message: 'One-Time Token Already Used' };
  }

  return null;
}

/**
 * Register a one-time token to be marked used once the platform confirms
 * the data_decryption_pending status for this request.
 */
function markTokenUsedIfOneTime(requestId: string, authorization: string): void {
  if (authorization === 'no_token_needed') return;
  const payload = decodeTokenPayload(authorization);
  if (payload?.usage_type === 'one_time') {
    pendingOneTimeConsentTokenByRequestId.set(requestId, authorization);
  }
}

// ─── Standard NDID Callback Handlers (pre-consent / revoke) ──────────────────

ndidCallbackEvent.on('ndid_callback', (data: NdidAsCallback) => {
  if (data.type === 'data_request') {
    handleNdidDataRequest(data as NdidDataRequestCallback);
  } else if (data.type === 'response_result') {
    const result = data as NdidSendDataResultCallback;
    if (result.success) {
      console.log(
        `NDID data sent successfully for request: ${result.request_id}`,
      );
    } else {
      console.error('NDID send data error:', result.error);
    }
  } else if (
    data.type === 'add_or_update_service_result' ||
    data.type === 'set_service_price_result'
  ) {
    const result = data as NdidServiceUpdateResultCallback;
    if (result.success) {
      console.log('NDID service registered/updated successfully');
    } else {
      console.error('NDID service registration error:', result.error);
    }
  } else if (data.type === 'request_status') {
    const statusData = data as NdidRequestStatusCallback;
    console.log(
      `NDID request ${statusData.request_id} status: ${statusData.status}`,
    );
  }
});

async function handleNdidDataRequest(
  data: NdidDataRequestCallback,
): Promise<void> {
  const { request_id, service_id } = data;
  const referenceId = `ndid-data-${Date.now()}`;

  console.log(
    `Handling NDID data request for service: ${service_id}, request: ${request_id}`,
  );

  try {
    if (service_id === '900.revoke_consent_001') {
      const revokedByThisAs: string[] = [];
      try {
        const tokenIds: string[] = JSON.parse(data.request_params ?? '[]');
        if (Array.isArray(tokenIds)) {
          for (const tokenId of tokenIds) {
            const owned = ownTokenStore.get(tokenId);
            if (owned && owned.asNodeId === data.node_id) {
              revokedTokens.add(tokenId);
              revokedByThisAs.push(tokenId);
            }
          }
          console.log(
            `Revoked ${revokedByThisAs.length}/${tokenIds.length} token(s) issued by this AS`,
          );
        }
      } catch { /* malformed JSON */ }

      await API.sendNdidData({
        request_id,
        service_id,
        reference_id: referenceId,
        callback_url: `http://${config.ndidApiCallbackIp}:${config.ndidApiCallbackPort}/as/response`,
        // Per spec (YourData_Schema_Common /NDID/service/revoke_consent),
        // respond with the array of revoked token_id(s) issued by this AS.
        data: JSON.stringify(revokedByThisAs),
      });
    } else if (service_id === '900.pre_consent_deposit_001' || service_id === '900.pre_consent_cardpayment_001') {
      const validUsageTypes: YourDataUsageType[] = ['one_time', 'continuous_with_expire', 'continuous_no_expire'];
      let intent: ConsentIntent = { usage_type: 'one_time' };
      try {
        const params = JSON.parse(data.request_params ?? '{}');
        const usage_type = params.usage_type as YourDataUsageType | undefined;
        if (usage_type && validUsageTypes.includes(usage_type)) {
          intent = {
            usage_type,
            expiration_datetime:
              typeof params.expiration_datetime === 'number' ? params.expiration_datetime : undefined,
            data_service_list: params.data_service_list?.map(
              (s: NonNullable<ConsentIntent['data_service_list']>[number]) => ({
                ...s,
                service_version: 'v1',
              }),
            ),
            token_objective: typeof params.token_objective === 'string' ? params.token_objective : undefined,
          };
        }
      } catch { /* malformed JSON — use default */ }

      // identifier is opaque (AS-generated) — NOT the real account number.
      // visible_identifier is a masked view of the same real number in
      // ACCOUNT_REAL_NUMBER, so the two are never inconsistent.
      if (service_id === '900.pre_consent_deposit_001') {
        intent.sub_identity_list = [
          {
            namespace: 'account_id',
            identifier: 'alpha-dep-a1b2c3d4',
            visible_identifier: maskAccountNumber(ACCOUNT_REAL_NUMBER['alpha-dep-a1b2c3d4']),
            identifier_extension: '{"accountSubType":"CURRENT"}',
          },
          {
            namespace: 'account_id',
            identifier: 'alpha-dep-e5f6a7b8',
            visible_identifier: maskAccountNumber(ACCOUNT_REAL_NUMBER['alpha-dep-e5f6a7b8']),
            identifier_extension: '{"accountSubType":"SAVINGS"}',
          },
        ];
      } else if (service_id === '900.pre_consent_cardpayment_001') {
        intent.sub_identity_list = [
          {
            namespace: 'card_number',
            identifier: 'alpha-card-x1y2z3w4',
            visible_identifier: maskAccountNumber(ACCOUNT_REAL_NUMBER['alpha-card-x1y2z3w4']),
            identifier_extension: '{"card_type":"VISA"}',
          },
          {
            namespace: 'card_number',
            identifier: 'alpha-card-m5n6p7q8',
            visible_identifier: maskAccountNumber(ACCOUNT_REAL_NUMBER['alpha-card-m5n6p7q8']),
            identifier_extension: '{"card_type":"Mastercard"}',
          },
        ];
      }

      const token = await API.createYourDataToken({
        requester_node_id: data.requester_node_id,
        as_node_id: data.node_id,
        namespace: data.namespace,
        identifier: data.identifier,
        source_request_id_list: [request_id],
        usage_type: 'one_time',
        expiration_datetime: nowSeconds() + 15 * 60,
        validate_identifier: true,
        validate_service_id: true,
        validate_service_extension: false,
        ...(intent.token_objective ? { token_objective: intent.token_objective } : {}),
        service_id_list: [
          {
            service_id: '900.complete_consent_001',
            service_version: 'v1',
            service_extension: [
              JSON.stringify({
                usage_type: intent.usage_type,
                ...(intent.expiration_datetime !== undefined
                  ? { expiration_datetime: intent.expiration_datetime }
                  : {}),
                data_service_list: intent.data_service_list ?? [],
              }),
            ],
          },
        ],
      });

      await API.sendNdidData({
        request_id,
        service_id,
        reference_id: referenceId,
        callback_url: `http://${config.ndidApiCallbackIp}:${config.ndidApiCallbackPort}/as/response`,
        data: JSON.stringify({
          sub_identity_list: intent.sub_identity_list,
          authorization: token.token,
        }),
      });

      consentIntentMap.set(token.token, intent);
    }
  } catch (error) {
    console.error(`Error handling NDID data request for ${service_id}:`, error);
  }
}

// ─── Your Data Callback Handlers (complete-consent / data-request) ────────────

ndidCallbackEvent.on(
  'yourdata_data_request',
  (data: YourDataAsDataRequestCallback) => {
    handleYourDataRequest(data).catch(console.error);
  },
);

ndidCallbackEvent.on(
  'yourdata_status_update',
  (data: YourDataAsRequestStatusCallback) => {
    console.log(`Your Data request ${data.request_id} status: ${data.status}`);
    if (data.status === 'data_decryption_pending') {
      const preConsentAuthorization = pendingPreConsentTokenByRequestId.get(data.request_id);
      if (preConsentAuthorization) {
        consentIntentMap.delete(preConsentAuthorization);
        usedPreConsentTokens.add(preConsentAuthorization);
        pendingPreConsentTokenByRequestId.delete(data.request_id);
      }

      const oneTimeAuthorization = pendingOneTimeConsentTokenByRequestId.get(data.request_id);
      if (oneTimeAuthorization) {
        usedOneTimeTokens.add(oneTimeAuthorization);
        pendingOneTimeConsentTokenByRequestId.delete(data.request_id);
      }
    }
  },
);

async function handleYourDataRequest(
  data: YourDataAsDataRequestCallback,
): Promise<void> {
  const { request_id, service_id } = data;

  console.log(
    `Handling Your Data request for service: ${service_id}, request: ${request_id}`,
  );

  try {
    if (service_id === '900.complete_consent_001') {
      if (usedPreConsentTokens.has(data.authorization)) {
        await API.sendYourDataError({
          request_id,
          error_code: 40730,
          error_message: 'One-Time Token Already Used',
        });
        return;
      }

      const intent = consentIntentMap.get(data.authorization);
      const preConsentPayload = decodeTokenPayload(data.authorization) as {
        source_request_id_list?: string[];
        token_objective?: string;
        service_id_list?: Array<{ service_id: string; service_extension?: string[] }>;
      } | null;

      let usage_type: YourDataUsageType | undefined = intent?.usage_type;
      let requestedExpiration: number | undefined = intent?.expiration_datetime;
      let data_service_list: ConsentIntent['data_service_list'] = intent?.data_service_list;
      let token_objective: string | undefined = intent?.token_objective;
      let sub_identity_list: SubIdentity[] | undefined = intent?.sub_identity_list;

      if (!intent) {
        const rawExt = preConsentPayload?.service_id_list?.[0]?.service_extension?.[0];
        if (rawExt) {
          try {
            const parsedExt = JSON.parse(rawExt) as {
              usage_type?: YourDataUsageType;
              expiration_datetime?: number;
              data_service_list?: ConsentIntent['data_service_list'];
            };
            usage_type ??= parsedExt.usage_type;
            requestedExpiration ??= parsedExt.expiration_datetime;
            data_service_list ??= parsedExt.data_service_list;
          } catch { /* malformed — nothing recoverable */ }
        }
        token_objective ??= preConsentPayload?.token_objective;
      }

      if (!usage_type || !sub_identity_list || sub_identity_list.length === 0) {
        await API.sendYourDataError({
          request_id,
          error_code: 40000,
          error_message: 'Failed to retrieve consent intent',
        });
        return;
      }

      const { source_request_id_list: preConsentRequestIds = [] } = preConsentPayload ?? {};

      const originalAccountCount = sub_identity_list.length;
      try {
        const selected: Array<{ namespace: string; identifier: string; visible_identifier: string }> =
          JSON.parse(data.request_params || '[]');
        if (Array.isArray(selected) && selected.length > 0 && sub_identity_list?.length) {
          const selectedIds = new Set(selected.map(a => a.identifier));
          sub_identity_list = sub_identity_list.filter(a => selectedIds.has(a.identifier));
          console.log(
            `Account selection: ${sub_identity_list.length}/${originalAccountCount} account(s) selected`,
          );
        }
      } catch { /* malformed request_params — use full list */ }

      const service_id_list =
        data_service_list && data_service_list.length > 0
          ? data_service_list
          : undefined;

      const expiration_datetime =
        usage_type === 'continuous_with_expire'
          ? requestedExpiration ?? nowSeconds() + 90 * 24 * 60 * 60
          : usage_type === 'one_time'
            ? nowSeconds() + 1 * 24 * 60 * 60
            : undefined;

      if (!sub_identity_list || sub_identity_list.length === 0) {
        await API.sendYourDataError({
          request_id,
          error_code: 40400,
          error_message: 'Account selection required: selected_accounts must not be empty',
        });
        return;
      }

      const perServiceOneTime = usage_type === 'one_time' && !!service_id_list && service_id_list.length > 1;
      const serviceGroups = perServiceOneTime ? service_id_list!.map(svc => [svc]) : [service_id_list];

      const results = await Promise.all(
        sub_identity_list.flatMap(account => {
          const realAccountNumber = ACCOUNT_REAL_NUMBER[account.identifier] ?? account.identifier;
          const isMaskedProduct =
            account.namespace === 'card_number' ||
            account.namespace === 'e_wallet_id';
          const completeConsentIdentifier = isMaskedProduct ? account.identifier : realAccountNumber;
          const completeConsentVisibleIdentifier = isMaskedProduct
            ? maskAccountNumber(realAccountNumber)
            : realAccountNumber;
          return serviceGroups.map((svcList) =>
            API.createYourDataToken({
              requester_node_id: data.requester_node_id,
              as_node_id: data.node_id,
              namespace: data.namespace,
              identifier: data.identifier,
              // Must include both the pre-consent request's id and this
              // complete-consent request's id.
              source_request_id_list: [...preConsentRequestIds, request_id],
              usage_type,
              ...(expiration_datetime !== undefined
                ? { expiration_datetime }
                : {}),
              validate_identifier: true,
              validate_service_id: true,
              validate_service_extension: true,
              ...(token_objective
                ? { token_objective }
                : {}),
              ...(svcList
                ? {
                    service_id_list: svcList,
                  }
                : {}),
              sub_identity_list: [
                {
                  namespace: account.namespace,
                  identifier: completeConsentIdentifier,
                  visible_identifier: completeConsentVisibleIdentifier,
                  identifier_extension: account.identifier_extension,
                },
              ],
            }).then((token) => ({ token: token.token, account })),
          );
        })
      );
      const consent_tokens = results.map(r => r.token);
      for (const { token, account } of results) {
        tokenAccountMap.set(token, account);
        const issuedPayload = decodeTokenPayload(token) as { token_id?: string } | null;
        if (issuedPayload?.token_id) {
          ownTokenStore.set(issuedPayload.token_id, { token, asNodeId: data.node_id });
        }
      }
      console.log(`Issued ${consent_tokens.length} consent token(s)`);
      await API.sendYourData({
        request_id,
        data: JSON.stringify(consent_tokens),
      });
      pendingPreConsentTokenByRequestId.set(request_id, data.authorization);
    } else {
      const tokenError = validateToken(data.authorization);
      if (tokenError) {
        await API.sendYourDataError({ request_id, ...tokenError });
        return;
      }

      let requestParams: Record<string, unknown> = {};
      try { requestParams = JSON.parse(data.request_params || '{}'); } catch { /* ignore */ }
      const { fromBookingDateTime, toBookingDateTime, fromTransactionDate, toTransactionDate } =
        requestParams as DateRangeParams;
      let fromStr = (fromBookingDateTime ?? fromTransactionDate) as string | undefined;
      let toStr = (toBookingDateTime ?? toTransactionDate) as string | undefined;

      const serviceLevel = parseServiceIdLevel(service_id);
      const lookbackMonths = serviceLevel?.lookbackMonths ?? 6;
      // The lookback window is anchored to *now* — the date/time this request
      // is processed. The current month counts as "month 0"; counting back
      // `lookbackMonths` months from there gives the earliest allowed month,
      // and a DC (the requesting party) may use any fromDate from the 1st of
      // that month onward — e.g. a request on 3 Sep 2026 with a 6-month
      // lookback permits fromDate as early as 1 Mar 2026. A requested toDate
      // may never be later than now.
      const now = new Date();
      const earliestFrom = new Date(now);
      earliestFrom.setMonth(earliestFrom.getMonth() - lookbackMonths, 1);
      earliestFrom.setHours(0, 0, 0, 0);

      if (!fromStr && !toStr) {
        fromStr = earliestFrom.toISOString();
        toStr = now.toISOString();
      }

      let dateRange: { from: number; to: number } | undefined;
      if (fromStr && toStr) {
        const fromMs = new Date(fromStr).getTime();
        const toMs = new Date(toStr).getTime();
        if (isNaN(fromMs) || isNaN(toMs) || toMs < fromMs) {
          await API.sendYourDataError({
            request_id,
            error_code: 40400,
            error_message: 'Invalid date range: to date must be >= from date',
          });
          return;
        }
        if (toMs > now.getTime() || fromMs < earliestFrom.getTime()) {
          await API.sendYourDataError({
            request_id,
            error_code: 40710,
            error_message: `Date Range Exceeds Permission`,
          });
          return;
        }
        dateRange = { from: fromMs, to: toMs };
      }

      const extension = serviceLevel?.level === 'detail' ? 'transactions_detail' : 'transactions_basic';
      const tokenAccount = resolveTokenAccount(data.authorization);
      if (!tokenAccount) {
        await API.sendYourDataError({
          request_id,
          error_code: 40000,
          error_message: 'Token not found: consent token is not associated with any account',
        });
        return;
      }
      const responseData =
        service_id.startsWith('900.cardpayment_transactions_')
          ? getCreditCardTransactions(extension, tokenAccount, dateRange)
          : getServiceData(service_id, extension, tokenAccount, dateRange);
      await API.sendYourData({
        request_id,
        data: JSON.stringify(responseData),
      });
      markTokenUsedIfOneTime(request_id, data.authorization);
    }
  } catch (error) {
    console.error(`Error handling Your Data request for ${service_id}:`, error);

    await API.sendYourDataError({
      request_id,
      error_code: 40000,
      error_message: 'Failed to retrieve data',
    }).catch(console.error);
  }
}

// ─── Mock Data Helpers ────────────────────────────────────────────────────────
// Response shapes below follow the published dataset schemas exactly:
//   Deposit:     https://app.swaggerhub.com/apis/NDID/YourData_Schema_Deposit/1.0.1
//   Card Payment: https://app.swaggerhub.com/apis/NDID/YourData_Schema_CardPayment/1.0.1

interface DepositTransactionEntry {
  transactionId: string;
  bookingDateTime: string;
  valueDateTime?: string;
  domainCode: string;
  familyCode: string;
  subFamilyCode: string;
  proprietaryBankTransactionCode: string;
  proprietaryBankTransactionDescription: string;
  creditDebitIndicator: 'CRDT' | 'DBIT';
  amount: number;
  amountCurrency: string;
  // Detail-only fields (TransactionEntryDetail) — stripped for the basic response.
  transactionInformation?: string;
  creditorAccountName?: string;
  debtorAccountName?: string;
}

// Per-account mock deposit transactions keyed by opaque identifier. The
// account number itself is not stored here — it's derived from
// ACCOUNT_REAL_NUMBER at lookup time (see getServiceData) so it can never
// drift from the number used everywhere else for the same account.
const DEPOSIT_MOCK: Record<string, { transactions: DepositTransactionEntry[] }> = {
  'alpha-dep-a1b2c3d4': {
    transactions: [
      { transactionId: 'TXN-A-001', bookingDateTime: '2026-06-01T00:00:00+07:00', valueDateTime: '2026-06-01T00:00:00+07:00', domainCode: 'PMNT', familyCode: 'RCDT', subFamilyCode: 'SALA', proprietaryBankTransactionCode: 'TW', proprietaryBankTransactionDescription: 'Transfer in', creditDebitIndicator: 'CRDT', amount: 5000.00, amountCurrency: 'THB', transactionInformation: 'Salary payment', debtorAccountName: 'ABC COMPANY LTD' },
      { transactionId: 'TXN-A-002', bookingDateTime: '2026-06-10T00:00:00+07:00', valueDateTime: '2026-06-10T00:00:00+07:00', domainCode: 'PMNT', familyCode: 'MDOP', subFamilyCode: 'RPMT', proprietaryBankTransactionCode: 'BP', proprietaryBankTransactionDescription: 'Bill payment', creditDebitIndicator: 'DBIT', amount: 1200.00, amountCurrency: 'THB', transactionInformation: 'Bill payment - utilities', creditorAccountName: 'KASIKORN BANK' },
      { transactionId: 'TXN-A-003', bookingDateTime: '2026-06-15T00:00:00+07:00', valueDateTime: '2026-06-15T00:00:00+07:00', domainCode: 'PMNT', familyCode: 'MDOP', subFamilyCode: 'FEES', proprietaryBankTransactionCode: 'BP', proprietaryBankTransactionDescription: 'Bill payment', creditDebitIndicator: 'DBIT', amount: 500.00, amountCurrency: 'THB', transactionInformation: 'Fuel top-up', creditorAccountName: 'TRUE MONEY WALLET' },
    ],
  },
  'alpha-dep-e5f6a7b8': {
    transactions: [
      { transactionId: 'TXN-B-001', bookingDateTime: '2026-06-03T00:00:00+07:00', valueDateTime: '2026-06-03T00:00:00+07:00', domainCode: 'PMNT', familyCode: 'RCDT', subFamilyCode: 'DMCT', proprietaryBankTransactionCode: 'TW', proprietaryBankTransactionDescription: 'Transfer in', creditDebitIndicator: 'CRDT', amount: 20000.00, amountCurrency: 'THB', transactionInformation: 'Transfer in', debtorAccountName: 'SOMCHAI JAIDEE' },
      { transactionId: 'TXN-B-002', bookingDateTime: '2026-06-12T00:00:00+07:00', valueDateTime: '2026-06-12T00:00:00+07:00', domainCode: 'PMNT', familyCode: 'MDOP', subFamilyCode: 'RPMT', proprietaryBankTransactionCode: 'LN', proprietaryBankTransactionDescription: 'Loan repayment', creditDebitIndicator: 'DBIT', amount: 3500.00, amountCurrency: 'THB', transactionInformation: 'Loan repayment', creditorAccountName: 'SCB BANK' },
    ],
  },
};

function withinRange(dateStr: string, range?: { from: number; to: number }): boolean {
  if (!range) return true;
  const ts = new Date(dateStr).getTime();
  return !isNaN(ts) && ts >= range.from && ts <= range.to;
}

function getServiceData(
  service_id: string,
  extension: string,
  account: SubIdentity,
  dateRange?: { from: number; to: number },
): Record<string, unknown> {
  if (service_id.startsWith('900.deposit_transactions_')) {
    const mock = DEPOSIT_MOCK[account.identifier] ?? DEPOSIT_MOCK['alpha-dep-a1b2c3d4'];
    const transactions = mock.transactions.filter((t) => withinRange(t.bookingDateTime, dateRange));
    // Deposit accountId is not masked in the actual data response — it's the
    // same real number carried in the consent token (unlike card numbers,
    // which stay masked throughout per PCI-DSS).
    const accountId = ACCOUNT_REAL_NUMBER[account.identifier] ?? account.identifier;

    if (extension === 'transactions_detail') {
      // TransactionResponseDetail
      return {
        accountId,
        transactionEntries: transactions,
      };
    }
    // TransactionResponseBasic — strip detail-only fields.
    return {
      accountId,
      transactionEntries: transactions.map(
        ({ transactionInformation, creditorAccountName, debtorAccountName, ...basic }) => basic,
      ),
    };
  }

  return { service_id, service_extension: extension, data: 'mock data' };
}

interface CardUsageTransaction {
  transactionId: string;
  transactionDate: string;
  postingDate?: string;
  creditDebitIndicator: 'CRDT' | 'DBIT';
  amount: number;
  amountCurrency: string;
  transactionType: 'SPENDING' | 'EPP' | 'REFUND' | 'ETL' | 'REPAYMENT' | 'RECURRING' | 'CASH' | 'VOID' | 'OTHER';
  merchantCategoryCode: string;
  // Detail-only field (UsageTransactionDetail).
  transactionDescription?: string;
}

// Per-card mock transaction data keyed by opaque identifier. The card
// number itself is not stored here — it's derived from ACCOUNT_REAL_NUMBER
// at lookup time (see getCreditCardTransactions), masked the same way as at
// pre-consent, since card numbers stay masked even after consent (PCI-DSS).
const CARD_MOCK: Record<string, { transactions: CardUsageTransaction[] }> = {
  'alpha-card-x1y2z3w4': {
    transactions: [
      { transactionId: 'CC-VISA-001', transactionDate: '2026-05-03', postingDate: '2026-05-04', creditDebitIndicator: 'DBIT', amount: 3500, amountCurrency: 'THB', transactionType: 'SPENDING', merchantCategoryCode: '5311', transactionDescription: 'CENTRAL WORLD' },
      { transactionId: 'CC-VISA-002', transactionDate: '2026-05-07', postingDate: '2026-05-07', creditDebitIndicator: 'DBIT', amount: 320, amountCurrency: 'THB', transactionType: 'SPENDING', merchantCategoryCode: '5812', transactionDescription: 'GRAB FOOD' },
      { transactionId: 'CC-VISA-003', transactionDate: '2026-05-10', postingDate: '2026-05-10', creditDebitIndicator: 'CRDT', amount: 5000, amountCurrency: 'THB', transactionType: 'REPAYMENT', merchantCategoryCode: '6012', transactionDescription: 'Payment received' },
      { transactionId: 'CC-VISA-004', transactionDate: '2026-05-14', postingDate: '2026-05-15', creditDebitIndicator: 'DBIT', amount: 1890, amountCurrency: 'THB', transactionType: 'SPENDING', merchantCategoryCode: '5961', transactionDescription: 'LAZADA' },
    ],
  },
  'alpha-card-m5n6p7q8': {
    transactions: [
      { transactionId: 'CC-MC-001', transactionDate: '2026-05-05', postingDate: '2026-05-06', creditDebitIndicator: 'DBIT', amount: 800, amountCurrency: 'THB', transactionType: 'SPENDING', merchantCategoryCode: '5812', transactionDescription: 'MK RESTAURANT' },
      { transactionId: 'CC-MC-002', transactionDate: '2026-05-18', postingDate: '2026-05-18', creditDebitIndicator: 'CRDT', amount: 2000, amountCurrency: 'THB', transactionType: 'REPAYMENT', merchantCategoryCode: '6012', transactionDescription: 'Payment received' },
      { transactionId: 'CC-MC-003', transactionDate: '2026-05-22', postingDate: '2026-05-23', creditDebitIndicator: 'DBIT', amount: 4200, amountCurrency: 'THB', transactionType: 'SPENDING', merchantCategoryCode: '5411', transactionDescription: 'TOPS SUPERMARKET' },
    ],
  },
};

function getCreditCardTransactions(
  extension: string,
  account: SubIdentity,
  dateRange?: { from: number; to: number },
): Record<string, unknown> {
  const mock = CARD_MOCK[account.identifier] ?? CARD_MOCK['alpha-card-x1y2z3w4'];
  const transactions = mock.transactions.filter((t) => withinRange(t.transactionDate, dateRange));
  const cardNumber = maskAccountNumber(ACCOUNT_REAL_NUMBER[account.identifier] ?? account.identifier);

  if (extension === 'transactions_detail') {
    // TransactionResponseDetail
    return { cardNumber, transactionEntries: transactions };
  }
  // TransactionResponseBasic — strip detail-only field.
  return {
    cardNumber,
    transactionEntries: transactions.map(({ transactionDescription, ...basic }) => basic),
  };
}

// ─── Management API ───────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(morgan('combined'));

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', service: 'as-example' });
});

app.get('/services', async (_req: Request, res: Response) => {
  try {
    const serviceIds = [
      '900.deposit_transactions_basic_001',
      '900.deposit_transactions_basic_002',
      '900.deposit_transactions_detail_001',
      '900.deposit_transactions_detail_002',
      '900.cardpayment_transactions_basic_001',
      '900.cardpayment_transactions_basic_002',
      '900.cardpayment_transactions_detail_001',
      '900.cardpayment_transactions_detail_002',
      '900.complete_consent_001',
    ];
    const results = await Promise.all(serviceIds.map((id) => API.getYourDataService(id)));
    res.status(200).json(Object.fromEntries(serviceIds.map((id, i) => [id, results[i]])));
  } catch (error) {
    res.status(500).json(error);
  }
});

app.get('/error-codes', async (_req: Request, res: Response) => {
  try {
    const codes = await API.getYourDataErrorCodes();
    res.status(200).json(codes);
  } catch (error) {
    res.status(500).json(error);
  }
});

app.listen(config.serverPort, () => {
  console.log(`AS example server running on port ${config.serverPort}`);
});

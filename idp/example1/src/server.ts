import http from 'http';
import express from 'express';
import type { Request, Response } from 'express';
import morgan from 'morgan';
import { Server as SocketIOServer } from 'socket.io';

import * as API from './api';
import * as db from './db';
import * as utils from './utils';
import { eventEmitter as ndidCallbackEvent } from './callbackHandler';
import * as config from './config';
import type { IdpCallback, IdpIncomingRequestCallback, CreateIdentityBody } from './types';

// Import callback handler to start callback server
import './callbackHandler';

process.on('unhandledRejection', (reason: unknown) => {
  console.error('Unhandled Rejection:', reason);
});

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server);

app.use(express.urlencoded({ extended: false, limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('combined'));

// ─── WebSocket ────────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log('Frontend connected via WebSocket');
  socket.on('disconnect', () => console.log('Frontend disconnected'));
});

// ─── Forward NDID callbacks to frontend ──────────────────────────────────────

ndidCallbackEvent.on('callback', (data: IdpCallback) => {
  console.log('IDP callback:', data.type);
  io.emit('idp_update', data);

  // Auto-accept incoming consent requests (pre-consent / revoke)
  if (data.type === 'incoming_request') {
    autoRespondToRequest(data as IdpIncomingRequestCallback).catch(
      console.error,
    );
  }
});

// ─── Auto-respond to Consent Requests ────────────────────────────────────────

async function autoRespondToRequest(
  data: IdpIncomingRequestCallback,
): Promise<void> {
  const { request_id, namespace, identifier, request_message_hash } = data;

  if (!namespace || !identifier) {
    console.warn(
      `Incoming request ${request_id} has no namespace/identifier in callback payload`,
    );
    return;
  }

  const accessor = db.getAccessorByIdentifier(namespace, identifier);
  if (!accessor) {
    console.warn(
      `No accessor found for ${namespace}:${identifier}, cannot auto-respond`,
    );
    return;
  }

  const referenceId = `idp-respond-${Date.now()}`;
  const signature = utils.createResponseSignature(
    accessor.accessor_private_key,
    request_message_hash,
  );

  try {
    await API.respondToRequest({
      request_id,
      namespace,
      identifier,
      reference_id: referenceId,
      callback_url: `http://${config.ndidApiCallbackIp}:${config.ndidApiCallbackPort}/idp/response`,
      ial: 2.3,
      aal: 2.1,
      status: 'accept',
      accessor_id: accessor.accessor_id,
      signature,
    });
    console.log(`Auto-accepted consent request: ${request_id}`);
  } catch (error) {
    console.error('Error responding to consent request:', error);
  }
}

// ─── Identity Management Endpoints ───────────────────────────────────────────

/**
 * POST /identity
 * Register a new user identity on NDID.
 * Body: { namespace, identifier, mode }
 */
app.post('/identity', async (req: Request, res: Response) => {
  const { namespace, identifier, mode } = req.body as CreateIdentityBody;

  try {
    const sid = `${namespace}:${identifier}`;
    utils.genNewKeyPair(sid);

    const accessor_public_key = utils.readPublicKey(sid);
    const accessor_private_key = utils.readPrivateKey(sid);

    const referenceId = `create-identity-${Date.now()}`;

    db.addOrUpdateReference(referenceId, {
      namespace,
      identifier,
      accessor_private_key,
      accessor_public_key,
    });

    const { request_id, accessor_id } = await API.createNewIdentity({
      reference_id: referenceId,
      callback_url: `http://${config.ndidApiCallbackIp}:${config.ndidApiCallbackPort}/idp/identity`,
      identity_list: [{ namespace, identifier }],
      mode: mode ?? 3,
      accessor_type: 'RSA',
      accessor_public_key,
      ial: 2.3,
    });

    db.addOrUpdateReference(referenceId, { request_id, accessor_id });

    // Save accessor for later use when responding to consent requests
    db.addAccessor({
      accessor_id,
      accessor_private_key,
      accessor_public_key,
      namespace,
      identifier,
    });

    res.status(200).json({ request_id, accessor_id });
  } catch (error) {
    console.error('Error creating identity:', error);
    res.status(500).json(error);
  }
});

/**
 * GET /identity/:namespace/:identifier
 * Check if an identity exists locally.
 */
app.get('/identity/:namespace/:identifier', (req: Request, res: Response) => {
  const namespace = req.params.namespace as string;
  const identifier = req.params.identifier as string;
  const accessor = db.getAccessorByIdentifier(namespace, identifier);
  if (accessor) {
    res.status(200).json({
      exists: true,
      accessor_id: accessor.accessor_id,
    });
  } else {
    res.status(200).json({ exists: false });
  }
});

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', service: 'idp-example' });
});

// ─── Start Server ─────────────────────────────────────────────────────────────

server.listen(config.serverPort, () => {
  console.log(`IDP example server running on port ${config.serverPort}`);
});

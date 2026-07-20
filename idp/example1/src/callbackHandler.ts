import { EventEmitter } from 'events';
import express from 'express';
import type { Request, Response } from 'express';
import * as API from './api';
import * as db from './db';
import * as utils from './utils';
import * as config from './config';
import type { IdpCallback, IdpAccessorEncryptRequest } from './types';

export const eventEmitter = new EventEmitter();

// ─── Set Callbacks on Startup ─────────────────────────────────────────────────

(async () => {
  for (;;) {
    try {
      await API.setCallbackUrls({
        incoming_request_url: `http://${config.ndidApiCallbackIp}:${config.ndidApiCallbackPort}/idp/request`,
        incoming_request_status_update_url: `http://${config.ndidApiCallbackIp}:${config.ndidApiCallbackPort}/idp/request_status_update`,
        identity_modification_notification_url: `http://${config.ndidApiCallbackIp}:${config.ndidApiCallbackPort}/idp/identity/notification`,
        // Register accessor_encrypt_url: NDID platform calls back here when it needs
        // the accessor private key to sign a challenge during consent.
        accessor_encrypt_url: `http://${config.ndidApiCallbackIp}:${config.ndidApiCallbackPort}/idp/accessor/encrypt`,
      });
      console.log('IDP callback URLs set successfully');
      break;
    } catch (error) {
      console.error('Error setting IDP callback URLs, retrying...', error);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
})();

// ─── Callback Server ──────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: '2mb' }));

/**
 * Callback: incoming consent request from NDID platform (pre-consent / revoke).
 * IDP must respond with accept or reject via POST /idp/response.
 */
app.post('/idp/request', async (req: Request, res: Response) => {
  try {
    const callbackData: IdpCallback = req.body;
    console.log(
      'Received incoming request callback:',
      JSON.stringify(callbackData, null, 2),
    );
    eventEmitter.emit('callback', callbackData);
    res.status(204).end();
  } catch (error) {
    console.error(error);
    res.status(500).end();
  }
});

/** Callback: request status update for an existing request */
app.post('/idp/request_status_update', async (req: Request, res: Response) => {
  try {
    const callbackData: IdpCallback = req.body;
    console.log(
      'Received request status update callback:',
      JSON.stringify(callbackData, null, 2),
    );
    eventEmitter.emit('callback', callbackData);
    res.status(204).end();
  } catch (error) {
    console.error(error);
    res.status(500).end();
  }
});

/** Callback: result of creating a new identity */
app.post('/idp/identity', async (req: Request, res: Response) => {
  try {
    const callbackData: IdpCallback = req.body;
    console.log(
      'Received create identity callback:',
      JSON.stringify(callbackData, null, 2),
    );
    eventEmitter.emit('callback', callbackData);
    res.status(204).end();
  } catch (error) {
    console.error(error);
    res.status(500).end();
  }
});

/** Callback: identity modification notification */
app.post('/idp/identity/notification', async (req: Request, res: Response) => {
  try {
    const callbackData: IdpCallback = req.body;
    console.log(
      'Received identity notification callback:',
      JSON.stringify(callbackData, null, 2),
    );
    eventEmitter.emit('callback', callbackData);
    res.status(204).end();
  } catch (error) {
    console.error(error);
    res.status(500).end();
  }
});

/** Callback: result of adding an accessor */
app.post('/idp/identity/accessor', async (req: Request, res: Response) => {
  try {
    const callbackData: IdpCallback = req.body;
    console.log(
      'Received add accessor callback:',
      JSON.stringify(callbackData, null, 2),
    );
    eventEmitter.emit('callback', callbackData);
    res.status(204).end();
  } catch (error) {
    console.error(error);
    res.status(500).end();
  }
});

/**
 * Callback: NDID platform asks IDP to sign a challenge using accessor private key.
 * Returns the RSA signature (no padding) of the padded message hash.
 */
app.post('/idp/accessor/encrypt', async (req: Request, res: Response) => {
  try {
    const {
      accessor_id,
      request_message_padded_hash,
    }: IdpAccessorEncryptRequest = req.body;

    const accessor = db.getAccessor(accessor_id);
    if (!accessor) {
      res.status(404).json({ error: `Accessor not found: ${accessor_id}` });
      return;
    }

    const signature = utils.createResponseSignature(
      accessor.accessor_private_key,
      request_message_padded_hash,
    );

    res.status(200).json({ signature });
  } catch (error) {
    console.error(error);
    res.status(500).end();
  }
});

/** Callback: IDP response result */
app.post('/idp/response', async (req: Request, res: Response) => {
  try {
    const callbackData: IdpCallback = req.body;
    console.log(
      'Received IDP response callback:',
      JSON.stringify(callbackData, null, 2),
    );
    eventEmitter.emit('callback', callbackData);
    res.status(204).end();
  } catch (error) {
    console.error(error);
    res.status(500).end();
  }
});

app.listen(config.ndidApiCallbackPort, () =>
  console.log(
    `IDP callback server listening on port ${config.ndidApiCallbackPort}`,
  ),
);

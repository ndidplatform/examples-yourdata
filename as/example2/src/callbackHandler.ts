import { EventEmitter } from 'events';
import express from 'express';
import type { Request, Response } from 'express';
import * as config from './config';
import type {
  NdidAsCallback,
  YourDataAsDataRequestCallback,
  YourDataAsRequestStatusCallback,
  NdidRequestStatusCallback,
} from './types';

export const eventEmitter = new EventEmitter();

const app = express();
app.use(express.json({ limit: '2mb' }));

// ─── Standard NDID Callbacks (pre-consent / revoke) ──────────────────────────

/**
 * Callback: incoming data request for a standard NDID service
 * (service_id: pre_consent_credit_card, revoke_consent)
 */
app.post('/as/service/:serviceId', async (req: Request, res: Response) => {
  const callbackData: NdidAsCallback = req.body;
  const serviceId = req.params.serviceId as string;
  console.log(
    `Received NDID data request callback for service: ${serviceId}`,
    JSON.stringify(callbackData, null, 2),
  );
  eventEmitter.emit('ndid_callback', callbackData);
  res.status(204).end();
});

/** Callback: result of registering/updating a standard NDID service */
app.post('/as/service', async (req: Request, res: Response) => {
  const callbackData: NdidAsCallback = req.body;
  console.log(
    'Received NDID register service callback:',
    JSON.stringify(callbackData, null, 2),
  );
  eventEmitter.emit('ndid_callback', callbackData);
  res.status(204).end();
});

/** Callback: result of sending data via standard NDID */
app.post('/as/response', async (req: Request, res: Response) => {
  const callbackData: NdidAsCallback = req.body;
  console.log(
    'Received NDID send data callback:',
    JSON.stringify(callbackData, null, 2),
  );
  eventEmitter.emit('ndid_callback', callbackData);
  res.status(204).end();
});

/** Callback: request status update for requests this AS node is involved in */
app.post('/as/request_status_update', async (req: Request, res: Response) => {
  const callbackData: NdidRequestStatusCallback = req.body;
  console.log(
    'Received NDID request status update callback:',
    JSON.stringify(callbackData, null, 2),
  );
  eventEmitter.emit('ndid_callback', callbackData);
  res.status(204).end();
});

// ─── Your Data Callbacks (complete-consent / data-request) ───────────────────

/**
 * Callback: RP requests Your Data from this AS for a specific service.
 * AS must respond by calling POST /yourdata/as/data or POST /yourdata/as/error.
 */
app.post(
  '/yourdata/as/request/:serviceId',
  async (req: Request, res: Response) => {
    const callbackData: YourDataAsDataRequestCallback = req.body;
    const serviceId = req.params.serviceId as string;
    console.log(
      `Received Your Data request callback for service: ${serviceId}`,
      JSON.stringify(callbackData, null, 2),
    );
    eventEmitter.emit('yourdata_data_request', callbackData);
    res.status(204).end();
  },
);

/**
 * Callback: status update for a Your Data request.
 * Tracks: pending → data_decryption_key_requested → data_decryption_key_available → completed
 */
app.post(
  '/yourdata/as/request_status_update',
  async (req: Request, res: Response) => {
    const callbackData: YourDataAsRequestStatusCallback = req.body;
    console.log(
      'Received Your Data request status update:',
      JSON.stringify(callbackData, null, 2),
    );
    eventEmitter.emit('yourdata_status_update', callbackData);
    res.status(204).end();
  },
);

app.listen(config.ndidApiCallbackPort, () =>
  console.log(
    `AS2 callback server listening on port ${config.ndidApiCallbackPort}`,
  ),
);

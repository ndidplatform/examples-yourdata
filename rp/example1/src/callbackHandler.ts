import { EventEmitter } from 'events';
import express from 'express';
import type { Request, Response } from 'express';
import * as config from './config';
import type {
  NdidCallback,
  YourDataRequestStatusCallback,
  YourDataDecryptionKeyRetryRequestStatusCallback,
} from './types';

export const eventEmitter = new EventEmitter();

const app = express();
app.use(express.json({ limit: '2mb' }));

// ─── Standard NDID Callbacks (pre-consent / revoke) ──────────────────────────

/**
 * Callback: result of POST /rp/requests (create_request_result)
 * Callback: request status update (request_status)
 */
app.post('/rp/request/:referenceId', async (req: Request, res: Response) => {
  try {
    const callbackData: NdidCallback = req.body;
    console.log(
      'Received NDID request callback:',
      JSON.stringify(callbackData, null, 2),
    );
    eventEmitter.emit('ndid_callback', callbackData);
    res.status(204).end();
  } catch (error) {
    console.error(error);
    res.status(500).end();
  }
});

// ─── Your Data Callbacks (complete-consent / data-request) ───────────────────

/**
 * Callback: Your Data request status update
 * Status transitions: pending → data_decryption_pending →
 *   data_decryption_key_requested → data_decryption_key_available → completed
 */
app.post(
  '/yourdata/rp/request_status_update',
  async (req: Request, res: Response) => {
    try {
      const callbackData: YourDataRequestStatusCallback = req.body;
      console.log(
        'Received Your Data request status update:',
        JSON.stringify(callbackData, null, 2),
      );
      eventEmitter.emit('yourdata_callback', callbackData);
      res.status(204).end();
    } catch (error) {
      console.error(error);
      res.status(500).end();
    }
  },
);

app.post(
  '/yourdata/rp/data_decryption_key_retry_request_status_update',
  async (req: Request, res: Response) => {
    try {
      const callbackData: YourDataDecryptionKeyRetryRequestStatusCallback =
        req.body;
      console.log(
        'Received Your Data retry request status update:',
        JSON.stringify(callbackData, null, 2),
      );
      eventEmitter.emit('yourdata_retry_callback', callbackData);
      res.status(204).end();
    } catch (error) {
      console.error(error);
      res.status(500).end();
    }
  },
);

app.listen(config.ndidApiCallbackPort, () =>
  console.log(
    `RP callback server listening on port ${config.ndidApiCallbackPort}`,
  ),
);

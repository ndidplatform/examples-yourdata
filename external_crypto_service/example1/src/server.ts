import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import express from 'express';
import type { Request, Response } from 'express';
import morgan from 'morgan';

process.on('unhandledRejection', (reason: unknown) => {
  console.error('Unhandled Rejection:', reason);
});

const SERVER_PORT = parseInt(process.env.SERVER_PORT || '12000');

// ─── Crypto Helpers ───────────────────────────────────────────────────────────

function privateDecrypt(privateKey: string, ciphertext: string): Buffer {
  const buffer = Buffer.from(ciphertext, 'base64');
  return crypto.privateDecrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    },
    buffer,
  );
}

function createSignature(
  privateKey: string,
  hashMethod: string,
  message: Buffer,
): string {
  return crypto
    .createSign(hashMethod)
    .update(message)
    .sign(privateKey, 'base64');
}

function loadDevKey(nodeId: string): string {
  const keyPath = path.join(__dirname, '..', 'devKey', nodeId);
  return fs.readFileSync(keyPath, 'utf8');
}

// ─── Express App ──────────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(morgan('combined'));

// ─── DPKI Endpoints ───────────────────────────────────────────────────────────

/**
 * POST /dpki/decrypt
 * Decrypt an RSA-encrypted message using the node's private key.
 */
app.post('/dpki/decrypt', async (req: Request, res: Response) => {
  try {
    const { node_id, encrypted_message } = req.body as {
      node_id: string;
      encrypted_message: string;
      key_algorithm: string;
      encryption_algorithm: string;
      key_version: number;
    };

    console.log(`decrypt requested for node: ${node_id}`);
    console.log('Body:', JSON.stringify(req.body, null, 2));

    const key = loadDevKey(node_id);
    const decryptedBuffer = privateDecrypt(key, encrypted_message);
    const decrypted_message = decryptedBuffer.toString('base64');

    console.log(
      'decrypt response:',
      JSON.stringify({ decrypted_message }, null, 2),
    );
    res.status(200).json({ decrypted_message });
  } catch (error) {
    console.error('decrypt error:', error);
    res.status(500).json(error);
  }
});

/**
 * POST /dpki/sign
 * Sign a message using the node's private signing key.
 */
app.post('/dpki/sign', async (req: Request, res: Response) => {
  try {
    const { node_id, request_message, hash_algorithm } = req.body as {
      node_id: string;
      request_message: string;
      request_message_hash: string;
      hash_algorithm: string;
      key_algorithm: string;
      signing_algorithm: string;
      key_version: number;
    };

    console.log(`sign requested for node: ${node_id}`);
    console.log('Body:', JSON.stringify(req.body, null, 2));

    const key = loadDevKey(node_id);
    const dataToSign = Buffer.from(request_message, 'base64');
    const signature = createSignature(key, hash_algorithm, dataToSign);

    console.log('sign response:', JSON.stringify({ signature }, null, 2));
    res.status(200).json({ signature });
  } catch (error) {
    console.error('sign error:', error);
    res.status(500).json(error);
  }
});

/**
 * POST /dpki/master/sign
 * Sign a message using the node's master private key.
 */
app.post('/dpki/master/sign', async (req: Request, res: Response) => {
  try {
    const { node_id, request_message, hash_algorithm } = req.body as {
      node_id: string;
      request_message: string;
      request_message_hash: string;
      hash_algorithm: string;
      key_algorithm: string;
      signing_algorithm: string;
      key_version: number;
    };

    console.log(`master/sign requested for node: ${node_id}`);
    console.log('Body:', JSON.stringify(req.body, null, 2));

    const key = loadDevKey(`${node_id}_master`);
    const dataToSign = Buffer.from(request_message, 'base64');
    const signature = createSignature(key, hash_algorithm, dataToSign);

    console.log(
      'master/sign response:',
      JSON.stringify({ signature }, null, 2),
    );
    res.status(200).json({ signature });
  } catch (error) {
    console.error('master/sign error:', error);
    res.status(500).json(error);
  }
});

// ─── Start Server ─────────────────────────────────────────────────────────────

app.listen(SERVER_PORT, () => {
  console.log(
    `External crypto service (DPKI) listening on port ${SERVER_PORT}`,
  );
});

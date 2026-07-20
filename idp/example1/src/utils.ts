import crypto from 'crypto';
import { spawnSync } from 'child_process';
import * as config from './config';
import fs from 'fs';

/**
 * Generate a new RSA 2048 key pair for a given identity (namespace:identifier).
 * Keys are saved to disk at config.keyPath.
 */
export function genNewKeyPair(sid: string): void {
  fs.mkdirSync(config.keyPath, { recursive: true });
  const keyFilePath = config.keyPath + sid;

  const gen = spawnSync('openssl', ['genrsa', '-out', keyFilePath, '2048']);
  const encode = spawnSync('openssl', [
    'rsa',
    '-in',
    keyFilePath,
    '-pubout',
    '-out',
    keyFilePath + '.pub',
  ]);

  if (gen.status !== 0 || encode.status !== 0) {
    throw new Error('Failed in genNewKeyPair()');
  }
}

export function readPublicKey(sid: string): string {
  return fs.readFileSync(config.keyPath + sid + '.pub', 'utf8');
}

export function readPrivateKey(sid: string): string {
  return fs.readFileSync(config.keyPath + sid, 'utf8');
}

/**
 * Sign a message hash using RSA private key (no padding).
 * Used to create the accessor signature when responding to consent requests.
 */
export function createResponseSignature(
  privateKey: string,
  messagePaddedHash: string,
): string {
  return crypto
    .privateEncrypt(
      {
        key: privateKey,
        padding: crypto.constants.RSA_NO_PADDING,
      },
      Buffer.from(messagePaddedHash, 'base64'),
    )
    .toString('base64');
}

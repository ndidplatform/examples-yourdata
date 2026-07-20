import * as config from './config';
import type {
  SetIdpCallbacksParams,
  CreateIdentityParams,
  CreateIdentityResponse,
  RespondToRequestParams,
} from './types';

// ─── HTTP Helpers ─────────────────────────────────────────────────────────────

function logResponse(
  url: string,
  method: string,
  status: number,
  body?: unknown,
  error?: unknown,
): void {
  console.log(
    `Received response from NDID API:
    URL: ${url} (${method})
    Status: ${status}${body ? '\nBody:\n' + JSON.stringify(body, null, 2) : ''}${error ? '\nError:\n' + JSON.stringify(error, null, 2) : ''}`,
  );
}

async function httpGet<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    if (response.status === 400 || response.status === 500) {
      const errorJson = await response.json();
      logResponse(url, 'GET', response.status, null, errorJson);
      throw errorJson;
    }
    throw response;
  }

  const responseJson = (await response.json()) as T;
  logResponse(url, 'GET', response.status, responseJson);
  return responseJson;
}

async function httpPost<T>(
  url: string,
  body: unknown,
  expectResponseBody = true,
): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    if (
      response.status === 400 ||
      response.status === 500 ||
      response.status === 403
    ) {
      const errorJson = await response.json();
      logResponse(url, 'POST', response.status, null, errorJson);
      throw errorJson;
    }
    throw response;
  }

  if (expectResponseBody) {
    const responseJson = (await response.json()) as T;
    logResponse(url, 'POST', response.status, responseJson);
    return responseJson;
  }

  logResponse(url, 'POST', response.status);
  return undefined as unknown as T;
}

// ─── IDP API ──────────────────────────────────────────────────────────────────

/**
 * POST /v7/idp/callback
 * Set IDP callback URLs for incoming requests and accessor encryption.
 */
export function setCallbackUrls(params: SetIdpCallbacksParams): Promise<void> {
  return httpPost<void>(`${config.ndidApiBaseUrl}/idp/callback`, params, false);
}

/**
 * GET /v7/idp/callback
 * Get currently configured IDP callback URLs.
 */
export function getCallbackUrls(): Promise<unknown> {
  return httpGet(`${config.ndidApiBaseUrl}/idp/callback`);
}

/**
 * POST /v7/identity
 * Create a new identity (on-board a user) on the NDID platform.
 */
export function createNewIdentity(
  params: CreateIdentityParams,
): Promise<CreateIdentityResponse> {
  return httpPost<CreateIdentityResponse>(
    `${config.ndidApiBaseUrl}/identity`,
    params,
  );
}

/**
 * POST /v7/idp/response
 * Respond to an incoming consent request (accept or reject).
 */
export function respondToRequest(
  params: RespondToRequestParams,
): Promise<void> {
  return httpPost<void>(`${config.ndidApiBaseUrl}/idp/response`, params, false);
}

/**
 * GET /v7/utility/idp
 * Get list of available IDP nodes.
 */
export function getIdpList(): Promise<unknown> {
  return httpGet(`${config.ndidApiBaseUrl}/utility/idp`);
}

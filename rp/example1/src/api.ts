import * as config from './config';
import type {
  CreateNdidRequestParams,
  CreateNdidRequestResponse,
  CreateYourDataRequestParams,
  CreateYourDataRequestResponse,
  YourDataItem,
  CreateDecryptionKeyRetryParams,
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

// ─── Standard NDID API (pre-consent / revoke) ────────────────────────────────

/**
 * GET /v7/utility/idp/{namespace}/{identifier}
 * Returns all IDP nodes that have onboarded this user's identity.
 * Front-end uses this to show the user an IDP picker before creating a request.
 * Spec: https://app.swaggerhub.com/apis/NDID/utility/7.0 — GET /utility/idp/{namespace}/{identifier}
 */
export function getIdentityIdpList(
  namespace: string,
  identifier: string,
  options?: { min_ial?: number; min_aal?: number; mode?: 2 | 3 },
): Promise<unknown> {
  const params = new URLSearchParams();
  if (options?.min_ial != null) params.set('min_ial', String(options.min_ial));
  if (options?.min_aal != null) params.set('min_aal', String(options.min_aal));
  if (options?.mode != null) params.set('mode', String(options.mode));
  const qs = params.toString() ? `?${params.toString()}` : '';
  return httpGet(
    `${config.ndidApiBaseUrl}/utility/idp/${namespace}/${identifier}${qs}`,
  );
}

/**
 * GET /v7/utility/as/{service_id}
 * Returns all AS nodes registered to serve this service_id.
 */
export function getServiceAsList(service_id: string): Promise<unknown> {
  return httpGet(`${config.ndidApiBaseUrl}/utility/as/${service_id}`);
}

/**
 * POST /v7/rp/requests/{namespace}/{identifier}
 * Used for: pre-consent and revoke flows (standard NDID on-chain consent).
 */
export function createNdidRequest(
  params: CreateNdidRequestParams,
): Promise<CreateNdidRequestResponse> {
  const { namespace, identifier, ...body } = params;
  return httpPost<CreateNdidRequestResponse>(
    `${config.ndidApiBaseUrl}/rp/requests/${namespace}/${identifier}`,
    body,
  );
}

/**
 * GET /v7/rp/request_data/{request_id}
 * Retrieve data (e.g. pre-consent token) from a completed standard NDID request.
 */
export function getNdidRequestData(requestId: string): Promise<unknown> {
  return httpGet(`${config.ndidApiBaseUrl}/rp/request_data/${requestId}`);
}

// ─── Your Data RP API ─────────────────────────────────────────────────────────

/**
 * POST /v7/yourdata/rp/requests
 * Used for: complete-consent and data-request flows.
 */
export function createYourDataRequest(
  params: CreateYourDataRequestParams,
): Promise<CreateYourDataRequestResponse> {
  return httpPost<CreateYourDataRequestResponse>(
    `${config.yourDataApiBaseUrl}/yourdata/rp/requests`,
    params,
  );
}

/**
 * GET /v7/yourdata/rp/request_references/{reference_id}
 * Get active/in-progress Your Data request by reference ID.
 */
export function getYourDataRequestByReference(
  referenceId: string,
): Promise<unknown> {
  return httpGet(
    `${config.yourDataApiBaseUrl}/yourdata/rp/request_references/${referenceId}`,
  );
}

/**
 * GET /v7/yourdata/rp/request_data/{request_id}
 * Get decrypted Your Data response (consent token or actual data).
 */
export function getYourDataRequestData(
  requestId: string,
): Promise<YourDataItem> {
  return httpGet<YourDataItem>(
    `${config.yourDataApiBaseUrl}/yourdata/rp/request_data/${requestId}`,
  );
}

/**
 * POST /v7/yourdata/rp/data_decryption_key_retry_requests
 * Retry requesting the data decryption key from AS.
 */
export function retryDecryptionKeyRequest(
  params: CreateDecryptionKeyRetryParams,
): Promise<void> {
  return httpPost<void>(
    `${config.yourDataApiBaseUrl}/yourdata/rp/data_decryption_key_retry_requests`,
    params,
    false,
  );
}

/**
 * GET /v7/yourdata/rp/data_decryption_key_retry_request_references/{reference_id}
 * Get active/in-progress data decryption key retry request by reference ID.
 */
export function getDataDecryptionKeyRetryByReference(
  referenceId: string,
): Promise<unknown> {
  return httpGet(
    `${config.yourDataApiBaseUrl}/yourdata/rp/data_decryption_key_retry_request_references/${referenceId}`,
  );
}

/**
 * POST /v7/yourdata/rp/request_data_removal/{request_id}
 * Remove Your Data received from AS for a specific request.
 */
export function removeYourDataByRequest(requestId: string): Promise<void> {
  return httpPost<void>(
    `${config.yourDataApiBaseUrl}/yourdata/rp/request_data_removal/${requestId}`,
    {},
    false,
  );
}

/**
 * POST /v7/yourdata/rp/request_data_removal
 * Remove all Your Data received from AS.
 */
export function removeAllYourData(): Promise<void> {
  return httpPost<void>(
    `${config.yourDataApiBaseUrl}/yourdata/rp/request_data_removal`,
    {},
    false,
  );
}

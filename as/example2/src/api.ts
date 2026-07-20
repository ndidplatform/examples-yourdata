import * as config from './config';
import type {
  SetYourDataCallbacksParams,
  RegisterYourDataServiceParams,
  SendYourDataParams,
  SendYourDataErrorParams,
  YourDataTokenResponse,
  CreateYourDataTokenParams,
  AutoErrorResponseParams,
  SendNdidDataParams,
  RegisterNdidServiceParams,
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

// ─── Standard NDID AS API (pre-consent / revoke) ─────────────────────────────

/**
 * POST /v7/as/data/{request_id}/{service_id}
 * Respond to a standard NDID data request (pre-consent or revoke) with data.
 */
export function sendNdidData(params: SendNdidDataParams): Promise<void> {
  const { request_id, service_id, ...body } = params;
  return httpPost<void>(
    `${config.ndidApiBaseUrl}/as/data/${request_id}/${service_id}`,
    body,
    false,
  );
}

/**
 * POST /v7/as/service/{service_id}
 * Register a standard NDID service (for pre-consent / revoke service IDs).
 */
export function registerNdidService(params: RegisterNdidServiceParams): Promise<void> {
  const { service_id, ...body } = params;
  return httpPost<void>(
    `${config.ndidApiBaseUrl}/as/service/${service_id}`,
    body,
    false,
  );
}

// ─── Your Data AS API ─────────────────────────────────────────────────────────

/**
 * POST /v7/yourdata/as/callback
 * Set callback URLs for Your Data AS events.
 */
export function setYourDataCallbacks(
  params: SetYourDataCallbacksParams,
): Promise<void> {
  return httpPost<void>(
    `${config.yourDataApiBaseUrl}/yourdata/as/callback`,
    params,
    false,
  );
}

/**
 * GET /v7/yourdata/as/callback
 * Get currently configured Your Data AS callback URLs.
 */
export function getYourDataCallbacks(): Promise<unknown> {
  return httpGet(`${config.yourDataApiBaseUrl}/yourdata/as/callback`);
}

/**
 * POST /v7/yourdata/as/service/{service_id}
 * Register or update a Your Data service offered by this AS.
 */
export function registerYourDataService(
  params: RegisterYourDataServiceParams,
): Promise<void> {
  const { service_id, ...body } = params;
  return httpPost<void>(
    `${config.yourDataApiBaseUrl}/yourdata/as/service/${service_id}`,
    body,
    false,
  );
}

/**
 * GET /v7/yourdata/as/service/{service_id}
 * Get a registered Your Data service.
 */
export function getYourDataService(serviceId: string): Promise<unknown> {
  return httpGet(
    `${config.yourDataApiBaseUrl}/yourdata/as/service/${serviceId}`,
  );
}

/**
 * POST /v7/yourdata/as/data
 * Respond to a Your Data request with actual data.
 */
export function sendYourData(params: SendYourDataParams): Promise<void> {
  return httpPost<void>(
    `${config.yourDataApiBaseUrl}/yourdata/as/data`,
    params,
    false,
  );
}

/**
 * POST /v7/yourdata/as/error
 * Respond to a Your Data request with an error.
 */
export function sendYourDataError(
  params: SendYourDataErrorParams,
): Promise<void> {
  return httpPost<void>(
    `${config.yourDataApiBaseUrl}/yourdata/as/error`,
    params,
    false,
  );
}

/**
 * POST /v7/yourdata/utility/token
 * Create a signed JWT / Your Data authorization token.
 * Used by AS to include consent proof when sending data.
 */
export function createYourDataToken(
  params: CreateYourDataTokenParams,
): Promise<YourDataTokenResponse> {
  return httpPost<YourDataTokenResponse>(
    `${config.yourDataApiBaseUrl}/yourdata/utility/token`,
    params,
  );
}

/**
 * POST /v7/yourdata/as/auto_error_responses
 * Configure automatic error responses for specific error cases.
 */
export function setAutoErrorResponse(
  params: AutoErrorResponseParams,
): Promise<void> {
  return httpPost<void>(
    `${config.yourDataApiBaseUrl}/yourdata/as/auto_error_responses`,
    params,
    false,
  );
}

/**
 * GET /v7/yourdata/as/auto_error_responses
 * Get configured automatic error responses.
 */
export function getAutoErrorResponses(): Promise<unknown> {
  return httpGet(
    `${config.yourDataApiBaseUrl}/yourdata/as/auto_error_responses`,
  );
}

/**
 * GET /v7/yourdata/utility/as_error_codes
 * Get all possible Your Data AS error codes.
 */
export function getYourDataErrorCodes(): Promise<unknown> {
  return httpGet(
    `${config.yourDataApiBaseUrl}/yourdata/utility/as_error_codes`,
  );
}

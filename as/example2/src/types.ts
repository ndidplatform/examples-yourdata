// ─── Standard NDID AS Callback Types (pre-consent / revoke) ─────────────────

export interface NdidDataRequestCallback {
  node_id: string;
  type: 'data_request';
  request_id: string;
  mode: 1 | 2 | 3;
  namespace: string;
  identifier: string;
  service_id: string;
  requester_node_id: string;
  response_signature_list: string[];
  max_ial: number;
  max_aal: number;
  creation_time: number;
  creation_block_height: string;
  request_timeout: number;
  request_params?: string;
  request_type?: string;
}

interface NdidCallbackError {
  code: number;
  message: string;
}

export interface NdidSendDataResultCallback {
  node_id: string;
  type: 'response_result';
  request_id: string;
  reference_id: string;
  success: boolean;
  error?: NdidCallbackError;
}

export interface NdidServiceUpdateResultCallback {
  node_id: string;
  type: 'add_or_update_service_result' | 'set_service_price_result';
  reference_id: string;
  success: boolean;
  error?: NdidCallbackError;
}

interface NdidRequestStatusResponseItem {
  idp_id: string;
  ial?: number;
  aal?: number;
  status?: 'accept' | 'reject';
  error_code?: number;
  signature?: string;
  valid_signature?: boolean;
  valid_ial?: boolean;
}

interface NdidRequestStatusAsResponseItem {
  as_id: string;
  signed?: boolean;
  received_data?: boolean;
  error_code?: number;
}

interface NdidRequestStatusDataRequestItem {
  service_id: string;
  as_id_list: string[];
  min_as: number;
  request_params_hash: string;
  response_list: NdidRequestStatusAsResponseItem[];
}

export interface NdidRequestStatusCallback {
  node_id: string;
  type: 'request_status';
  request_id: string;
  requester_node_id: string;
  mode: 1 | 2 | 3;
  request_message_hash: string;
  min_ial: number;
  min_aal: number;
  min_idp: number;
  idp_id_list: string[];
  response_list: NdidRequestStatusResponseItem[];
  data_request_list: NdidRequestStatusDataRequestItem[];
  request_timeout: number;
  closed: boolean;
  timed_out: boolean;
  status:
    | 'pending'
    | 'confirmed'
    | 'rejected'
    | 'partial_completed'
    | 'completed'
    | 'complicated'
    | 'errored';
  block_height: string;
  request_type?: string;
}

export type NdidAsCallback =
  | NdidDataRequestCallback
  | NdidSendDataResultCallback
  | NdidServiceUpdateResultCallback
  | NdidRequestStatusCallback;

// ─── Your Data AS Callback Types ─────────────────────────────────────────────

export type YourDataRequestStatus =
  | 'pending'
  | 'data_decryption_pending'
  | 'data_decryption_key_requested'
  | 'data_decryption_key_available'
  | 'completed'
  | 'errored';

/** Callback when RP requests data: AS must respond with data or error */
export interface YourDataAsDataRequestCallback {
  node_id: string;
  type: 'yourdata.data_request';
  request_id: string;
  service_id: string;
  service_version?: string;
  service_extension?: string[];
  requester_node_id: string;
  namespace: string;
  identifier: string;
  request_params: string;
  authorization: string;
  request_time: number;
  request_timeout: number;
}

/** Callback for status updates on a Your Data request */
export interface YourDataAsRequestStatusBase {
  node_id?: string;
  type?: 'yourdata.request_status';
  requester_node_id: string;
  as_node_id: string;
  request_id: string;
  request_timeout: number;
  timed_out: boolean;
  status: YourDataRequestStatus;
  service_id?: string;
}

export type YourDataAsRequestStatusCallback =
  | YourDataAsRequestStatusBase
  | (YourDataAsRequestStatusBase & {
      status: 'errored';
      error_code: number;
      error_message: string;
    });

// ─── Shared Utility Types ─────────────────────────────────────────────────────

/** Shape of error bodies returned by the NDID API node (used in retry-loop casts). */
export interface NdidApiErrorBody {
  error?: { code?: number };
}

/** Optional date range passed in request_params by the RP. Max 92-day window. */
export interface DateRangeParams {
  /** Deposit: fromBookingDateTime (ISO 8601 datetime with TZ, e.g. "2026-01-01T00:00:00+07:00") */
  fromBookingDateTime?: string;
  /** Deposit: toBookingDateTime (ISO 8601 datetime with TZ, e.g. "2026-03-31T23:59:59+07:00") */
  toBookingDateTime?: string;
  /** Card payment: fromTransactionDate */
  fromTransactionDate?: string;
  /** Card payment: toTransactionDate */
  toTransactionDate?: string;
  /** Response language. Required by spec. TH = Thai, EN = English */
  language?: 'TH' | 'EN';
}

// ─── Standard NDID AS API Types ──────────────────────────────────────────────

export type YourDataUsageType =
  | 'one_time'
  | 'continuous_with_expire'
  | 'continuous_no_expire';

export interface SendNdidDataParams {
  request_id: string;
  service_id: string;
  reference_id: string;
  callback_url: string;
  data: string;
}

export interface RegisterNdidServiceParams {
  service_id: string;
  reference_id: string;
  callback_url: string;
  min_ial: number;
  min_aal: number;
  url: string;
  supported_namespace_list?: string[];
}

// ─── Consent Intent ───────────────────────────────────────────────────────────

/**
 * Intent stored at pre-consent time, keyed by as_token.
 * At complete-consent, AS reads usage_type, data_service_list, and sub_identity_list
 * from here using data.authorization (the as_token) as the key — so the DC doesn't
 * need to resend any of these at complete-consent.
 */
export interface ConsentIntent {
  usage_type: YourDataUsageType;
  data_service_list?: Array<{
    service_id: string;
    service_version?: string;
    service_extension?: string[];
    expiration_datetime?: number;
  }>;
  sub_identity_list?: SubIdentity[];
  /**
   * Reason the DC is requesting data, e.g. "เพื่อการพิจารณาให้สินเชื่อ".
   */
  token_objective?: string;
}

// ─── Your Data AS API Types ───────────────────────────────────────────────────

export interface SetYourDataCallbacksParams {
  incoming_request_status_update_url: string;
}

export interface RegisterYourDataServiceParams {
  service_id: string;
  node_id?: string;
  service_url: string;
  supported_namespace_list: string[];
  supported_authorization: Array<
    | 'no_token_needed'
    | 'token_one_time'
    | 'token_continuous_with_expire'
    | 'token_continuous_no_expire'
  >;
  service_availability?: boolean;
}

export interface SendYourDataParams {
  request_id: string;
  data: string;
  node_id?: string;
}

export interface SendYourDataErrorParams {
  request_id: string;
  error_code: number;
  error_message?: string;
  node_id?: string;
}

export interface YourDataTokenResponse {
  token: string;
}

export interface SubIdentity {
  namespace: string;
  identifier: string;
  visible_identifier: string;
  identifier_extension?: string;
}

export interface CreateYourDataTokenParams {
  requester_node_id: string;
  as_node_id: string;
  namespace?: string;
  identifier?: string;
  token_objective?: string;
  sub_identity_list?: SubIdentity[];
  service_id_list?: Array<{
    service_id: string;
    service_version?: string;
    service_extension?: string[];
  }>;
  validate_identifier?: boolean;
  validate_service_id?: boolean;
  validate_service_extension?: boolean;
  usage_type?: YourDataUsageType;
  expiration_datetime?: number;
  source_request_id_list?: string[];
}

export interface AutoErrorResponseParams {
  node_id?: string;
  bypass_error_code_check?: boolean;
  unsupported_service?: { error_code?: number; error_message?: string };
  service_not_available?: { error_code?: number; error_message?: string };
  unsupported_namespace?: { error_code?: number; error_message?: string };
  unsupported_authorization?: { error_code?: number; error_message?: string };
}

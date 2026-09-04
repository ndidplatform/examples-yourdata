// ─── Your Data Request Status ────────────────────────────────────────────────

export type YourDataRequestStatus =
  | 'pending'
  | 'data_decryption_pending'
  | 'data_decryption_key_requested'
  | 'data_decryption_key_available'
  | 'completed'
  | 'errored';

// ─── Standard NDID Request (pre-consent / revoke) ────────────────────────────

export interface NdidDataRequestItem {
  service_id: string;
  as_id_list?: string[];
  min_as: number;
  request_params?: string;
}

export interface CreateNdidRequestParams {
  namespace: string;
  identifier: string;
  node_id?: string;
  mode: number;
  reference_id: string;
  idp_id_list?: string[];
  callback_url: string;
  data_request_list?: NdidDataRequestItem[];
  request_message: string;
  min_ial: number;
  min_aal: number;
  min_idp: number;
  request_timeout: number;
  bypass_identity_check?: boolean;
  initial_salt?: string;
  request_type?: string;
}

export interface CreateNdidRequestResponse {
  request_id: string;
  initial_salt: string;
}

interface NdidCallbackError {
  code: number;
  message: string;
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

export interface NdidCreateRequestResultCallback {
  node_id: string;
  type: 'create_request_result';
  reference_id: string;
  request_id: string;
  success: boolean;
  creation_block_height?: string;
  error?: NdidCallbackError;
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

export interface NdidCloseRequestResultCallback {
  node_id: string;
  type: 'close_request_result';
  reference_id: string;
  request_id: string;
  success: boolean;
  error?: NdidCallbackError;
}

export type NdidCallback =
  | NdidCreateRequestResultCallback
  | NdidRequestStatusCallback
  | NdidCloseRequestResultCallback;

// ─── Your Data Token Payload (decoded as_token / consent_token JWT) ─────────
// Only the fields the RP actually reads back — the real payload has more.

export interface YourDataTokenServiceEntry {
  service_id: string;
  service_version?: string;
  service_extension?: string[];
}

export interface YourDataTokenSubIdentity {
  namespace: string;
  /** Real, unmasked account/card number — not the opaque pre-consent id. */
  identifier: string;
  visible_identifier?: string;
  identifier_extension?: string;
}

export interface YourDataTokenPayload {
  token_id?: string;
  as_node_id?: string;
  service_id_list?: YourDataTokenServiceEntry[];
  sub_identity_list?: YourDataTokenSubIdentity[];
  [key: string]: unknown;
}

// ─── Your Data RP Create Request ─────────────────────────────────────────────

export interface CreateYourDataRequestParams {
  node_id?: string;
  service_id: string;
  service_version?: string;
  service_extension?: string[];
  as_node_id: string;
  reference_id: string;
  callback_url: string;
  namespace: string;
  identifier: string;
  request_params: string;
  authorization: string;
  request_timeout: number;
}

export interface CreateYourDataRequestResponse {
  request_id: string;
}

// ─── Your Data RP Request Status Callback ────────────────────────────────────

type YourDataRequestStatusNonError =
  | 'pending'
  | 'data_decryption_pending'
  | 'data_decryption_key_requested'
  | 'data_decryption_key_available'
  | 'completed';

interface YourDataRequestStatusCallbackBase {
  node_id?: string;
  type: 'yourdata.request_status';
  requester_node_id: string;
  as_node_id: string;
  request_id: string;
  request_timeout: number;
  timed_out: boolean;
}

export type YourDataRequestStatusCallback =
  | (YourDataRequestStatusCallbackBase & {
      status: YourDataRequestStatusNonError;
    })
  | (YourDataRequestStatusCallbackBase & {
      status: 'errored';
      error_code: number;
      error_message: string;
    });

export interface YourDataDecryptionKeyRetryRequestStatusCallback {
  node_id?: string;
  type: 'yourdata.data_decryption_key_retry_request_status';
  requester_node_id: string;
  as_node_id: string;
  request_id: string;
  request_timeout: number;
  timed_out: boolean;
  status: 'pending' | 'completed';
}

// ─── Your Data RP Request Data (GET response) ────────────────────────────────

export interface YourDataItem {
  source_node_id: string;
  service_id: string;
  source_signature: string;
  signature_signing_algorithm:
    | 'RSASSA_PKCS1_V1_5_SHA_256'
    | 'RSASSA_PKCS1_V1_5_SHA_384'
    | 'RSASSA_PKCS1_V1_5_SHA_512'
    | 'RSASSA_PSS_SHA_256'
    | 'RSASSA_PSS_SHA_384'
    | 'RSASSA_PSS_SHA_512'
    | 'ECDSA_SHA_256'
    | 'ECDSA_SHA_384'
    | 'Ed25519';
  signature_signing_key_version: number;
  data_salt: string;
  data: string;
}

// ─── Your Data Decryption Key Retry ──────────────────────────────────────────

export interface CreateDecryptionKeyRetryParams {
  request_id: string;
  reference_id: string;
  callback_url: string;
  request_timeout: number;
}

// ─── RP Server Request Body Types ────────────────────────────────────────────

/** Item in data_request_list for POST /pre-consent/create */
interface PreConsentDataRequestItem {
  service_id: string;
  as_id_list?: string[];
  min_as?: number;
  /**
   * JSON-stringified intent object passed as-is to the NDID platform and
   * forwarded to the AS callback. Must include "usage_type" and optionally
   * "data_service_list" so the AS can build the scoped consent token.
   * Example: '{"token_objective":"เพื่อการพิจารณาให้สินเชื่อ","usage_type":"one_time","data_service_list":[{"service_id":"900.deposit_transactions_basic_002"}]}' — the service_id itself encodes data level (basic/detail) and lookback period (*_001 = 6 months, *_002 = 12 months), so no service_extension is needed here.
   */
  request_params: string;
}

/** Account/card item as surfaced from pre-consent's masked sub_identity_list. */
export interface YourDataAccountItem {
  namespace: string;
  /** Opaque unique ID generated by AS — not the real account number */
  identifier: string;
  visible_identifier: string;
  identifier_extension?: string;
}

export interface PreConsentCreateBody {
  namespace: string;
  identifier: string;
  data_request_list: PreConsentDataRequestItem[];
  idp_id_list?: string[];
  min_idp?: number;
  request_timeout?: number;
}

export interface CompleteConsentCreateBody {
  as_node_id: string;
  namespace: string;
  identifier: string;
  /**
   * The RP resolves the as_token itself from this pre-consent request_id
   * plus as_node_id — the client never sends the raw token.
   */
  pre_consent_request_id: string;
  /**
   * Full account item objects the user selected from the pre-consent masked list.
   * Per spec (YourData_Schema_Common), the RP sends back the complete objects
   * (namespace, identifier, visible_identifier, identifier_extension) received
   * from pre-consent. Empty array or omitted = consent to all accounts.
   */
  selected_accounts?: YourDataAccountItem[];
  request_timeout?: number;
}

export interface DataRequestCreateBody {
  service_id: string;
  as_node_id: string;
  namespace: string;
  identifier: string;
  /** The RP resolves the consent_token itself from this accountId. */
  account_id: string;
  request_timeout?: number;
  request_params?: string;
  /**
   * Scope of data to return, e.g. ["transactions_basic"] or ["transactions_detail"].
   * Forwarded to AS in the callback; AS uses it to decide detail level.
   */
  service_extension?: string[];
}

export interface RevokeCreateBody {
  namespace: string;
  identifier: string;
  /** The RP resolves each accountId's consent_token itself. */
  account_ids: string[];
  idp_id_list?: string[];
  min_idp?: number;
  request_timeout?: number;
}

export interface RetryDecryptionKeyBody {
  request_id: string;
  request_timeout?: number;
}

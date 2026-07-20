// ─── IDP Callback Types ───────────────────────────────────────────────────────

interface IdpCallbackError {
  code: number;
  message: string;
}

interface IdpRequestStatusResponseItem {
  idp_id: string;
  ial?: number;
  aal?: number;
  status?: 'accept' | 'reject';
  error_code?: number;
  signature?: string;
  valid_signature?: boolean;
  valid_ial?: boolean;
}

interface IdpRequestStatusAsResponseItem {
  as_id: string;
  signed?: boolean;
  received_data?: boolean;
  error_code?: number;
}

interface IdpRequestStatusDataRequestItem {
  service_id: string;
  as_id_list: string[];
  min_as: number;
  request_params_hash: string;
  response_list: IdpRequestStatusAsResponseItem[];
}

interface IdpIncomingRequestBase {
  node_id: string;
  type: 'incoming_request';
  mode: 1 | 2 | 3;
  request_id: string;
  request_message: string;
  request_message_hash: string;
  request_message_salt: string;
  requester_node_id: string;
  min_ial: number;
  min_aal: number;
  initial_salt: string;
  creation_time: number;
  creation_block_height: string;
  request_timeout: number;
  namespace?: string;
  identifier?: string;
  reference_group_code?: string;
  data_request_list?: Array<{
    service_id: string;
    as_id_list?: string[];
    min_as?: number;
  }>;
  request_type?: string;
}

export type IdpIncomingRequestCallback =
  | (IdpIncomingRequestBase & {
      mode: 1;
      namespace: string;
      identifier: string;
    })
  | (IdpIncomingRequestBase & {
      mode: 2 | 3;
    });

export interface IdpRequestStatusCallback {
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
  response_list: IdpRequestStatusResponseItem[];
  data_request_list: IdpRequestStatusDataRequestItem[];
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

export interface IdpResponseResultCallback {
  node_id: string;
  type: 'response_result';
  reference_id: string;
  request_id: string;
  success: boolean;
  error?: IdpCallbackError;
}

export interface IdpCreateIdentityRequestResultCallback {
  node_id: string;
  type: 'create_identity_request_result';
  reference_id: string;
  request_id: string;
  accessor_id: string;
  exist?: boolean;
  creation_block_height?: string;
  success: boolean;
  error?: IdpCallbackError;
}

export interface IdpCreateIdentityResultCallback {
  node_id: string;
  type: 'create_identity_result';
  reference_id: string;
  request_id?: string;
  reference_group_code?: string;
  success: boolean;
  error?: IdpCallbackError;
}

export interface IdpIdentityNotificationCallback {
  node_id: string;
  type: 'identity_modification_notification';
  reference_group_code: string;
  action:
    | 'create_identity'
    | 'revoke_identity_association'
    | 'add_identity'
    | 'add_accessor'
    | 'revoke_accessor'
    | 'revoke_and_add_accessor'
    | 'upgrade_identity_mode';
  actor_node_id: string;
}

export interface IdpSimpleResultCallback {
  node_id: string;
  type:
    | 'add_identity_result'
    | 'add_identity_request_result'
    | 'update_ial_result'
    | 'update_lial_result'
    | 'update_laal_result'
    | 'add_accessor_result'
    | 'add_accessor_request_result'
    | 'revoke_identity_association_result'
    | 'revoke_identity_association_request_result'
    | 'revoke_accessor_result'
    | 'revoke_accessor_request_result'
    | 'revoke_and_add_accessor_result'
    | 'revoke_and_add_accessor_request_result'
    | 'upgrade_identity_mode_result'
    | 'upgrade_identity_mode_request_result'
    | 'close_request_result';
  reference_id: string;
  success: boolean;
  request_id?: string;
  accessor_id?: string;
  revoking_accessor_id?: string;
  creation_block_height?: string;
  error?: IdpCallbackError;
}

export interface IdpErrorCallback {
  type: 'error';
  node_id?: string;
  action?: string;
  request_id?: string;
  error: IdpCallbackError;
}

export interface IdpAccessorEncryptRequest {
  accessor_id: string;
  request_message_padded_hash: string;
}

export type IdpCallback =
  | IdpIncomingRequestCallback
  | IdpRequestStatusCallback
  | IdpResponseResultCallback
  | IdpCreateIdentityRequestResultCallback
  | IdpCreateIdentityResultCallback
  | IdpIdentityNotificationCallback
  | IdpSimpleResultCallback
  | IdpErrorCallback;

// ─── IDP API Types ────────────────────────────────────────────────────────────

export interface SetIdpCallbacksParams {
  incoming_request_url: string;
  incoming_request_status_update_url?: string;
  identity_modification_notification_url?: string;
  accessor_encrypt_url?: string;
  error_url?: string;
}

export interface CreateIdentityParams {
  reference_id: string;
  callback_url: string;
  identity_list: Array<{ namespace: string; identifier: string }>;
  mode: number;
  accessor_type: string;
  accessor_public_key: string;
  ial: number;
}

export interface CreateIdentityResponse {
  request_id: string;
  accessor_id: string;
}

export interface RespondToRequestParams {
  request_id: string;
  namespace: string;
  identifier: string;
  reference_id: string;
  callback_url: string;
  ial: number;
  aal: number;
  status: 'accept' | 'reject';
  accessor_id: string;
  signature: string;
}

// ─── In-memory Store Types ────────────────────────────────────────────────────

export interface AccessorRecord {
  accessor_id: string;
  accessor_private_key: string;
  accessor_public_key: string;
  namespace: string;
  identifier: string;
}

export interface ReferenceRecord {
  id: string;
  namespace?: string;
  identifier?: string;
  accessor_id?: string;
  accessor_private_key?: string;
  accessor_public_key?: string;
  request_id?: string;
}

// ─── IDP Server Request Body Types ───────────────────────────────────────────

export interface CreateIdentityBody {
  namespace: string;
  identifier: string;
  mode: number;
}

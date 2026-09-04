import type { ServiceData } from '@/domain/types'

export interface FetchDataParams {
  dpId: string
  // The fully-resolved Your Data service_id, e.g.
  // '900.deposit_transactions_basic_002' — level (basic/detail) and lookback
  // period (6/12 months) are encoded in the id itself, not a service_extension.
  datasetId: string
  // The RP backend resolves the consent_token itself from this accountId.
  accountId: string
}

export interface DataRequestService {
  fetchData(params: FetchDataParams): Promise<ServiceData[]>
}

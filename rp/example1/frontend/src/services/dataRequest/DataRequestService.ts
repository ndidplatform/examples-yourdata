import type { ServiceData } from '@/domain/types'

export interface FetchDataParams {
  dpId: string
  datasetId: string
  serviceExtension: string
  // The RP backend resolves the consent_token itself from this accountId.
  accountId: string
}

export interface DataRequestService {
  fetchData(params: FetchDataParams): Promise<ServiceData[]>
}

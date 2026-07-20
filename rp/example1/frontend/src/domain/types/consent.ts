export type ConsentType = 'one-time' | 'recurring'

export type ConsentStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'revoked'
  | 'expired'

export type WizardStep =
  | 'terms'
  | 'dataset-select'
  | 'dp-select'
  | 'dp-select-credit'
  | 'common-message'
  | 'idp-select'
  | 'idp-waiting'
  | 'account-select'
  | 'result'
  | 'data-result'

export interface DataPeriod {
  months: number
  fromDate: string
  toDate: string
}

export interface SelectedDataset {
  datasetId: string
  datasetName: string
  permissionId: string
  permissionName: string
  dataPeriod: DataPeriod
  accountIds: string[]
}

export interface SelectedDP {
  dpId: string
  dpName: string
  tcAccepted: boolean
  selectedDatasets: SelectedDataset[]
}

export interface ConsentRequest {
  referenceId: string
  consentType: ConsentType
  purpose: string
  dcName: string
  selectedDPs: SelectedDP[]
  selectedIdPId: string
  dataPeriod: DataPeriod
  status: ConsentStatus
}

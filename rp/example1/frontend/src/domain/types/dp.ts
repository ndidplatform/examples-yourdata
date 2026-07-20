import type { DataPeriod } from './consent'

export interface Permission {
  permissionId: string
  permissionName: string
}

export interface Dataset {
  datasetId: string
  datasetName: string
  permissions: Permission[]
  dataPeriod: DataPeriod
  isMandatory: boolean
}

export interface DataProvider {
  dpId: string
  dpName: string
  dpNameTh: string
  tcUrl: string
  datasets: Dataset[]
}

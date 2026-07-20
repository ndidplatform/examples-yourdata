import type { DataProvider, Account } from '@/domain/types'

export interface DataProviderService {
  getDPList(): Promise<DataProvider[]>
  getDPAccounts(dpId: string, referenceId: string): Promise<Account[]>
}

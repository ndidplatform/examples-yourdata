import type { DataProviderService } from './DataProviderService'
import type { DataProvider, Account } from '@/domain/types'
import { mockDPs, mockAccounts } from './fixtures/dp.fixtures'

export class DataProviderServiceMock implements DataProviderService {
  async getDPList(): Promise<DataProvider[]> {
    return mockDPs
  }

  async getDPAccounts(dpId: string, _referenceId: string): Promise<Account[]> {
    return mockAccounts[dpId] ?? []
  }
}

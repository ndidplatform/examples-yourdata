import type { IdentityProviderService } from './IdentityProviderService'
import type { IdentityProvider } from '@/domain/types'
import { mockIdPs } from './fixtures/idp.fixtures'

export class IdentityProviderServiceMock implements IdentityProviderService {
  async getIdPList(): Promise<IdentityProvider[]> {
    return mockIdPs
  }
}

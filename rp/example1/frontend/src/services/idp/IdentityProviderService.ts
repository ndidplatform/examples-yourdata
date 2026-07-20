import type { IdentityProvider } from '@/domain/types'

export interface IdentityProviderService {
  getIdPList(): Promise<IdentityProvider[]>
}

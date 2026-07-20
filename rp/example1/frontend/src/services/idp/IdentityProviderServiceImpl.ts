import type { IdentityProviderService } from './IdentityProviderService'
import type { IdentityProvider } from '@/domain/types'
import { get } from '@/lib/http'

interface BackendIdP {
  node_id: string
  // The example/sandbox NDID node returns `name`; some NDID utility API
  // versions document this field as `node_name` — accept either.
  name?: string
  node_name?: string
  [key: string]: unknown
}

export class IdentityProviderServiceImpl implements IdentityProviderService {
  async getIdPList(): Promise<IdentityProvider[]> {
    const items = await get<BackendIdP[]>('/identity/citizen_id/1234567890123')
    return items.map(item => ({
      idpId: item.node_id,
      idpName: item.node_name ?? item.name ?? item.node_id,
      hasApp: true,
    }))
  }
}

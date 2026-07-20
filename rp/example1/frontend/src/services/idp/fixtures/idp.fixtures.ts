import type { IdentityProvider } from '@/domain/types'

export const mockIdPs: IdentityProvider[] = [
  { idpId: 'idp-a', idpName: 'IdP A', hasApp: true },
  { idpId: 'idp-b', idpName: 'IdP B', hasApp: true },
  { idpId: 'idp-c', idpName: 'IdP C', hasApp: false },
]

import type { ConsentService } from './consent/ConsentService'
import type { DataProviderService } from './dp/DataProviderService'
import type { IdentityProviderService } from './idp/IdentityProviderService'
import type { DataRequestService } from './dataRequest/DataRequestService'
import { ConsentServiceMock } from './consent/ConsentServiceMock'
import { DataProviderServiceMock } from './dp/DataProviderServiceMock'
import { IdentityProviderServiceMock } from './idp/IdentityProviderServiceMock'
import { DataRequestServiceMock } from './dataRequest/DataRequestServiceMock'
import { ConsentServiceImpl } from './consent/ConsentServiceImpl'
import { DataProviderServiceImpl } from './dp/DataProviderServiceImpl'
import { IdentityProviderServiceImpl } from './idp/IdentityProviderServiceImpl'
import { DataRequestServiceImpl } from './dataRequest/DataRequestServiceImpl'

const useMock = import.meta.env.VITE_USE_MOCK === 'true'

export const consentService: ConsentService = useMock
  ? new ConsentServiceMock()
  : new ConsentServiceImpl()

export const dpService: DataProviderService = useMock
  ? new DataProviderServiceMock()
  : new DataProviderServiceImpl()

export const idpService: IdentityProviderService = useMock
  ? new IdentityProviderServiceMock()
  : new IdentityProviderServiceImpl()

export const dataRequestService: DataRequestService = useMock
  ? new DataRequestServiceMock()
  : new DataRequestServiceImpl()

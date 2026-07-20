import type { ConsentService, InitConsentParams, CompleteConsentParams } from './ConsentService'
import { mockReferenceId, mockRequestId } from './fixtures/consent.fixtures'

export class ConsentServiceMock implements ConsentService {
  async initConsentRequest(_params: InitConsentParams): Promise<{ referenceId: string; requestId: string }> {
    return { referenceId: mockReferenceId, requestId: mockRequestId }
  }

  async getPreConsentStatus(_referenceId: string): Promise<'pending' | 'confirmed' | 'complete'> {
    return 'complete'
  }

  async completeConsent(params: CompleteConsentParams): Promise<{ consentedAccountIds: string[] }> {
    const accountIds = params.selectedAccounts.map(a => a.accountId)
    return { consentedAccountIds: accountIds.length > 0 ? accountIds : ['mock'] }
  }
}

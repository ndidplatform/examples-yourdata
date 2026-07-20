import type { SelectedDP, Account } from '@/domain/types'

// Pre-consent flow: triggers standard NDID request to fetch masked accounts from banks
export interface InitConsentParams {
  referenceId: string
  purpose: string
  dcName: string
  requestMessage: string
  selectedDPs: SelectedDP[]
  selectedIdPId: string
}

// Complete-consent flow: Your Data specific API, produces a Consent Token
export interface CompleteConsentParams {
  referenceId: string
  // The pre-consent request_id — the RP backend uses this plus as_node_id
  // to look up the matching as_token server-side.
  requestId: string
  selectedDPs: SelectedDP[]
  // Accounts the user explicitly selected on the account-select screen
  selectedAccounts: Account[]
}

export interface ConsentService {
  // Phase A: initiate pre-consent NDID request → returns referenceId for polling
  initConsentRequest(params: InitConsentParams): Promise<{ referenceId: string; requestId: string }>
  // Phase A: poll pre-consent request status until complete
  getPreConsentStatus(referenceId: string): Promise<'pending' | 'confirmed' | 'complete'>
  // Phase B: submit complete-consent (Your Data API) → the AS issues one
  // Consent Token per selected account, kept server-side; this returns just
  // the accountIds that succeeded.
  completeConsent(params: CompleteConsentParams): Promise<{ consentedAccountIds: string[] }>
}

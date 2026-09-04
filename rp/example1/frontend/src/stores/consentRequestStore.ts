import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { WizardStep, SelectedDP, SelectedDataset, Account, DataProvider, IdentityProvider, DataResultEntry } from '@/domain/types'
import { dpService, idpService, consentService, dataRequestService } from '@/services'
import { validateDPCount } from '@/domain/validators/consentValidator'

const STEP_ORDER: WizardStep[] = [
  'terms',
  'dataset-select',
  'dp-select',
  'dp-select-credit',
  'common-message',
  'idp-select',
  'idp-waiting',
  'account-select',
  'result',
  'data-result',
]

interface ConsentRequestState {
  currentStep: WizardStep
  purpose: string
  selectedDPs: SelectedDP[]
  selectedIdPId: string
  referenceId: string
  requestId: string
  consentMessage: string
  availableDPs: DataProvider[]
  availableIdPs: IdentityProvider[]
  accounts: Account[]
  // Only the accountIds that received a consent token — the RP backend
  // keeps the actual tokens server-side.
  consentedAccountIds: string[]
  consentedDPIds: string[]
  dataResults: DataResultEntry[]
  isLoading: boolean
  isLoadingData: boolean
  error: string | null
  isCreditSelected: boolean
}

interface ConsentRequestActions {
  acceptTerms(): void
  setPurpose(purpose: string): void
  proceedToDPSelect(creditSelected?: boolean): void
  proceedToCommonMessage(): void
  confirmCommonMessage(message?: string): void
  initConsentRequest(dcName: string, requestMessage: string): Promise<void>
  selectIdP(idpId: string): void
  proceedToAccountSelect(): void
  toggleDP(dpId: string, datasetId: string): void
  toggleAccount(accountId: string, dpId: string): void
  submitConsent(): Promise<void>
  proceedToDataResult(): void
  fetchDataForConsent(): Promise<void>
  goBack(): void
  reset(): void
  loadDPs(): Promise<void>
  loadIdPs(): Promise<void>
  loadAccounts(dpId: string): Promise<void>
  confirmCreditDPSelect(): void
}

const initialState: ConsentRequestState = {
  currentStep: 'dataset-select',
  purpose: '',
  selectedDPs: [],
  selectedIdPId: '',
  referenceId: '',
  requestId: '',
  consentMessage: '',
  availableDPs: [],
  availableIdPs: [],
  accounts: [],
  consentedAccountIds: [],
  consentedDPIds: [],
  dataResults: [],
  isLoading: false,
  isLoadingData: false,
  error: null,
  isCreditSelected: false,
}

export const useConsentRequestStore = create<ConsentRequestState & ConsentRequestActions>()(
  devtools(
    (set, get) => ({
      ...initialState,

      acceptTerms() {
        if (get().currentStep === 'terms') {
          set({ currentStep: 'dataset-select' })
        }
      },

      setPurpose(purpose: string) {
        set({ purpose })
      },

      proceedToDPSelect(creditSelected = false) {
        if (get().currentStep === 'dataset-select') {
          set({ currentStep: 'dp-select', isCreditSelected: creditSelected })
        }
      },

      proceedToCommonMessage() {
        const step = get().currentStep
        if (step === 'dp-select') {
          const validation = validateDPCount(get().selectedDPs)
          if (!validation.valid) {
            set({ error: validation.error ?? null })
            return
          }
          const next = get().isCreditSelected ? 'dp-select-credit' : 'idp-select'
          set({ currentStep: next, error: null })
        } else if (step === 'dp-select-credit') {
          const validation = validateDPCount(get().selectedDPs)
          if (!validation.valid) {
            set({ error: validation.error ?? null })
            return
          }
          set({ currentStep: 'idp-select', error: null })
        }
      },

      confirmCreditDPSelect() {
        // Alias — proceedToCommonMessage handles dp-select-credit routing
        get().proceedToCommonMessage()
      },

      confirmCommonMessage(message = '') {
        if (get().currentStep === 'common-message') {
          set({ consentMessage: message, currentStep: 'idp-select' })
        }
      },

      async initConsentRequest(dcName: string, requestMessage: string) {
        set({ isLoading: true, error: null })
        try {
          const { referenceId, requestId } = await consentService.initConsentRequest({
            referenceId: get().referenceId,
            purpose: get().purpose,
            dcName,
            requestMessage,
            selectedDPs: get().selectedDPs,
            selectedIdPId: get().selectedIdPId,
          })
          set({ referenceId, requestId, isLoading: false })
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', isLoading: false })
        }
      },

      selectIdP(idpId: string) {
        if (get().currentStep === 'idp-select') {
          set({ selectedIdPId: idpId, currentStep: 'idp-waiting' })
        }
      },

      proceedToAccountSelect() {
        if (get().currentStep === 'idp-waiting') {
          set({ currentStep: 'account-select', accounts: [] })
        }
      },

      toggleDP(dpId: string, datasetId: string) {
        const { availableDPs, selectedDPs } = get()
        const dp = availableDPs.find(d => d.dpId === dpId)
        if (!dp) return

        const dataset = dp.datasets.find(d => d.datasetId === datasetId)
        const newDataset: SelectedDataset = {
          datasetId,
          datasetName: dataset?.datasetName ?? '',
          permissionId: dataset?.permissions[0]?.permissionId ?? '',
          permissionName: dataset?.permissions[0]?.permissionName ?? '',
          dataPeriod: dataset?.dataPeriod ?? { months: 0, fromDate: '', toDate: '' },
          accountIds: [],
        }

        const existing = selectedDPs.find(d => d.dpId === dpId)
        if (!existing) {
          set({
            selectedDPs: [...selectedDPs, {
              dpId: dp.dpId, dpName: dp.dpName, tcAccepted: true,
              selectedDatasets: [newDataset],
            }],
          })
        } else {
          const hasDataset = existing.selectedDatasets.some(ds => ds.datasetId === datasetId)
          if (hasDataset) {
            const newDatasets = existing.selectedDatasets.filter(ds => ds.datasetId !== datasetId)
            set({
              selectedDPs: newDatasets.length === 0
                ? selectedDPs.filter(d => d.dpId !== dpId)
                : selectedDPs.map(d => d.dpId === dpId ? { ...d, selectedDatasets: newDatasets } : d),
            })
          } else {
            set({
              selectedDPs: selectedDPs.map(d =>
                d.dpId === dpId ? { ...d, selectedDatasets: [...d.selectedDatasets, newDataset] } : d
              ),
            })
          }
        }
      },

      toggleAccount(accountId: string, dpId: string) {
        const accounts = get().accounts.map(acc =>
          acc.accountId === accountId && acc.dpId === dpId ? { ...acc, isSelected: !acc.isSelected } : acc
        )
        set({ accounts })
      },

      async submitConsent() {
        if (get().currentStep !== 'account-select') return
        const selectedAccounts = get().accounts.filter(a => a.isSelected)
        if (selectedAccounts.length === 0) {
          set({ error: 'กรุณาเลือกบัญชีอย่างน้อย 1 บัญชี' })
          return
        }
        set({ isLoading: true, error: null })
        try {
          const consentedDPIds = [...new Set(selectedAccounts.map(a => a.dpId))]
          const { consentedAccountIds } = await consentService.completeConsent({
            referenceId: get().referenceId,
            requestId: get().requestId,
            selectedDPs: get().selectedDPs,
            selectedAccounts,
          })
          set({ consentedAccountIds, consentedDPIds, currentStep: 'result', isLoading: false })
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', isLoading: false })
        }
      },

      proceedToDataResult() {
        if (get().currentStep === 'result') {
          set({ currentStep: 'data-result' })
        }
      },

      async fetchDataForConsent() {
        set({ isLoadingData: true, dataResults: [] })
        const { consentedDPIds, selectedDPs, availableDPs, consentedAccountIds, accounts } = get()
        const consentedDPs = selectedDPs.filter(dp => consentedDPIds.includes(dp.dpId))
        for (const dp of consentedDPs) {
          const dpInfo = availableDPs.find(d => d.dpId === dp.dpId)
          for (const ds of dp.selectedDatasets) {
            // The AS issues a separate, account-scoped consent token per selected
            // account — fetch each selected account for this dataset individually.
            const accountType = ds.datasetId.startsWith('900.cardpayment_transactions_') ? 'loan' : 'deposit'
            const dsAccounts = accounts.filter(
              a => a.dpId === dp.dpId && a.isSelected && a.accountType === accountType
                && consentedAccountIds.includes(a.accountId),
            )
            let entry: DataResultEntry
            try {
              const results = await Promise.all(
                dsAccounts.map(async acc => {
                  const data = await dataRequestService.fetchData({
                    dpId: dp.dpId,
                    datasetId: ds.datasetId,
                    accountId: acc.accountId,
                  })
                  // The AS response doesn't echo back the account's display type —
                  // attach it here from the Account the caller already selected.
                  return data.map(d => ({ ...d, accountTypeName: acc.accountTypeName }))
                }),
              )
              entry = {
                dpId: dp.dpId,
                dpNameTh: dpInfo?.dpNameTh ?? dp.dpName,
                datasetId: ds.datasetId,
                datasetName: ds.datasetName,
                data: results.flat(),
              }
            } catch (err) {
              entry = {
                dpId: dp.dpId,
                dpNameTh: dpInfo?.dpNameTh ?? dp.dpName,
                datasetId: ds.datasetId,
                datasetName: ds.datasetName,
                data: null,
                error: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด',
              }
            }
            set(s => ({ dataResults: [...s.dataResults, entry] }))
          }
        }
        set({ isLoadingData: false })
      },

      goBack() {
        const step = get().currentStep
        const nonReversible: WizardStep[] = ['idp-waiting', 'account-select', 'result', 'data-result']
        if (nonReversible.includes(step)) return
        const currentIndex = STEP_ORDER.indexOf(step)
        if (currentIndex > 0) {
          let prevIndex = currentIndex - 1
          // Skip hidden steps: common-message and dp-select-credit (if not credit), and terms
          if (STEP_ORDER[prevIndex] === 'common-message') prevIndex -= 1
          if (STEP_ORDER[prevIndex] === 'dp-select-credit' && !get().isCreditSelected) prevIndex -= 1
          if (STEP_ORDER[prevIndex] === 'terms') return
          if (prevIndex >= 0) {
            set({ currentStep: STEP_ORDER[prevIndex] })
          }
        }
      },

      reset() {
        set(initialState)
      },

      async loadDPs() {
        set({ isLoading: true, error: null })
        try {
          const availableDPs = await dpService.getDPList()
          set({ availableDPs, isLoading: false })
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', isLoading: false })
        }
      },

      async loadIdPs() {
        set({ isLoading: true, error: null })
        try {
          const availableIdPs = await idpService.getIdPList()
          set({ availableIdPs, isLoading: false })
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', isLoading: false })
        }
      },

      async loadAccounts(dpId: string) {
        set({ isLoading: true, error: null })
        try {
          const newAccounts = await dpService.getDPAccounts(dpId, get().requestId)
          set(s => {
            const seen = new Set(s.accounts.map(a => a.accountId))
            const unique = newAccounts.filter(a => !seen.has(a.accountId))
            return { accounts: [...s.accounts, ...unique], isLoading: false }
          })
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', isLoading: false })
        }
      },
    }),
    { name: 'consent-request-store' }
  )
)

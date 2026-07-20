import { describe, it, expect, beforeEach } from 'vitest'
import { useConsentRequestStore } from './consentRequestStore'

// Reset store state between tests
beforeEach(() => {
  useConsentRequestStore.getState().reset()
})

describe('initial state', () => {
  it('starts on the dataset-select step (terms and common-message pages are hidden)', () => {
    expect(useConsentRequestStore.getState().currentStep).toBe('dataset-select')
  })

  it('has no selected DPs initially', () => {
    expect(useConsentRequestStore.getState().selectedDPs).toEqual([])
  })
})

describe('acceptTerms', () => {
  it('advances to dataset-select', () => {
    useConsentRequestStore.setState({ currentStep: 'terms' })
    useConsentRequestStore.getState().acceptTerms()
    expect(useConsentRequestStore.getState().currentStep).toBe('dataset-select')
  })
})

describe('step guard — confirmCommonMessage', () => {
  it('does nothing when not on the common-message step', () => {
    useConsentRequestStore.getState().confirmCommonMessage()
    expect(useConsentRequestStore.getState().currentStep).toBe('dataset-select')
  })
})

describe('goBack', () => {
  it('returns from dp-select to dataset-select', () => {
    useConsentRequestStore.getState().proceedToDPSelect()
    expect(useConsentRequestStore.getState().currentStep).toBe('dp-select')
    useConsentRequestStore.getState().goBack()
    expect(useConsentRequestStore.getState().currentStep).toBe('dataset-select')
  })

  it('does nothing on the first step', () => {
    useConsentRequestStore.getState().goBack()
    expect(useConsentRequestStore.getState().currentStep).toBe('dataset-select')
  })

  it('does nothing from idp-waiting (non-reversible)', () => {
    useConsentRequestStore.setState({ currentStep: 'idp-waiting' })
    useConsentRequestStore.getState().goBack()
    expect(useConsentRequestStore.getState().currentStep).toBe('idp-waiting')
  })

  it('does nothing from account-select (non-reversible)', () => {
    useConsentRequestStore.setState({ currentStep: 'account-select' })
    useConsentRequestStore.getState().goBack()
    expect(useConsentRequestStore.getState().currentStep).toBe('account-select')
  })

  it('does nothing from result (non-reversible)', () => {
    useConsentRequestStore.setState({ currentStep: 'result' })
    useConsentRequestStore.getState().goBack()
    expect(useConsentRequestStore.getState().currentStep).toBe('result')
  })
})

describe('confirmCommonMessage', () => {
  it('stores the built consent message string', () => {
    // The common-message screen is currently hidden from the default flow
    // (proceedToCommonMessage now routes dp-select straight to idp-select),
    // but the guarded action itself must still work when reached directly.
    useConsentRequestStore.setState({ currentStep: 'common-message' })
    useConsentRequestStore.getState().confirmCommonMessage('ขอความยินยอม')
    expect(useConsentRequestStore.getState().consentMessage).toBe('ขอความยินยอม')
    expect(useConsentRequestStore.getState().currentStep).toBe('idp-select')
  })
})

describe('selectIdP', () => {
  it('stores the selected IdP id', () => {
    useConsentRequestStore.getState().proceedToDPSelect()
    useConsentRequestStore.getState().proceedToCommonMessage()
    useConsentRequestStore.getState().selectIdP('idp-a')
    expect(useConsentRequestStore.getState().selectedIdPId).toBe('idp-a')
    expect(useConsentRequestStore.getState().currentStep).toBe('idp-waiting')
  })
})

describe('proceedToAccountSelect', () => {
  it('advances from idp-waiting to account-select', () => {
    useConsentRequestStore.setState({ currentStep: 'idp-waiting' })
    useConsentRequestStore.getState().proceedToAccountSelect()
    expect(useConsentRequestStore.getState().currentStep).toBe('account-select')
  })

  it('step guard — does nothing when not on idp-waiting', () => {
    useConsentRequestStore.getState().proceedToAccountSelect()
    expect(useConsentRequestStore.getState().currentStep).toBe('dataset-select')
  })
})

describe('reset', () => {
  it('returns to initial state', () => {
    useConsentRequestStore.getState().proceedToDPSelect()
    useConsentRequestStore.getState().reset()
    expect(useConsentRequestStore.getState().currentStep).toBe('dataset-select')
  })

  it('clears consentedAccountIds', () => {
    useConsentRequestStore.setState({ consentedAccountIds: ['acc-1'] })
    useConsentRequestStore.getState().reset()
    expect(useConsentRequestStore.getState().consentedAccountIds).toEqual([])
  })
})

describe('toggleDP', () => {
  it('toggleDP adds a DP when not selected and removes it when selected', () => {
    const store = useConsentRequestStore.getState()
    // seed availableDPs so toggleDP can find the DP
    useConsentRequestStore.setState({
      availableDPs: [{
        dpId: 'dp-1', dpName: 'Bank A', dpNameTh: 'ธนาคาร A', tcUrl: 'https://example.com',
        datasets: [{
          datasetId: '900.deposit_transactions_001', datasetName: 'รายการเดินบัญชีเงินฝาก', isMandatory: false,
          permissions: [{ permissionId: 'p1', permissionName: 'ข้อมูลธุรกรรมพื้นฐาน' }],
          dataPeriod: { months: 12, fromDate: '', toDate: '' },
        }],
      }],
    })
    store.toggleDP('dp-1', '900.deposit_transactions_001')
    expect(useConsentRequestStore.getState().selectedDPs).toHaveLength(1)
    expect(useConsentRequestStore.getState().selectedDPs[0].dpId).toBe('dp-1')
    store.toggleDP('dp-1', '900.deposit_transactions_001')
    expect(useConsentRequestStore.getState().selectedDPs).toHaveLength(0)
  })
})

describe('submitConsent', () => {
  it('advances to result step and sets consentedAccountIds when on account-select', async () => {
    useConsentRequestStore.setState({
      currentStep: 'account-select',
      accounts: [{
        accountId: 'acc-1', dpId: 'dp-1', accountType: 'deposit', accountTypeName: 'CURRENT',
        maskedAccountNumber: 'xxx-x-xx234-1', isSelected: true,
      }],
    })
    await useConsentRequestStore.getState().submitConsent()
    const state = useConsentRequestStore.getState()
    expect(state.currentStep).toBe('result')
    expect(state.consentedAccountIds.length).toBeGreaterThan(0)
    expect(state.isLoading).toBe(false)
  })

  it('step guard — does nothing when not on account-select', async () => {
    // store starts at 'dataset-select' (from beforeEach reset)
    await useConsentRequestStore.getState().submitConsent()
    expect(useConsentRequestStore.getState().currentStep).toBe('dataset-select')
  })

  it('sets an error and stays on account-select when no accounts are selected', async () => {
    useConsentRequestStore.setState({ currentStep: 'account-select', accounts: [] })
    await useConsentRequestStore.getState().submitConsent()
    const state = useConsentRequestStore.getState()
    expect(state.currentStep).toBe('account-select')
    expect(state.error).toBeTruthy()
  })
})

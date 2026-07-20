import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useConsentRequestStore } from '@/stores/consentRequestStore'
import { StepDataResult } from './StepDataResult'
import type { DepositData, CreditData } from '@/domain/types'

// Regression coverage for the real dataset schemas returned by the AS
// (YourData_Schema_Deposit / YourData_Schema_CardPayment) — accountId +
// statementEntries for deposit, cardNumber + usageTransactions for card
// payment. A prior refactor renamed these fields on the backend without
// updating the render-side type guards, so every result silently rendered
// as nothing with no error shown.

const depositResult: DepositData = {
  accountId: '***-***-1234',
  statementEntries: [
    {
      transactionId: 'TXN-001',
      bookingDateTime: '2026-06-01T00:00:00+07:00',
      commonTransactionCode: { domainCode: 'PMNT', familyCode: 'RCDT', subFamilyCode: 'SALA' },
      proprietaryBankTransactionCode: 'TW',
      proprietaryBankTransactionDescription: 'Transfer in',
      creditDebitIndicator: 'CRDT',
      amount: 5000,
      amountCurrency: 'THB',
    },
  ],
}

const creditResult: CreditData = {
  cardNumber: '123456XXXXXX1111',
  usageTransactions: [
    {
      transactionId: 'CC-001',
      transactionDate: '2026-05-03',
      creditDebitIndicator: 'DBIT',
      amount: 3500,
      amountCurrency: 'THB',
      transactionType: 'SPENDING',
      marchantCategoryCode: '5311',
    },
  ],
}

beforeEach(() => {
  useConsentRequestStore.getState().reset()
})

describe('StepDataResult', () => {
  it('renders a deposit result (accountId + statementEntries)', () => {
    useConsentRequestStore.setState({
      dataResults: [
        { dpId: 'as1', dpNameTh: 'ธนาคาร A', datasetId: '900.deposit_transactions_001', datasetName: 'เงินฝาก', data: [depositResult] },
      ],
      isLoadingData: false,
      // StepDataResult triggers fetchDataForConsent on mount, which would
      // otherwise reset dataResults to [] — stub it out to test rendering
      // of a pre-seeded result in isolation.
      fetchDataForConsent: async () => {},
    })
    render(<StepDataResult />)
    expect(screen.getByText(/\*\*\*-\*\*\*-1234/)).toBeInTheDocument()
    expect(screen.getByText('Transfer in')).toBeInTheDocument()
  })

  it('renders a credit card result (cardNumber + usageTransactions)', () => {
    useConsentRequestStore.setState({
      dataResults: [
        { dpId: 'as1', dpNameTh: 'ธนาคาร A', datasetId: '900.cardpayment_transactions_001', datasetName: 'บัตรเครดิต', data: [creditResult] },
      ],
      isLoadingData: false,
      // StepDataResult triggers fetchDataForConsent on mount, which would
      // otherwise reset dataResults to [] — stub it out to test rendering
      // of a pre-seeded result in isolation.
      fetchDataForConsent: async () => {},
    })
    render(<StepDataResult />)
    expect(screen.getByText(/123456XXXXXX1111/)).toBeInTheDocument()
    expect(screen.getByText('SPENDING')).toBeInTheDocument()
  })

  it('shows the error message for a failed entry instead of silently rendering nothing', () => {
    useConsentRequestStore.setState({
      dataResults: [
        { dpId: 'as1', dpNameTh: 'ธนาคาร A', datasetId: '900.deposit_transactions_001', datasetName: 'เงินฝาก', data: null, error: 'AS error 40720' },
      ],
      isLoadingData: false,
      // StepDataResult triggers fetchDataForConsent on mount, which would
      // otherwise reset dataResults to [] — stub it out to test rendering
      // of a pre-seeded result in isolation.
      fetchDataForConsent: async () => {},
    })
    render(<StepDataResult />)
    expect(screen.getByText('AS error 40720')).toBeInTheDocument()
  })
})

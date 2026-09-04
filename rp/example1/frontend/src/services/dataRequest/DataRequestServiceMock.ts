import type { ServiceData, DepositData, CreditData } from '@/domain/types'
import type { DataRequestService, FetchDataParams } from './DataRequestService'

const DEPOSIT_FIXTURES: DepositData[] = [
  {
    accountId: '***-***-1234',
    statementEntries: [
      {
        transactionId: 'TXN-20260601-1234-001',
        bookingDateTime: '2026-06-01T00:00:00+07:00',
        commonTransactionCode: { domainCode: 'PMNT', familyCode: 'CNTR', subFamilyCode: 'CDPT' },
        proprietaryBankTransactionCode: 'TW',
        proprietaryBankTransactionDescription: 'Credit transfer',
        creditDebitIndicator: 'CRDT',
        amount: 5000.00,
        amountCurrency: 'THB',
      },
      {
        transactionId: 'TXN-20260605-1234-002',
        bookingDateTime: '2026-06-05T00:00:00+07:00',
        commonTransactionCode: { domainCode: 'PMNT', familyCode: 'ICDT', subFamilyCode: 'OTHR' },
        proprietaryBankTransactionCode: 'TW',
        proprietaryBankTransactionDescription: 'Debit transfer',
        creditDebitIndicator: 'DBIT',
        amount: 1250.50,
        amountCurrency: 'THB',
      },
      {
        transactionId: 'TXN-20260610-1234-003',
        bookingDateTime: '2026-06-10T00:00:00+07:00',
        commonTransactionCode: { domainCode: 'PMNT', familyCode: 'CNTR', subFamilyCode: 'CDPT' },
        proprietaryBankTransactionCode: 'TW',
        proprietaryBankTransactionDescription: 'Credit transfer',
        creditDebitIndicator: 'CRDT',
        amount: 22000.00,
        amountCurrency: 'THB',
      },
    ],
  },
  {
    accountId: '***-***-5678',
    statementEntries: [
      {
        transactionId: 'TXN-20260603-5678-001',
        bookingDateTime: '2026-06-03T00:00:00+07:00',
        commonTransactionCode: { domainCode: 'PMNT', familyCode: 'ICDT', subFamilyCode: 'OTHR' },
        proprietaryBankTransactionCode: 'TW',
        proprietaryBankTransactionDescription: 'Debit transfer',
        creditDebitIndicator: 'DBIT',
        amount: 3500.00,
        amountCurrency: 'THB',
      },
      {
        transactionId: 'TXN-20260612-5678-002',
        bookingDateTime: '2026-06-12T00:00:00+07:00',
        commonTransactionCode: { domainCode: 'PMNT', familyCode: 'CNTR', subFamilyCode: 'CDPT' },
        proprietaryBankTransactionCode: 'TW',
        proprietaryBankTransactionDescription: 'Credit transfer',
        creditDebitIndicator: 'CRDT',
        amount: 8000.00,
        amountCurrency: 'THB',
      },
    ],
  },
]

const CREDIT_FIXTURES: CreditData[] = [
  {
    cardNumber: '123456XXXXXX1111',
    usageTransactions: [
      { transactionId: 'CC-20260503-001', transactionDate: '2026-05-03', postingDate: '2026-05-04', creditDebitIndicator: 'DBIT', amount: 3500, amountCurrency: 'THB', transactionType: 'SPENDING', marchantCategoryCode: '5311' },
      { transactionId: 'CC-20260525-002', transactionDate: '2026-05-25', postingDate: '2026-05-25', creditDebitIndicator: 'CRDT', amount: 5000, amountCurrency: 'THB', transactionType: 'REPAYMENT', marchantCategoryCode: '6012' },
    ],
  },
  {
    cardNumber: '555000XXXXXX2222',
    usageTransactions: [
      { transactionId: 'CC-20260510-001', transactionDate: '2026-05-10', postingDate: '2026-05-10', creditDebitIndicator: 'DBIT', amount: 890, amountCurrency: 'THB', transactionType: 'SPENDING', marchantCategoryCode: '5812' },
      { transactionId: 'CC-20260520-002', transactionDate: '2026-05-20', postingDate: '2026-05-21', creditDebitIndicator: 'DBIT', amount: 1890, amountCurrency: 'THB', transactionType: 'SPENDING', marchantCategoryCode: '5961' },
    ],
  },
]

export class DataRequestServiceMock implements DataRequestService {
  async fetchData(params: FetchDataParams): Promise<ServiceData[]> {
    return params.datasetId.startsWith('900.cardpayment_transactions_') ? CREDIT_FIXTURES : DEPOSIT_FIXTURES
  }
}

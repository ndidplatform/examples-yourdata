// Mirrors YourData_Schema_Deposit's TransactionEntryBasic / TransactionEntryDetail.
// domainCode/familyCode/subFamilyCode are flat top-level fields on TransactionBase
// in the real schema — not nested under a commonTransactionCode wrapper.
export interface DepositTransaction {
  transactionId: string
  bookingDateTime: string
  valueDateTime?: string
  domainCode: string
  familyCode: string
  subFamilyCode: string
  proprietaryBankTransactionCode: string
  proprietaryBankTransactionDescription: string
  creditDebitIndicator: 'CRDT' | 'DBIT'
  amount: number
  amountCurrency: string
  // Detail-only fields — absent when service_extension is transactions_basic.
  transactionInformation?: string
  creditorAccountName?: string
  debtorAccountName?: string
}

// Mirrors YourData_Schema_Deposit's TransactionResponseBasic / TransactionResponseDetail.
export interface DepositData {
  accountId: string
  transactionEntries: DepositTransaction[]
  accountTypeName?: string // attached client-side from the selected Account; not sent by the AS
}

// Mirrors YourData_Schema_CardPayment's UsageTransactionBasic / UsageTransactionDetail.
export interface CreditTransaction {
  transactionId: string
  transactionDate: string
  postingDate?: string
  creditDebitIndicator: 'CRDT' | 'DBIT'
  amount: number
  amountCurrency: string
  transactionType: 'SPENDING' | 'EPP' | 'REFUND' | 'ETL' | 'REPAYMENT' | 'RECURRING' | 'CASH' | 'VOID' | 'OTHER'
  merchantCategoryCode: string
  // Detail-only field — absent when service_extension is transactions_basic.
  transactionDescription?: string
}

// Mirrors YourData_Schema_CardPayment's TransactionResponseBasic / TransactionResponseDetail.
export interface CreditData {
  cardNumber: string
  transactionEntries: CreditTransaction[]
  accountTypeName?: string // attached client-side from the selected Account; not sent by the AS
}

export type ServiceData = DepositData | CreditData

export interface DataResultEntry {
  dpId: string
  dpNameTh: string
  datasetId: string
  datasetName: string
  data: ServiceData[] | null
  error?: string
}

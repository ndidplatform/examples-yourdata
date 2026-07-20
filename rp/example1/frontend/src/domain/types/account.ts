export type AccountType = 'deposit' | 'loan' | 'insurance'

export interface Account {
  accountId: string
  dpId: string
  accountType: AccountType
  accountTypeName: string
  maskedAccountNumber: string
  isSelected: boolean
  identifierExtension?: string // opaque JSON string from AS; must be echoed back verbatim at complete-consent
}

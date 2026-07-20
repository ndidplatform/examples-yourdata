import type { DataProvider, Account } from '@/domain/types'

export const mockDPs: DataProvider[] = [
  {
    dpId: 'bank-a',
    dpName: 'Bank A',
    dpNameTh: 'ธนาคาร A จำกัด (มหาชน)',
    tcUrl: 'https://www.bank-a.th/yourdata-tc',
    datasets: [
      {
        datasetId: '900.deposit_transactions_001',
        datasetName: 'รายการเดินบัญชีเงินฝาก',
        isMandatory: true,
        dataPeriod: { months: 6, fromDate: '2568-04-15', toDate: '2568-10-15' },
        permissions: [
          { permissionId: 'txn-detail', permissionName: 'รายการเดินบัญชี (แบบมีรายละเอียด)' },
        ],
      },
      {
        datasetId: '900.cardpayment_transactions_001',
        datasetName: 'รายการธุรกรรมบัตรเครดิต',
        isMandatory: false,
        dataPeriod: { months: 36, fromDate: '2565-10-15', toDate: '2568-10-15' },
        permissions: [
          { permissionId: 'loan-status', permissionName: 'สถานะและประวัติการชำระสินเชื่อ' },
        ],
      },
    ],
  },
  {
    dpId: 'bank-b',
    dpName: 'Bank B',
    dpNameTh: 'ธนาคาร B จำกัด (มหาชน)',
    tcUrl: 'https://www.bank-b.th/yourdata-tc',
    datasets: [
      {
        datasetId: '900.deposit_transactions_001',
        datasetName: 'รายการเดินบัญชีเงินฝาก',
        isMandatory: true,
        dataPeriod: { months: 6, fromDate: '2568-04-15', toDate: '2568-10-15' },
        permissions: [
          { permissionId: 'txn-detail', permissionName: 'รายการเดินบัญชี (แบบมีรายละเอียด)' },
        ],
      },
    ],
  },
  {
    dpId: 'bank-c',
    dpName: 'Bank C',
    dpNameTh: 'ธนาคาร C จำกัด (มหาชน)',
    tcUrl: 'https://www.bank-c.th/yourdata-tc',
    datasets: [
      {
        datasetId: '900.deposit_transactions_001',
        datasetName: 'รายการเดินบัญชีเงินฝาก',
        isMandatory: true,
        dataPeriod: { months: 6, fromDate: '2568-04-15', toDate: '2568-10-15' },
        permissions: [
          { permissionId: 'txn-detail', permissionName: 'รายการเดินบัญชี (แบบมีรายละเอียด)' },
        ],
      },
    ],
  },
]

export const mockAccounts: Record<string, Account[]> = {
  'bank-a': [
    {
      accountId: 'acc-a-001',
      dpId: 'bank-a',
      accountType: 'deposit',
      accountTypeName: 'บัญชีออมทรัพย์',
      maskedAccountNumber: 'xxx-x-xx234-1',
      isSelected: true,
    },
    {
      accountId: 'acc-a-002',
      dpId: 'bank-a',
      accountType: 'loan',
      accountTypeName: 'บัญชีสินเชื่อส่วนบุคคล',
      maskedAccountNumber: 'x-xxxxx-xxxxx-28-7',
      isSelected: true,
    },
  ],
  'bank-b': [
    {
      accountId: 'acc-b-001',
      dpId: 'bank-b',
      accountType: 'deposit',
      accountTypeName: 'บัญชีออมทรัพย์',
      maskedAccountNumber: 'xxx-x-xx234-1',
      isSelected: true,
    },
  ],
  'bank-c': [
    {
      accountId: 'acc-c-001',
      dpId: 'bank-c',
      accountType: 'deposit',
      accountTypeName: 'บัญชีฝากประจำ',
      maskedAccountNumber: 'xxx-x-xx356-4',
      isSelected: true,
    },
  ],
}

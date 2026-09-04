import type { DataProvider } from '../domain/types/dp'

export const dpListConfig: DataProvider[] = [
  {
    dpId: 'as1',
    dpName: 'Alpha Bank',
    dpNameTh: 'อัลฟ่า แบงก์',
    tcUrl: '',
    datasets: [
      {
        datasetId: '900.deposit_transactions_basic_002',
        datasetName: 'รายการเดินบัญชีเงินฝาก',
        permissions: [
          { permissionId: 'transactions_basic',  permissionName: 'ข้อมูลธุรกรรมพื้นฐาน' },
          { permissionId: 'transactions_detail', permissionName: 'ข้อมูลธุรกรรมละเอียด' },
        ],
        dataPeriod: { months: 12, fromDate: '', toDate: '' },
        isMandatory: true,
      },
      {
        datasetId: '900.cardpayment_transactions_basic_002',
        datasetName: 'รายการธุรกรรมบัตรเครดิต',
        permissions: [
          { permissionId: 'transactions_basic',  permissionName: 'ข้อมูลธุรกรรมพื้นฐาน' },
          { permissionId: 'transactions_detail', permissionName: 'ข้อมูลธุรกรรมละเอียด' },
        ],
        dataPeriod: { months: 12, fromDate: '', toDate: '' },
        isMandatory: false,
      },
    ],
  },
  {
    dpId: 'as2',
    dpName: 'Beta Bank',
    dpNameTh: 'เบต้า แบงก์',
    tcUrl: '',
    datasets: [
      {
        datasetId: '900.deposit_transactions_basic_002',
        datasetName: 'รายการเดินบัญชีเงินฝาก',
        permissions: [
          { permissionId: 'transactions_basic',  permissionName: 'ข้อมูลธุรกรรมพื้นฐาน' },
        ],
        dataPeriod: { months: 12, fromDate: '', toDate: '' },
        isMandatory: true,
      },
    ],
  },
]

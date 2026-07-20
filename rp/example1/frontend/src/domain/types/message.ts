export interface ConsentMessageDPItem {
  dpName: string
  accountRef: string
  datasets: Array<{ name: string; permission: string }>
}

export interface ConsentMessageData {
  purpose: string
  dcName: string
  dpItems: ConsentMessageDPItem[]
  consentExpiryDate?: string
}

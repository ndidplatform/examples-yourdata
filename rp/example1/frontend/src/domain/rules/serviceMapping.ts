// Maps a Your Data dataset service_id to the standard NDID pre-consent
// service_id used to request consent for it.
export function datasetToServiceId(datasetId: string): string {
  if (datasetId === '900.cardpayment_transactions_001') return '900.pre_consent_cardpayment_001'
  return '900.pre_consent_deposit_001'
}

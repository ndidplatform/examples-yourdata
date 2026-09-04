// Maps a Your Data dataset service_id to the standard NDID pre-consent
// service_id used to request consent for it. Matched by family prefix, not
// exact equality — the trailing _basic_001/_basic_002/_detail_001/_detail_002
// segment encodes data level + lookback period (see AS server.ts), not which
// pre-consent flow applies.
export function datasetToServiceId(datasetId: string): string {
  if (datasetId.startsWith('900.cardpayment_transactions_')) return '900.pre_consent_cardpayment_001'
  return '900.pre_consent_deposit_001'
}

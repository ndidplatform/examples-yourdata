import type { ServiceData } from '@/domain/types'
import type { DataRequestService, FetchDataParams } from './DataRequestService'
import { get, post } from '@/lib/http'

interface BackendDataRequestCreateResponse {
  request_id: string
  [key: string]: unknown
}

interface BackendDataItem {
  source_node_id: string
  service_id: string
  data?: string
  error?: boolean
  error_code?: number
  error_message?: string
  [key: string]: unknown
}

// The AS already responds with the real dataset schema (accountId +
// statementEntries for deposit, cardNumber + usageTransactions for card
// payment) — no client-side mapping needed.
function toServiceData(raw: unknown): ServiceData | null {
  if (!raw) return null
  return raw as ServiceData
}

const POLL_INTERVAL_MS = 2000
const POLL_MAX_ATTEMPTS = 15

export class DataRequestServiceImpl implements DataRequestService {
  async fetchData(params: FetchDataParams): Promise<ServiceData[]> {
    const dateRange = params.datasetId === '900.cardpayment_transactions_001'
      ? { fromTransactionDate: '2026-05-01T00:00:00+07:00', toTransactionDate: '2026-06-30T23:59:59+07:00' }
      : { fromBookingDateTime: '2026-05-01T00:00:00+07:00', toBookingDateTime: '2026-06-30T23:59:59+07:00' }

    const body = {
      service_id: params.datasetId,
      as_node_id: params.dpId,
      namespace: 'citizen_id',
      identifier: '1234567890123',
      account_id: params.accountId,
      service_extension: [params.serviceExtension],
      request_params: JSON.stringify({ ...dateRange, language: 'TH' }),
      request_timeout: 900, // 15 minutes, matches backend default
    }

    const { request_id } = await post<BackendDataRequestCreateResponse>(
      '/data-request/create',
      body,
    )

    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      await new Promise<void>(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
      const items = await get<BackendDataItem[]>(`/data-request/data/${request_id}`)
      if (items.length === 0) continue

      const results: ServiceData[] = []
      for (const item of items) {
        if (item.error) {
          throw new Error(item.error_message ?? `AS error ${item.error_code ?? ''}`.trim())
        }
        if (!item.data) continue
        try {
          const parsed = JSON.parse(item.data) as unknown
          const values = Array.isArray(parsed) ? parsed : [parsed]
          for (const value of values) {
            const mapped = toServiceData(value)
            if (mapped) results.push(mapped)
          }
        } catch { /* skip malformed */ }
      }
      if (results.length > 0) return results
    }

    throw new Error('Data request timed out')
  }
}

import type { ConsentService, InitConsentParams, CompleteConsentParams } from './ConsentService'
import { get, post } from '@/lib/http'
import { datasetToServiceId } from '@/domain/rules/serviceMapping'

interface BackendPreConsentCreateResponse {
  reference_id: string
  request_id: string
}

interface BackendPreConsentStatusResponse {
  status: string
  [key: string]: unknown
}

interface BackendCompleteConsentCreateResponse {
  request_id: string
  [key: string]: unknown
}

interface BackendCompleteConsentDataItem {
  source_node_id: string
  service_id: string
  // JSON-encoded array of accountIds that received a consent token — the
  // actual tokens stay server-side.
  data: string
  [key: string]: unknown
}

const POLL_INTERVAL_MS = 2000
const POLL_MAX_ATTEMPTS = 15 // ~30s

export class ConsentServiceImpl implements ConsentService {
  async initConsentRequest(
    params: InitConsentParams,
  ): Promise<{ referenceId: string; requestId: string }> {
    // Group by service_id — all DPs that share a service go into one as_id_list entry
    const serviceMap = new Map<
      string,
      { asIds: string[]; datasetId: string; permissionId: string; lookbackMonths?: number }
    >()
    for (const dp of params.selectedDPs) {
      for (const ds of dp.selectedDatasets) {
        const serviceId = datasetToServiceId(ds.datasetId)
        const entry = serviceMap.get(serviceId)
        if (entry) {
          entry.asIds.push(dp.dpId)
        } else {
          serviceMap.set(serviceId, {
            asIds: [dp.dpId],
            datasetId: ds.datasetId,
            permissionId: ds.permissionId,
            lookbackMonths: ds.dataPeriod?.months,
          })
        }
      }
    }
    const dataRequestList = Array.from(serviceMap.entries()).map(
      ([service_id, { asIds, datasetId, permissionId, lookbackMonths }]) => {
        const serviceExtension = [
          ...(permissionId ? [permissionId] : []),
          ...(lookbackMonths ? [`lookback_${lookbackMonths}_months`] : []),
        ]
        return {
          service_id,
          as_id_list: asIds,
          request_params: JSON.stringify({
            token_objective: `เพื่อ${params.purpose || 'การพิจารณาให้สินเชื่อ'}`,
            usage_type: 'one_time',
            data_service_list: [
              { service_id: datasetId, ...(serviceExtension.length > 0 ? { service_extension: serviceExtension } : {}) },
            ],
          }),
        }
      },
    )

    const body = {
      namespace: 'citizen_id',
      identifier: '1234567890123',
      data_request_list: dataRequestList,
      idp_id_list: params.selectedIdPId ? [params.selectedIdPId] : [],
    }

    const response = await post<BackendPreConsentCreateResponse>('/pre-consent/create', body)
    return {
      referenceId: response.reference_id,
      requestId: response.request_id,
    }
  }

  async getPreConsentStatus(
    referenceId: string,
  ): Promise<'pending' | 'confirmed' | 'complete'> {
    const response = await get<BackendPreConsentStatusResponse>(
      `/pre-consent/data/${referenceId}`,
    )
    if (response.status === 'completed') return 'complete'
    if (response.status === 'confirmed') return 'confirmed'
    return 'pending'
  }

  async completeConsent(
    params: CompleteConsentParams,
  ): Promise<{ consentedAccountIds: string[] }> {
    // Group selected accounts by bank (dpId) — one complete-consent request per AS.
    const byBank = new Map<string, { accounts: typeof params.selectedAccounts }>()
    for (const acc of params.selectedAccounts) {
      const existing = byBank.get(acc.dpId)
      if (existing) {
        existing.accounts.push(acc)
      } else {
        byBank.set(acc.dpId, { accounts: [acc] })
      }
    }

    const requestIdByDp = new Map<string, string>()
    for (const [dpId, { accounts: dpAccounts }] of byBank) {
      const createBody = {
        as_node_id: dpId,
        namespace: 'citizen_id',
        identifier: '1234567890123',
        // RP resolves the as_token server-side from this + as_node_id.
        pre_consent_request_id: params.requestId,
        // Per YourData_Schema_Common, must echo back the full account item objects
        // exactly as received from pre-consent's sub_identity_list.
        selected_accounts: dpAccounts.map(acc => ({
          namespace: 'account_id',
          identifier: acc.accountId,
          visible_identifier: acc.maskedAccountNumber,
          identifier_extension: acc.identifierExtension,
        })),
        request_timeout: 900, // 15 minutes, matches backend default
      }
      const createResp = await post<BackendCompleteConsentCreateResponse>(
        '/complete-consent/create',
        createBody,
      )
      if (createResp.request_id) {
        requestIdByDp.set(dpId, createResp.request_id)
      }
    }

    // Poll all banks until each resolves (one consent per selected account).
    const consentedAccountIds: string[] = []
    const resolvedDpIds = new Set<string>()
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      await new Promise<void>(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
      for (const [dpId, requestId] of requestIdByDp) {
        if (resolvedDpIds.has(dpId)) continue
        const items = await get<BackendCompleteConsentDataItem[]>(
          `/complete-consent/data/${requestId}`,
        )
        for (const item of items) {
          try {
            const accountIds = JSON.parse(item.data) as string[]
            if (!Array.isArray(accountIds) || accountIds.length === 0) continue
            consentedAccountIds.push(...accountIds)
            resolvedDpIds.add(dpId)
            break
          } catch { /* skip malformed item */ }
        }
      }
      if (resolvedDpIds.size === requestIdByDp.size) {
        return { consentedAccountIds }
      }
    }

    throw new Error('Complete consent timed out — consent token not received after 30s')
  }
}

import type { DataProviderService } from './DataProviderService'
import type { DataProvider, Account } from '@/domain/types'
import { get } from '@/lib/http'
import { dpListConfig } from '@/config/dp-list'
import { datasetToServiceId } from '@/domain/rules/serviceMapping'

interface AsServiceListEntry {
  node_id: string
}

interface BackendSubIdentity {
  namespace: string
  identifier: string
  visible_identifier: string
  identifier_extension?: string
}

interface BackendAccountEntry {
  accountId: string
  accountSubType: string
  institutionName?: string
  accountName?: string
  [key: string]: unknown
}

interface BackendAccountListData {
  accountListHeader: {
    accountListEntries: BackendAccountEntry[]
  }
  // Note: the RP backend strips `authorization` (the as_token) out of this
  // payload before it ever reaches the browser — see GET /pre-consent/data
  // in rp/example1/src/server.ts. It is not, and must not be, present here.
  sub_identity_list?: BackendSubIdentity[]
  [key: string]: unknown
}

interface BackendPreConsentDataItem {
  source_node_id: string
  service_id: string
  data: string
  [key: string]: unknown
}

// identifier_extension is an opaque JSON string set by the AS, e.g.
// '{"accountSubType":"CURRENT"}' or '{"card_type":"VISA"}'.
function parseIdentifierExtension(raw?: string): { accountSubType?: string; card_type?: string } {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as { accountSubType?: string; card_type?: string }
  } catch {
    return {}
  }
}

export class DataProviderServiceImpl implements DataProviderService {
  async getDPList(): Promise<DataProvider[]> {
    // Cross-check the static business catalog against which AS nodes are
    // actually registered on the platform right now, so the user only ever
    // sees providers that are genuinely available — not a stale/manual list.
    const serviceIds = [
      ...new Set(dpListConfig.flatMap(dp => dp.datasets.map(ds => datasetToServiceId(ds.datasetId)))),
    ]

    const registeredNodesByService = new Map<string, Set<string>>()
    await Promise.all(
      serviceIds.map(async serviceId => {
        try {
          const nodes = await get<AsServiceListEntry[]>(`/service-as-list/${serviceId}`)
          registeredNodesByService.set(serviceId, new Set(nodes.map(n => n.node_id)))
        } catch {
          // Discovery failed for this service — treat as no registered nodes
          // rather than silently trusting the static config.
          registeredNodesByService.set(serviceId, new Set())
        }
      }),
    )

    return dpListConfig
      .map(dp => ({
        ...dp,
        datasets: dp.datasets.filter(ds => {
          const serviceId = datasetToServiceId(ds.datasetId)
          return registeredNodesByService.get(serviceId)?.has(dp.dpId) ?? false
        }),
      }))
      .filter(dp => dp.datasets.length > 0)
  }

  async getDPAccounts(_dpId: string, requestId: string): Promise<Account[]> {
    const items = await get<BackendPreConsentDataItem[]>(`/pre-consent/data/${requestId}`)
    const accounts: Account[] = []
    for (const item of items) {
      let parsed: BackendAccountListData
      try {
        parsed = JSON.parse(item.data) as BackendAccountListData
      } catch {
        continue
      }

      const subIdentities = parsed.sub_identity_list ?? []
      const entries = parsed.accountListHeader?.accountListEntries ?? []

      if (subIdentities.length > 0) {
        for (const identity of subIdentities) {
          const isCard = identity.namespace === 'card_number'
          const { accountSubType, card_type } = parseIdentifierExtension(identity.identifier_extension)
          accounts.push({
            accountId: identity.identifier,
            dpId: item.source_node_id,
            accountType: isCard ? 'loan' : 'deposit',
            accountTypeName: card_type ?? accountSubType ?? identity.namespace,
            maskedAccountNumber: identity.visible_identifier,
            isSelected: false,
            identifierExtension: identity.identifier_extension,
          })
        }
      } else {
        for (const entry of entries) {
          accounts.push({
            accountId: entry.accountId,
            dpId: item.source_node_id,
            accountType: entry.accountSubType.toLowerCase().includes('credit') ? 'loan' : 'deposit',
            accountTypeName: entry.accountSubType,
            maskedAccountNumber: entry.accountId,
            isSelected: false,
          })
        }
      }
    }
    return accounts
  }
}

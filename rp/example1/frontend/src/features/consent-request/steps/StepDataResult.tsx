import { useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { useConsentRequestStore } from '@/stores/consentRequestStore'
import type { DataResultEntry, DepositData, CreditData, ServiceData } from '@/domain/types'

function isDepositData(data: ServiceData): data is DepositData {
  return 'statementEntries' in data
}

function isCreditData(data: ServiceData): data is CreditData {
  return 'usageTransactions' in data
}

function formatDate(isoDate: string): string {
  const d = new Date(isoDate)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function DepositAccountCard({ data }: { data: DepositData }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <p style={{ fontSize: 11, color: '#64748B', marginBottom: 5 }}>
        เลขที่บัญชี: <span style={{ fontWeight: 600, color: '#0F172A' }}>{data.accountId}{data.accountTypeName ? ` | ประเภทบัญชี: ${data.accountTypeName}` : ''}</span>
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {data.statementEntries.map((tx, i) => (
          <div
            key={tx.transactionId ?? `${data.accountId}-${i}`}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 10px', background: '#F8FAFC', borderRadius: 7,
              border: '1px solid #E2E8F0',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12, color: '#0F172A', fontWeight: 500, lineHeight: 1.3 }}>
                {tx.transactionInformation ?? tx.proprietaryBankTransactionDescription}
              </p>
              <p style={{ fontSize: 10.5, color: '#94A3B8', marginTop: 1 }}>
                {formatDate(tx.bookingDateTime)}
              </p>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
              <span style={{
                fontSize: 12.5, fontWeight: 700,
                color: tx.creditDebitIndicator === 'CRDT' ? '#166534' : '#991B1B',
              }}>
                {tx.creditDebitIndicator === 'CRDT' ? '+' : '-'}
                {tx.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </span>
              <p style={{ fontSize: 9.5, color: '#94A3B8' }}>{tx.amountCurrency}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CreditAccountCard({ data }: { data: CreditData }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <p style={{ fontSize: 11, color: '#64748B', marginBottom: 5 }}>
        เลขที่บัตร: <span style={{ fontWeight: 600, color: '#0F172A' }}>{data.cardNumber}{data.accountTypeName ? ` | ${data.accountTypeName}` : ''}</span>
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {data.usageTransactions.map((tx, i) => (
          <div
            key={tx.transactionId ?? `${data.cardNumber}-${i}`}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 10px', background: '#F8FAFC', borderRadius: 7,
              border: '1px solid #E2E8F0',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12, color: '#0F172A', fontWeight: 500, lineHeight: 1.3 }}>
                {tx.transactionDescription ?? tx.transactionType}
              </p>
              <p style={{ fontSize: 10.5, color: '#94A3B8', marginTop: 1 }}>
                {formatDate(tx.transactionDate)}
              </p>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
              <span style={{
                fontSize: 12.5, fontWeight: 700,
                color: tx.creditDebitIndicator === 'CRDT' ? '#166534' : '#991B1B',
              }}>
                {tx.creditDebitIndicator === 'CRDT' ? '+' : '-'}
                {tx.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </span>
              <p style={{ fontSize: 9.5, color: '#94A3B8' }}>{tx.amountCurrency}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ResultCard({ entry }: { entry: DataResultEntry }) {
  return (
    <div style={{ marginBottom: 16, borderBottom: '1px solid #F1F5F9', paddingBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{entry.dpNameTh}</p>
        <p style={{ fontSize: 11, color: '#64748B' }}>· {entry.datasetName}</p>
      </div>

      {entry.error ? (
        <div style={{ padding: '8px 10px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 7 }}>
          <p style={{ fontSize: 11.5, color: '#DC2626' }}>{entry.error}</p>
        </div>
      ) : entry.data && entry.data.length > 0 ? (
        entry.data.map((item, i) => (
          isDepositData(item)
            ? <DepositAccountCard key={`${item.accountId}-${i}`} data={item} />
            : isCreditData(item)
              ? <CreditAccountCard key={`${item.cardNumber}-${i}`} data={item} />
              : null
        ))
      ) : null}
    </div>
  )
}

export function StepDataResult() {
  const dataResults = useConsentRequestStore(s => s.dataResults)
  const isLoadingData = useConsentRequestStore(s => s.isLoadingData)
  const fetchDataForConsent = useConsentRequestStore(s => s.fetchDataForConsent)
  const reset = useConsentRequestStore(s => s.reset)

  const hasCalledRef = useRef(false)

  useEffect(() => {
    if (hasCalledRef.current) return
    hasCalledRef.current = true
    void fetchDataForConsent()
  }, [fetchDataForConsent])

  const showSpinner = isLoadingData && dataResults.length === 0

  return (
    <div className="flex-1 flex flex-col">
      {/* Page header — full-bleed, outside the scrollable area */}
      <div style={{
        background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
        borderBottom: '2px solid #A16207',
        padding: '18px 20px 16px',
        flexShrink: 0,
      }}>
        <div>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#FFFFFF', lineHeight: 1.2 }}>
            ข้อมูลที่ได้รับ
          </p>
          <p style={{ fontSize: 11.5, color: '#94A3B8', marginTop: 2 }}>
            ข้อมูลที่คุณให้ความยินยอม
          </p>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px 8px' }}>

        {showSpinner ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: 40, gap: 10 }}>
            <Loader2 size={28} strokeWidth={1.5} className="animate-spin" style={{ color: '#2563EB' }} />
            <p style={{ fontSize: 13, color: '#64748B' }}>กำลังดึงข้อมูล...</p>
          </div>
        ) : (
          <>
            {dataResults.map((entry, i) => (
              <ResultCard key={`${entry.dpId}-${entry.datasetId}-${i}`} entry={entry} />
            ))}
            {isLoadingData && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
                <Loader2 size={14} strokeWidth={1.5} className="animate-spin" style={{ color: '#94A3B8' }} />
                <p style={{ fontSize: 11.5, color: '#94A3B8' }}>กำลังดึงข้อมูลเพิ่มเติม...</p>
              </div>
            )}
          </>

        )}
      </div>

      <div style={{ padding: '13px 20px', borderTop: '1px solid #E2E8F0', flexShrink: 0 }}>
        <button
          onClick={reset}
          disabled={isLoadingData}
          style={{
            width: '100%', padding: '11px 16px',
            background: isLoadingData ? '#E2E8F0' : '#0F172A',
            color: isLoadingData ? '#94A3B8' : 'white',
            borderRadius: 8, fontSize: 14, fontWeight: 600,
            border: 'none', cursor: isLoadingData ? 'not-allowed' : 'pointer',
            minHeight: 44,
          }}
        >
          ปิด
        </button>
      </div>
    </div>
  )
}

import { useConsentRequestStore } from '@/stores/consentRequestStore'
import { DPCard } from '@/components/DPCard'

const MAX_DP_COUNT = 7

export function StepDPSelectCredit() {
  const availableDPs = useConsentRequestStore(s => s.availableDPs)
  const selectedDPs = useConsentRequestStore(s => s.selectedDPs)
  const toggleDP = useConsentRequestStore(s => s.toggleDP)
  const proceedToCommonMessage = useConsentRequestStore(s => s.proceedToCommonMessage)
  const goBack = useConsentRequestStore(s => s.goBack)
  const error = useConsentRequestStore(s => s.error)

  const creditDPs = availableDPs.filter(dp =>
    dp.datasets.some(d => d.datasetId.startsWith('900.cardpayment_transactions_'))
  )
  const creditDataset = availableDPs
    .flatMap(dp => dp.datasets)
    .find(d => d.datasetId.startsWith('900.cardpayment_transactions_'))

  const selectedIds = selectedDPs
    .filter(d => d.selectedDatasets.some(ds => ds.datasetId.startsWith('900.cardpayment_transactions_')))
    .map(d => d.dpId)
  const selectedCount = selectedDPs.length
  const progressPct = Math.min((selectedCount / MAX_DP_COUNT) * 100, 100)

  const fromDate = creditDataset?.dataPeriod.fromDate ?? ''
  const toDate = creditDataset?.dataPeriod.toDate ?? ''
  const months = creditDataset?.dataPeriod.months ?? 36

  function formatThaiDate(iso: string): string {
    if (!iso) return ''
    const [year, month] = iso.split('-')
    const thaiYear = parseInt(year) + 543
    return `${month}/${String(thaiYear).slice(-2)}`
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 p-4 overflow-y-auto">
        <span
          className="inline-flex items-center gap-1.5 text-xs font-bold rounded-full px-3 py-1 mb-3"
          style={{ background: '#F3E8FF', color: '#7C3AED' }}
        >
          <svg width="11" height="11" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <rect x="1" y="3" width="8" height="5" rx="1" stroke="#7C3AED" strokeWidth="1.2" />
            <path d="M1 5.5h8M3 3V2M7 3V2" stroke="#7C3AED" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          ประวัติการชำระสินเชื่อ
        </span>

        <h2 className="text-base font-bold mb-1" style={{ color: '#0F172A' }}>
          เลือกผู้ให้บริการ
        </h2>
        <p className="text-xs mb-3" style={{ color: '#64748B' }}>
          กรุณาเลือกธนาคารที่ประสงค์ให้ส่งข้อมูลสินเชื่อ
        </p>

        <div
          className="rounded-lg p-3 mb-4"
          style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium" style={{ color: '#334155' }}>เลือกแล้ว</span>
            <span className="text-sm font-bold" style={{ color: selectedCount >= MAX_DP_COUNT ? '#DC2626' : '#0F172A' }}>
              {selectedCount} / {MAX_DP_COUNT} ราย (รวมทุกชุดข้อมูล)
            </span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#E2E8F0' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${progressPct}%`,
                background: selectedCount >= MAX_DP_COUNT ? '#DC2626' : '#7C3AED',
              }}
            />
          </div>
        </div>

        {creditDPs.map(dp => (
          <DPCard
            key={dp.dpId}
            dp={dp}
            isSelected={selectedIds.includes(dp.dpId)}
            onToggle={(dpId) => toggleDP(dpId, '900.cardpayment_transactions_basic_002')}
          />
        ))}

        {error && (
          <p className="text-xs mt-2 p-2 rounded" style={{ color: '#991B1B', background: '#FEF2F2' }}>
            {error}
          </p>
        )}

        <div
          style={{
            border: '1px solid #E2E8F0', borderRadius: 8,
            padding: '10px 14px', marginTop: 12, background: '#F8FAFC',
          }}
        >
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#64748B' }}>
            ระยะเวลาข้อมูลย้อนหลัง (Data Period)
          </p>
          <p style={{ fontSize: 12.5, color: '#0F172A', marginTop: 3 }}>
            ย้อนหลัง {months} เดือน นับจากเดือนที่เรียก
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center', fontSize: 12 }}>
            <span style={{ flex: 1, textAlign: 'center', background: '#E2E8F0', borderRadius: 5, padding: '4px 0', color: '#334155' }}>
              {formatThaiDate(fromDate)}
            </span>
            <span style={{ color: '#94A3B8' }}>–</span>
            <span style={{ flex: 1, textAlign: 'center', background: '#E2E8F0', borderRadius: 5, padding: '4px 0', color: '#334155' }}>
              {formatThaiDate(toDate)}
            </span>
          </div>
        </div>
      </div>

      <div className="p-4 flex gap-2" style={{ borderTop: '1px solid #E2E8F0' }}>
        <button
          onClick={goBack}
          className="flex-1 py-2.5 rounded-lg text-sm font-semibold"
          style={{ background: '#F1F5F9', color: '#64748B' }}
        >
          ย้อนกลับ
        </button>
        <button
          onClick={proceedToCommonMessage}
          className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white"
          style={{ background: '#0F172A' }}
        >
          ดำเนินการต่อ
        </button>
      </div>
    </div>
  )
}

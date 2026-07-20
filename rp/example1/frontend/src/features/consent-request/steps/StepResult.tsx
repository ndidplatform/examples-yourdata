import { useEffect, useState } from 'react'
import { useConsentRequestStore } from '@/stores/consentRequestStore'

const DOT_COLORS = ['#1E3A8A', '#4A1F8F', '#166534', '#0F172A', '#9F1239', '#0369A1']

function dotColor(dpId: string): string {
  return DOT_COLORS[dpId.charCodeAt(dpId.length - 1) % DOT_COLORS.length]
}

function monthLabel(months: number): string {
  return `ย้อนหลัง ${months} เดือน`
}

export function StepResult() {
  const consentedAccountIds = useConsentRequestStore(s => s.consentedAccountIds)
  const selectedDPs = useConsentRequestStore(s => s.selectedDPs)
  const availableDPs = useConsentRequestStore(s => s.availableDPs)
  const consentedDPIds = useConsentRequestStore(s => s.consentedDPIds)
  const accounts = useConsentRequestStore(s => s.accounts)
  const isCreditSelected = useConsentRequestStore(s => s.isCreditSelected)
  const reset = useConsentRequestStore(s => s.reset)

  const proceedToDataResult = useConsentRequestStore(s => s.proceedToDataResult)
  const isSuccess = consentedAccountIds.length > 0

  const [countdown, setCountdown] = useState(10)

  useEffect(() => {
    if (!isSuccess) return
    if (countdown <= 0) {
      proceedToDataResult()
      return
    }
    const id = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(id)
  }, [isSuccess, countdown, proceedToDataResult])

  if (!isSuccess) {
    return (
      <div className="flex-1 flex flex-col">
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' }}>
          <div>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#FEF2F2', border: '2px solid #FECACA', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                <path d="M8 8l12 12M20 8L8 20" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>เกิดข้อผิดพลาด</p>
            <p style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>กรุณาลองใหม่อีกครั้ง</p>
          </div>
        </div>
        <div style={{ padding: '13px 20px', borderTop: '1px solid #E2E8F0', flexShrink: 0 }}>
          <button onClick={reset} style={{ width: '100%', padding: '11px 16px', background: '#0F172A', color: 'white', borderRadius: 8, fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer', minHeight: 44 }}>
            ปิด
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col">
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 20px 8px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: '#F0FDF4', border: '2px solid #BBF7D0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'popIn 400ms cubic-bezier(0.34,1.56,0.64,1)',
          }}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
              <path d="M7 14l5 5.5 9.5-9.5" stroke="#166534" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        <p style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', textAlign: 'center', letterSpacing: '-0.02em', marginBottom: 4 }}>
          ให้ความยินยอมสำเร็จ
        </p>
        <p style={{ fontSize: 13, color: '#64748B', textAlign: 'center', marginBottom: 18 }}>
          คุณได้ให้ความยินยอมในการเปิดเผยข้อมูลแล้ว
        </p>

        <div style={{ border: '1.5px solid #A16207', borderRadius: 10, overflow: 'hidden', marginBottom: 14 }}>
          <div style={{ padding: '14px 18px', background: 'white' }}>
            {/* Bank-by-bank summary — only DPs where accounts were actually selected */}
            {selectedDPs.length > 0 && (
              <div style={{paddingTop: 10}}>
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#64748B', marginBottom: 8 }}>
                  รายการข้อมูลที่ให้ความยินยอม
                </p>
                {selectedDPs.filter(dp => consentedDPIds.includes(dp.dpId)).map(dp => {
                  const dpInfo = availableDPs.find(d => d.dpId === dp.dpId)
                  const acctCount = accounts.filter(a => a.dpId === dp.dpId && a.isSelected).length
                  const datasets = (dpInfo?.datasets ?? []).filter(ds =>
                    ds.isMandatory || isCreditSelected
                  )
                  return (
                    <div key={dp.dpId} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, padding: '5px 0', fontSize: 12, color: '#334155' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor(dp.dpId), flexShrink: 0, marginTop: 3 }} />
                      <div>
                        <span style={{ fontWeight: 700 }}>
                          {dpInfo?.dpNameTh ?? dp.dpName}
                          {acctCount > 0 && (
                            <span style={{ fontWeight: 400, color: '#64748B' }}> · {acctCount} บัญชี</span>
                          )}
                        </span>
                        {datasets.length > 0 && (
                          <div style={{ marginTop: 3, display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {datasets.map(ds => (
                              <p key={ds.datasetId} style={{ fontSize: 11, color: '#64748B', lineHeight: 1.5 }}>
                                {ds.datasetName} — {monthLabel(ds.dataPeriod.months)}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

        </div>
      </div>

      <div style={{ padding: '13px 20px', borderTop: '1px solid #E2E8F0', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ textAlign: 'center', fontSize: 12, color: '#64748B' }}>
          ดึงข้อมูลอัตโนมัติใน <span style={{ fontWeight: 700, color: '#0F172A' }}>{countdown}</span> วินาที
        </p>
        <button
          onClick={reset}
          style={{ width: '100%', padding: '9px 16px', background: 'transparent', color: '#64748B', borderRadius: 8, fontSize: 13, fontWeight: 500, border: '1px solid #E2E8F0', cursor: 'pointer' }}
        >
          ปิด
        </button>
      </div>
    </div>
  )
}

import { useEffect } from 'react'
import { useConsentRequestStore } from '@/stores/consentRequestStore'

export function StepDatasetSelect() {
  const availableDPs = useConsentRequestStore(s => s.availableDPs)
  const loadDPs = useConsentRequestStore(s => s.loadDPs)
  const proceedToDPSelect = useConsentRequestStore(s => s.proceedToDPSelect)
  const goBack = useConsentRequestStore(s => s.goBack)
  const isLoading = useConsentRequestStore(s => s.isLoading)
  const purpose = useConsentRequestStore(s => s.purpose)

  const displayPurpose = purpose || 'การพิจารณาให้สินเชื่อ'

  useEffect(() => { void loadDPs() }, [loadDPs])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#0F172A', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  const allDatasets = availableDPs.flatMap(dp => dp.datasets)
  const uniqueIds = [...new Set(allDatasets.map(d => d.datasetId))]
  const globalDatasets = uniqueIds.map(id => allDatasets.find(d => d.datasetId === id)!)
  const mandatory = globalDatasets.filter(d => d.isMandatory)
  const optional = globalDatasets.filter(d => !d.isMandatory)

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 p-4 overflow-y-auto">
        <div
          className="rounded-lg p-3 mb-4"
          style={{
            background: '#FFFBEB',
            border: '1px solid #FDE68A',
            borderLeft: '3px solid #D97706',
          }}
        >
          <p className="font-semibold mb-0.5" style={{ fontSize: 9, color: '#92400E', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            วัตถุประสงค์
          </p>
          <p className="text-sm font-bold" style={{ color: '#D97706' }}>เพื่อ{displayPurpose}</p>
        </div>

        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#64748B', marginBottom: 8 }}>
          บังคับ
        </p>
        {mandatory.map(ds => (
          <div
            key={ds.datasetId}
            style={{
              border: '1.5px solid #BBF7D0',
              borderRadius: 9,
              marginBottom: 8,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 13px',
                background: '#F0FDF4',
                cursor: 'default',
              }}
            >
              {/* sr-only checkbox for test compat */}
              <input type="checkbox" checked readOnly disabled className="sr-only" />
              <div
                aria-hidden="true"
                style={{
                  width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: '#166534', border: '2px solid #166534',
                }}
              >
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                  <polyline points="1.5,5.5 4.5,8.5 9.5,2.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#166534' }}>{ds.datasetName}</span>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', color: '#166534', background: '#DCFCE7', borderRadius: 20, padding: '2px 8px' }}>
                บังคับ
              </span>
            </div>
            <div style={{ padding: '8px 13px 10px', background: '#F0FDF4' }}>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
                {ds.permissions.map(p => (
                  <li key={p.permissionId} style={{ fontSize: 12, color: '#334155', display: 'flex', gap: 6 }}>
                    <span style={{ color: '#A16207' }}>·</span>
                    {p.permissionName}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}

        {optional.length > 0 && (
          <>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#64748B', marginTop: 14, marginBottom: 8 }}>
              ตัวเลือกเพิ่มเติม
            </p>
            {optional.map(ds => (
                <div
                  key={ds.datasetId}
                  style={{
                    border: '1.5px solid #E2E8F0',
                    borderRadius: 9,
                    marginBottom: 8,
                    overflow: 'hidden',
                    opacity: 0.5,
                    cursor: 'not-allowed',
                  }}
                >
                  <div
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 13px',
                      background: '#F8FAFC',
                    }}
                  >
                    <input type="checkbox" checked={false} disabled readOnly className="sr-only" />
                    <div
                      aria-hidden="true"
                      style={{
                        width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: '#F1F5F9',
                        border: '2px solid #CBD5E1',
                      }}
                    />
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#94A3B8' }}>{ds.datasetName}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', color: '#7C3AED', background: '#F3E8FF', borderRadius: 20, padding: '2px 8px' }}>
                      ไม่บังคับ
                    </span>
                  </div>
                  <div style={{ padding: '8px 13px 10px', background: '#F8FAFC' }}>
                    <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {ds.permissions.map(p => (
                        <li key={p.permissionId} style={{ fontSize: 12, color: '#94A3B8', display: 'flex', gap: 6 }}>
                          <span style={{ color: '#CBD5E1' }}>·</span>
                          {p.permissionName}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
            ))}
          </>
        )}
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
          onClick={() => proceedToDPSelect(false)}
          className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white"
          style={{ background: '#0F172A' }}
        >
          ดำเนินการต่อ
        </button>
      </div>
    </div>
  )
}

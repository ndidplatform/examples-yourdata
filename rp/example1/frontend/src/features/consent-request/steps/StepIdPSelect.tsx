import { useEffect, useState } from 'react'
import { useConsentRequestStore } from '@/stores/consentRequestStore'

function idpIconColor(idpName: string): { bg: string; color: string } {
  if (idpName.includes('K Plus') || idpName.includes('KBank')) return { bg: '#E8F5EE', color: '#1E5F3A' }
  if (idpName.includes('SCB')) return { bg: '#EDE9F7', color: '#4A1F8F' }
  if (idpName.includes('KTB') || idpName.includes('Krungthai')) return { bg: '#E6EEF9', color: '#003A8C' }
  return { bg: '#F1F5F9', color: '#334155' }
}

function monogram(name: string): string {
  return name.replace(/[^A-Za-z฀-๿]/g, '').slice(0, 2).toUpperCase() || name.slice(0, 2).toUpperCase()
}

export function StepIdPSelect() {
  const availableIdPs = useConsentRequestStore(s => s.availableIdPs)
  const loadIdPs = useConsentRequestStore(s => s.loadIdPs)
  const selectIdP = useConsentRequestStore(s => s.selectIdP)
  const initConsentRequest = useConsentRequestStore(s => s.initConsentRequest)
  const consentMessage = useConsentRequestStore(s => s.consentMessage)
  const goBack = useConsentRequestStore(s => s.goBack)

  const [localSelected, setLocalSelected] = useState<string | null>(null)

  useEffect(() => { void loadIdPs() }, [loadIdPs])

  function handleContinue() {
    if (!localSelected) return
    selectIdP(localSelected)
    void initConsentRequest('Your Data DC', consentMessage)
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 p-4 overflow-y-auto">
        <h2 className="text-base font-bold mb-1" style={{ color: '#0F172A' }}>
          เลือกผู้ให้บริการยืนยันตัวตน
        </h2>
        <p className="text-xs mb-4" style={{ color: '#64748B' }}>
          กรุณายืนยันตัวตนผ่านผู้ให้บริการที่คุณเคยลงทะเบียนไว้
        </p>
        <div className="grid grid-cols-2 gap-3">
          {availableIdPs.map(idp => {
            const { bg, color } = idpIconColor(idp.idpName)
            const isSelected = localSelected === idp.idpId
            return (
              <button
                key={idp.idpId}
                onClick={() => setLocalSelected(isSelected ? null : idp.idpId)}
                className="rounded-2xl p-4 transition-all"
                style={{
                  background: 'white',
                  border: `2px solid ${isSelected ? '#0F172A' : '#E2E8F0'}`,
                  boxShadow: isSelected ? '0 0 0 3px rgba(15,23,42,0.12)' : 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                }}
              >
                <div
                  className="flex items-center justify-center rounded-xl mb-3 font-bold text-lg"
                  style={{ width: 52, height: 52, background: bg, color }}
                >
                  {monogram(idp.idpName)}
                </div>
                <p className="text-sm font-bold leading-tight" style={{ color: '#0F172A' }}>
                  {idp.idpName}
                </p>
              </button>
            )
          })}
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
          onClick={handleContinue}
          className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity"
          style={{
            background: '#0F172A',
            opacity: localSelected === null ? 0.35 : 1,
            pointerEvents: localSelected === null ? 'none' : 'auto',
          }}
        >
          ดำเนินการต่อ
        </button>
      </div>
    </div>
  )
}

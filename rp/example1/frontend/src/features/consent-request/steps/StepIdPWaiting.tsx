import { useEffect, useRef, useState } from 'react'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { useConsentRequestStore } from '@/stores/consentRequestStore'

const WAIT_SECONDS = 10

export function StepIdPWaiting() {
  const requestId = useConsentRequestStore(s => s.requestId)
  const error = useConsentRequestStore(s => s.error)
  const selectedIdPId = useConsentRequestStore(s => s.selectedIdPId)
  const availableIdPs = useConsentRequestStore(s => s.availableIdPs)
  const consentMessage = useConsentRequestStore(s => s.consentMessage)
  const selectedDPs = useConsentRequestStore(s => s.selectedDPs)
  const proceedToAccountSelect = useConsentRequestStore(s => s.proceedToAccountSelect)
  const loadAccounts = useConsentRequestStore(s => s.loadAccounts)
  const initConsentRequest = useConsentRequestStore(s => s.initConsentRequest)

  const selectedIdPName = availableIdPs.find(i => i.idpId === selectedIdPId)?.idpName ?? selectedIdPId

  const [secondsLeft, setSecondsLeft] = useState(WAIT_SECONDS)
  const [done, setDone] = useState(false)
  const hasProceededRef = useRef(false)

  useEffect(() => {
    if (secondsLeft <= 0) return
    const t = setTimeout(() => setSecondsLeft(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [secondsLeft])

  useEffect(() => {
    if (secondsLeft > 0 || !requestId || hasProceededRef.current) return
    hasProceededRef.current = true
    setDone(true)
    for (const dp of selectedDPs) {
      void loadAccounts(dp.dpId)
    }
    proceedToAccountSelect()
  }, [secondsLeft, requestId, loadAccounts, proceedToAccountSelect, selectedDPs])

  const progress = ((WAIT_SECONDS - secondsLeft) / WAIT_SECONDS) * 100
  const countdownDone = secondsLeft === 0

  if (error && !requestId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4">
        <div
          className="flex items-center justify-center rounded-full"
          style={{ width: 72, height: 72, background: '#FEE2E2' }}
        >
          <XCircle size={36} strokeWidth={1.5} style={{ color: '#DC2626' }} />
        </div>
        <p className="text-base font-semibold text-center" style={{ color: '#DC2626' }}>
          เกิดข้อผิดพลาด
        </p>
        <p className="text-sm text-center" style={{ color: '#64748B' }}>{error}</p>
        <button
          onClick={() => void initConsentRequest('Your Data DC', consentMessage)}
          className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white"
          style={{ background: '#0F172A' }}
        >
          ลองใหม่อีกครั้ง
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
      {done ? (
        <div className="flex flex-col items-center gap-3">
          <div
            className="flex items-center justify-center rounded-full"
            style={{ width: 72, height: 72, background: '#DCFCE7' }}
          >
            <CheckCircle2 size={36} strokeWidth={1.5} style={{ color: '#16A34A' }} />
          </div>
          <p className="text-base font-semibold" style={{ color: '#15803D' }}>ยืนยันสำเร็จ</p>
        </div>
      ) : (
        <>
          <div
            className="flex items-center justify-center rounded-full"
            style={{ width: 72, height: 72, background: '#EFF6FF' }}
          >
            <Loader2 size={36} strokeWidth={1.5} className="animate-spin" style={{ color: '#2563EB' }} />
          </div>

          <div className="text-center">
            <p className="text-lg font-semibold mb-1" style={{ color: '#0F172A' }}>
              กำลังรอการยืนยันตัวตน
            </p>
            {selectedIdPId && (
              <p className="text-sm" style={{ color: '#64748B' }}>
                ผ่าน{' '}
                <span className="font-semibold" style={{ color: '#0F172A' }}>{selectedIdPName}</span>
              </p>
            )}
          </div>

          <div className="w-full">
            <div
              className="w-full rounded-full overflow-hidden"
              style={{ height: 6, background: '#E2E8F0' }}
            >
              <div
                className="h-full rounded-full transition-all duration-1000 ease-linear"
                style={{ width: `${progress}%`, background: '#2563EB' }}
              />
            </div>
            <p className="text-xs text-center mt-2" style={{ color: '#94A3B8' }}>
              {!countdownDone
                ? `กรุณารอสักครู่... (${secondsLeft})`
                : !requestId
                  ? 'รอการตอบกลับจากเซิร์ฟเวอร์...'
                  : 'กำลังโหลดข้อมูลบัญชี...'}
            </p>
          </div>


        </>
      )}
    </div>
  )
}

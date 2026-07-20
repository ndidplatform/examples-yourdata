import { useConsentRequestStore } from '@/stores/consentRequestStore'
import { ConsentMessageDisplay } from '@/components/ConsentMessageDisplay'
import { buildConsentMessage } from '@/domain/rules/messageBuilder'
import type { ConsentMessageData } from '@/domain/types'

export function StepCommonMessage() {
  const selectedDPs = useConsentRequestStore(s => s.selectedDPs)
  const availableDPs = useConsentRequestStore(s => s.availableDPs)
  const purpose = useConsentRequestStore(s => s.purpose)
  const confirmCommonMessage = useConsentRequestStore(s => s.confirmCommonMessage)
  const goBack = useConsentRequestStore(s => s.goBack)

  const displayPurpose = purpose || 'การพิจารณาให้สินเชื่อ'

  const messageData: ConsentMessageData = {
    purpose: displayPurpose,
    dcName: 'DC Application',
    dpItems: selectedDPs.map(dp => {
      const dpInfo = availableDPs.find(d => d.dpId === dp.dpId)
      return {
      dpName: dpInfo ? `${dpInfo.dpNameTh} (${dpInfo.dpName})` : dp.dpName,
      accountRef: '',
      datasets: dp.selectedDatasets.map(ds => ({ name: ds.datasetName, permission: ds.permissionName })),
    }}),
  }

  const handleConfirm = () => {
    confirmCommonMessage(buildConsentMessage(messageData))
  }

  return (
    <div className="flex-1 flex flex-col">
      <div
        className="px-4 py-3 text-center"
        style={{
          borderTop: '3px solid #D97706',
          background: '#FFFBEB',
          borderBottom: '1px solid #FDE68A',
        }}
      >
        <p className="text-xs font-bold leading-snug" style={{ color: '#0F172A' }}>
          คำขอและการให้ความยินยอมในการเปิดเผยข้อมูล
        </p>
        <p className="text-xs mt-0.5 font-semibold" style={{ color: '#D97706' }}>
          เพื่อ{displayPurpose}
        </p>
      </div>

      <div className="flex-1 p-4 overflow-y-auto">
        <ConsentMessageDisplay data={messageData} />
      </div>

      <div className="p-4 flex gap-2" style={{ borderTop: '1px solid #E2E8F0' }}>
        <button
          onClick={goBack}
          className="flex-1 py-2.5 rounded-lg text-sm font-semibold"
          style={{ background: '#F1F5F9', color: '#64748B' }}
        >
          ไม่ยินยอม
        </button>
        <button
          onClick={handleConfirm}
          className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white"
          style={{ background: '#0F172A' }}
        >
          ยินยอม
        </button>
      </div>
    </div>
  )
}

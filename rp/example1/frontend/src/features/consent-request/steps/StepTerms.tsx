import { useState } from 'react'
import { useConsentRequestStore } from '@/stores/consentRequestStore'

const MANDATORY_ITEMS = [
  'เงื่อนไขการใช้ผลิตภัณฑ์ (Product T&C)',
  'เงื่อนไข Digital ID Platform',
  'นโยบายความเป็นส่วนตัว (Privacy Notice)',
]

export function StepTerms() {
  const [agreed, setAgreed] = useState(false)
  const [optionalChecked, setOptionalChecked] = useState(false)
  const acceptTerms = useConsentRequestStore(s => s.acceptTerms)
  const goBack = useConsentRequestStore(s => s.goBack)

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 p-4 overflow-y-auto">
        <h2 className="text-base font-bold mb-1" style={{ color: '#0F172A' }}>
          เงื่อนไขการใช้บริการ
        </h2>
        <p className="text-xs mb-4" style={{ color: '#64748B' }}>
          เพื่อใช้บริการ DC Application ภายใต้โครงการ Your Data
        </p>

        <div className="space-y-2 mb-4">
          {MANDATORY_ITEMS.map(label => (
            <div
              key={label}
              className="flex items-center justify-between rounded-lg p-3"
              style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                  style={{ background: '#166534' }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                    <path d="M2 5l2.5 2.5 4-4" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <span className="text-xs font-medium" style={{ color: '#14532D' }}>{label}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span
                  className="text-xs font-semibold px-1.5 py-0.5 rounded"
                  style={{ background: '#BBF7D0', color: '#166534', fontSize: 9 }}
                >
                  จำเป็นต้องยอมรับ
                </span>
                <span style={{ color: '#166534', fontSize: 14 }}>›</span>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => setOptionalChecked(v => !v)}
            className="w-full flex items-center justify-between rounded-lg p-3 text-left transition-colors"
            style={{
              background: optionalChecked ? '#F8FAFC' : 'white',
              border: `1px solid ${optionalChecked ? '#CBD5E1' : '#E2E8F0'}`,
            }}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-colors"
                style={{
                  background: optionalChecked ? '#0F172A' : 'white',
                  border: optionalChecked ? 'none' : '1.5px solid #CBD5E1',
                }}
              >
                {optionalChecked && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                    <path d="M2 5l2.5 2.5 4-4" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <span className="text-xs font-medium" style={{ color: '#334155' }}>อื่น ๆ</span>
            </div>
            <span
              className="text-xs font-semibold px-1.5 py-0.5 rounded"
              style={{ background: '#F1F5F9', color: '#64748B', fontSize: 9 }}
            >
              ไม่บังคับ
            </span>
          </button>
        </div>

        <label
          className="flex items-start gap-2.5 cursor-pointer select-none rounded-lg p-3"
          style={{ background: '#FEFCE8', border: '1px solid #FDE68A' }}
        >
          <input
            type="checkbox"
            checked={agreed}
            onChange={e => setAgreed(e.target.checked)}
            className="mt-0.5 w-4 h-4 flex-shrink-0"
            data-testid="terms-checkbox"
          />
          <span className="text-xs leading-relaxed" style={{ color: '#78350F' }}>
            ฉันได้อ่านและยอมรับข้อตกลงทั้งหมดข้างต้น
          </span>
        </label>
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
          onClick={acceptTerms}
          disabled={!agreed}
          className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity"
          style={{ background: '#0F172A', opacity: agreed ? 1 : 0.45, cursor: agreed ? 'pointer' : 'not-allowed' }}
          data-testid="terms-next-button"
        >
          ดำเนินการต่อ
        </button>
      </div>
    </div>
  )
}

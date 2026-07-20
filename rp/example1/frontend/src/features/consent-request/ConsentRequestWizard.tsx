import type { ReactNode } from 'react'
import yourDataLogo from '@/assets/your_data_logo.png'
import { useConsentRequestStore } from '@/stores/consentRequestStore'
import { StepTerms } from './steps/StepTerms'
import { StepDatasetSelect } from './steps/StepDatasetSelect'
import { StepDPSelect } from './steps/StepDPSelect'
import { StepDPSelectCredit } from './steps/StepDPSelectCredit'
import { StepCommonMessage } from './steps/StepCommonMessage'
import { StepIdPSelect } from './steps/StepIdPSelect'
import { StepIdPWaiting } from './steps/StepIdPWaiting'
import { StepAccountSelect } from './steps/StepAccountSelect'
import { StepResult } from './steps/StepResult'
import { StepDataResult } from './steps/StepDataResult'
import type { WizardStep } from '@/domain/types'

const STEP_TO_RAIL: Record<WizardStep, number> = {
  'terms': 0,
  'dataset-select': 0,
  'dp-select': 1,
  'dp-select-credit': 1,
  'common-message': 2,
  'idp-select': 2,
  'idp-waiting': 2,
  'account-select': 3,
  'result': 4,
  'data-result': 4,
}

const RAIL_LABELS = ['ชุดข้อมูล', 'ธนาคาร', 'ยืนยัน', 'บัญชี', 'สำเร็จ']

const STEP_COUNTER: Record<WizardStep, string> = {
  'terms': '',
  'dataset-select': 'ขั้นตอน 1 / 5',
  'dp-select': 'ขั้นตอน 2 / 5',
  'dp-select-credit': 'ขั้นตอน 3 / 6',
  'common-message': '',
  'idp-select': 'ขั้นตอน 3 / 5',
  'idp-waiting': 'รอยืนยัน',
  'account-select': 'ขั้นตอน 4 / 5',
  'result': 'สำเร็จ',
  'data-result': 'ดูข้อมูล',
}

function renderStep(step: WizardStep): ReactNode {
  switch (step) {
    case 'terms': return <StepTerms />
    case 'dataset-select': return <StepDatasetSelect />
    case 'dp-select': return <StepDPSelect />
    case 'dp-select-credit': return <StepDPSelectCredit />
    case 'common-message': return <StepCommonMessage />
    case 'idp-select': return <StepIdPSelect />
    case 'idp-waiting': return <StepIdPWaiting />
    case 'account-select': return <StepAccountSelect />
    case 'result': return <StepResult />
    case 'data-result': return <StepDataResult />
  }
}

function CheckSVG() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M2 5l2.5 2.5 4-4" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

interface StepRailProps {
  current: WizardStep
}

function StepRail({ current }: StepRailProps) {
  const activeRail = STEP_TO_RAIL[current]
  return (
    <div className="flex items-center justify-between px-4 py-3">
      {RAIL_LABELS.map((label, i) => {
        const isDone = i < activeRail
        const isActive = i === activeRail
        return (
          <div key={label} className="flex items-center" style={{ flex: i < RAIL_LABELS.length - 1 ? '1' : undefined }}>
            <div className="flex flex-col items-center" style={{ minWidth: 36 }}>
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors"
                style={{
                  background: isDone ? '#A16207' : isActive ? '#0F172A' : '#E2E8F0',
                  color: isDone || isActive ? 'white' : '#94A3B8',
                }}
              >
                {isDone ? <CheckSVG /> : <span style={{ fontSize: 9 }}>{i + 1}</span>}
              </div>
              <span
                className="mt-0.5 text-center leading-tight"
                style={{
                  fontSize: 8,
                  color: isDone ? '#A16207' : isActive ? '#0F172A' : '#94A3B8',
                  fontWeight: isActive ? 700 : 400,
                  maxWidth: 36,
                }}
              >
                {label}
              </span>
            </div>
            {i < RAIL_LABELS.length - 1 && (
              <div
                className="flex-1 h-0.5 mx-0.5 mb-3 transition-colors"
                style={{ background: isDone ? '#A16207' : '#E2E8F0' }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

export function ConsentRequestWizard() {
  const currentStep = useConsentRequestStore(s => s.currentStep)

  return (
    <div
      className="flex flex-col items-center min-h-screen py-6 px-4"
      style={{
        background: 'radial-gradient(ellipse at 50% 0%, #e8edf3 0%, #F8FAFC 60%)',
      }}
    >
      <div
        className="w-full bg-white flex flex-col overflow-hidden"
        style={{
          maxWidth: 430,
          borderRadius: 14,
          boxShadow: '0 4px 24px rgba(15,23,42,0.10), 0 1px 4px rgba(15,23,42,0.06)',
          minHeight: 600,
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: '#E2E8F0' }}
        >
          <img src={yourDataLogo} alt="Your Data" className="h-8" />
          <span
            className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
            style={{ background: '#FEF3C7', color: '#A16207' }}
          >
            {STEP_COUNTER[currentStep]}
          </span>
        </div>

        {currentStep !== 'data-result' && (
          <div style={{ borderBottom: '1px solid #E2E8F0' }}>
            <StepRail current={currentStep} />
          </div>
        )}

        <div className="flex-1 flex flex-col overflow-hidden">
          {renderStep(currentStep)}
        </div>
      </div>
    </div>
  )
}

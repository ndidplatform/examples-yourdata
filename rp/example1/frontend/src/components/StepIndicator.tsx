import type { WizardStep } from '@/domain/types'

interface Props {
  steps: WizardStep[]
  current: WizardStep
}

export function StepIndicator({ steps, current }: Props) {
  const currentIndex = steps.indexOf(current)
  return (
    <div className="flex items-center gap-2 mb-5">
      {steps.map((step, i) => {
        const status = i < currentIndex ? 'done' : i === currentIndex ? 'active' : 'pending'
        return (
          <div
            key={step}
            data-testid="step-dot"
            data-status={status}
            className={[
              'w-2.5 h-2.5 rounded-full transition-colors',
              status === 'done' ? 'bg-green-500' : status === 'active' ? 'bg-blue-600' : 'bg-slate-300',
            ].join(' ')}
          />
        )
      })}
    </div>
  )
}

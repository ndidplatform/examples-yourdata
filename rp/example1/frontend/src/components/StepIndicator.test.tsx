import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { StepIndicator } from './StepIndicator'
import type { WizardStep } from '@/domain/types'

const steps: WizardStep[] = ['terms', 'dataset-select', 'dp-select', 'common-message', 'idp-select', 'idp-waiting', 'account-select', 'result']

describe('StepIndicator', () => {
  it('renders a dot for each step', () => {
    const { container } = render(<StepIndicator steps={steps} current="dp-select" />)
    const dots = container.querySelectorAll('[data-testid="step-dot"]')
    expect(dots).toHaveLength(8)
  })

  it('marks completed steps', () => {
    const { container } = render(<StepIndicator steps={steps} current="dp-select" />)
    const doneDots = container.querySelectorAll('[data-status="done"]')
    expect(doneDots.length).toBeGreaterThan(0)
  })

  it('marks the current step as active', () => {
    const { container } = render(<StepIndicator steps={steps} current="dp-select" />)
    expect(container.querySelector('[data-status="active"]')).toBeInTheDocument()
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useConsentRequestStore } from '@/stores/consentRequestStore'
import { ConsentRequestWizard } from './ConsentRequestWizard'

beforeEach(() => {
  useConsentRequestStore.getState().reset()
})

// The terms and common-message screens are currently hidden from the default
// flow (consentRequestStore's initial step is 'dataset-select'), so the
// golden path now starts at StepDatasetSelect. StepTerms itself is still
// covered directly in steps.test.tsx.
describe('ConsentRequestWizard — golden path', () => {
  it('renders StepDatasetSelect first', async () => {
    render(<ConsentRequestWizard />)
    // StepDatasetSelect shows a loading spinner while loadDPs() resolves
    await waitFor(() => expect(screen.getByText('วัตถุประสงค์')).toBeInTheDocument())
  })

  it('step indicator shows step 1 of 5 on the dataset-select screen', () => {
    render(<ConsentRequestWizard />)
    expect(screen.getByText('ขั้นตอน 1 / 5')).toBeInTheDocument()
  })
})

// StepTerms is unreachable from the wizard's default entry point right now
// (see above), but the screen and its store wiring are still fully intact.
// Kept skipped rather than deleted so this coverage comes back for free
// whenever the terms/common-message pages are unhidden from the flow.
describe.skip('ConsentRequestWizard — terms gate (currently hidden from flow)', () => {
  it('renders StepTerms first', () => {
    useConsentRequestStore.setState({ currentStep: 'terms' })
    render(<ConsentRequestWizard />)
    expect(screen.getByText('เงื่อนไขการใช้บริการ')).toBeInTheDocument()
  })

  it('Next button is disabled before accepting T&C', () => {
    useConsentRequestStore.setState({ currentStep: 'terms' })
    render(<ConsentRequestWizard />)
    expect(screen.getByTestId('terms-next-button')).toBeDisabled()
  })

  it('advances to StepDatasetSelect after accepting T&C', async () => {
    useConsentRequestStore.setState({ currentStep: 'terms' })
    render(<ConsentRequestWizard />)
    const checkbox = screen.getByTestId('terms-checkbox')
    await userEvent.click(checkbox)
    await userEvent.click(screen.getByTestId('terms-next-button'))
    await waitFor(() =>
      expect(screen.getByText(/วัตถุประสงค์/)).toBeInTheDocument()
    )
  })
})

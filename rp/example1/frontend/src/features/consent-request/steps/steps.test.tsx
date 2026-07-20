import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useConsentRequestStore } from '@/stores/consentRequestStore'
import { StepTerms } from './StepTerms'
import { StepDatasetSelect } from './StepDatasetSelect'
import { StepDPSelect } from './StepDPSelect'
import { StepCommonMessage } from './StepCommonMessage'
import { StepAccountSelect } from './StepAccountSelect'
import { StepResult } from './StepResult'
import { mockDPs, mockAccounts } from '@/services/dp/fixtures/dp.fixtures'

beforeEach(() => {
  useConsentRequestStore.getState().reset()
})

// ---------------------------------------------------------------------------
// Step 1 — Terms (M1: Next button only enabled when checkbox checked)
// ---------------------------------------------------------------------------

describe('StepTerms (M1)', () => {
  it('renders the T&C text', () => {
    render(<StepTerms />)
    expect(screen.getByText('เงื่อนไขการใช้บริการ')).toBeInTheDocument()
  })

  it('renders the agreement checkbox', () => {
    render(<StepTerms />)
    expect(screen.getByTestId('terms-checkbox')).toBeInTheDocument()
  })

  it('Next button is disabled initially (M1)', () => {
    render(<StepTerms />)
    expect(screen.getByTestId('terms-next-button')).toBeDisabled()
  })

  it('Next button is enabled after checkbox is checked (M1)', async () => {
    render(<StepTerms />)
    const checkbox = screen.getByTestId('terms-checkbox')
    await userEvent.click(checkbox)
    expect(screen.getByTestId('terms-next-button')).not.toBeDisabled()
  })

  it('clicking Next when enabled calls acceptTerms and advances step', async () => {
    render(<StepTerms />)
    const checkbox = screen.getByTestId('terms-checkbox')
    await userEvent.click(checkbox)
    await userEvent.click(screen.getByTestId('terms-next-button'))
    expect(useConsentRequestStore.getState().currentStep).toBe('dataset-select')
  })
})

// ---------------------------------------------------------------------------
// Step 2 — Dataset Select (M4: optional datasets NOT pre-checked)
// ---------------------------------------------------------------------------

describe('StepDatasetSelect (M4)', () => {
  beforeEach(() => {
    // Pre-populate availableDPs and mark loading done so the component renders content immediately
    useConsentRequestStore.setState({ availableDPs: mockDPs, isLoading: false })
  })

  it('renders dataset names', async () => {
    render(<StepDatasetSelect />)
    await waitFor(() => expect(screen.getByText('รายการเดินบัญชีเงินฝาก')).toBeInTheDocument())
  })

  it('mandatory datasets are pre-checked (M4)', async () => {
    render(<StepDatasetSelect />)
    await waitFor(() => screen.getByText('รายการเดินบัญชีเงินฝาก'))
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes[0]).toBeChecked()
    expect(checkboxes[0]).toBeDisabled()
  })

  it('optional datasets are NOT pre-checked (M4)', async () => {
    render(<StepDatasetSelect />)
    await waitFor(() => screen.getByText('รายการเดินบัญชีเงินฝาก'))
    const checkboxes = screen.getAllByRole('checkbox')
    // First is mandatory (deposit), second is optional (credit card)
    const optionalCheckbox = checkboxes[1]
    expect(optionalCheckbox).not.toBeChecked()
  })
})

// ---------------------------------------------------------------------------
// Step 3 — DP Select (M7: T&C link per DP shown)
// ---------------------------------------------------------------------------

describe('StepDPSelect (M5, M7)', () => {
  beforeEach(() => {
    useConsentRequestStore.setState({ availableDPs: mockDPs, isLoading: false })
  })

  it('renders DP cards with T&C links (M5)', () => {
    render(<StepDPSelect />)
    const tcLinks = screen.getAllByRole('link', { name: /T&C/i })
    expect(tcLinks.length).toBeGreaterThan(0)
    expect(tcLinks[0]).toHaveAttribute('href', mockDPs[0].tcUrl)
  })

  it('shows DP count constraint label (M7)', () => {
    render(<StepDPSelect />)
    expect(screen.getByText(/7/)).toBeInTheDocument()
  })

  it('toggling a DP adds it to selectedDPs', async () => {
    render(<StepDPSelect />)
    const checkboxes = screen.getAllByRole('checkbox')
    await userEvent.click(checkboxes[0])
    expect(useConsentRequestStore.getState().selectedDPs).toHaveLength(1)
    expect(useConsentRequestStore.getState().selectedDPs[0].dpId).toBe('bank-a')
  })
})

// ---------------------------------------------------------------------------
// Step 4 — Common Message (M9: uses ConsentMessageDisplay, never inline)
// ---------------------------------------------------------------------------

describe('StepCommonMessage (M9)', () => {
  beforeEach(() => {
    useConsentRequestStore.setState({
      selectedDPs: [{ dpId: 'bank-a', dpName: 'Bank A', tcAccepted: true, selectedDatasets: [] }],
      purpose: 'ทดสอบ',
    })
  })

  it('renders the consent message display (M9)', () => {
    render(<StepCommonMessage />)
    // ConsentMessageDisplay renders the purpose in the heading span
    const matches = screen.getAllByText(/ทดสอบ/)
    expect(matches.length).toBeGreaterThan(0)
  })

  it('renders consent/reject buttons', () => {
    render(<StepCommonMessage />)
    expect(screen.getByText('ยินยอม')).toBeInTheDocument()
    expect(screen.getByText('ไม่ยินยอม')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Step 7 — Account Select (M12: masked account numbers via AccountCard)
// ---------------------------------------------------------------------------

describe('StepAccountSelect (M12)', () => {
  beforeEach(() => {
    useConsentRequestStore.setState({
      accounts: mockAccounts['bank-a'],
      currentStep: 'account-select',
    })
  })

  it('renders deposit account section', () => {
    render(<StepAccountSelect />)
    expect(screen.getByText('ข้อมูลบัญชีเงินฝาก')).toBeInTheDocument()
  })

  it('renders loan account section', () => {
    render(<StepAccountSelect />)
    expect(screen.getByText('ข้อมูลบัญชีสินเชื่อ')).toBeInTheDocument()
  })

  it('renders masked account numbers (M12)', () => {
    render(<StepAccountSelect />)
    // Both accounts in bank-a: 'xxx-x-xx234-1' and 'x-xxxxx-xxxxx-28-7'
    expect(screen.getByText('xxx-x-xx234-1')).toBeInTheDocument()
    expect(screen.getByText('x-xxxxx-xxxxx-28-7')).toBeInTheDocument()
  })

  it('submit button triggers submitConsent', async () => {
    render(<StepAccountSelect />)
    const submitBtn = screen.getByTestId('submit-button')
    await userEvent.click(submitBtn)
    // After submit, step should advance to result
    expect(useConsentRequestStore.getState().currentStep).toBe('result')
  })
})

// ---------------------------------------------------------------------------
// Step 9 — Result (M13: shows consent success/failure)
// ---------------------------------------------------------------------------

describe('StepResult (M13)', () => {
  it('shows success state when consentedAccountIds is non-empty (M13)', () => {
    useConsentRequestStore.setState({ consentedAccountIds: ['acc-1'] })
    render(<StepResult />)
    expect(screen.getByText(/ให้ความยินยอมสำเร็จ/)).toBeInTheDocument()
  })

  it('shows failure state when consentedAccountIds is empty', () => {
    useConsentRequestStore.setState({ consentedAccountIds: [] })
    render(<StepResult />)
    expect(screen.getByText(/เกิดข้อผิดพลาด/)).toBeInTheDocument()
  })

  it('reset button calls reset action', async () => {
    useConsentRequestStore.setState({ consentedAccountIds: ['acc-1'], currentStep: 'result' })
    render(<StepResult />)
    await userEvent.click(screen.getByText('ปิด'))
    expect(useConsentRequestStore.getState().currentStep).toBe('dataset-select')
    expect(useConsentRequestStore.getState().consentedAccountIds).toEqual([])
  })
})

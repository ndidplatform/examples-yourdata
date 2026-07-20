import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DPCard } from './DPCard'
import { mockDPs } from '@/services/dp/fixtures/dp.fixtures'

const dp = mockDPs[0]

describe('DPCard', () => {
  it('renders DP name', () => {
    render(<DPCard dp={dp} isSelected={false} onToggle={vi.fn()} />)
    expect(screen.getByText('Bank A')).toBeInTheDocument()
  })

  it('renders T&C link (M5)', () => {
    render(<DPCard dp={dp} isSelected={false} onToggle={vi.fn()} />)
    const link = screen.getByRole('link', { name: /T&C/i })
    expect(link).toHaveAttribute('href', dp.tcUrl)
  })

  it('calls onToggle when checkbox is clicked', async () => {
    const onToggle = vi.fn()
    render(<DPCard dp={dp} isSelected={false} onToggle={onToggle} />)
    await userEvent.click(screen.getByRole('checkbox'))
    expect(onToggle).toHaveBeenCalledWith(dp.dpId)
  })

  it('shows checked state when isSelected is true', () => {
    render(<DPCard dp={dp} isSelected={true} onToggle={vi.fn()} />)
    expect(screen.getByRole('checkbox')).toBeChecked()
  })
})

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AccountCard } from './AccountCard'
import { mockAccounts } from '@/services/dp/fixtures/dp.fixtures'

const account = mockAccounts['bank-a'][0]

describe('AccountCard', () => {
  it('renders account type name', () => {
    render(<AccountCard account={account} onToggle={vi.fn()} />)
    expect(screen.getByText('บัญชีออมทรัพย์')).toBeInTheDocument()
  })

  it('renders masked account number (M12)', () => {
    render(<AccountCard account={account} onToggle={vi.fn()} />)
    expect(screen.getByText('xxx-x-xx234-1')).toBeInTheDocument()
  })

  it('calls onToggle when clicked', async () => {
    const onToggle = vi.fn()
    render(<AccountCard account={account} onToggle={onToggle} />)
    await userEvent.click(screen.getByRole('checkbox'))
    expect(onToggle).toHaveBeenCalledWith(account.accountId, account.dpId)
  })
})

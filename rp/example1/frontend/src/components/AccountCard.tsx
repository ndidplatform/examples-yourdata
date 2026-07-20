import type { Account } from '@/domain/types'
import { MaskedAccountNumber } from './MaskedAccountNumber'

interface Props {
  account: Account
  onToggle: (accountId: string, dpId: string) => void
  dpTHname?: string
}

export function AccountCard({ account, onToggle, dpTHname }: Props) {
  return (
    <label
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 11,
        padding: '12px 13px',
        border: `1.5px solid ${account.isSelected ? '#0F172A' : '#E2E8F0'}`,
        borderRadius: 9, marginBottom: 7,
        background: 'white', cursor: 'pointer',
        transition: 'border-color 180ms',
      }}
    >
      {/* Real checkbox — sr-only, label click handles toggle */}
      <input
        type="checkbox"
        checked={account.isSelected}
        onChange={() => onToggle(account.accountId, account.dpId)}
        className="sr-only"
      />

      <div
        aria-hidden="true"
        style={{
          width: 20, height: 20, borderRadius: 5, flexShrink: 0, marginTop: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: account.isSelected ? '#0F172A' : 'white',
          border: `2px solid ${account.isSelected ? '#0F172A' : '#E2E8F0'}`,
          transition: 'all 180ms',
        }}
      >
        {account.isSelected && (
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
            <polyline points="1.5,5.5 4.5,8.5 9.5,2.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {dpTHname && (
          <p style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 1 }}>{dpTHname}</p>
        )}
        <p style={{ fontSize: 12, color: '#64748B' }}>{account.accountTypeName}</p>
        <MaskedAccountNumber masked={account.maskedAccountNumber} />
      </div>
    </label>
  )
}

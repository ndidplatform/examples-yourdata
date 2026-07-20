
import { useConsentRequestStore } from '@/stores/consentRequestStore'
import { AccountCard } from '@/components/AccountCard'

export function StepAccountSelect() {
  const accounts = useConsentRequestStore(s => s.accounts)
  const availableDPs = useConsentRequestStore(s => s.availableDPs)
  const toggleAccount = useConsentRequestStore(s => s.toggleAccount)
  const submitConsent = useConsentRequestStore(s => s.submitConsent)
  const isLoading = useConsentRequestStore(s => s.isLoading)

  function bankLabel(dpId: string): string {
    const dp = availableDPs.find(d => d.dpId === dpId)
    if (!dp) return ''
    return `${dp.dpNameTh} (${dp.dpName})`
  }

  const depositAccounts = accounts.filter(a => a.accountType === 'deposit')
  const loanAccounts = accounts.filter(a => a.accountType === 'loan')
  const hasSelection = accounts.some(a => a.isSelected)

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 p-4 overflow-y-auto">
        <h2 className="text-base font-bold mb-1" style={{ color: '#0F172A' }}>
          เลือกบัญชีที่จะเปิดเผยข้อมูล
        </h2>
        <p className="text-xs mb-3" style={{ color: '#64748B' }}>
          เลือกบัญชีที่จะเปิดเผยข้อมูลให้กับผู้รับข้อมูล
        </p>

        {depositAccounts.length > 0 && (
          <div className="mb-4">
            <span
              className="inline-flex items-center text-xs font-bold text-white rounded-full px-3 py-1 mb-2"
              style={{ background: '#0F172A', letterSpacing: '0.04em' }}
            >
              ข้อมูลบัญชีเงินฝาก
            </span>
            {depositAccounts.map(acc => (
              <AccountCard key={acc.accountId} account={acc} onToggle={toggleAccount} dpTHname={bankLabel(acc.dpId)} />
            ))}
          </div>
        )}

        {loanAccounts.length > 0 && (
          <div className="mb-4">
            <span
              className="inline-flex items-center text-xs font-bold text-white rounded-full px-3 py-1 mb-2"
              style={{ background: '#7C3AED', letterSpacing: '0.04em' }}
            >
              ข้อมูลบัญชีสินเชื่อ
            </span>
            {loanAccounts.map(acc => (
              <AccountCard key={acc.accountId} account={acc} onToggle={toggleAccount} dpTHname={bankLabel(acc.dpId)} />
            ))}
          </div>
        )}
      </div>

      <div className="p-4" style={{ borderTop: '1px solid #E2E8F0' }}>
        <button
          onClick={() => void submitConsent()}
          disabled={isLoading || !hasSelection}
          className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity"
          style={{ background: '#0F172A', opacity: (isLoading || !hasSelection) ? 0.6 : 1 }}
          data-testid="submit-button"
        >
          {isLoading ? 'กำลังส่ง...' : 'ยืนยัน'}
        </button>
      </div>
    </div>
  )
}

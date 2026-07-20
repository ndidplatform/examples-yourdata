import type { DataProvider } from '@/domain/types'

interface Props {
  dp: DataProvider
  isSelected: boolean
  onToggle: (dpId: string) => void
}

const BANK_PALETTES = [
  { bg: '#E8F5EE', text: '#1E5F3A' },
  { bg: '#EDE9F7', text: '#4A1F8F' },
  { bg: '#E6EEF9', text: '#003A8C' },
  { bg: '#FEF3C7', text: '#92400E' },
  { bg: '#FCE7F3', text: '#9D174D' },
  { bg: '#EDE9FE', text: '#4C1D95' },
]

const STRIPE_COLORS = ['#1E3A8A', '#4A1F8F', '#166534', '#0F172A', '#9F1239', '#0369A1']

function hashIndex(s: string, len: number): number {
  return s.charCodeAt(s.length - 1) % len
}

function initials(name: string): string {
  const words = name.split(/[\s\-_]+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

export function DPCard({ dp, isSelected, onToggle }: Props) {
  const idx = hashIndex(dp.dpId, BANK_PALETTES.length)
  const palette = BANK_PALETTES[idx]
  const stripe = STRIPE_COLORS[idx]

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        border: `${isSelected ? 2 : 1.5}px solid ${isSelected ? '#0F172A' : '#E2E8F0'}`,
        borderRadius: 9, padding: '12px 14px',
        cursor: 'pointer', background: 'white', position: 'relative', overflow: 'hidden',
        boxShadow: isSelected ? '0 0 0 3px rgba(15,23,42,0.08)' : 'none',
        transition: 'border-color 200ms, box-shadow 200ms',
        marginBottom: 8,
      }}
      onClick={() => onToggle(dp.dpId)}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') onToggle(dp.dpId) }}
    >
      {/* Left accent stripe — shows only when selected */}
      {isSelected && (
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: 3, background: stripe, pointerEvents: 'none',
        }} />
      )}

      {/* sr-only real checkbox for tests/a11y */}
      <input
        type="checkbox"
        className="sr-only"
        checked={isSelected}
        onChange={() => onToggle(dp.dpId)}
        onClick={e => e.stopPropagation()}
        tabIndex={-1}
        aria-label={dp.dpName}
      />

      <div
        aria-hidden="true"
        style={{
          width: 40, height: 40, borderRadius: 7, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: palette.bg, color: palette.text,
          fontSize: 11, fontWeight: 800, letterSpacing: '-0.02em',
        }}
      >
        {initials(dp.dpName)}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {dp.dpNameTh || dp.dpName}
        </p>
        <p style={{ fontSize: 11, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {dp.dpName}
        </p>
      </div>

      <a
        href={dp.tcUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{ fontSize: 11, fontWeight: 600, color: '#1E3A8A', textDecoration: 'underline', textUnderlineOffset: 2, flexShrink: 0 }}
        onClick={e => e.stopPropagation()}
      >
        T&amp;C
      </a>
    </div>
  )
}

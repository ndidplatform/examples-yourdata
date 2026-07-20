import type { Dataset } from '@/domain/types'

interface Props {
  datasets: Dataset[]
  selectedDatasetIds: string[]
  onToggle: (datasetId: string) => void
}

export function DatasetList({ datasets, selectedDatasetIds, onToggle }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {datasets.map(ds => {
        const isChecked = ds.isMandatory || selectedDatasetIds.includes(ds.datasetId)
        const isOptionalSelected = !ds.isMandatory && isChecked

        return (
          <div
            key={ds.datasetId}
            onClick={() => { if (!ds.isMandatory) onToggle(ds.datasetId) }}
            style={{
              border: `1.5px solid ${ds.isMandatory ? '#BBF7D0' : isOptionalSelected ? '#0F172A' : '#E2E8F0'}`,
              borderRadius: 9,
              overflow: 'hidden',
              cursor: ds.isMandatory ? 'default' : 'pointer',
              transition: 'border-color 180ms',
            }}
          >
            {/* Real input kept sr-only for test/a11y compatibility */}
            <input
              type="checkbox"
              checked={isChecked}
              disabled={ds.isMandatory}
              onChange={() => { if (!ds.isMandatory) onToggle(ds.datasetId) }}
              className="sr-only"
              aria-label={ds.datasetName}
            />

            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '13px 14px',
              background: ds.isMandatory ? '#F0FDF4' : 'white',
            }}>
              <div
                aria-hidden="true"
                style={{
                  width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: ds.isMandatory ? '#166534' : isOptionalSelected ? '#0F172A' : 'white',
                  border: `2px solid ${ds.isMandatory ? '#166534' : isOptionalSelected ? '#0F172A' : '#E2E8F0'}`,
                  transition: 'all 180ms',
                }}
              >
                {isChecked && (
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                    <polyline points="1.5,5.5 4.5,8.5 9.5,2.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>

              <p style={{
                flex: 1, fontSize: 13.5, fontWeight: 600,
                color: ds.isMandatory ? '#166534' : '#0F172A',
              }}>
                {ds.datasetName}
              </p>

              <span style={{
                fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
                padding: '2px 8px', borderRadius: 20, flexShrink: 0,
                ...(ds.isMandatory
                  ? { background: '#DCFCE7', color: '#166534' }
                  : { background: '#F1F5F9', color: '#64748B' }),
              }}>
                {ds.isMandatory ? 'บังคับ' : 'ไม่บังคับ'}
              </span>
            </div>

            {ds.permissions.length > 0 && (
              <div style={{
                padding: '0 14px 12px 44px',
                background: ds.isMandatory ? '#F0FDF4' : 'white',
              }}>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {ds.permissions.map(p => (
                    <li key={p.permissionId} style={{
                      fontSize: 12.5, color: '#334155',
                      display: 'flex', alignItems: 'baseline', gap: 7,
                    }}>
                      <span style={{ color: '#A16207', fontWeight: 700, flexShrink: 0 }}>·</span>
                      {p.permissionName}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

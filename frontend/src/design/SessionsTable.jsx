import { Icon } from './icons.jsx'
import { StatusDot } from './AppShell.jsx'
import { formatCost, getRiskLabel, getRiskScore, timeAgo } from '../utils/sessionDisplay.js'

const COLS = [
  { key: 'name', label: 'Session', w: 'minmax(260px, 1.8fr)' },
  { key: 'status', label: 'Status', w: '120px' },
  { key: 'events', label: 'Events', w: '90px', align: 'right' },
  { key: 'flags', label: 'Flags', w: '80px', align: 'center' },
  { key: 'risk', label: 'Risk', w: '140px' },
  { key: 'model', label: 'Model', w: '190px' },
  { key: 'cost', label: 'Cost', w: '120px', align: 'right' },
  { key: 'started', label: 'Started', w: '100px' },
  { key: 'action', label: '', w: '48px', align: 'right' },
]

export function SessionsTable({ rows, onRowClick }) {
  const gridCols = COLS.map((c) => c.w).join(' ')

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: gridCols,
          padding: '10px var(--s-5)',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-soft)',
        }}
      >
        {COLS.map((c) => (
          <div key={c.key} className="aaa-label-tiny" style={{ textAlign: c.align || 'left' }}>
            {c.label}
          </div>
        ))}
      </div>
      <div>
        {rows.map((r, idx) => (
          <div
            key={r.id}
            role="button"
            tabIndex={0}
            className="aaa-row"
            onClick={() => onRowClick?.(r)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onRowClick?.(r)
              }
            }}
            style={{
              display: 'grid',
              gridTemplateColumns: gridCols,
              padding: '12px var(--s-5)',
              borderBottom: idx === rows.length - 1 ? 'none' : '1px solid var(--border)',
              alignItems: 'center',
              transition: 'background .12s',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--text)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {r.name}
              </span>
              <span className="aaa-mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
                {r.id}
              </span>
            </div>
            <div>
              <StatusDot status={r.status} />
            </div>
            <div style={{ textAlign: 'right' }}>
              <span className="aaa-mono" style={{ fontSize: 12, color: 'var(--text-soft)', fontVariantNumeric: 'tabular-nums' }}>
                {r.events.toLocaleString()}
              </span>
            </div>
            <div style={{ textAlign: 'center' }}>
              {r.flags === 0 ? (
                <span className="aaa-mono" style={{ fontSize: 12, color: 'var(--muted-2)' }}>
                  —
                </span>
              ) : (
                <span
                  className="aaa-mono"
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: r.flags >= 3 ? 'var(--danger)' : 'var(--warning)',
                    background: r.flags >= 3 ? 'var(--danger-soft)' : 'var(--warning-soft)',
                    padding: '2px 7px',
                    borderRadius: 10,
                    border: `1px solid ${r.flags >= 3 ? 'var(--danger-line)' : 'var(--warning-line)'}`,
                  }}
                >
                  {r.flags}
                </span>
              )}
            </div>
            <div>
              {(() => {
                const risk = getRiskScore(r._session || { flag_count: r.flags })
                const { label, color } = getRiskLabel(risk)
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div
                      style={{
                        width: 60,
                        height: 3,
                        background: 'rgba(255,255,255,0.08)',
                        borderRadius: 2,
                      }}
                    >
                      <div
                        style={{
                          width: `${risk}%`,
                          height: '100%',
                          background: color,
                          borderRadius: 2,
                          transition: 'width 0.5s ease',
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontSize: 12,
                        color,
                        fontFamily: 'var(--font-mono)',
                        minWidth: 40,
                      }}
                    >
                      {label}
                    </span>
                  </div>
                )
              })()}
            </div>
            <div className="aaa-mono" style={{ fontSize: 12, color: 'var(--text-soft)' }}>
              {r.model}
            </div>
            <div
              style={{
                padding: '12px 16px',
                textAlign: 'right',
                fontSize: 12,
                fontFamily: 'var(--font-mono), monospace',
                color: Number(r.cost) > 0.01 ? '#f59e0b' : '#10b981',
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
              }}
            >
              {formatCost(r.cost)}
            </div>
            <div
              style={{
                padding: '12px 16px',
                fontSize: 12,
                color: '#64748b',
                whiteSpace: 'nowrap',
              }}
            >
              {r.startedAt ? timeAgo(r.startedAt) : r.started}
            </div>
            <div style={{ textAlign: 'right', color: 'var(--muted)' }}>
              <Icon name="arrow" size={14} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

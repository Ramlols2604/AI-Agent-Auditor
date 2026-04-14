import { useMemo, useState } from 'react'

const FILTERS = ['All', 'Critical', 'High', 'Medium', 'Low', 'Resolved']

function severityClass(severity) {
  const s = String(severity || '').toLowerCase()
  if (s === 'critical') return 'sev-critical'
  if (s === 'high') return 'sev-high'
  if (s === 'medium') return 'sev-medium'
  return 'sev-low'
}

function flagIcon(type) {
  const t = String(type || '').toLowerCase()
  if (t === 'hallucination') return '⚠'
  if (t === 'safety') return '✕'
  if (t === 'cost') return '$'
  return '⊘'
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 0 || Number.isNaN(diff)) return 'just now'
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

export default function FlagsPage({ allFlags, flagsLoading, flagsError, resolveState, onResolve }) {
  const flagMessages = {
    hallucination: 'Response contains potential factual inconsistency',
    safety: 'Output may violate safety policy guidelines',
    cost: 'Token usage significantly above session average',
    compliance: 'Response pattern inconsistent with EU AI Act requirements',
  }

  const [filter, setFilter] = useState('All')
  const [expanded, setExpanded] = useState('')

  const filtered = useMemo(() => {
    return allFlags.filter((flag) => {
      if (filter === 'Resolved') return flag.resolved
      if (filter === 'All') return true
      return String(flag.severity || '').toLowerCase() === filter.toLowerCase()
    })
  }, [allFlags, filter])

  return (
    <div className="page-stack">
      <div className="surface-card">
        <div className="filter-bar">
          {FILTERS.map((f) => (
            <button
              key={f}
              className={f === filter ? 'filter-btn filter-btn-active' : 'filter-btn'}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>

        {flagsError ? <p className="error">{flagsError}</p> : null}
        {resolveState.error ? <p className="error">{resolveState.error}</p> : null}
        {resolveState.message ? <p className="success">{resolveState.message}</p> : null}
        {flagsLoading ? <p className="muted">Loading flags...</p> : null}

        {!flagsLoading && filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-symbol">⚑</div>
            <p>No flags match this filter</p>
          </div>
        ) : null}

        <div className="flag-card-list">
          {filtered.map((flag) => {
            const open = expanded === flag.id
            const sevClass = severityClass(flag.severity)
            return (
              <article key={flag.id} className="flag-card" onClick={() => setExpanded(open ? '' : flag.id)}>
                <div className={`severity-rail ${sevClass}`} />
                <div className="flag-main">
                  <div className="flag-title-row">
                    <span className="flag-icon">{flagIcon(flag.flag_type)}</span>
                    <span className="section-title">{flag.flag_type}</span>
                    <span className={`pill ${sevClass}`}>{flag.severity}</span>
                  </div>
                  <p className="flag-description">
                    {flagMessages[flag.flag_type] || flag.description}
                  </p>
                  <p className="muted mono">
                    {flag.session_id?.slice(0, 8)}... • {timeAgo(flag.created_at)}
                  </p>
                </div>
                <div className="flag-actions" onClick={(e) => e.stopPropagation()}>
                  {flag.resolved ? (
                    <span className="pill pill-success">Resolved</span>
                  ) : (
                    <button onClick={() => onResolve(flag.id)}>Resolve</button>
                  )}
                </div>
                {open ? (
                  <pre className="json-block">{JSON.stringify(flag.agent_verdict || {}, null, 2)}</pre>
                ) : null}
              </article>
            )
          })}
        </div>
      </div>
    </div>
  )
}

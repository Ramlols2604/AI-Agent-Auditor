import { useMemo, useState } from 'react'

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 0 || Number.isNaN(diff)) return 'just now'
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

function verdictKind(verdict) {
  if (verdict === 'SAFE') return 'pill-success'
  if (verdict === 'CRITICAL') return 'pill-danger'
  if (verdict === 'FLAGGED') return 'pill-warning'
  return 'pill-neutral'
}

function CollapsibleContent({ label, content }) {
  const [expanded, setExpanded] = useState(false)
  const text = String(content || '')
  const long = text.length > 220
  const shown = expanded || !long ? text : `${text.slice(0, 220)}...`

  return (
    <div className="event-block">
      <p className="meta-label">{label}</p>
      <pre className="code-block">{shown || '-'}</pre>
      {long ? (
        <button className="btn-link" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      ) : null}
    </div>
  )
}

export function SessionAuditPanel({ selectedSessionId, latestAuditResult, onGenerateAudit }) {
  const scores = latestAuditResult?.scores || {}
  const verdict = latestAuditResult?.verdict || 'UNKNOWN'
  const scoreList = [
    ['Hallucination', scores.hallucination],
    ['Safety', scores.safety],
    ['Cost', scores.cost],
    ['Compliance', scores.compliance],
  ]

  return (
    <div className="surface-card sticky-card">
      <h2 className="section-title">Audit Results</h2>
      {!selectedSessionId ? <p className="muted">Select a session to view audit results.</p> : null}

      {!latestAuditResult && selectedSessionId ? (
        <div className="empty-state compact">
          <div className="empty-symbol">☰</div>
          <p>Run Generate Audit to analyze this session</p>
          <button onClick={onGenerateAudit}>Generate Audit</button>
        </div>
      ) : null}

      {latestAuditResult ? (
        <>
          <div className="verdict-center">
            <span className={`pill ${verdictKind(verdict)}`}>{verdict}</span>
          </div>
          <p className="score-big mono">{Number(latestAuditResult.overall_score || 0).toFixed(1)} / 100</p>

          <div className="score-bars">
            {scoreList.map(([name, value]) => {
              const v = Number(value || 0)
              return (
                <div key={name} className="score-row">
                  <span className="muted">{name}</span>
                  <div className="bar-wrap">
                    <div className="bar-fill" style={{ width: `${Math.max(0, Math.min(100, v))}%` }} />
                  </div>
                  <span className="mono">{v.toFixed(1)}</span>
                </div>
              )
            })}
          </div>

          <div className="dissent-row">
            <span className="meta-label">Dissent Score</span>
            <span className="mono">{String(latestAuditResult.dissent_score ?? 'N/A')}</span>
          </div>

          <button className="btn-outline" onClick={() => window.location.assign('/audit')}>
            View Full Report
          </button>
        </>
      ) : null}
    </div>
  )
}

export default function SessionDetailPage({
  selectedSessionId,
  sessionDetail,
  events,
  detailLoading,
  detailError,
  flagCount,
}) {
  const totals = useMemo(() => {
    const input = events.reduce((acc, e) => acc + Number(e.input_tokens || 0), 0)
    const output = events.reduce((acc, e) => acc + Number(e.output_tokens || 0), 0)
    const first = events[0]?.timestamp ? new Date(events[0].timestamp).getTime() : null
    const last = events.at(-1)?.timestamp ? new Date(events.at(-1).timestamp).getTime() : null
    const duration = first && last ? Math.max(0, Math.floor((last - first) / 1000)) : 0
    return { input, output, duration }
  }, [events])

  return (
    <div className="page-stack">
      {!selectedSessionId ? (
        <div className="surface-card empty-state">
          <div className="empty-symbol">◈</div>
          <p>Select a session from Sessions to inspect timeline and audits</p>
        </div>
      ) : null}

      {detailError ? <p className="error">{detailError}</p> : null}
      {detailLoading ? <p className="muted">Loading session details...</p> : null}

      {sessionDetail ? (
        <>
          <div className="surface-card">
            <h1 className="page-title">{sessionDetail.agent_name}</h1>
            <div className="badge-row">
              <span className="badge-model">{sessionDetail.model_used || 'unknown'}</span>
              <span className="pill pill-neutral">{sessionDetail.status || 'unknown'}</span>
              <span className="mono muted">{sessionDetail.id}</span>
            </div>
            <div className="stats-grid four">
              <article className="metric-card compact">
                <p className="metric-label">Events</p>
                <p className="metric-value mono">{events.length}</p>
              </article>
              <article className="metric-card compact">
                <p className="metric-label">Flags</p>
                <p className={flagCount > 0 ? 'metric-value danger mono' : 'metric-value muted mono'}>
                  {flagCount}
                </p>
              </article>
              <article className="metric-card compact">
                <p className="metric-label">Total Tokens</p>
                <p className="metric-value mono">{totals.input + totals.output}</p>
              </article>
              <article className="metric-card compact">
                <p className="metric-label">Duration</p>
                <p className="metric-value mono">{totals.duration}s</p>
              </article>
            </div>
          </div>

          <div className="surface-card">
            <div className="section-head">
              <h2 className="section-title">Events</h2>
              <span className="count-pill">{events.length}</span>
            </div>

            {events.length === 0 ? (
              <div className="empty-state compact">
                <div className="empty-symbol">◎</div>
                <p>No events captured yet for this session</p>
              </div>
            ) : null}

            <div className="event-list">
              {events.map((event) => {
                const verdict = event.raw_json?.audit_verdict || event.raw_json?.verdict
                return (
                  <article key={event.id} className="event-item">
                    <div className="event-item-head">
                      <div className="event-meta">
                        <span className="mono">#{event.sequence_num}</span>
                        <span className="badge-model">{event.model}</span>
                        <span className="muted mono">{event.latency_ms}ms</span>
                        <span className="muted">{timeAgo(event.timestamp)}</span>
                      </div>
                      {verdict ? <span className={`pill ${verdictKind(verdict)}`}>{verdict}</span> : null}
                    </div>

                    <CollapsibleContent label="Prompt" content={event.prompt} />
                    <CollapsibleContent label="Response" content={event.response} />

                    <div className="token-row mono muted">
                      input: {event.input_tokens} | output: {event.output_tokens}
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}

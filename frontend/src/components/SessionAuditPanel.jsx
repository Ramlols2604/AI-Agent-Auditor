export function SessionAuditPanel({ selectedSessionId, latestAuditResult, onGenerateAudit }) {
  const scores = latestAuditResult?.scores || {}
  const verdict = latestAuditResult?.verdict || 'UNKNOWN'
  const scoreList = [
    ['Hallucination', scores.hallucination],
    ['Safety', scores.safety],
    ['Cost', scores.cost],
    ['Compliance', scores.compliance],
  ]

  const verdictClass =
    verdict === 'SAFE' ? 'pill-success' : verdict === 'CRITICAL' ? 'pill-danger' : verdict === 'FLAGGED' ? 'pill-warning' : 'pill-neutral'

  return (
    <div className="surface-card sticky-card">
      <h2 className="section-title">Audit Results</h2>
      {!selectedSessionId ? <p className="muted">Select a session to view audit results.</p> : null}

      {!latestAuditResult && selectedSessionId ? (
        <div className="empty-state compact">
          <div className="empty-symbol">☰</div>
          <p>Run Generate Audit to analyze this session</p>
          <button type="button" onClick={onGenerateAudit}>
            Generate Audit
          </button>
        </div>
      ) : null}

      {latestAuditResult ? (
        <>
          <div className="verdict-center">
            <span className={`pill ${verdictClass}`}>{verdict}</span>
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

          <button type="button" className="btn-outline" onClick={() => window.location.assign('/audit')}>
            View Full Report
          </button>
        </>
      ) : null}
    </div>
  )
}

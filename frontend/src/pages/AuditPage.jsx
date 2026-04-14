function verdictClass(verdict) {
  if (verdict === 'SAFE') return 'pill-success'
  if (verdict === 'CRITICAL') return 'pill-danger'
  if (verdict === 'CONTESTED') return 'pill-primary'
  return 'pill-warning'
}

function scoreWidth(score) {
  const n = Number(score || 0)
  return `${Math.max(0, Math.min(100, n))}%`
}

export default function AuditPage({
  selectedSessionId,
  auditState,
  reportState,
  report,
  latestAuditResult,
  onGenerateAudit,
  onFetchReport,
}) {
  const verdict = report?.summary?.verdict || latestAuditResult?.verdict || 'UNKNOWN'
  const overall = Number(report?.summary?.overall_score ?? latestAuditResult?.overall_score ?? 0)
  const roundedOverall = Math.round(overall * 10) / 10

  const exportPDF = () => {
    window.print()
  }

  const agentScores = latestAuditResult?.scores
    ? [
        ['Hallucination', latestAuditResult.scores.hallucination, 'Potential hallucination risk.'],
        ['Safety', latestAuditResult.scores.safety, 'Safety policy adherence trend.'],
        ['Cost', latestAuditResult.scores.cost, 'Token and latency efficiency.'],
        ['Compliance', latestAuditResult.scores.compliance, 'Policy compliance signal.'],
      ]
    : []

  return (
    <div className="page-stack">
      <div className="surface-card">
        <h2 className="section-title">Generate Audit</h2>
        <p className="muted">Analyzes all events in selected session using 4 AI agents</p>
        <div className="actions">
          <button onClick={onGenerateAudit} disabled={!selectedSessionId || auditState.loading}>
            {auditState.loading ? 'Generating...' : 'Generate Audit'}
          </button>
          <button className="btn-outline" onClick={onFetchReport} disabled={!selectedSessionId || reportState.loading}>
            {reportState.loading ? 'Fetching...' : 'Fetch Report'}
          </button>
        </div>

        {auditState.error ? <p className="error">{auditState.error}</p> : null}
        {reportState.error ? <p className="error">{reportState.error}</p> : null}
        {auditState.message && latestAuditResult ? (
          <div className="audit-result-banner">
            <span className={`pill ${verdictClass(latestAuditResult.verdict)}`}>
              {latestAuditResult.verdict}
            </span>
            <span className="muted audit-result-text">
              {latestAuditResult.flag_created
                ? 'Audit complete · Flags raised for review'
                : 'Audit complete · No flags raised'}
            </span>
          </div>
        ) : null}
        {reportState.message ? <p className="muted">Report is ready below.</p> : null}

        {!selectedSessionId ? (
          <div className="empty-state compact">
            <div className="empty-symbol">☰</div>
            <p>Select a session to generate an audit report</p>
          </div>
        ) : null}
      </div>

      {report || latestAuditResult ? (
        <div className="surface-card">
          <div className="verdict-row">
            <span className={`pill ${verdictClass(verdict)}`}>{verdict}</span>
            <div className="score-circle mono">{roundedOverall.toFixed(1)}</div>
          </div>

          <div className="stats-grid four">
            <article className="metric-card compact">
              <p className="metric-label">Flags Total</p>
              <p className="metric-value mono">{report?.summary?.flags_total ?? '-'}</p>
            </article>
            <article className="metric-card compact">
              <p className="metric-label">Flags Resolved</p>
              <p className="metric-value mono">{report?.summary?.flags_resolved ?? '-'}</p>
            </article>
            <article className="metric-card compact">
              <p className="metric-label">Events Total</p>
              <p className="metric-value mono">{report?.summary?.events_total ?? '-'}</p>
            </article>
            <article className="metric-card compact">
              <p className="metric-label">Compliance Score</p>
              <p className="metric-value mono">{roundedOverall.toFixed(1)}</p>
            </article>
          </div>

          <h3 className="section-title">Agent Verdicts</h3>
          <div className="agent-grid">
            {agentScores.length === 0 ? (
              <p className="muted">Run Generate Audit to view per-agent findings.</p>
            ) : (
              agentScores.map(([name, score, finding]) => (
                <article key={name} className="agent-card">
                  <div className="agent-head">
                    <span>{name}</span>
                    <span className="mono">{Number(score || 0).toFixed(1)}</span>
                  </div>
                  <div className="bar-wrap">
                    <div className="bar-fill" style={{ width: scoreWidth(score) }} />
                  </div>
                  <p className="muted">{finding}</p>
                </article>
              ))
            )}
          </div>

          <button
            className="btn-outline export-btn"
            onClick={exportPDF}
          >
            <span>↓</span> Export PDF Report
          </button>
        </div>
      ) : null}
    </div>
  )
}

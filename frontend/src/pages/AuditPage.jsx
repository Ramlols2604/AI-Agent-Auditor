import { Btn } from '../design/AppShell.jsx'
import { extractReportMetrics, formatReportMetric } from '../utils/reportDisplay.js'
import { exportAuditPdf } from '../utils/exportPdf.js'

const AGENTS = [
  { key: 'hallucination', label: 'Hallucination', color: '#ef4444' },
  { key: 'safety', label: 'Safety', color: '#f59e0b' },
  { key: 'cost', label: 'Cost', color: '#3b82f6' },
  { key: 'compliance', label: 'Compliance', color: '#6366f1' },
]

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
  sessions = [],
  allFlags = [],
  auditActionState,
  liveAuditState,
  reportState,
  report,
  latestAuditResult,
  onGenerateAudit,
  onFetchReport,
}) {
  const isRunning = liveAuditState?.status === 'running'
  const runningComplete = Object.values(liveAuditState?.agentResults || {}).filter((a) => a?.status === 'complete').length

  const metrics = extractReportMetrics(report, {
    latestAuditResult,
    liveAuditState,
    loading: reportState.loading,
  })

  const verdict = metrics.verdict || 'UNKNOWN'
  const roundedOverall =
    metrics.complianceScore === 'Loading...'
      ? 'Loading...'
      : Math.round(Number(metrics.complianceScore) || 0)

  const agentScores = latestAuditResult?.scores
    ? [
        ['Hallucination', latestAuditResult.scores.hallucination, 'Potential hallucination risk.'],
        ['Safety', latestAuditResult.scores.safety, 'Safety policy adherence trend.'],
        ['Cost', latestAuditResult.scores.cost, 'Token and latency efficiency.'],
        ['Compliance', latestAuditResult.scores.compliance, 'Policy compliance signal.'],
      ]
    : []

  const sessionMeta = sessions.find((s) => s.id === selectedSessionId)
  const sessionFlags = allFlags.filter((f) => f.session_id === selectedSessionId)

  const exportPDF = () => {
    const scores =
      latestAuditResult?.scores ||
      latestAuditResult?.agent_scores ||
      report?.agent_scores ||
      {}
    const flagsForPdf =
      report?.flags?.length > 0
        ? report.flags
        : sessionFlags.filter((f) => f.resolved === false || f.resolved === 0 || !f.resolved)

    exportAuditPdf({
      sessionName: sessionMeta?.agent_name || report?.session?.agent_name || 'Session',
      sessionId: selectedSessionId,
      verdict: metrics.verdict || latestAuditResult?.verdict || 'UNKNOWN',
      overallScore:
        metrics.complianceScore === 'Loading...'
          ? latestAuditResult?.overall_score
          : metrics.complianceScore,
      agentScores: scores,
      flags: flagsForPdf,
      generatedAt: report?.generated_at || latestAuditResult?.generated_at,
    })
  }

  const auditComplete = Boolean(auditActionState.message && latestAuditResult)
  const auditVerdict = latestAuditResult?.verdict || liveAuditState?.verdict || ''

  return (
    <div style={{ padding: 'var(--s-6) var(--s-7)' }} className="aaa-fade-in">
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-lg)',
          padding: 'var(--s-5)',
          marginBottom: 'var(--s-5)',
        }}
      >
        <h2 style={{ margin: '0 0 8px', fontSize: 'var(--t-lg)', color: 'var(--text)' }}>Generate Audit</h2>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--muted)' }}>
          Runs the 4-agent committee with live streaming progress (same as Live Audit).
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn kind="primary" icon="play" onClick={onGenerateAudit} disabled={!selectedSessionId || isRunning}>
            {isRunning ? `Running… ${runningComplete}/4` : 'Generate Audit'}
          </Btn>
          <Btn kind="ghost" icon="doc" onClick={onFetchReport} disabled={!selectedSessionId || reportState.loading || isRunning}>
            {reportState.loading ? 'Fetching…' : 'Fetch Report'}
          </Btn>
        </div>

        {auditActionState.error ? <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 12 }}>{auditActionState.error}</p> : null}
        {reportState.error ? <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{reportState.error}</p> : null}
        {auditComplete ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 16px',
              borderRadius: '8px',
              marginTop: '12px',
              background: auditVerdict === 'SAFE' ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
              border: `1px solid ${auditVerdict === 'SAFE' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
            }}
          >
            <span
              style={{
                padding: '3px 10px',
                borderRadius: '20px',
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '1px',
                fontFamily: 'monospace',
                background: auditVerdict === 'SAFE' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                color: auditVerdict === 'SAFE' ? '#10b981' : '#ef4444',
              }}
            >
              {auditVerdict}
            </span>
            <span style={{ color: '#64748b', fontSize: '13px' }}>
              {auditVerdict === 'SAFE'
                ? 'Audit complete · No flags raised'
                : 'Audit complete · Flags require review'}
            </span>
          </div>
        ) : null}
        {!selectedSessionId ? (
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 12 }}>Select a session on the Sessions page first.</p>
        ) : null}
      </div>

      {isRunning || liveAuditState?.status === 'complete' ? (
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-lg)',
            padding: 'var(--s-5)',
            marginBottom: 'var(--s-5)',
          }}
        >
          <p className="aaa-label-tiny" style={{ marginBottom: 12 }}>
            {isRunning ? 'LIVE COMMITTEE PROGRESS' : 'LAST AUDIT RESULT'}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {AGENTS.map((agent) => {
              const state = liveAuditState?.agentResults?.[agent.key] || { status: 'idle', score: null }
              const running = state.status === 'running'
              const done = state.status === 'complete'
              return (
                <article
                  key={agent.key}
                  style={{
                    border: `1px solid ${running || done ? agent.color : 'var(--border)'}`,
                    borderRadius: 'var(--r-md)',
                    padding: 12,
                    background: 'var(--bg-soft)',
                  }}
                >
                  <p className="aaa-label-tiny">{agent.label}</p>
                  <p style={{ fontSize: 32, margin: '4px 0', color: done ? agent.color : 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                    {running && !Number.isFinite(state.score) ? '…' : Number.isFinite(state.score) ? state.score : '—'}
                  </p>
                  <span style={{ fontSize: 11, color: running ? 'var(--primary)' : 'var(--muted)' }}>
                    {running ? '● Analyzing' : done ? '✓ Complete' : 'Waiting'}
                  </span>
                </article>
              )
            })}
          </div>
          {liveAuditState?.verdict ? (
            <p style={{ marginTop: 16, fontSize: 14, color: 'var(--text)' }}>
              Verdict: <strong>{liveAuditState.verdict}</strong>
              {Number.isFinite(liveAuditState.overallScore) ? ` · ${liveAuditState.overallScore}/100` : ''}
            </p>
          ) : null}
        </div>
      ) : null}

      {report || latestAuditResult || reportState.loading ? (
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-lg)',
            padding: 'var(--s-5)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 0', marginBottom: 24 }}>
            <span className={`pill ${verdictClass(verdict)}`} style={{ fontSize: 13, letterSpacing: '0.12em', padding: '10px 24px' }}>
              {verdict}
            </span>
            <div style={{ fontSize: 64, fontWeight: 600, lineHeight: 1, color: verdict === 'SAFE' ? 'var(--success)' : 'var(--danger)', marginTop: 16, fontFamily: 'var(--font-mono)' }}>
              {roundedOverall}
            </div>
            <div style={{ fontSize: 16, color: 'var(--muted)', marginTop: 4 }}>/ 100</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
            <div style={{ padding: 12, background: 'var(--bg-soft)', borderRadius: 'var(--r-md)', border: '1px solid var(--border)' }}>
              <p className="aaa-label-tiny">Flags Total</p>
              <p className="aaa-mono" style={{ fontSize: 20, color: 'var(--text)' }}>
                {formatReportMetric(metrics.flagsTotal)}
              </p>
            </div>
            <div style={{ padding: 12, background: 'var(--bg-soft)', borderRadius: 'var(--r-md)', border: '1px solid var(--border)' }}>
              <p className="aaa-label-tiny">Flags Resolved</p>
              <p className="aaa-mono" style={{ fontSize: 20, color: 'var(--text)' }}>
                {formatReportMetric(metrics.flagsResolved)}
              </p>
            </div>
            <div style={{ padding: 12, background: 'var(--bg-soft)', borderRadius: 'var(--r-md)', border: '1px solid var(--border)' }}>
              <p className="aaa-label-tiny">Events Total</p>
              <p className="aaa-mono" style={{ fontSize: 20, color: 'var(--text)' }}>
                {formatReportMetric(metrics.eventsTotal)}
              </p>
            </div>
            <div style={{ padding: 12, background: 'var(--bg-soft)', borderRadius: 'var(--r-md)', border: '1px solid var(--border)' }}>
              <p className="aaa-label-tiny">Compliance Score</p>
              <p className="aaa-mono" style={{ fontSize: 20, color: 'var(--text)' }}>
                {formatReportMetric(
                  metrics.complianceScore === 'Loading...' ? 'Loading...' : roundedOverall,
                )}
              </p>
            </div>
          </div>

          <h3 style={{ fontSize: 'var(--t-md)', color: 'var(--text)', marginBottom: 12 }}>Agent Verdicts</h3>
          {agentScores.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>Run Generate Audit to view per-agent findings.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {agentScores.map(([name, score, finding]) => (
                <article key={name} style={{ padding: 12, background: 'var(--bg-soft)', borderRadius: 'var(--r-md)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                    <span style={{ color: 'var(--text-soft)' }}>{name}</span>
                    <span className="aaa-mono" style={{ color: 'var(--text)' }}>{Math.round(Number(score || 0))}</span>
                  </div>
                  <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginBottom: 8 }}>
                    <div style={{ height: '100%', borderRadius: 2, background: 'var(--primary)', width: scoreWidth(score) }} />
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>{finding}</p>
                </article>
              ))}
            </div>
          )}

          <Btn kind="ghost" icon="export" style={{ marginTop: 20 }} onClick={exportPDF}>
            Export PDF Report
          </Btn>
        </div>
      ) : null}
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getAuditReport } from './api/audit'
import { listSessionFlags } from './api/flags'
import { getSession, listSessionEvents } from './api/sessions'
import { StatusDot } from './design/AppShell.jsx'

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 0 || Number.isNaN(diff)) return 'just now'
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

function agentDescription(agentName) {
  const name = String(agentName || '').toLowerCase()
  if (name.includes('customer')) return 'A customer support agent handling user queries'
  if (name.includes('code') || name.includes('review')) return 'A code review agent analyzing pull requests'
  if (name.includes('middleware')) return 'An HTTP middleware agent capturing API traffic'
  if (name.includes('smoke')) return 'A smoke test agent running validation checks'
  if (name.includes('halueval') || name.includes('qa')) return 'A QA agent tested against the HaluEval hallucination benchmark'
  if (name.includes('legal')) return 'A legal research agent tested against real case queries'
  if (name.includes('financial') || name.includes('finance')) return 'A financial advisory agent handling investment queries'
  return 'An AI agent monitored for behavioral compliance'
}

function sessionStatusLabel(session, events) {
  const status = String(session?.status || '').toLowerCase()
  if (status === 'complete') return 'complete'
  if (status === 'error') return 'idle'
  const last = events?.at(-1)?.timestamp
  const ms = new Date(last || '').getTime()
  if (Number.isFinite(ms) && Date.now() - ms <= 5 * 60 * 1000) return 'running'
  return 'idle'
}

function verdictColor(verdict) {
  if (verdict === 'SAFE') return '#10b981'
  if (verdict === 'CRITICAL') return '#ef4444'
  if (verdict === 'FLAGGED') return '#f59e0b'
  return '#6366f1'
}

function latencyColor(ms) {
  const n = Number(ms) || 0
  if (n < 500) return '#10b981'
  if (n < 2000) return '#f59e0b'
  return '#ef4444'
}

function Skeleton({ height = 14, width = '100%', style }) {
  return (
    <div
      className="aaa-shimmer"
      style={{
        height,
        width,
        borderRadius: 6,
        marginBottom: 8,
        ...(style || {}),
      }}
    />
  )
}

function ExpandableText({ label, text, tone = 'muted', expandLabel = 'Show full text' }) {
  const [expanded, setExpanded] = useState(false)
  const value = String(text || '')
  const long = value.length > 200
  const shown = expanded || !long ? value : `${value.slice(0, 200)}…`

  return (
    <div style={{ marginTop: 12 }}>
      <div className="aaa-label-tiny">{label}</div>
      <div
        style={{
          background: 'rgba(0,0,0,0.3)',
          borderRadius: 6,
          padding: '10px 12px',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: tone === 'muted' ? '#94a3b8' : '#f1f5f9',
          marginTop: 6,
          maxHeight: expanded ? 'none' : 80,
          overflow: 'hidden',
          position: 'relative',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {shown || '—'}
        {!expanded && long ? (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: 28,
              background: 'linear-gradient(transparent, rgba(17,19,24,0.95))',
            }}
          />
        ) : null}
      </div>
      {long ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{
            marginTop: 6,
            background: 'none',
            border: 'none',
            color: 'var(--primary)',
            fontSize: 12,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          {expanded ? 'Show less' : expandLabel}
        </button>
      ) : null}
    </div>
  )
}

function EventCard({ event, flag, onFlagClick }) {
  return (
    <article
      style={{
        background: '#111318',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 10,
        padding: 16,
        marginBottom: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="aaa-mono" style={{ color: 'var(--primary)', fontWeight: 700, fontSize: 13 }}>
            #{event.sequence_num}
          </span>
          <span
            style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 4,
              background: 'var(--primary-soft)',
              color: 'var(--primary)',
              border: '1px solid var(--primary-line)',
            }}
          >
            {event.model || 'unknown'}
          </span>
          <span className="aaa-mono" style={{ fontSize: 11, color: latencyColor(event.latency_ms) }}>
            {event.latency_ms}ms
          </span>
        </div>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{timeAgo(event.timestamp)}</span>
      </div>

      <ExpandableText label="PROMPT" text={event.prompt} tone="muted" expandLabel="Show full prompt" />
      <ExpandableText label="RESPONSE" text={event.response} tone="light" expandLabel="Show full response" />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 10 }}>
        <span className="aaa-mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
          ↑ {event.input_tokens ?? 0} in · ↓ {event.output_tokens ?? 0} out
          {Number(event.cost_usd) > 0 ? ` · $${Number(event.cost_usd).toFixed(6)}` : ''}
        </span>
        {flag ? (
          <button
            type="button"
            onClick={onFlagClick}
            style={{
              fontSize: 11,
              padding: '4px 10px',
              borderRadius: 999,
              border: '1px solid var(--danger-line)',
              background: 'var(--danger-soft)',
              color: 'var(--danger)',
              cursor: 'pointer',
            }}
          >
            ⚑ Flagged: {flag.flag_type}
          </button>
        ) : null}
      </div>
    </article>
  )
}

export default function SessionDetail({ onGenerateAudit }) {
  const { sessionId } = useParams()
  const navigate = useNavigate()

  const [session, setSession] = useState(null)
  const [events, setEvents] = useState([])
  const [flags, setFlags] = useState([])
  const [report, setReport] = useState(null)

  const [sessionLoading, setSessionLoading] = useState(true)
  const [eventsLoading, setEventsLoading] = useState(true)
  const [flagsLoading, setFlagsLoading] = useState(true)
  const [reportLoading, setReportLoading] = useState(true)

  const [sessionError, setSessionError] = useState('')
  const [eventsError, setEventsError] = useState('')

  useEffect(() => {
    if (!sessionId) return

    setSessionLoading(true)
    setSessionError('')
    getSession(sessionId)
      .then((data) => setSession(data))
      .catch((err) => {
        setSession(null)
        setSessionError(err.message || 'Failed to load session')
      })
      .finally(() => setSessionLoading(false))

    setEventsLoading(true)
    setEventsError('')
    listSessionEvents(sessionId)
      .then((data) => setEvents(Array.isArray(data) ? data : []))
      .catch((err) => {
        setEvents([])
        setEventsError(err.message || 'Failed to load events')
      })
      .finally(() => setEventsLoading(false))

    setFlagsLoading(true)
    listSessionFlags(sessionId)
      .then((data) => setFlags(Array.isArray(data) ? data : []))
      .catch(() => setFlags([]))
      .finally(() => setFlagsLoading(false))

    setReportLoading(true)
    getAuditReport(sessionId)
      .then((data) => setReport(data))
      .catch(() => setReport(null))
      .finally(() => setReportLoading(false))
  }, [sessionId])

  const flagsByEventId = useMemo(() => {
    const map = {}
    flags.forEach((flag) => {
      if (flag.event_id) map[flag.event_id] = flag
    })
    return map
  }, [flags])

  const stats = useMemo(() => {
    const input = events.reduce((acc, e) => acc + Number(e.input_tokens || 0), 0)
    const output = events.reduce((acc, e) => acc + Number(e.output_tokens || 0), 0)
    const tokens = Number(session?.total_tokens) || input + output
    const latencies = events.map((e) => Number(e.latency_ms || 0)).filter((n) => Number.isFinite(n) && n > 0)
    const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0
    const totalCost =
      Number(session?.total_cost_usd) ||
      events.reduce((acc, e) => acc + Number(e.cost_usd || 0), 0)
    const first = events[0]?.timestamp ? new Date(events[0].timestamp).getTime() : null
    const last = events.at(-1)?.timestamp ? new Date(events.at(-1).timestamp).getTime() : null
    let duration = '—'
    if (first && last) {
      const sec = Math.max(0, Math.floor((last - first) / 1000))
      if (sec < 60) duration = `${sec}s`
      else if (sec < 3600) duration = `${Math.floor(sec / 60)}m`
      else duration = `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
    }
    return { tokens, avgLatency, totalCost, duration, eventCount: events.length }
  }, [events, session])

  const auditVerdict = useMemo(() => {
    if (report?.summary?.verdict && report?.status === 'ready') return report.summary.verdict
    const fromFlag = flags.find((f) => f.agent_verdict?.verdict)?.agent_verdict?.verdict
    if (fromFlag) return fromFlag
    if (session?.compliance_score != null && Number(session.compliance_score) >= 85) return 'SAFE'
    if (session?.compliance_score != null && Number(session.compliance_score) < 70) return 'CRITICAL'
    if (session?.compliance_score != null) return 'FLAGGED'
    return null
  }, [report, flags, session])

  const auditScore = useMemo(() => {
    if (report?.summary?.overall_score != null) return Math.round(Number(report.summary.overall_score))
    const fromFlag = flags.find((f) => f.agent_verdict?.overall_score != null)?.agent_verdict?.overall_score
    if (fromFlag != null) return Math.round(Number(fromFlag))
    if (session?.compliance_score != null) return Math.round(Number(session.compliance_score))
    return null
  }, [report, flags, session])

  const auditHistory = useMemo(() => {
    const items = []
    if (report?.status === 'ready' && report?.summary) {
      items.push({
        id: `report-${report.generated_at}`,
        verdict: report.summary.verdict,
        score: report.summary.overall_score,
        at: report.generated_at,
      })
    }
    flags.forEach((flag) => {
      const v = flag.agent_verdict
      if (v?.verdict) {
        items.push({
          id: `flag-${flag.id}`,
          verdict: v.verdict,
          score: v.overall_score,
          at: flag.created_at,
        })
      }
    })
    const seen = new Set()
    return items.filter((item) => {
      const key = `${item.verdict}-${item.score}-${item.at}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [report, flags])

  const statusKey = session ? sessionStatusLabel(session, events) : 'idle'
  const vColor = verdictColor(auditVerdict)
  const unresolvedFlags = flags.filter(
    (f) => f.resolved === false || f.resolved === 0 || !f.resolved,
  )

  const goLive = () => {
    navigate('/live', {
      state: {
        sessionId: session?.id || sessionId,
        sessionName: session?.agent_name,
      },
    })
  }

  return (
    <div style={{ padding: 'var(--s-6) var(--s-7)' }} className="aaa-fade-in">
      <button
        type="button"
        onClick={() => navigate('/sessions')}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-soft)',
          fontSize: 13,
          cursor: 'pointer',
          marginBottom: 16,
          padding: 0,
        }}
      >
        ← Sessions
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: '65fr 35fr', gap: 20, alignItems: 'start' }}>
        {/* LEFT */}
        <div>
          {sessionLoading ? (
            <div style={{ marginBottom: 16 }}>
              <Skeleton height={32} width="60%" />
              <Skeleton height={20} width="40%" />
              <Skeleton height={60} />
            </div>
          ) : sessionError ? (
            <p style={{ color: 'var(--danger)' }}>{sessionError}</p>
          ) : session ? (
            <div
              style={{
                background: '#111318',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 12,
                padding: 24,
                marginBottom: 16,
              }}
            >
              <h1 style={{ margin: '0 0 12px', fontSize: 24, fontWeight: 500, color: '#fff' }}>{session.agent_name}</h1>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                <span
                  style={{
                    fontSize: 11,
                    padding: '3px 10px',
                    borderRadius: 4,
                    background: 'var(--primary-soft)',
                    color: 'var(--primary)',
                    border: '1px solid var(--primary-line)',
                  }}
                >
                  {session.model_used === 'http-request' ? 'HTTP' : session.model_used || 'unknown'}
                </span>
                <StatusDot status={statusKey} />
                <span className="aaa-mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {session.id?.slice(0, 8)}…
                </span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>Started {timeAgo(session.started_at)}</span>
              </div>

              <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--text-soft)', lineHeight: 1.5 }}>
                {agentDescription(session.agent_name)}
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {[
                  `${stats.eventCount} Events`,
                  `${session.flag_count ?? unresolvedFlags.length} Flags`,
                  `${stats.tokens.toLocaleString()} Tokens`,
                  `$${stats.totalCost.toFixed(4)} Cost`,
                ].map((pill) => (
                  <span
                    key={pill}
                    style={{
                      fontSize: 11,
                      padding: '4px 10px',
                      borderRadius: 999,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-soft)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {pill}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {!reportLoading && auditVerdict && auditScore != null ? (
            <div
              style={{
                background:
                  auditVerdict === 'SAFE'
                    ? 'rgba(16,185,129,0.06)'
                    : auditVerdict === 'CRITICAL'
                      ? 'rgba(239,68,68,0.06)'
                      : 'rgba(245,158,11,0.06)',
                border: `1px solid ${vColor}30`,
                borderRadius: 12,
                padding: 20,
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div className="aaa-label-tiny" style={{ marginBottom: 6 }}>
                  LAST AUDIT RESULT
                </div>
                <div style={{ fontSize: 18, fontWeight: 500, color: vColor, fontFamily: 'var(--font-mono)' }}>
                  {auditVerdict} · {auditScore}/100
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  {report?.generated_at ? `Audited ${timeAgo(report.generated_at)}` : 'From latest committee audit'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {onGenerateAudit ? (
                  <button
                    type="button"
                    onClick={onGenerateAudit}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 8,
                      border: '1px solid rgba(99,102,241,0.4)',
                      background: 'rgba(99,102,241,0.1)',
                      color: '#6366f1',
                      fontSize: 13,
                      cursor: 'pointer',
                    }}
                  >
                    Run Audit
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={goLive}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--text-soft)',
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  Live Audit →
                </button>
              </div>
            </div>
          ) : reportLoading ? (
            <Skeleton height={72} style={{ marginBottom: 16 }} />
          ) : null}

          <h2 style={{ margin: '0 0 4px', fontSize: 16, color: '#fff', fontWeight: 500 }}>What the agent did</h2>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--muted)' }}>Every LLM call captured in this session</p>

          {eventsLoading ? (
            <>
              <Skeleton height={120} />
              <Skeleton height={120} />
            </>
          ) : eventsError ? (
            <p style={{ color: 'var(--danger)', fontSize: 13 }}>{eventsError}</p>
          ) : events.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: 'var(--s-8)',
                background: '#111318',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 12,
              }}
            >
              <div style={{ fontSize: 48, opacity: 0.4 }}>◈</div>
              <p style={{ color: 'var(--text)', marginTop: 12 }}>No events captured yet</p>
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>Events appear here when your agent makes LLM calls</p>
              <button
                type="button"
                onClick={() => navigate('/about')}
                style={{
                  marginTop: 16,
                  padding: '8px 16px',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  background: 'transparent',
                  color: 'var(--text-soft)',
                  cursor: 'pointer',
                }}
              >
                View Setup Docs →
              </button>
            </div>
          ) : (
            events.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                flag={flagsByEventId[event.id]}
                onFlagClick={() =>
                  navigate(`/flags?session=${encodeURIComponent(sessionId)}&event=${encodeURIComponent(event.id)}`)
                }
              />
            ))
          )}
        </div>

        {/* RIGHT */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{
              background: '#111318',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 12,
              padding: 20,
            }}
          >
            <h3 style={{ margin: '0 0 14px', fontSize: 14, color: '#fff' }}>Session Overview</h3>
            {sessionLoading ? (
              <>
                <Skeleton height={12} />
                <Skeleton height={12} />
                <Skeleton height={12} />
              </>
            ) : (
              [
                ['Total Events', stats.eventCount],
                ['Total Tokens', stats.tokens.toLocaleString()],
                ['Avg Latency', stats.avgLatency ? `${stats.avgLatency}ms` : '—'],
                ['Total Cost', `$${stats.totalCost.toFixed(6)}`],
                ['Duration', stats.duration],
                ['Model', session?.model_used || '—'],
              ].map(([label, value]) => (
                <div
                  key={label}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '8px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: 'var(--muted)' }}>{label}</span>
                  <span className="aaa-mono" style={{ color: 'var(--text-soft)' }}>
                    {value}
                  </span>
                </div>
              ))
            )}
          </div>

          <div
            style={{
              background: '#111318',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 12,
              padding: 20,
            }}
          >
            <h3 style={{ margin: '0 0 14px', fontSize: 14, color: '#fff' }}>Issues Found</h3>
            {flagsLoading ? (
              <Skeleton height={40} />
            ) : unresolvedFlags.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--success)', fontSize: 13 }}>
                ✓ No issues found
                <span style={{ display: 'block', color: 'var(--muted)', marginTop: 4, fontSize: 12 }}>This session is clean</span>
              </p>
            ) : (
              unresolvedFlags.map((flag) => (
                <button
                  key={flag.id}
                  type="button"
                  onClick={() => navigate(`/flags?session=${encodeURIComponent(sessionId)}`)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '10px 0',
                    border: 'none',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    background: 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: verdictColor(flag.severity === 'critical' ? 'CRITICAL' : 'FLAGGED') }} />
                  <span style={{ color: 'var(--text)', fontSize: 13, flex: 1 }}>{flag.flag_type}</span>
                  <span
                    style={{
                      fontSize: 10,
                      padding: '2px 6px',
                      borderRadius: 4,
                      color: verdictColor(flag.severity === 'critical' ? 'CRITICAL' : 'FLAGGED'),
                      border: `1px solid ${verdictColor(flag.severity === 'critical' ? 'CRITICAL' : 'FLAGGED')}44`,
                    }}
                  >
                    {String(flag.severity || 'medium').toUpperCase()}
                  </span>
                </button>
              ))
            )}
          </div>

          <div
            style={{
              background: '#111318',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 12,
              padding: 20,
            }}
          >
            <h3 style={{ margin: '0 0 14px', fontSize: 14, color: '#fff' }}>Audit History</h3>
            {reportLoading ? (
              <Skeleton height={36} />
            ) : auditHistory.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>No audits yet</p>
            ) : (
              auditHistory.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                  }}
                >
                  <span style={{ color: verdictColor(item.verdict), fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                    {item.verdict}
                    {item.score != null ? ` · ${Math.round(Number(item.score))}` : ''}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{timeAgo(item.at)}</span>
                </div>
              ))
            )}
            <button
              type="button"
              onClick={goLive}
              style={{
                marginTop: 14,
                width: '100%',
                padding: '10px',
                borderRadius: 8,
                border: '1px solid rgba(99,102,241,0.35)',
                background: 'rgba(99,102,241,0.08)',
                color: '#6366f1',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Audit This Session →
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}

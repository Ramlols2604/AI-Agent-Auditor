import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch, getApiBase } from './api/client'

const AGENTS = [
  { key: 'hallucination', label: 'Hallucination Agent', color: '#ef4444' },
  { key: 'safety', label: 'Safety Agent', color: '#f59e0b' },
  { key: 'cost', label: 'Cost Agent', color: '#3b82f6' },
  { key: 'compliance', label: 'Compliance Agent', color: '#6366f1' },
]

const EVENT_COLORS = {
  audit_start: '#6366f1',
  audit_request: '#6366f1',
  agent_result: '#10b981',
  flag_raised: '#ef4444',
  verdict: '#f1f5f9',
  error: '#ef4444',
}

function scoreToVerdictColor(verdict) {
  if (verdict === 'SAFE') return '#10b981'
  if (verdict === 'FLAGGED') return '#f59e0b'
  if (verdict === 'CRITICAL') return '#ef4444'
  return '#6366f1'
}

function verdictStyle(verdict) {
  const color = scoreToVerdictColor(verdict)
  return {
    color,
    border: `1px solid ${color}`,
    background: `${color}20`,
    fontSize: 18,
    fontFamily: 'JetBrains Mono, monospace',
    padding: '12px 24px',
    borderRadius: 8,
    display: 'inline-block',
  }
}

function mapAgentKey(payload) {
  const raw = String(payload?.agent_type || payload?.flag_type || payload?.agent || payload?.key || '').toLowerCase()
  if (raw.includes('hall')) return 'hallucination'
  if (raw.includes('safe')) return 'safety'
  if (raw.includes('cost')) return 'cost'
  if (raw.includes('compliance')) return 'compliance'
  const text = JSON.stringify(payload || {}).toLowerCase()
  if (text.includes('hallucination')) return 'hallucination'
  if (text.includes('safety')) return 'safety'
  if (text.includes('cost')) return 'cost'
  if (text.includes('compliance')) return 'compliance'
  return null
}

export default function LiveAudit({
  auditState,
  setAuditState,
  auditEventSource,
  setAuditEventSource,
}) {
  const apiBase = getApiBase()
  const [sessions, setSessions] = useState([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [streamWarning, setStreamWarning] = useState('')
  const [report, setReport] = useState(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [sessionEventCount, setSessionEventCount] = useState(0)

  const selectedSessionId = auditState?.sessionId || ''
  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) || null,
    [sessions, selectedSessionId],
  )

  const selectableSessions = useMemo(() => {
    const base = Array.isArray(sessions) ? sessions : []
    return base.filter((s) => s?.id && s?.agent_name).slice(0, 250)
  }, [sessions])

  const closeStream = useCallback(() => {
    if (auditEventSource) {
      auditEventSource.close()
      setAuditEventSource(null)
    }
  }, [auditEventSource, setAuditEventSource])

  const appendLog = useCallback((type, description) => {
    const ts = new Date().toLocaleTimeString()
    setAuditState((prev) => ({
      ...prev,
      eventLog: [{ ts, type, description, color: EVENT_COLORS[type] || '#94a3b8' }, ...(prev.eventLog || [])].slice(0, 120),
    }))
  }, [setAuditState])

  const bindEventSource = useCallback((es) => {
    if (!es) return

    es.onmessage = (e) => {
      console.log('SSE raw:', e)
      try {
        const payload = JSON.parse(e.data)
        const type = String(payload?.type || 'message')

        if (type === 'session_start' || type === 'audit_start') {
          appendLog('audit_start', 'Audit stream connected · listening for results')
          return
        }

        if (type === 'event_captured') {
          setAuditState((prev) => ({ ...prev, eventCount: Number(prev.eventCount || 0) + 1 }))
          return
        }

        if (type === 'agent_result' || type === 'audit_result') {
          const data = payload?.data || payload
          const key = mapAgentKey(data)
          const score = Number(data?.score ?? data?.value ?? data?.overall_score)
          if (key && Number.isFinite(score)) {
            const flagged = Boolean(data?.flagged || data?.flag_created || score < 70)
            const finding = flagged
              ? String(data?.description || data?.finding || data?.message || `${key} anomaly detected`)
              : 'No anomalies detected'
            setAuditState((prev) => ({
              ...prev,
              agentResults: {
                ...(prev.agentResults || {}),
                [key]: { score: Math.round(score), finding, status: 'complete', flagged },
              },
            }))
            const agentName = AGENTS.find((agent) => agent.key === key)?.label || key
            appendLog('agent_result', `${agentName} returned score ${Math.round(score)}/100`)
          }
          return
        }

        if (type === 'flag_raised') {
          const data = payload?.data || payload
          const row = {
            severity: String(data?.severity || 'high'),
            flag_type: String(data?.flag_type || 'behavior'),
            description: String(data?.description || 'Flag raised during audit'),
            timestamp: new Date().toISOString(),
          }
          setAuditState((prev) => ({ ...prev, flagsRaised: [row, ...(prev.flagsRaised || [])] }))
          appendLog('flag_raised', `⚑ Flag raised: ${row.severity} ${row.flag_type} anomaly`)
          return
        }

        if (type === 'verdict' || type === 'complete') {
          const data = payload?.data || payload
          const roundedScore = Math.round(Number(data?.overall_score ?? 0))
          setAuditState((prev) => {
            const scores = Object.values(prev.agentResults || {})
              .map((item) => Number(item?.score))
              .filter((score) => Number.isFinite(score))
            const dissentScore = scores.length > 1 ? Math.max(...scores) - Math.min(...scores) : 0
            return {
              ...prev,
              status: 'complete',
              verdict: data?.verdict || prev.verdict,
              overallScore: roundedScore || prev.overallScore,
              dissentScore,
              completedAt: Date.now(),
            }
          })
          appendLog('verdict', `Committee verdict: ${data?.verdict || 'UNKNOWN'} · Overall score ${roundedScore}/100`)
          closeStream()
          return
        }

        if (type === 'error') {
          const msg = String(payload?.message || payload?.error || 'unknown error')
          appendLog('error', msg)
          setAuditState((prev) => ({ ...prev, status: 'error', error: msg, completedAt: Date.now() }))
          closeStream()
        }
      } catch (error) {
        console.error('Failed to parse SSE payload', error)
      }
    }

    es.onerror = () => {
      setStreamWarning('Stream disconnected — results may be incomplete')
    }
  }, [appendLog, closeStream, setAuditState])

  const openStream = useCallback((sessionId) => {
    closeStream()
    const es = new EventSource(`${apiBase}/stream/${sessionId}`)
    setAuditEventSource(es)
    bindEventSource(es)
  }, [apiBase, bindEventSource, closeStream, setAuditEventSource])

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true)
    try {
      const data = await apiFetch('/sessions')
      const normalized = [...(Array.isArray(data) ? data : [])].sort((a, b) => {
        const aTs = new Date(a?.started_at || 0).getTime()
        const bTs = new Date(b?.started_at || 0).getTime()
        return (Number.isFinite(bTs) ? bTs : 0) - (Number.isFinite(aTs) ? aTs : 0)
      })
      const preferred = normalized.filter((session) => session.agent_name !== 'middleware-capture')
      const trimmed = (preferred.length > 0 ? preferred : normalized).slice(0, 250)
      setSessions(trimmed)
      if (!selectedSessionId && trimmed.length > 0) {
        setAuditState((prev) => ({
          ...prev,
          sessionId: trimmed[0].id,
          sessionName: trimmed[0].agent_name,
        }))
      }
    } catch (error) {
      console.error('Failed loading sessions', error)
      setAuditState((prev) => ({ ...prev, status: 'error', error: error.message }))
    } finally {
      setSessionsLoading(false)
    }
  }, [selectedSessionId, setAuditState])

  const loadSelectedSessionEvents = useCallback(async (sessionId) => {
    if (!sessionId) {
      setSessionEventCount(0)
      return
    }
    try {
      const events = await apiFetch(`/sessions/${sessionId}/events`)
      setSessionEventCount(Array.isArray(events) ? events.length : 0)
    } catch {
      setSessionEventCount(0)
    }
  }, [])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  useEffect(() => {
    if (!selectedSessionId && selectableSessions.length > 0) {
      const first = selectableSessions[0]
      setAuditState((prev) => ({ ...prev, sessionId: first.id, sessionName: first.agent_name }))
    }
  }, [selectedSessionId, selectableSessions, setAuditState])

  useEffect(() => {
    loadSelectedSessionEvents(selectedSessionId)
  }, [loadSelectedSessionEvents, selectedSessionId])

  useEffect(() => {
    if (auditState?.status === 'running' && auditEventSource) {
      bindEventSource(auditEventSource)
    }
    return () => {
      // Intentionally persist active audit stream across navigation.
    }
  }, [auditEventSource, auditState?.status, bindEventSource])

  const runAudit = async () => {
    if (!selectedSessionId) return

    if (auditState?.status === 'running') return
    if (auditState?.status === 'complete' || auditState?.status === 'error') {
      closeStream()
    }

    const runStartedAt = Date.now()
    setReport(null)
    setStreamWarning('')
    setAuditState((prev) => ({
      ...prev,
      sessionId: selectedSessionId,
      sessionName: selectedSession?.agent_name || prev.sessionName,
      status: 'running',
      agentResults: Object.fromEntries(
        AGENTS.map((agent) => [agent.key, { score: null, finding: 'Analyzing...', status: 'running', flagged: false }]),
      ),
      verdict: null,
      overallScore: null,
      dissentScore: null,
      eventLog: [],
      flagsRaised: [],
      startedAt: runStartedAt,
      completedAt: null,
      error: null,
      eventCount: sessionEventCount,
    }))

    appendLog('audit_request', 'Audit job submitted to 4-agent committee')

    try {
      const req = fetch(`${apiBase}/audit/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: selectedSessionId }),
      })
      openStream(selectedSessionId)

      const res = await req
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.detail || `Request failed: ${res.status}`)
      }

      const result = await res.json()
      const nextResults = {}
      AGENTS.forEach((agent) => {
        const score = Number(result?.scores?.[agent.key])
        if (Number.isFinite(score)) {
          const flagged = score < 70
          nextResults[agent.key] = {
            score: Math.round(score),
            finding: flagged ? `${agent.label} score below threshold` : 'No anomalies detected',
            status: 'complete',
            flagged,
          }
        }
      })
      setAuditState((prev) => ({
        ...prev,
        agentResults: { ...(prev.agentResults || {}), ...nextResults },
        verdict: result?.verdict || prev.verdict,
        overallScore: Math.round(Number(result?.overall_score || 0)) || prev.overallScore,
      }))
      appendLog('verdict', `Committee verdict: ${result?.verdict || 'UNKNOWN'} · Overall score ${Math.round(Number(result?.overall_score || 0))}/100`)

      const sessionFlags = await apiFetch(`/flags/${selectedSessionId}`).catch(() => [])
      setAuditState((prev) => ({
        ...prev,
        flagsRaised: sessionFlags.map((flag) => ({
          severity: flag.severity || 'unknown',
          description: flag.description || flag.flag_type || 'Flag raised',
          timestamp: flag.created_at || new Date().toISOString(),
        })),
      }))
    } catch (error) {
      console.error('Audit POST failed', error)
      appendLog('error', error.message)
      setAuditState((prev) => ({ ...prev, status: 'error', error: error.message, completedAt: Date.now() }))
      closeStream()
    }
  }

  const cancelAudit = () => {
    closeStream()
    setAuditState((prev) => ({ ...prev, status: 'idle', error: null }))
  }

  const reconnectStream = () => {
    if (!selectedSessionId) return
    setStreamWarning('')
    openStream(selectedSessionId)
  }

  const fetchReport = async () => {
    if (!selectedSessionId) return
    setReportLoading(true)
    try {
      const payload = await apiFetch(`/audit/report/${selectedSessionId}`)
      setReport(payload)
    } catch (error) {
      console.error('Failed fetching report', error)
      setAuditState((prev) => ({ ...prev, status: 'error', error: error.message }))
    } finally {
      setReportLoading(false)
    }
  }

  const completedScores = AGENTS
    .map((agent) => Number(auditState?.agentResults?.[agent.key]?.score))
    .filter((score) => Number.isFinite(score))
  const dissent = completedScores.length > 1 ? Math.max(...completedScores) - Math.min(...completedScores) : 0
  const dissentColor = dissent < 15 ? '#10b981' : dissent < 30 ? '#f59e0b' : '#ef4444'
  const durationSec = auditState?.startedAt && auditState?.completedAt
    ? Math.max(1, Math.round((auditState.completedAt - auditState.startedAt) / 1000))
    : 0

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 14 }}>
      <section className="surface-card">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={selectedSessionId}
            onChange={(e) => {
              const selected = selectableSessions.find((session) => session.id === e.target.value) || null
              setAuditState((prev) => ({
                ...prev,
                sessionId: e.target.value || null,
                sessionName: selected?.agent_name || null,
              }))
            }}
            disabled={auditState?.status === 'running'}
            style={{ background: '#0d0f14', color: '#f1f5f9', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '8px 10px', minWidth: 280 }}
          >
            {selectableSessions.length === 0 ? <option value="">{sessionsLoading ? 'Loading sessions...' : 'No sessions available'}</option> : null}
            {selectableSessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.agent_name} · {session.id.slice(0, 8)}...
              </option>
            ))}
          </select>
          <button className="btn-outline" onClick={loadSessions} disabled={sessionsLoading || auditState?.status === 'running'}>
            {sessionsLoading ? 'Refreshing...' : 'Refresh Sessions'}
          </button>
          <button
            onClick={runAudit}
            disabled={!selectedSessionId || auditState?.status === 'running'}
            style={{ background: '#6366f1', border: '1px solid rgba(99,102,241,0.6)', color: '#fff', borderRadius: 10, padding: '8px 14px' }}
          >
            {auditState?.status === 'complete' ? '▶ Run New Audit' : auditState?.status === 'running' ? 'Running...' : '▶ Run Audit'}
          </button>
          {auditState?.status === 'running' ? <button className="btn-outline" onClick={cancelAudit}>Cancel Audit</button> : null}
        </div>

        <p className="muted" style={{ marginTop: 10, marginBottom: 14 }}>
          {auditState?.status === 'running'
            ? `● Analyzing ${selectedSession?.agent_name || auditState?.sessionName || 'agent'} session · ${sessionEventCount} events`
            : auditState?.status === 'complete'
              ? `✓ Audit complete · 4 agents · ${durationSec}s`
              : auditState?.status === 'error'
                ? `⚠ Audit failed: ${auditState?.error || 'Unknown error'}`
                : 'Select a session and click Run Audit'}
        </p>

        {auditState?.status === 'error' && auditState?.error ? (
          <div className="error-banner">
            <p className="error-banner-title">Audit failed: {auditState.error}</p>
            <button className="btn-outline" onClick={loadSessions}>Retry</button>
          </div>
        ) : null}

        {streamWarning ? (
          <div className="error-banner" style={{ borderColor: 'rgba(245, 158, 11, 0.25)' }}>
            <p className="error-banner-title">⚠ {streamWarning}</p>
            <button className="btn-outline" onClick={reconnectStream}>Reconnect</button>
          </div>
        ) : null}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
          {AGENTS.map((agent) => {
            const state = auditState?.agentResults?.[agent.key] || { score: null, finding: 'Waiting for audit', status: 'idle', flagged: false }
            const isActive = state.status === 'running'
            const isComplete = state.status === 'complete'
            return (
              <article key={agent.key} className={isActive ? 'live-agent-card-pulse' : ''} style={{ border: `1px solid ${isActive || isComplete ? agent.color : 'rgba(255,255,255,0.08)'}`, borderRadius: 10, padding: 12, background: '#0d0f14' }}>
                <p className="metric-label" style={{ marginBottom: 6 }}>{agent.label}</p>
                <p style={{ margin: 0, fontSize: 48, color: isComplete ? agent.color : '#94a3b8' }}>
                  {isActive && !Number.isFinite(state.score) ? '...' : Number.isFinite(state.score) ? state.score : '—'}
                </p>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 999, fontSize: 12, marginTop: 4, border: `1px solid ${state.flagged ? 'rgba(239,68,68,0.45)' : 'rgba(16,185,129,0.45)'}`, color: state.flagged ? '#fca5a5' : '#86efac', background: state.flagged ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)' }}>
                  {state.flagged ? '⚑ Flagged' : '✓ Clean'}
                </span>
                <p style={{ margin: '6px 0 0', fontSize: 12, color: state.flagged ? '#ef4444' : '#64748b' }}>
                  {isActive ? 'Analyzing...' : state.flagged ? state.finding : 'No anomalies detected'}
                </p>
              </article>
            )
          })}
        </div>

        <div style={{ marginTop: 14 }}>
          <p className="metric-label" style={{ marginBottom: 8 }}>Live event log</p>
          <div style={{ maxHeight: 200, overflow: 'auto' }}>
            {(auditState?.eventLog || []).map((item, idx) => (
              <div key={`${item.ts}-${idx}`} style={{ display: 'flex', gap: 12, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>
                <span style={{ color: '#64748b', minWidth: 70 }}>{item.ts}</span>
                <span style={{ color: item.color, minWidth: 90 }}>{item.type}</span>
                <span style={{ color: '#94a3b8' }}>{item.description}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="surface-card">
        {auditState?.status === 'idle' && !auditState?.overallScore ? (
          <div className="empty-state" style={{ minHeight: 280 }}>
            <div className="empty-symbol" style={{ fontSize: 48 }}>⬡</div>
            <p>Results will appear here</p>
          </div>
        ) : (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 14 }}>
              <span style={verdictStyle(auditState?.verdict || 'CONTESTED')}>{auditState?.verdict || 'CONTESTED'}</span>
              <p style={{ margin: '12px 0 0', fontSize: 48, color: scoreToVerdictColor(auditState?.verdict) }}>
                {Math.round(Number(auditState?.overallScore || 0))}
                <span className="muted" style={{ fontSize: 20 }}> / 100</span>
              </p>
            </div>

            {AGENTS.map((agent) => {
              const score = Number(auditState?.agentResults?.[agent.key]?.score || 0)
              return (
                <div key={agent.key} style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
                    <span style={{ color: '#94a3b8' }}>{agent.label}</span>
                    <span style={{ color: agent.color, fontFamily: 'JetBrains Mono, monospace' }}>{score || '—'}</span>
                  </div>
                  <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                    <div style={{ height: '100%', borderRadius: 2, background: agent.color, width: `${score}%`, transition: 'width 600ms ease' }} />
                  </div>
                </div>
              )
            })}

            {completedScores.length === AGENTS.length ? (
              <div style={{ marginTop: 8, padding: 10, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }}>
                <p style={{ margin: 0, color: dissentColor, fontFamily: 'JetBrains Mono, monospace' }}>
                  Dissent: {Math.round(dissent)} pts
                </p>
                <p className="metric-subtext" style={{ marginTop: 4 }}>
                  {dissent < 15 ? 'Agents agree on verdict' : dissent < 30 ? 'Some disagreement between agents' : 'Agents strongly disagree — verdict contested'}
                </p>
              </div>
            ) : null}

            {(auditState?.flagsRaised || []).length > 0 ? (
              <div style={{ marginTop: 14 }}>
                <p style={{ margin: '0 0 8px', color: '#fca5a5' }}>⚑ Flags Raised</p>
                {(auditState.flagsRaised || []).map((flag, index) => (
                  <div key={`${flag.timestamp}-${index}`} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span className="pill pill-danger">{flag.severity}</span>
                    <span style={{ color: '#cbd5e1', fontSize: 12 }}>{flag.description}</span>
                    <span className="muted mono">{new Date(flag.timestamp).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            ) : null}

            <div style={{ marginTop: 14 }}>
              <button
                onClick={fetchReport}
                disabled={reportLoading}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'rgba(99,102,241,0.15)',
                  border: '1px solid rgba(99,102,241,0.4)',
                  borderRadius: '8px',
                  color: '#6366f1',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: reportLoading ? 'not-allowed' : 'pointer',
                  marginTop: '16px',
                }}
              >
                {reportLoading ? 'Loading...' : 'Fetch Full Report →'}
              </button>
              {report ? <pre className="json-block" style={{ marginTop: 10 }}>{JSON.stringify(report, null, 2)}</pre> : null}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

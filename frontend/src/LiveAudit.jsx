import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { apiFetch } from './api/client'
import { AgentScoresChart } from './design/AgentScoresChart'
import { useAuditRunner } from './hooks/useAuditRunner'
import { DATA_CLEARED_EVENT } from './utils/dataEvents'

const AGENTS = [
  { key: 'hallucination', label: 'Hallucination Agent', color: '#ef4444' },
  { key: 'safety', label: 'Safety Agent', color: '#f59e0b' },
  { key: 'cost', label: 'Cost Agent', color: '#3b82f6' },
  { key: 'compliance', label: 'Compliance Agent', color: '#6366f1' },
]

function clearAuditResults(prev) {
  return {
    ...prev,
    status: 'idle',
    agentResults: {},
    verdict: null,
    overallScore: null,
    dissentScore: null,
    eventLog: [],
    flagsRaised: [],
    startedAt: null,
    completedAt: null,
    error: null,
    debateEntries: [],
  }
}

function scoreToVerdictColor(verdict) {
  if (verdict === 'SAFE') return '#10b981'
  if (verdict === 'FLAGGED') return '#f59e0b'
  if (verdict === 'CRITICAL') return '#ef4444'
  return '#6366f1'
}

const FLAG_TYPE_MESSAGES = {
  hallucination: 'Factual inconsistency detected in agent response',
  safety: 'Safety policy violation detected',
  cost: 'Token usage exceeded efficiency threshold',
  compliance: 'EU AI Act compliance gap identified',
}

const VERDICT_EXPLANATIONS = {
  SAFE: 'All four agents found no significant behavioral anomalies. This session meets EU AI Act Article 9 risk management standards.',
  FLAGGED:
    'One or more agents detected behavioral patterns that require review. Check the flags and resolution steps before deploying.',
  CRITICAL:
    'Significant behavioral violations detected. This agent should not be deployed without addressing the flagged issues.',
  CONTESTED:
    'Agents strongly disagree on the verdict. Manual review recommended — the data is ambiguous and automated confidence is low.',
}

function flagDisplayDescription(flag) {
  const desc = flag?.description || ''
  if (desc && !desc.includes('Automated')) return desc
  const type = String(flag?.flag_type || '').toLowerCase()
  return FLAG_TYPE_MESSAGES[type] ?? 'Behavioral anomaly detected'
}

function verdictStyle(verdict) {
  const color = scoreToVerdictColor(verdict)
  return {
    color,
    border: `1px solid ${color}`,
    background: `${color}20`,
    fontSize: 18,
    fontFamily: 'var(--font-mono)',
    padding: '12px 24px',
    borderRadius: 8,
    display: 'inline-block',
  }
}

export default function LiveAudit({ auditState, setAuditState, auditEventSource, setAuditEventSource }) {
  const location = useLocation()
  const [sessions, setSessions] = useState([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [streamWarning, setStreamWarning] = useState('')
  const [report, setReport] = useState(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [sessionEventCount, setSessionEventCount] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const didInitialSessionPickRef = useRef(false)

  const { runAudit: startAudit, closeStream } = useAuditRunner({
    auditState,
    setAuditState,
    setAuditEventSource,
  })

  const selectedSessionId = auditState?.sessionId || ''
  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) || null,
    [sessions, selectedSessionId],
  )

  const selectableSessions = useMemo(() => {
    const base = Array.isArray(sessions) ? sessions : []
    return base.filter((s) => s?.id && s?.agent_name).slice(0, 250)
  }, [sessions])

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
      if (trimmed.length === 0) {
        didInitialSessionPickRef.current = false
        setAuditState((prev) => ({
          ...prev,
          sessionId: null,
          sessionName: null,
        }))
        setSessionEventCount(0)
        return
      }
      const stillValid = trimmed.some((s) => s.id === selectedSessionId)
      if (!stillValid) {
        didInitialSessionPickRef.current = true
        setAuditState((prev) => ({
          ...prev,
          sessionId: trimmed[0].id,
          sessionName: trimmed[0].agent_name,
        }))
      } else if (!selectedSessionId && !didInitialSessionPickRef.current) {
        didInitialSessionPickRef.current = true
        setAuditState((prev) => ({
          ...prev,
          sessionId: trimmed[0].id,
          sessionName: trimmed[0].agent_name,
        }))
      }
    } catch (error) {
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
    const onDataCleared = () => {
      didInitialSessionPickRef.current = false
      setSessions([])
      setSessionEventCount(0)
      setReport(null)
      setAuditState((prev) => ({
        ...prev,
        sessionId: null,
        sessionName: null,
        status: 'idle',
        agentResults: {},
        verdict: null,
        overallScore: null,
        eventLog: [],
        flagsRaised: [],
      }))
      loadSessions()
    }
    window.addEventListener(DATA_CLEARED_EVENT, onDataCleared)
    return () => window.removeEventListener(DATA_CLEARED_EVENT, onDataCleared)
  }, [loadSessions, setAuditState])

  useEffect(() => {
    if (location.state?.sessionId) {
      didInitialSessionPickRef.current = true
      setAuditState((prev) => ({
        ...prev,
        sessionId: location.state.sessionId,
        sessionName: location.state.sessionName || prev.sessionName,
      }))
    }
  }, [location.state, setAuditState])

  useEffect(() => {
    loadSelectedSessionEvents(selectedSessionId)
  }, [loadSelectedSessionEvents, selectedSessionId])

  useEffect(() => {
    if (auditState?.status === 'error' && auditState?.error) {
      setStreamWarning('Stream disconnected — results may be incomplete')
    } else if (auditState?.status === 'complete') {
      setStreamWarning('')
    }
  }, [auditState?.status, auditState?.error])

  useEffect(() => {
    if (auditState?.status !== 'running') return undefined
    setElapsed(0)
    const timer = setInterval(() => {
      setElapsed((prev) => prev + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [auditState?.status, auditState?.sessionId, auditState?.startedAt])

  const runAudit = () => {
    if (!selectedSessionId) return
    setStreamWarning('')
    setReport(null)
    setElapsed(0)
    startAudit(selectedSessionId, selectedSession?.agent_name, sessionEventCount)
  }

  const debateEntries = auditState?.debateEntries || []
  const flagsRaised = auditState?.flagsRaised || []

  const cancelAudit = () => {
    closeStream()
    setAuditState((prev) => ({ ...prev, status: 'idle', error: null }))
  }

  const resetResultsOnly = () => {
    closeStream()
    setReport(null)
    setAuditState((prev) => clearAuditResults(prev))
  }

  const reconnectStream = () => {
    if (!selectedSessionId || auditState?.status === 'running') return
    setStreamWarning('')
    runAudit()
  }

  const fetchReport = async () => {
    if (!selectedSessionId) return
    setReportLoading(true)
    try {
      const payload = await apiFetch(`/audit/report/${selectedSessionId}`)
      setReport(payload)
    } catch (error) {
      setAuditState((prev) => ({ ...prev, status: 'error', error: error.message }))
    } finally {
      setReportLoading(false)
    }
  }

  const completedScores = AGENTS.map((agent) => Number(auditState?.agentResults?.[agent.key]?.score)).filter((s) =>
    Number.isFinite(s),
  )
  const dissent = completedScores.length > 1 ? Math.max(...completedScores) - Math.min(...completedScores) : 0
  const dissentColor = dissent < 15 ? 'var(--success)' : dissent < 30 ? 'var(--warning)' : 'var(--danger)'
  const durationSec =
    auditState?.startedAt && auditState?.completedAt
      ? Math.max(1, Math.round((auditState.completedAt - auditState.startedAt) / 1000))
      : 0

  const runningCount = Object.values(auditState?.agentResults || {}).filter((a) => a?.status === 'complete').length

  return (
    <div style={{ padding: 'var(--s-6) var(--s-7)' }} className="aaa-fade-in">
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 14 }}>
        <section
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-lg)',
            padding: 'var(--s-5)',
          }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={selectedSessionId}
              onChange={(e) => {
                const selected = selectableSessions.find((session) => session.id === e.target.value) || null
                didInitialSessionPickRef.current = true
                closeStream()
                setReport(null)
                setAuditState((prev) => ({
                  ...clearAuditResults(prev),
                  sessionId: e.target.value || null,
                  sessionName: selected?.agent_name || null,
                }))
              }}
              disabled={auditState?.status === 'running'}
              style={{
                background: 'var(--bg-soft)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-md)',
                padding: '8px 10px',
                minWidth: 280,
                fontSize: 13,
              }}
            >
              {selectableSessions.length === 0 ? (
                <option value="">{sessionsLoading ? 'Loading sessions...' : 'No sessions available'}</option>
              ) : null}
              {selectableSessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.agent_name} · {session.id.slice(0, 8)}...
                </option>
              ))}
            </select>
            <button
              type="button"
              className="aaa-focus"
              onClick={loadSessions}
              disabled={sessionsLoading || auditState?.status === 'running'}
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--text-soft)',
                borderRadius: 'var(--r-md)',
                padding: '8px 12px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {sessionsLoading ? 'Refreshing...' : 'Refresh Sessions'}
            </button>
            {auditState?.status === 'running' ? (
              <button
                type="button"
                disabled
                style={{
                  background: 'var(--primary)',
                  border: '1px solid var(--primary-line)',
                  color: '#fff',
                  borderRadius: 'var(--r-md)',
                  padding: '8px 14px',
                  fontSize: 12,
                }}
              >
                Running… {runningCount}/4 agents
              </button>
            ) : auditState?.status === 'complete' || auditState?.status === 'error' ? (
              <>
                <button
                  type="button"
                  onClick={runAudit}
                  disabled={!selectedSessionId}
                  style={{
                    background: 'var(--primary)',
                    border: '1px solid var(--primary-line)',
                    color: '#fff',
                    borderRadius: 'var(--r-md)',
                    padding: '8px 14px',
                    fontSize: 12,
                    cursor: selectedSessionId ? 'pointer' : 'not-allowed',
                  }}
                >
                  {auditState?.status === 'complete' ? '✓ Run Again' : '↻ Retry Audit'}
                </button>
                <button
                  type="button"
                  onClick={resetResultsOnly}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    color: 'var(--text-soft)',
                    borderRadius: 'var(--r-md)',
                    padding: '8px 12px',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Clear results
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={runAudit}
                disabled={!selectedSessionId}
                style={{
                  background: 'var(--primary)',
                  border: '1px solid var(--primary-line)',
                  color: '#fff',
                  borderRadius: 'var(--r-md)',
                  padding: '8px 14px',
                  fontSize: 12,
                  cursor: selectedSessionId ? 'pointer' : 'not-allowed',
                  opacity: selectedSessionId ? 1 : 0.6,
                }}
              >
                ▶ Run Audit
              </button>
            )}
            {auditState?.status === 'running' ? (
              <button type="button" onClick={cancelAudit} style={{ fontSize: 12, color: 'var(--muted)' }}>
                Cancel
              </button>
            ) : null}
          </div>

          <p style={{ marginTop: 10, marginBottom: 14, fontSize: 13, color: 'var(--muted)' }}>
            {auditState?.status === 'running'
              ? `● Analyzing ${selectedSession?.agent_name || auditState?.sessionName || 'session'} · ${elapsed}s elapsed · ${runningCount}/4 agents`
              : auditState?.status === 'complete'
                ? `Audit complete · 4 agents · ${durationSec}s`
                : auditState?.status === 'error'
                  ? `Audit failed: ${auditState?.error || 'Unknown error'}`
                  : 'Select a session and click Run Audit for live committee progress'}
          </p>

          {auditState?.status === 'error' && auditState?.error ? (
            <div
              style={{
                marginBottom: 12,
                padding: '12px 16px',
                background: 'var(--danger-soft)',
                border: '1px solid var(--danger-line)',
                borderRadius: 'var(--r-md)',
                color: 'var(--danger)',
                fontSize: 13,
              }}
            >
              {auditState.error}
            </div>
          ) : null}

          {streamWarning && auditState?.status !== 'running' ? (
            <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--warning)' }}>
              {streamWarning}{' '}
              <button type="button" onClick={reconnectStream} style={{ color: 'var(--primary)' }}>
                Retry
              </button>
            </div>
          ) : null}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
            {AGENTS.map((agent) => {
              const state = auditState?.agentResults?.[agent.key] || {
                score: null,
                finding: 'Waiting for audit',
                status: 'idle',
                flagged: false,
              }
              const isActive = state.status === 'running'
              const isComplete = state.status === 'complete'
              return (
                <article
                  key={agent.key}
                  className={isActive ? 'live-agent-card-pulse' : ''}
                  style={{
                    border: `1px solid ${isActive || isComplete ? agent.color : 'var(--border)'}`,
                    borderRadius: 'var(--r-md)',
                    padding: 12,
                    background: 'var(--bg-soft)',
                  }}
                >
                  <p className="aaa-label-tiny" style={{ marginBottom: 6 }}>
                    {agent.label}
                  </p>
                  <p style={{ margin: 0, fontSize: 48, color: isComplete ? agent.color : 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                    {isActive && !Number.isFinite(state.score) ? '…' : Number.isFinite(state.score) ? state.score : '—'}
                  </p>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '3px 8px',
                      borderRadius: 999,
                      fontSize: 12,
                      marginTop: 4,
                      border: `1px solid ${state.flagged ? 'var(--danger-line)' : 'var(--success-line)'}`,
                      color: state.flagged ? 'var(--danger)' : 'var(--success)',
                      background: state.flagged ? 'var(--danger-soft)' : 'var(--success-soft)',
                    }}
                  >
                    {isActive ? '● Running' : state.flagged ? '⚑ Flagged' : isComplete ? '✓ Clean' : '— Idle'}
                  </span>
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: state.flagged ? 'var(--danger)' : 'var(--muted)' }}>
                    {isActive ? 'Analyzing…' : state.finding || 'No anomalies detected'}
                  </p>
                </article>
              )
            })}
          </div>

          {debateEntries.length > 0 ? (
            <div style={{ marginTop: 24 }}>
              <div className="aaa-label-tiny" style={{ marginBottom: 12 }}>
                COMMITTEE DEBATE
              </div>
              {debateEntries.map((entry, i) => (
                <div key={`${entry.type}-${entry.timestamp || i}-${i}`} style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: entry.type === 'verdict' ? 'var(--primary)' : entry.type === 'debate' ? 'var(--warning)' : entry.color,
                      marginTop: 4,
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 2 }}>
                      {entry.agent ?? (entry.type === 'debate' ? 'Committee' : 'Judge')}
                      {entry.score ? ` · ${entry.score}/100` : ''}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text)' }}>{entry.finding ?? entry.message}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div style={{ marginTop: 14 }}>
            <p className="aaa-label-tiny" style={{ marginBottom: 8 }}>
              LIVE EVENT LOG
            </p>
            <div style={{ maxHeight: 200, overflow: 'auto' }} className="aaa-scroll">
              {(auditState?.eventLog || []).length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--muted)' }}>Waiting for stream events…</p>
              ) : (
                (auditState.eventLog || []).map((item, idx) => (
                  <div
                    key={`${item.ts}-${idx}`}
                    style={{
                      display: 'flex',
                      gap: 12,
                      padding: '6px 0',
                      borderBottom: '1px solid var(--border)',
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    <span style={{ color: 'var(--muted)', minWidth: 70 }}>{item.ts}</span>
                    <span style={{ color: item.color, minWidth: 90 }}>{item.type}</span>
                    <span style={{ color: 'var(--text-soft)' }}>{item.description}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-lg)',
            padding: 'var(--s-5)',
          }}
        >
          {auditState?.status === 'idle' && !auditState?.overallScore ? (
            <div style={{ textAlign: 'center', padding: 'var(--s-8)', color: 'var(--muted)' }}>
              <p>Results will appear here as the audit runs</p>
            </div>
          ) : (
            <div>
              <div style={{ textAlign: 'center', marginBottom: 14 }}>
                <span style={verdictStyle(auditState?.verdict || 'CONTESTED')}>{auditState?.verdict || '…'}</span>
                <p style={{ margin: '12px 0 0', fontSize: 48, color: scoreToVerdictColor(auditState?.verdict), fontFamily: 'var(--font-mono)' }}>
                  {auditState?.status === 'running' && !auditState?.overallScore
                    ? '…'
                    : Math.round(Number(auditState?.overallScore || 0))}
                  <span style={{ fontSize: 20, color: 'var(--muted)' }}> / 100</span>
                </p>
                {auditState?.verdict && VERDICT_EXPLANATIONS[auditState.verdict] ? (
                  <p
                    style={{
                      fontSize: 12,
                      color: '#64748b',
                      textAlign: 'center',
                      marginTop: 8,
                      lineHeight: 1.6,
                      padding: '0 8px',
                    }}
                  >
                    {VERDICT_EXPLANATIONS[auditState.verdict]}
                  </p>
                ) : null}
              </div>

              <AgentScoresChart agentResults={auditState?.agentResults} agents={AGENTS} height={160} />

              {AGENTS.map((agent) => {
                const score = Number(auditState?.agentResults?.[agent.key]?.score || 0)
                const running = auditState?.agentResults?.[agent.key]?.status === 'running'
                return (
                  <div key={agent.key} style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
                      <span style={{ color: 'var(--text-soft)' }}>{agent.label}</span>
                      <span style={{ color: agent.color, fontFamily: 'var(--font-mono)' }}>
                        {running && !Number.isFinite(score) ? '…' : score || '—'}
                      </span>
                    </div>
                    <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                      <div
                        style={{
                          height: '100%',
                          borderRadius: 2,
                          background: agent.color,
                          width: `${score}%`,
                          transition: 'width 600ms ease',
                        }}
                      />
                    </div>
                  </div>
                )
              })}

              {completedScores.length === AGENTS.length ? (
                <div style={{ marginTop: 8, padding: 10, border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
                  <p style={{ margin: 0, color: dissentColor, fontFamily: 'var(--font-mono)' }}>Dissent: {Math.round(dissent)} pts</p>
                </div>
              ) : null}

              {flagsRaised.length > 0 ? (
                <div style={{ marginTop: 16 }}>
                  <p className="aaa-label-tiny" style={{ marginBottom: 10 }}>
                    FLAGS RAISED
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {flagsRaised.map((flag, idx) => (
                      <div
                        key={`${flag.flag_type}-${flag.timestamp}-${idx}`}
                        style={{
                          padding: 12,
                          background: 'var(--bg-soft)',
                          border: '1px solid var(--border)',
                          borderLeft: '3px solid var(--danger)',
                          borderRadius: 'var(--r-md)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 11 }}>
                          <span style={{ color: 'var(--text-soft)', textTransform: 'capitalize' }}>
                            {flag.flag_type || 'compliance'}
                          </span>
                          <span style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>{flag.severity}</span>
                        </div>
                        <p style={{ margin: 0, fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>
                          {flagDisplayDescription(flag)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                onClick={fetchReport}
                disabled={reportLoading || auditState?.status === 'running'}
                style={{
                  width: '100%',
                  padding: 12,
                  background: 'var(--primary-soft)',
                  border: '1px solid var(--primary-line)',
                  borderRadius: 'var(--r-md)',
                  color: 'var(--primary)',
                  fontSize: 14,
                  marginTop: 16,
                  cursor: reportLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {reportLoading ? 'Loading…' : 'Fetch Full Report →'}
              </button>
              {report ? (
                <pre
                  className="aaa-mono"
                  style={{
                    marginTop: 10,
                    fontSize: 11,
                    overflow: 'auto',
                    maxHeight: 200,
                    color: 'var(--text-soft)',
                  }}
                >
                  {JSON.stringify(report, null, 2)}
                </pre>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

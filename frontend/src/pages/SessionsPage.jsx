import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 0 || Number.isNaN(diff)) return 'just now'
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

function statusMeta(session, lastEventAt) {
  const status = String(session.status || '').toLowerCase()
  if (status === 'error') return { dot: 'dot-danger', label: 'Error' }
  if (status === 'complete') return { dot: 'dot-muted', label: 'Complete' }

  const ms = new Date(lastEventAt || '').getTime()
  if (!Number.isFinite(ms)) return { dot: 'dot-warning', label: 'Idle' }
  const active = Date.now() - ms <= 5 * 60 * 1000
  return active ? { dot: 'dot-pulse', label: 'Active' } : { dot: 'dot-warning', label: 'Idle' }
}

function isSessionToday(session) {
  const ts = new Date(session.started_at || '').getTime()
  return Number.isFinite(ts) && Date.now() - ts <= 24 * 60 * 60 * 1000
}

export default function SessionsPage({
  sessions,
  sessionsLoading,
  sessionsError,
  allFlags,
  isLive,
  selectedSessionId,
  eventCountBySession,
  eventsTodayBySession,
  lastEventAtBySession,
  flagCountBySession,
  onRefresh,
  onSelectSession,
}) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('All')
  const [hoveredSessionId, setHoveredSessionId] = useState(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const searched = q
      ? sessions.filter((s) => `${s.agent_name} ${s.id}`.toLowerCase().includes(q))
      : sessions

    return searched.filter((session) => {
      const flags = flagCountBySession[session.id] ?? 0
      const state = statusMeta(session, lastEventAtBySession[session.id]).label
      if (tab === 'Flagged') return flags > 0
      if (tab === 'Active') return state === 'Active'
      if (tab === 'Complete') return state === 'Complete'
      return true
    })
  }, [query, sessions, flagCountBySession, tab, lastEventAtBySession])

  const sessionsToday = sessions.filter(isSessionToday).length
  const flaggedSessions = sessions.filter((s) => (flagCountBySession[s.id] ?? 0) > 0).length
  const eventsToday = Object.values(eventsTodayBySession).reduce((acc, n) => acc + n, 0)
  const healthScore = sessions.length === 0
    ? 100
    : Math.round(
        (sessions.filter((s) => ((s.flag_count ?? flagCountBySession[s.id] ?? 0) === 0)).length / sessions.length) * 100,
      )
  const normalizedHealthScore = flaggedSessions > 0 && healthScore === 100 ? 99 : healthScore
  const healthClass = normalizedHealthScore >= 90 ? 'health-good' : normalizedHealthScore >= 60 ? 'health-medium' : 'health-bad'

  const idleSessions = sessions.filter((session) => {
    const state = statusMeta(session, lastEventAtBySession[session.id]).label
    return state === 'Idle'
  })
  const idleAllZeroEvents =
    idleSessions.length > 0 && idleSessions.every((session) => (eventCountBySession[session.id] ?? 0) === 0)

  const recentUnresolvedFlag = useMemo(() => {
    const unresolved = (allFlags || []).filter((flag) => !flag.resolved)
    if (unresolved.length === 0) return null
    return unresolved.reduce((latest, current) => {
      const currentMs = new Date(current.created_at || '').getTime()
      const latestMs = new Date(latest.created_at || '').getTime()
      if (!Number.isFinite(currentMs)) return latest
      if (!Number.isFinite(latestMs) || currentMs > latestMs) return current
      return latest
    })
  }, [allFlags])

  const flaggedSessionMap = useMemo(
    () => Object.fromEntries(sessions.map((session) => [session.id, session.agent_name])),
    [sessions],
  )

  let insightKind = 'success'
  let insightTitle = '● Your agents are running clean. No behavioral anomalies detected in the last 24 hours.'
  let insightBody = ''
  if (flaggedSessions > 0) {
    insightKind = 'danger'
    const flagType = recentUnresolvedFlag?.flag_type || 'unknown'
    const severity = recentUnresolvedFlag?.severity || 'unknown'
    const agentName = recentUnresolvedFlag?.session_id
      ? flaggedSessionMap[recentUnresolvedFlag.session_id] || 'unknown agent'
      : 'unknown agent'
    insightTitle = `⚑ ${flaggedSessions} sessions have unresolved flags.`
    insightBody = `The most recent flag was ${flagType} severity ${severity} on agent ${agentName}.`
  } else if (idleAllZeroEvents) {
    insightKind = 'warning'
    insightTitle = '⚠ Several sessions captured 0 events.'
    insightBody =
      'This usually means the SDK middleware is connected but your agent is not making LLM calls. Check your agent configuration.'
  }

  const systemStatus = flaggedSessions >= 3
    ? {
        className: 'status-critical',
        headline: '✕ Issues Detected',
        subtext: `${flaggedSessions} sessions flagged — review recommended`,
      }
    : flaggedSessions > 0
      ? {
          className: 'status-attention',
          headline: '⚑ Attention Needed',
          subtext: `${flaggedSessions} sessions have unresolved flags`,
        }
      : {
          className: 'status-clear',
          headline: '● All Clear',
          subtext: `${sessionsToday} sessions analyzed today, no issues detected`,
        }

  return (
    <div className="page-stack">
      <div className="page-head">
        <div>
          <h1 className="page-title">Agent Sessions</h1>
          <p className="page-subtitle">
            Each session is one run of your AI agent. Events are individual LLM calls. Flags are behavioral anomalies.
          </p>
        </div>
        <div className="head-actions">
          <span className={isLive ? 'count-pill live-pill' : 'count-pill'}>
            <span className={isLive ? 'dot dot-pulse' : 'dot dot-muted'} /> {isLive ? 'Live' : 'Offline'}
          </span>
          <button className="btn-outline" disabled>
            New Session
          </button>
          <button className="btn-outline" onClick={onRefresh}>
            ↻
          </button>
        </div>
      </div>

      <div className="status-card-grid">
        <article className={`metric-card system-card ${systemStatus.className}`}>
          <p className="metric-label">System status</p>
          <p className="system-verdict">{systemStatus.headline}</p>
          <p className="metric-subtext">{systemStatus.subtext}</p>
        </article>

        <article className="metric-card">
          <p className="metric-label">Activity summary</p>
          <div style={{ fontSize: '14px', color: '#f1f5f9', lineHeight: '1.8' }}>
            <span>{sessionsToday} sessions today</span><br />
            <span style={{ color: '#64748b' }}>
              {eventsToday.toLocaleString()} events captured
            </span><br />
            <span style={{ color: '#64748b' }}>
              avg {Math.round(eventsToday / Math.max(sessionsToday, 1))} per session
            </span>
          </div>
        </article>

        <article className="metric-card">
          <p className="metric-label">Agent health score</p>
          <p className={`metric-value mono ${healthClass}`}>{normalizedHealthScore}%</p>
          <p className="metric-subtext">of sessions are clean</p>
        </article>
      </div>

      {!sessionsError ? (
        <div className={`insight-banner insight-${insightKind}`}>
          <div>
            <p className="insight-title">{insightTitle}</p>
            {insightBody ? <p className="metric-subtext">{insightBody}</p> : null}
          </div>
          {flaggedSessions > 0 ? (
            <button
              className="btn-outline"
              onClick={() => {
                navigate('/flags')
              }}
            >
              Review flags
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="filter-bar">
        {['All', 'Active', 'Flagged', 'Complete'].map((f) => (
          <button
            key={f}
            className={tab === f ? 'filter-btn filter-btn-active' : 'filter-btn'}
            onClick={() => setTab(f)}
          >
            {f}
          </button>
        ))}
      </div>

      {sessionsError ? (
        <div className="error-banner">
          <div>
            <p className="error-banner-title">⚠ Could not connect to the auditor API at http://127.0.0.1:8000</p>
            <p className="muted small">Make sure the backend is running: uvicorn main:app --reload</p>
          </div>
          <button className="btn-outline" onClick={onRefresh}>Retry</button>
        </div>
      ) : null}

      <div className="surface-card">
        <input
          className="search-input"
          placeholder="Search agents or session IDs..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {sessionsLoading && sessions.length === 0 ? (
          <div style={{ color: '#64748b', padding: '12px 0', fontSize: '13px' }}>
            Loading sessions...
          </div>
        ) : null}

        {!sessionsLoading && (sessionsError || filtered.length === 0) ? (
          <div className="empty-state">
            <div className="empty-symbol">◈</div>
            <h3 className="section-title">No sessions captured yet</h3>
            <p>Wrap your AI agent with the SDK to start capturing sessions</p>
            <pre className="code-block">{`from agent_auditor import AuditWrapper
client = AuditWrapper(your_client, session_name="my-agent")`}</pre>
            <button className="btn-outline" onClick={() => navigate('/about')}>
              View Setup Docs →
            </button>
          </div>
        ) : null}

        {filtered.length > 0 ? (
          <div className="table-wrap">
            <table className="sessions-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Status</th>
                  <th>Events</th>
                  <th>Flags</th>
                  <th>Risk</th>
                  <th>Model</th>
                  <th>Started</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((session) => {
                  const events = eventCountBySession[session.id] ?? 0
                  const flags = flagCountBySession[session.id] ?? 0
                  const status = statusMeta(session, lastEventAtBySession[session.id])
                  const modelRaw = String(session.model_used || 'unknown')
                  const model = modelRaw === 'http-request' ? 'HTTP' : modelRaw
                  let risk = { label: 'Clean', className: 'pill pill-success' }
                  if (events === 0) {
                    risk = { label: 'No data', className: 'pill pill-neutral' }
                  } else if (flags >= 3) {
                    risk = { label: 'Critical', className: 'pill pill-danger' }
                  } else if (flags >= 1) {
                    risk = { label: 'Review', className: 'pill pill-warning' }
                  }

                  return (
                    <tr
                      key={session.id}
                      className={session.id === selectedSessionId ? 'active-row' : ''}
                      onMouseEnter={() => setHoveredSessionId(session.id)}
                      onMouseLeave={() => setHoveredSessionId(null)}
                      onClick={() => {
                        onSelectSession(session.id)
                        navigate('/session')
                      }}
                    >
                      <td className="agent-meta-cell">
                        <div className="agent-cell">{session.agent_name}</div>
                        <div className="mono muted">{session.id.slice(0, 12)}...</div>
                        {flags > 0 ? <span className="flag-inline-badge">⚑ {flags} flags</span> : null}
                      </td>

                      <td>
                        <span className="status-inline">
                          <span className={`dot ${status.dot}`} />
                          {status.label}
                        </span>
                      </td>

                      <td className={events > 0 ? '' : 'muted'} title={`${events} LLM calls captured`}>
                        {events > 0 ? events : '—'}
                      </td>

                      <td
                        className={flags > 0 ? 'danger mono clickable' : 'muted mono'}
                        onClick={(e) => {
                          if (flags > 0) {
                            e.stopPropagation()
                            navigate(`/flags?session=${session.id}`)
                          }
                        }}
                      >
                        {flags > 0 ? `⚑ ${flags}` : '—'}
                      </td>

                      <td>
                        <span className={risk.className}>{risk.label}</span>
                      </td>

                      <td>
                        <span className={model === 'unknown' ? 'badge-model badge-model-muted' : 'badge-model'}>
                          {model}
                        </span>
                      </td>

                      <td className="muted">{timeAgo(session.started_at)}</td>

                      <td className="action-cell">
                        <span className="row-arrow">{hoveredSessionId === session.id ? '→' : ''}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  )
}

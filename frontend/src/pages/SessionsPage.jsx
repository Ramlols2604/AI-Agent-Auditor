import { useMemo, useState } from 'react'

const DAY_MS = 24 * 60 * 60 * 1000
import { useNavigate } from 'react-router-dom'
import { Btn, FilterTabs } from '../design/AppShell.jsx'
import { Icon } from '../design/icons.jsx'
import { SessionsTable } from '../design/SessionsTable.jsx'
import { StatusHero } from '../design/StatusHero.jsx'
import { getRiskScore, timeAgo } from '../utils/sessionDisplay.js'

function statusForRow(session, lastEventAt, flags) {
  const status = String(session.status || '').toLowerCase()
  if (status === 'complete') return 'complete'
  if (flags > 0) return 'flagged'
  const ms = new Date(lastEventAt || '').getTime()
  if (Number.isFinite(ms) && Date.now() - ms <= 5 * 60 * 1000) return 'running'
  return 'idle'
}

export default function SessionsPage({
  sessions,
  sessionsLoading,
  sessionsError,
  allFlags,
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
  const [tab, setTab] = useState('all')
  const [modelFilter, setModelFilter] = useState('all')
  const [riskFilter, setRiskFilter] = useState('all')
  const [sortBy, setSortBy] = useState('date_desc')

  const unresolvedFlags = useMemo(() => (allFlags || []).filter((f) => !f.resolved), [allFlags])
  const criticalCount = unresolvedFlags.filter((f) => String(f.severity).toLowerCase() === 'critical').length
  const highCount = unresolvedFlags.filter((f) => String(f.severity).toLowerCase() === 'high').length

  const modelOptions = useMemo(() => {
    const models = new Set(sessions.map((s) => String(s.model_used || 'unknown').toLowerCase()))
    return ['all', ...Array.from(models).sort()]
  }, [sessions])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sessions
      .filter((s) => {
        if (!q) return true
        const hay = `${s.agent_name} ${s.id} ${s.model_used || ''}`.toLowerCase()
        return hay.includes(q)
      })
      .map((session) => {
        const flags = Number(session.flag_count ?? flagCountBySession[session.id] ?? 0) || 0
        const events = eventCountBySession[session.id] ?? session.event_count ?? 0
        const modelRaw = String(session.model_used || 'unknown')
        const model = modelRaw === 'http-request' ? 'HTTP' : modelRaw
        const sessionForRisk = { ...session, flag_count: flags, flags }
        return {
          id: session.id,
          name: session.agent_name,
          status: statusForRow(session, lastEventAtBySession[session.id], flags),
          events,
          flags,
          model,
          cost: Number(session.total_cost_usd || 0),
          startedAt: session.started_at,
          started: timeAgo(session.started_at),
          _session: sessionForRisk,
        }
      })
  }, [sessions, query, flagCountBySession, eventCountBySession, lastEventAtBySession])

  const filtered = useMemo(() => {
    let list = rows
    if (tab === 'active') list = list.filter((r) => r.status === 'running')
    if (tab === 'flagged') list = list.filter((r) => r.flags > 0)
    if (tab === 'complete') list = list.filter((r) => r.status === 'complete')

    if (modelFilter !== 'all') {
      list = list.filter((r) => String(r._session?.model_used || r.model || '').toLowerCase() === modelFilter)
    }

    if (riskFilter === 'high') {
      list = list.filter((r) => getRiskScore(r._session) >= 75)
    } else if (riskFilter === 'medium') {
      list = list.filter((r) => {
        const score = getRiskScore(r._session)
        return score >= 45 && score < 75
      })
    } else if (riskFilter === 'clean') {
      list = list.filter((r) => getRiskScore(r._session) === 0)
    }

    const sorted = [...list]
    sorted.sort((a, b) => {
      if (sortBy === 'cost_desc') return b.cost - a.cost
      if (sortBy === 'events_desc') return b.events - a.events
      if (sortBy === 'flags_desc') return b.flags - a.flags
      if (sortBy === 'date_asc') {
        return new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
      }
      return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    })
    return sorted
  }, [rows, tab, modelFilter, riskFilter, sortBy])

  const counts = useMemo(
    () => ({
      all: rows.length,
      active: rows.filter((r) => r.status === 'running').length,
      flagged: rows.filter((r) => r.flags > 0).length,
      complete: rows.filter((r) => r.status === 'complete').length,
    }),
    [rows],
  )

  const activeCount = counts.active
  const [spendAnchorMs] = useState(() => Date.now())
  const spendToday = useMemo(
    () =>
      sessions
        .filter((s) => {
          const ts = new Date(s.started_at || '').getTime()
          return Number.isFinite(ts) && spendAnchorMs - ts <= DAY_MS
        })
        .reduce((sum, s) => sum + Number(s.total_cost_usd || 0), 0),
    [sessions, spendAnchorMs],
  )
  const eventsToday = useMemo(() => {
    const fromProbes = Object.values(eventsTodayBySession).reduce((a, n) => a + n, 0)
    if (fromProbes > 0) return fromProbes
    return sessions.reduce((acc, s) => acc + Number(s.event_count ?? 0), 0)
  }, [eventsTodayBySession, sessions])

  const sessionCount = sessions.length
  const healthScore =
    unresolvedFlags.length === 0
      ? 100
      : Math.max(0, Math.round(100 - (counts.flagged / Math.max(sessionCount, 1)) * 100))
  const totalCost = spendToday
  const totalEvents = eventsToday

  const heroStats = useMemo(
    () => [
      {
        label: 'ACTIVE SESSIONS',
        value: String(activeCount),
        delta: `${sessionCount.toLocaleString()} total monitored`,
        tone: 'primary',
        footer: (
          <div style={{ marginTop: '12px' }}>
            <div style={{ fontSize: '12px', color: '#64748b' }}>
              {sessionCount - activeCount} idle · {activeCount} running
            </div>
            <div
              style={{
                marginTop: '8px',
                height: '2px',
                background: 'rgba(255,255,255,0.06)',
                borderRadius: '1px',
              }}
            >
              <div
                style={{
                  width: `${(activeCount / Math.max(sessionCount, 1)) * 100}%`,
                  height: '100%',
                  background: '#6366f1',
                  borderRadius: '1px',
                }}
              />
            </div>
          </div>
        ),
      },
      {
        label: 'OPEN FLAGS',
        value: String(unresolvedFlags.length),
        delta: `${criticalCount} critical · ${highCount} high`,
        tone: 'danger',
        footer: (
          <div style={{ marginTop: '12px', fontSize: '12px', color: '#64748b' }}>
            {criticalCount > 0
              ? `${criticalCount} critical need immediate review`
              : highCount > 0
                ? `${highCount} high severity flags open`
                : 'No open flags — all clear'}
          </div>
        ),
      },
      {
        label: 'SPEND TODAY',
        value: `$${totalCost.toFixed(2)}`,
        delta: `${totalEvents.toLocaleString()} events captured today`,
        tone: 'warning',
        footer: (
          <div style={{ marginTop: '12px', fontSize: '12px', color: '#64748b' }}>
            {totalEvents > 0
              ? `avg $${(totalCost / totalEvents).toFixed(6)} per LLM call`
              : 'No spend recorded today'}
          </div>
        ),
      },
      {
        label: 'HEALTH',
        value: `${healthScore}%`,
        delta: counts.flagged ? `${counts.flagged} sessions need review` : 'All agents running clean',
        tone: 'success',
        footer: (
          <div style={{ marginTop: '12px' }}>
            <div
              style={{
                height: '4px',
                background: 'rgba(255,255,255,0.06)',
                borderRadius: '2px',
              }}
            >
              <div
                style={{
                  width: `${healthScore}%`,
                  height: '100%',
                  background: healthScore > 90 ? '#10b981' : healthScore > 60 ? '#f59e0b' : '#ef4444',
                  borderRadius: '2px',
                  transition: 'width 0.5s ease',
                }}
              />
            </div>
            <div style={{ marginTop: '6px', fontSize: '11px', color: '#64748b' }}>
              {unresolvedFlags.length === 0
                ? 'All agents running clean'
                : `${counts.flagged} session${counts.flagged === 1 ? '' : 's'} need review`}
            </div>
          </div>
        ),
      },
    ],
    [
      activeCount,
      sessionCount,
      unresolvedFlags.length,
      criticalCount,
      highCount,
      totalCost,
      totalEvents,
      healthScore,
      counts.flagged,
    ],
  )

  const tabs = [
    { id: 'all', label: 'All' },
    { id: 'active', label: 'Active' },
    { id: 'flagged', label: 'Flagged' },
    { id: 'complete', label: 'Complete' },
  ]

  const insights = useMemo(() => {
    const sessionCount = sessions.length
    const flaggedSessions = counts.flagged
    const totalEvents = rows.reduce((sum, row) => sum + Number(row.events || 0), 0)
    const avgEventsPerSession = sessionCount > 0 ? totalEvents / sessionCount : 0
    const totalCost = spendToday

    return [
      flaggedSessions > 0
        ? {
            icon: '⚑',
            color: '#ef4444',
            title: 'Action Required',
            body: `${flaggedSessions} session${flaggedSessions > 1 ? 's have' : ' has'} unresolved flags. Your agents may be producing hallucinations or policy violations that haven't been reviewed yet.`,
          }
        : {
            icon: '●',
            color: '#10b981',
            title: 'All Clear',
            body: `All ${sessionCount.toLocaleString()} monitored sessions are running within acceptable behavioral parameters. No action required.`,
          },
      avgEventsPerSession > 1000
        ? {
            icon: '◈',
            color: '#6366f1',
            title: 'High Volume Agent',
            body: `Your agents are averaging ${Math.round(avgEventsPerSession).toLocaleString()} LLM calls per session. At this volume, even a 1% hallucination rate means ${Math.round(avgEventsPerSession * 0.01).toLocaleString()} potentially problematic responses per session.`,
          }
        : {
            icon: '◈',
            color: '#6366f1',
            title: 'Activity Summary',
            body: `${totalEvents.toLocaleString()} total LLM calls captured across all sessions. Each call is analyzed for hallucinations, safety violations, cost efficiency, and EU AI Act compliance.`,
          },
      totalCost > 0.1
        ? {
            icon: '◎',
            color: '#f59e0b',
            title: 'Cost Alert',
            body: `Agents have spent $${totalCost.toFixed(2)} today. At this rate, projected monthly spend is $${(totalCost * 30).toFixed(0)}. Review high-cost sessions to identify inefficient prompts.`,
          }
        : {
            icon: '◎',
            color: '#10b981',
            title: 'Cost Efficient',
            body: `Total spend today: $${totalCost.toFixed(4)}. Your agents are operating within efficient token usage ranges. No cost anomalies detected.`,
          },
    ]
  }, [sessions.length, counts.flagged, rows, spendToday])

  return (
    <div style={{ padding: 'var(--s-6) var(--s-7)' }} className="aaa-fade-in">
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 'var(--s-4)',
          marginBottom: 'var(--s-5)',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 'var(--t-xl)', fontWeight: 500, color: 'var(--text)', letterSpacing: '-0.01em' }}>
          Sessions
        </h1>
        <span className="aaa-mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
          {sessions.length.toLocaleString()} total · {activeCount} active
        </span>
        <span style={{ flex: 1 }} />
        <Btn kind="ghost" icon="refresh" onClick={onRefresh}>
          Refresh
        </Btn>
        <Btn kind="primary" icon="play" onClick={() => navigate('/live')}>
          New audit
        </Btn>
      </div>

      <StatusHero stats={heroStats} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 12,
          marginBottom: 20,
        }}
      >
        {insights.map((insight, i) => (
          <div
            key={i}
            style={{
              background: '#111318',
              border: '1px solid rgba(255,255,255,0.06)',
              borderLeft: `3px solid ${insight.color}`,
              borderRadius: 8,
              padding: 16,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  color: insight.color,
                  fontSize: '16px',
                  fontWeight: 'bold',
                  lineHeight: 1,
                }}
              >
                {insight.icon}
              </span>
              <span style={{ color: '#f1f5f9', fontSize: 13, fontWeight: 500 }}>{insight.title}</span>
            </div>
            <p style={{ color: '#64748b', fontSize: 12, lineHeight: 1.6, margin: 0 }}>{insight.body}</p>
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--s-3)',
          marginBottom: 'var(--s-4)',
        }}
      >
        <FilterTabs tabs={tabs} value={tab} onChange={setTab} counts={counts} />
        <select
          value={modelFilter}
          onChange={(e) => setModelFilter(e.target.value)}
          style={{ height: 30, padding: '0 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', color: 'var(--text-soft)', fontSize: 12 }}
          aria-label="Filter by model"
        >
          {modelOptions.map((m) => (
            <option key={m} value={m}>{m === 'all' ? 'All models' : m}</option>
          ))}
        </select>
        <select
          value={riskFilter}
          onChange={(e) => setRiskFilter(e.target.value)}
          style={{ height: 30, padding: '0 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', color: 'var(--text-soft)', fontSize: 12 }}
          aria-label="Filter by risk"
        >
          <option value="all">All risk</option>
          <option value="high">High risk</option>
          <option value="medium">Medium risk</option>
          <option value="clean">Clean</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          style={{ height: 30, padding: '0 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', color: 'var(--text-soft)', fontSize: 12 }}
          aria-label="Sort sessions"
        >
          <option value="date_desc">Newest first</option>
          <option value="date_asc">Oldest first</option>
          <option value="cost_desc">Highest cost</option>
          <option value="events_desc">Most events</option>
          <option value="flags_desc">Most flags</option>
        </select>
        <span style={{ flex: 1 }} />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            height: 30,
            padding: '0 10px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-md)',
            minWidth: 240,
          }}
        >
          <Icon name="search" size={13} color="var(--muted)" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name, model, id…"
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              color: 'var(--text)',
              fontSize: 12,
              outline: 'none',
            }}
          />
        </div>
      </div>

      {sessionsError ? (
        <div
          style={{
            marginBottom: 'var(--s-4)',
            padding: 'var(--s-4) var(--s-5)',
            background: 'var(--danger-soft)',
            border: '1px solid var(--danger-line)',
            borderRadius: 'var(--r-lg)',
            color: 'var(--danger)',
            fontSize: 13,
          }}
        >
          Could not connect to the Sentinel API. Make sure the backend is running on port 8000.
          <Btn kind="ghost" style={{ marginLeft: 12 }} onClick={onRefresh}>
            Retry
          </Btn>
        </div>
      ) : null}

      {sessionsLoading && sessions.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading sessions…</p>
      ) : null}

      {!sessionsLoading && sessions.length === 0 ? (
        <div
          style={{
            padding: 'var(--s-8)',
            textAlign: 'center',
            color: 'var(--muted)',
            background: 'var(--surface)',
            border: '1px dashed var(--border)',
            borderRadius: 'var(--r-lg)',
          }}
        >
          <Icon name="inbox" size={32} color="var(--muted-2)" />
          <p style={{ marginTop: 12, color: 'var(--text)' }}>No sessions yet</p>
          <p style={{ fontSize: 13, maxWidth: 420, margin: '8px auto 0' }}>
            Run the setup wizard or demo agent to capture your first LLM session.
          </p>
        </div>
      ) : !sessionsLoading && filtered.length === 0 ? (
        <div
          style={{
            padding: 'var(--s-8)',
            textAlign: 'center',
            color: 'var(--muted)',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-lg)',
          }}
        >
          <Icon name="inbox" size={32} color="var(--muted-2)" />
          <p style={{ marginTop: 12 }}>No sessions match your filters</p>
        </div>
      ) : (
        <SessionsTable
          rows={filtered.slice(0, 200)}
          onRowClick={(row) => {
            onSelectSession(row.id)
            navigate(`/sessions/${row.id}`)
          }}
        />
      )}

      {filtered.length > 200 ? (
        <p style={{ marginTop: 'var(--s-4)', fontSize: 12, color: 'var(--muted)' }}>
          Showing first 200 of {filtered.length} sessions. Use search to narrow results.
        </p>
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--s-4) 2px 0',
            color: 'var(--muted)',
            fontSize: 12,
          }}
        >
          <span>
            Showing {filtered.length} of {sessions.length.toLocaleString()} sessions
            {selectedSessionId ? ` · selected ${selectedSessionId.slice(0, 12)}…` : ''}
          </span>
        </div>
      )}
    </div>
  )
}

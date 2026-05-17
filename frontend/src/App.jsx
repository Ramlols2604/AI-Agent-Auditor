import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { getAuditReport } from './api/audit'
import { apiFetch, RateLimitError } from './api/client'
import { listFlags, resolveFlag } from './api/flags'
import { listSessionEvents, listSessions } from './api/sessions'
import Layout from './components/Layout'
import { SessionAuditPanel } from './components/SessionAuditPanel'
import About from './About'
import AuditPage from './pages/AuditPage'
import FlagsPage from './pages/FlagsPage'
import SessionDetailRoute from './pages/SessionDetailRoute'
import SessionsPage from './pages/SessionsPage'
import OnboardingWizard from './pages/OnboardingWizard'
import { isOnboardingComplete } from './utils/onboarding'
import ToastStack from './components/ToastStack'
import LiveAudit from './LiveAudit'
import Settings from './Settings'
import { useAuditRunner } from './hooks/useAuditRunner'
import { DATA_CLEARED_EVENT } from './utils/dataEvents'
import { showBrowserNotification } from './utils/notifications'

const initialActionState = { loading: false, error: '', message: '' }
const POLL_INTERVAL_MS = 30000
const EVENT_PROBE_MAX = 3
const activeRequests = new Set()

async function deduplicatedFetch(key, fetchFn) {
  if (activeRequests.has(key)) return
  activeRequests.add(key)
  try {
    await fetchFn()
  } finally {
    activeRequests.delete(key)
  }
}

const initialLiveAuditState = {
  sessionId: null,
  sessionName: null,
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
  eventCount: 0,
}

function App() {
  const location = useLocation()
  const navigate = useNavigate()

  const [sessions, setSessions] = useState([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [sessionsError, setSessionsError] = useState('')

  const [selectedSessionId, setSelectedSessionId] = useState('')

  const [allFlags, setAllFlags] = useState([])
  const [flagsLoading, setFlagsLoading] = useState(false)
  const [flagsError, setFlagsError] = useState('')

  const [auditActionState, setAuditActionState] = useState(initialActionState)
  const [reportState, setReportState] = useState(initialActionState)
  const [report, setReport] = useState(null)
  const [latestAuditResult, setLatestAuditResult] = useState(null)
  const [resolveState, setResolveState] = useState(initialActionState)
  const [auditState, setAuditState] = useState(initialLiveAuditState)
  const [auditEventSource, setAuditEventSource] = useState(null)

  const [eventCountBySession, setEventCountBySession] = useState({})
  const [eventsTodayBySession, setEventsTodayBySession] = useState({})
  const [lastEventAtBySession, setLastEventAtBySession] = useState({})
  const [flagCountBySession, setFlagCountBySession] = useState({})
  const [isConnected, setIsConnected] = useState(true)
  const isMountedRef = useRef(true)
  const lastAuditSyncRef = useRef('')
  const refreshPollingRef = useRef(null)
  const healthPollingRef = useRef(null)
  const pollIntervalMsRef = useRef(POLL_INTERVAL_MS)
  const sessionsRef = useRef([])
  const rateLimitUntilRef = useRef(0)
  const prevFlagIdsRef = useRef(new Set())
  const toastIdRef = useRef(0)

  const [toasts, setToasts] = useState([])
  const [showOnboarding, setShowOnboarding] = useState(() => !isOnboardingComplete())

  const detailSessionId = useMemo(() => {
    const match = location.pathname.match(/^\/sessions\/([^/]+)/)
    return match?.[1] || ''
  }, [location.pathname])

  const activeSessionId = detailSessionId || selectedSessionId

  const pushToast = useCallback(({ title, message, tone = 'info' }) => {
    const id = `toast-${++toastIdRef.current}`
    setToasts((prev) => [...prev, { id, title, message, tone }].slice(-4))
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 6000)
  }, [])

  const { runAudit: runLiveAudit } = useAuditRunner({
    setAuditState,
    setAuditEventSource,
  })

  const hasActiveSession = useMemo(() => {
    const now = Date.now()
    return Object.values(lastEventAtBySession).some((ts) => {
      const ms = new Date(ts).getTime()
      return Number.isFinite(ms) && now - ms <= 5 * 60 * 1000
    })
  }, [lastEventAtBySession])

  const totalFlagCount = useMemo(
    () => allFlags.filter((f) => f.resolved === false || f.resolved === 0 || !f.resolved).length,
    [allFlags],
  )

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true)
    setSessionsError('')
    try {
      const data = await listSessions()
      setSessions(data)

      if (data.length === 0) {
        setSelectedSessionId('')
        setEventCountBySession({})
        setEventsTodayBySession({})
        setLastEventAtBySession({})
        return
      }

      const activeId =
        selectedSessionId && data.some((s) => s.id === selectedSessionId)
          ? selectedSessionId
          : data[0].id
      if (activeId !== selectedSessionId) {
        setSelectedSessionId(activeId)
      }

      sessionsRef.current = data

      const now = Date.now()
      setEventCountBySession(
        Object.fromEntries(
          data.map((session) => [session.id, Number(session.event_count ?? 0)]),
        ),
      )
      setEventsTodayBySession(
        Object.fromEntries(
          data.map((session) => {
            const started = new Date(session.started_at || '').getTime()
            const isToday = Number.isFinite(started) && now - started <= 24 * 60 * 60 * 1000
            return [session.id, isToday ? Number(session.event_count ?? 0) : 0]
          }),
        ),
      )
      setLastEventAtBySession(
        Object.fromEntries(
          data.map((session) => [session.id, session.started_at || null]),
        ),
      )

      const probeIds = []
      if (activeId) probeIds.push(activeId)
      data
        .filter((s) => String(s.status || '').toLowerCase() === 'active')
        .slice(0, EVENT_PROBE_MAX)
        .forEach((s) => {
          if (!probeIds.includes(s.id)) probeIds.push(s.id)
        })

      if (probeIds.length > 0) {
        const counts = await Promise.all(
          probeIds.map(async (id) => {
            try {
              let ev = []
              await deduplicatedFetch(`session-events-${id}`, async () => {
                ev = await listSessionEvents(id)
              })
              const todayCount = ev.filter((event) => {
                const ts = new Date(event.timestamp).getTime()
                return Number.isFinite(ts) && now - ts <= 24 * 60 * 60 * 1000
              }).length
              const lastEventAt = ev.length > 0 ? ev[ev.length - 1].timestamp : null
              return [id, { count: ev.length, todayCount, lastEventAt }]
            } catch {
              return [id, null]
            }
          }),
        )
        counts.forEach(([id, v]) => {
          if (!v) return
          setEventCountBySession((prev) => ({ ...prev, [id]: v.count }))
          setEventsTodayBySession((prev) => ({ ...prev, [id]: v.todayCount }))
          setLastEventAtBySession((prev) => ({ ...prev, [id]: v.lastEventAt }))
        })
      }
    } catch (error) {
      if (error instanceof RateLimitError) {
        rateLimitUntilRef.current = Date.now() + error.retryAfter * 1000
        pollIntervalMsRef.current = Math.max(pollIntervalMsRef.current, error.retryAfter * 1000)
        rateLimitUntilRef.current = Date.now() + error.retryAfter * 1000
        setSessionsError(`Rate limited (${error.limitType || 'refresh'}). Retrying in ${error.retryAfter}s.`)
      } else {
        setSessionsError(error.message)
      }
    } finally {
      setSessionsLoading(false)
    }
  }, [selectedSessionId])

  const loadFlagsData = useCallback(async () => {
    setFlagsLoading(true)
    setFlagsError('')
    try {
      const all = await listFlags()
      setAllFlags(all)

      const bySession = {}
      all.forEach((flag) => {
        bySession[flag.session_id] = (bySession[flag.session_id] || 0) + (flag.resolved ? 0 : 1)
      })
      setFlagCountBySession(bySession)

      const openFlags = all.filter((f) => f.resolved === false || f.resolved === 0 || !f.resolved)
      const prevIds = prevFlagIdsRef.current
      const newCritical = openFlags.filter(
        (f) => !prevIds.has(f.id) && String(f.severity).toLowerCase() === 'critical',
      )
      if (newCritical.length > 0) {
        const flag = newCritical[0]
        const session = sessionsRef.current.find((s) => s.id === flag.session_id)
        const agentLabel = session?.agent_name || flag.session_id?.slice(0, 8) || 'session'
        pushToast({
          title: `⚑ Critical flag on ${agentLabel}`,
          message: flag.description || `${flag.flag_type} agent flagged this session`,
          tone: 'critical',
        })
        showBrowserNotification({
          title: 'Sentinel — Critical flag',
          body: `${agentLabel}: ${flag.description || flag.flag_type}`,
          tag: flag.id,
          onClick: () => navigate(`/flags?session=${flag.session_id}`),
        })
      }
      prevFlagIdsRef.current = new Set(openFlags.map((f) => f.id))
    } catch (error) {
      if (error instanceof RateLimitError) {
        rateLimitUntilRef.current = Date.now() + error.retryAfter * 1000
        pollIntervalMsRef.current = Math.max(pollIntervalMsRef.current, error.retryAfter * 1000)
        setFlagsError(`Rate limited (${error.limitType || 'refresh'}). Retrying in ${error.retryAfter}s.`)
      } else {
        setFlagsError(error.message)
      }
    } finally {
      setFlagsLoading(false)
    }
  }, [navigate, pushToast])

  const handleGenerateAudit = useCallback(() => {
    const sessionId = activeSessionId
    if (!sessionId || auditState.status === 'running') return
    const session = sessions.find((s) => s.id === sessionId)
    setAuditActionState({ loading: true, error: '', message: '' })
    runLiveAudit(sessionId, session?.agent_name, eventCountBySession[sessionId] || 0)
  }, [activeSessionId, auditState.status, eventCountBySession, runLiveAudit, sessions])

  useEffect(() => {
    if (auditState.status !== 'complete' && auditState.status !== 'error') return

    const syncKey = `${auditState.status}:${auditState.completedAt}:${auditState.verdict}`
    if (lastAuditSyncRef.current === syncKey) return
    lastAuditSyncRef.current = syncKey

    if (auditState.status === 'complete' && auditState.verdict) {
      const agent_scores = Object.fromEntries(
        Object.entries(auditState.agentResults || {}).map(([key, val]) => [key, val?.score]),
      )
      setLatestAuditResult({
        verdict: auditState.verdict,
        overall_score: auditState.overallScore,
        agent_scores,
        scores: agent_scores,
        status: 'complete',
        flag_created: (auditState.flagsRaised || []).length > 0,
      })
      setAuditActionState({
        loading: false,
        error: '',
        message: `Verdict: ${auditState.verdict} | Audit complete`,
      })
      loadFlagsData()
      loadSessions()
      if (auditState.verdict === 'CRITICAL' || auditState.verdict === 'FLAGGED') {
        const session = sessionsRef.current.find((s) => s.id === auditState.sessionId)
        pushToast({
          title: `Audit ${auditState.verdict}`,
          message: `${session?.agent_name || 'Session'} scored ${auditState.overallScore ?? '—'}/100`,
          tone: auditState.verdict === 'CRITICAL' ? 'critical' : 'warning',
        })
      }
    }

    if (auditState.status === 'error') {
      setAuditActionState({
        loading: false,
        error: auditState.error || 'Audit failed',
        message: '',
      })
    }
  }, [
    auditState.status,
    auditState.verdict,
    auditState.overallScore,
    auditState.agentResults,
    auditState.flagsRaised,
    auditState.error,
    auditState.completedAt,
    auditState.sessionId,
    loadFlagsData,
    loadSessions,
    pushToast,
  ])

  const handleFetchReport = useCallback(async () => {
    if (!activeSessionId) return
    setReportState({ loading: true, error: '', message: '' })
    try {
      const data = await getAuditReport(activeSessionId)
      setReport(data)
      setReportState({ loading: false, error: '', message: 'Report loaded.' })
    } catch (error) {
      setReportState({ loading: false, error: error.message, message: '' })
    }
  }, [activeSessionId])

  const handleResolveFlag = useCallback(
    async (flagId) => {
      setResolveState({ loading: true, error: '', message: '' })

      setAllFlags((prev) => prev.map((flag) => (flag.id === flagId ? { ...flag, resolved: true } : flag)))

      try {
        await resolveFlag(flagId, true)
        setResolveState({ loading: false, error: '', message: `Resolved flag: ${flagId}` })
        await loadFlagsData()
      } catch (error) {
        setResolveState({ loading: false, error: error.message, message: '' })
        await loadFlagsData()
      }
    },
    [loadFlagsData],
  )

  useEffect(() => {
    isMountedRef.current = true
    loadSessions()
    loadFlagsData()
    return () => {
      isMountedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only bootstrap
  }, [])

  useEffect(() => {
    const onDataCleared = () => {
      auditEventSource?.close()
      setAuditEventSource(null)
      setAuditState(initialLiveAuditState)
      setLatestAuditResult(null)
      setReport(null)
      setAllFlags([])
      setFlagCountBySession({})
      loadSessions()
      loadFlagsData()
    }
    window.addEventListener(DATA_CLEARED_EVENT, onDataCleared)
    return () => window.removeEventListener(DATA_CLEARED_EVENT, onDataCleared)
  }, [auditEventSource, loadFlagsData, loadSessions, setAuditEventSource])

  useEffect(() => {
    const schedulePoll = () => {
      if (refreshPollingRef.current) clearTimeout(refreshPollingRef.current)
      const now = Date.now()
      const waitMs = Math.max(
        pollIntervalMsRef.current,
        Math.max(0, rateLimitUntilRef.current - now),
      )
      refreshPollingRef.current = setTimeout(async () => {
        if (!isMountedRef.current) return
        if (Date.now() < rateLimitUntilRef.current) {
          schedulePoll()
          return
        }
        await Promise.all([loadSessions(), loadFlagsData()])
        if (Date.now() >= rateLimitUntilRef.current && pollIntervalMsRef.current > POLL_INTERVAL_MS) {
          pollIntervalMsRef.current = Math.max(POLL_INTERVAL_MS, Math.floor(pollIntervalMsRef.current * 0.75))
        }
        schedulePoll()
      }, waitMs)
    }
    schedulePoll()
    return () => {
      if (refreshPollingRef.current) {
        clearTimeout(refreshPollingRef.current)
        refreshPollingRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable polling loop
  }, [])

  useEffect(() => {
    if (activeSessionId) {
      setReport(null)
      setAuditActionState(initialActionState)
      setReportState(initialActionState)
      setResolveState(initialActionState)
    }
  }, [activeSessionId])

  useEffect(() => {
    const check = async () => {
      try {
        await apiFetch('/health')
        if (isMountedRef.current) setIsConnected(true)
      } catch {
        if (isMountedRef.current) setIsConnected(false)
      }
    }
    check()
    if (healthPollingRef.current) clearInterval(healthPollingRef.current)
    healthPollingRef.current = setInterval(() => {
      if (!isMountedRef.current) return
      if (Date.now() < rateLimitUntilRef.current) return
      check()
    }, 20000)
    return () => {
      if (healthPollingRef.current) {
        clearInterval(healthPollingRef.current)
        healthPollingRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const match = location.pathname.match(/^\/sessions\/([^/]+)/)
    if (match?.[1] && match[1] !== selectedSessionId) {
      setSelectedSessionId(match[1])
    }
  }, [location.pathname, selectedSessionId])

  const showRightPanel =
    location.pathname.startsWith('/sessions/') && location.pathname !== '/sessions'

  return (
    <Layout
      showRightPanel={showRightPanel}
      rightPanel={
        <SessionAuditPanel
          selectedSessionId={activeSessionId}
          latestAuditResult={latestAuditResult}
          onGenerateAudit={handleGenerateAudit}
        />
      }
      isConnected={isConnected}
      flagCount={totalFlagCount}
      hasActiveSession={hasActiveSession}
      auditState={auditState}
    >
      <Routes>
        <Route
          path="/sessions"
          element={
            <SessionsPage
              sessions={sessions}
              sessionsLoading={sessionsLoading}
              sessionsError={sessionsError}
              allFlags={allFlags}
              selectedSessionId={selectedSessionId}
              eventCountBySession={eventCountBySession}
              eventsTodayBySession={eventsTodayBySession}
              lastEventAtBySession={lastEventAtBySession}
              flagCountBySession={flagCountBySession}
              onRefresh={loadSessions}
              onSelectSession={setSelectedSessionId}
            />
          }
        />
        <Route
          path="/sessions/:sessionId"
          element={
            <SessionDetailRoute
              onSelectSession={setSelectedSessionId}
              onGenerateAudit={handleGenerateAudit}
            />
          }
        />
        <Route path="/" element={<Navigate to="/sessions" replace />} />
        <Route
          path="/live"
          element={
            <LiveAudit
              auditState={auditState}
              setAuditState={setAuditState}
              setAuditEventSource={setAuditEventSource}
            />
          }
        />
        <Route
          path="/flags"
          element={
            <FlagsPage
              allFlags={allFlags}
              flagsLoading={flagsLoading}
              flagsError={flagsError}
              resolveState={resolveState}
              onResolve={handleResolveFlag}
            />
          }
        />
        <Route
          path="/audit"
          element={
            <AuditPage
              selectedSessionId={activeSessionId}
              sessions={sessions}
              allFlags={allFlags}
              auditActionState={auditActionState}
              liveAuditState={auditState}
              reportState={reportState}
              report={report}
              latestAuditResult={latestAuditResult}
              onGenerateAudit={handleGenerateAudit}
              onFetchReport={handleFetchReport}
            />
          }
        />
        <Route path="/about" element={<About />} />
        <Route
          path="/settings"
          element={<Settings />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <OnboardingWizard
        open={showOnboarding}
        sessionsCount={sessions.length}
        onComplete={() => setShowOnboarding(false)}
      />
      <ToastStack toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
      {auditState.status === 'running' ? (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: '220px',
            right: 0,
            height: '40px',
            background: 'rgba(17,19,24,0.95)',
            borderTop: '1px solid rgba(99,102,241,0.3)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 24px',
            gap: '12px',
            zIndex: 1000,
            backdropFilter: 'blur(8px)',
          }}
        >
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#6366f1',
              animation: 'ping 1s infinite',
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: '13px', color: '#94a3b8' }}>
            Auditing {auditState.sessionName || 'session'}...
          </span>
          <span style={{ fontSize: '12px', color: '#64748b', marginLeft: 'auto' }}>
            {Object.values(auditState.agentResults || {}).filter((item) => item?.status === 'complete').length} / 4 agents complete
          </span>
          <a
            href="/live"
            style={{
              fontSize: '12px',
              color: '#6366f1',
              textDecoration: 'none',
              padding: '4px 10px',
              border: '1px solid rgba(99,102,241,0.3)',
              borderRadius: '4px',
            }}
          >
            View →
          </a>
        </div>
      ) : null}
    </Layout>
  )
}

export default App

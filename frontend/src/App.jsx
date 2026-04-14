import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { generateAudit, getAuditReport } from './api/audit'
import { apiFetch, getApiBase } from './api/client'
import { listFlags, resolveFlag } from './api/flags'
import { getSession, listSessionEvents, listSessions } from './api/sessions'
import Layout from './components/Layout'
import About from './About'
import AuditPage from './pages/AuditPage'
import FlagsPage from './pages/FlagsPage'
import SessionDetailPage, { SessionAuditPanel } from './pages/SessionDetailPage'
import SessionsPage from './pages/SessionsPage'
import LiveAudit from './LiveAudit'

const initialActionState = { loading: false, error: '', message: '' }
const MAX_EVENT_PROBE_SESSIONS = 40
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

  const [sessions, setSessions] = useState([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [sessionsError, setSessionsError] = useState('')

  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [sessionDetail, setSessionDetail] = useState(null)
  const [events, setEvents] = useState([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

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
  const refreshPollingRef = useRef(null)
  const healthPollingRef = useRef(null)
  const detailFallbackRef = useRef(null)

  const apiBase = useMemo(() => getApiBase(), [])

  const hasActiveSession = useMemo(() => {
    const now = Date.now()
    return Object.values(lastEventAtBySession).some((ts) => {
      const ms = new Date(ts).getTime()
      return Number.isFinite(ms) && now - ms <= 5 * 60 * 1000
    })
  }, [lastEventAtBySession])

  const totalFlagCount = useMemo(() => allFlags.filter((f) => !f.resolved).length, [allFlags])

  const loadSessionDetails = useCallback(async (sessionId) => {
    if (!sessionId) return
    setDetailLoading(true)
    setDetailError('')
    try {
      await deduplicatedFetch(`session-detail-${sessionId}`, async () => {
        const [session, sessionEvents] = await Promise.all([getSession(sessionId), listSessionEvents(sessionId)])
        if (!isMountedRef.current) return
        setSessionDetail(session)
        setEvents(sessionEvents)
        setEventCountBySession((prev) => ({ ...prev, [sessionId]: sessionEvents.length }))
      })
    } catch (error) {
      if (!isMountedRef.current) return
      setDetailError(error.message)
      setSessionDetail(null)
      setEvents([])
    } finally {
      if (isMountedRef.current) setDetailLoading(false)
    }
  }, [])

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true)
    setSessionsError('')
    try {
      const data = await listSessions()
      setSessions(data)
      if (!selectedSessionId && data.length > 0) {
        setSelectedSessionId(data[0].id)
      }

      const probeIds = []
      if (selectedSessionId) {
        probeIds.push(selectedSessionId)
      }
      data.forEach((session) => {
        if (probeIds.length < MAX_EVENT_PROBE_SESSIONS && !probeIds.includes(session.id)) {
          probeIds.push(session.id)
        }
      })

      const counts = await Promise.all(
        probeIds.map(async (id) => {
          try {
            let ev = []
            await deduplicatedFetch(`session-events-${id}`, async () => {
              ev = await listSessionEvents(id)
            })
            const now = Date.now()
            const todayCount = ev.filter((event) => {
              const ts = new Date(event.timestamp).getTime()
              return Number.isFinite(ts) && now - ts <= 24 * 60 * 60 * 1000
            }).length
            const lastEventAt = ev.length > 0 ? ev[ev.length - 1].timestamp : null
            return [id, { count: ev.length, todayCount, lastEventAt }]
          } catch {
            return [id, { count: 0, todayCount: 0, lastEventAt: null }]
          }
        }),
      )
      const asObject = Object.fromEntries(counts)
      setEventCountBySession(
        Object.fromEntries(Object.entries(asObject).map(([id, v]) => [id, v.count])),
      )
      setEventsTodayBySession(
        Object.fromEntries(Object.entries(asObject).map(([id, v]) => [id, v.todayCount])),
      )
      setLastEventAtBySession(
        Object.fromEntries(Object.entries(asObject).map(([id, v]) => [id, v.lastEventAt])),
      )
    } catch (error) {
      setSessionsError(error.message)
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
    } catch (error) {
      setFlagsError(error.message)
    } finally {
      setFlagsLoading(false)
    }
  }, [])

  const handleGenerateAudit = useCallback(async () => {
    if (!selectedSessionId) return
    setAuditActionState({ loading: true, error: '', message: '' })
    try {
      const result = await generateAudit(selectedSessionId)
      setLatestAuditResult(result)
      setAuditActionState({
        loading: false,
        error: '',
        message: `Verdict: ${result.verdict} | Flag created: ${result.flag_created}`,
      })
      await Promise.all([loadSessionDetails(selectedSessionId), loadFlagsData()])
    } catch (error) {
      setAuditActionState({ loading: false, error: error.message, message: '' })
    }
  }, [loadFlagsData, loadSessionDetails, selectedSessionId])

  const handleFetchReport = useCallback(async () => {
    if (!selectedSessionId) return
    setReportState({ loading: true, error: '', message: '' })
    try {
      const data = await getAuditReport(selectedSessionId)
      setReport(data)
      setReportState({ loading: false, error: '', message: 'Report loaded.' })
    } catch (error) {
      setReportState({ loading: false, error: error.message, message: '' })
    }
  }, [selectedSessionId])

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
  }, [loadFlagsData, loadSessions])

  useEffect(() => {
    if (refreshPollingRef.current) clearInterval(refreshPollingRef.current)
    refreshPollingRef.current = setInterval(() => {
      if (!isMountedRef.current) return
      loadSessions()
      loadFlagsData()
    }, 10000)
    return () => {
      if (refreshPollingRef.current) {
        clearInterval(refreshPollingRef.current)
        refreshPollingRef.current = null
      }
    }
  }, [loadFlagsData, loadSessions])

  useEffect(() => {
    if (selectedSessionId) {
      loadSessionDetails(selectedSessionId)
      setReport(null)
      setAuditActionState(initialActionState)
      setReportState(initialActionState)
      setResolveState(initialActionState)
    }
  }, [loadSessionDetails, selectedSessionId])

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
      check()
    }, 10000)
    return () => {
      if (healthPollingRef.current) {
        clearInterval(healthPollingRef.current)
        healthPollingRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!selectedSessionId || location.pathname !== '/session') return undefined

    loadSessionDetails(selectedSessionId)

    let source
    let cancelled = false
    try {
      source = new EventSource(`${apiBase}/stream/${selectedSessionId}`)
      source.onmessage = (event) => {
        if (cancelled || !isMountedRef.current) return
        try {
          const payload = JSON.parse(event.data)
          if (payload?.type !== 'event_captured' || !payload?.event) return
          const newEvent = payload.event
          setEvents((prev) => {
            if (prev.some((item) => item.id === newEvent.id)) return prev
            const next = [...prev, newEvent]
            setEventCountBySession((counts) => ({ ...counts, [selectedSessionId]: next.length }))
            return next
          })
        } catch {
          // Ignore malformed stream events.
        }
      }
      source.onerror = () => {
        source?.close()
        if (detailFallbackRef.current) clearInterval(detailFallbackRef.current)
        detailFallbackRef.current = setInterval(() => {
          if (!isMountedRef.current) return
          loadSessionDetails(selectedSessionId)
          loadFlagsData()
        }, 10000)
      }
    } catch {
      if (detailFallbackRef.current) clearInterval(detailFallbackRef.current)
      detailFallbackRef.current = setInterval(() => {
        if (!isMountedRef.current) return
        loadSessionDetails(selectedSessionId)
        loadFlagsData()
      }, 10000)
    }

    return () => {
      cancelled = true
      if (detailFallbackRef.current) {
        clearInterval(detailFallbackRef.current)
        detailFallbackRef.current = null
      }
      if (source) source.close()
    }
  }, [apiBase, loadFlagsData, loadSessionDetails, location.pathname, selectedSessionId])

  const showRightPanel = location.pathname === '/session'

  return (
    <Layout
      showRightPanel={showRightPanel}
      rightPanel={
        <SessionAuditPanel
          selectedSessionId={selectedSessionId}
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
          path="/"
          element={
            <SessionsPage
              sessions={sessions}
              sessionsLoading={sessionsLoading}
              sessionsError={sessionsError}
              allFlags={allFlags}
              isLive={isConnected}
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
          path="/session"
          element={
            <SessionDetailPage
              selectedSessionId={selectedSessionId}
              sessionDetail={sessionDetail}
              events={events}
              detailLoading={detailLoading}
              detailError={detailError}
              flagCount={flagCountBySession[selectedSessionId] || 0}
            />
          }
        />
        <Route
          path="/live"
          element={
            <LiveAudit
              auditState={auditState}
              setAuditState={setAuditState}
              auditEventSource={auditEventSource}
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
              selectedSessionId={selectedSessionId}
              auditState={auditActionState}
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
          element={
            <div className="surface-card empty-state">
              <div className="empty-symbol">◎</div>
              <p>Settings panel coming soon.</p>
            </div>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
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

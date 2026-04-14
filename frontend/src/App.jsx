import { useEffect, useMemo, useState } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

const initialActionState = {
  loading: false,
  error: '',
  message: '',
}

async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  })

  let body = null
  try {
    body = await response.json()
  } catch {
    body = null
  }

  if (!response.ok) {
    const detail = body?.detail || `Request failed: ${response.status}`
    throw new Error(detail)
  }

  return body
}

function Panel({ title, children }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

function KeyValue({ label, value }) {
  return (
    <div className="kv-row">
      <span className="kv-label">{label}</span>
      <span className="kv-value">{String(value ?? '-')}</span>
    </div>
  )
}

function App() {
  const [sessions, setSessions] = useState([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [sessionsError, setSessionsError] = useState('')

  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [sessionDetail, setSessionDetail] = useState(null)
  const [events, setEvents] = useState([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

  const [allFlags, setAllFlags] = useState([])
  const [sessionFlags, setSessionFlags] = useState([])
  const [flagsLoading, setFlagsLoading] = useState(false)
  const [flagsError, setFlagsError] = useState('')

  const [auditState, setAuditState] = useState(initialActionState)
  const [reportState, setReportState] = useState(initialActionState)
  const [lastReport, setLastReport] = useState(null)
  const [resolveState, setResolveState] = useState(initialActionState)

  const selectedSessionFlags = useMemo(
    () => sessionFlags.filter((flag) => flag.session_id === selectedSessionId),
    [selectedSessionId, sessionFlags],
  )

  async function loadSessions() {
    setSessionsLoading(true)
    setSessionsError('')
    try {
      const data = await apiFetch('/sessions')
      setSessions(data)
      if (!selectedSessionId && data.length > 0) {
        setSelectedSessionId(data[0].id)
      }
    } catch (error) {
      setSessionsError(error.message)
    } finally {
      setSessionsLoading(false)
    }
  }

  async function loadFlags() {
    setFlagsLoading(true)
    setFlagsError('')
    try {
      const [all, forSession] = await Promise.all([
        apiFetch('/flags'),
        selectedSessionId ? apiFetch(`/flags/${selectedSessionId}`) : Promise.resolve([]),
      ])
      setAllFlags(all)
      setSessionFlags(forSession)
    } catch (error) {
      setFlagsError(error.message)
    } finally {
      setFlagsLoading(false)
    }
  }

  async function loadSessionDetail(sessionId) {
    if (!sessionId) return
    setDetailLoading(true)
    setDetailError('')
    try {
      const [session, sessionEvents] = await Promise.all([
        apiFetch(`/sessions/${sessionId}`),
        apiFetch(`/sessions/${sessionId}/events`),
      ])
      setSessionDetail(session)
      setEvents(sessionEvents)
    } catch (error) {
      setDetailError(error.message)
      setSessionDetail(null)
      setEvents([])
    } finally {
      setDetailLoading(false)
    }
  }

  async function generateAudit() {
    if (!selectedSessionId) return
    setAuditState({ loading: true, error: '', message: '' })
    try {
      const result = await apiFetch('/audit/generate', {
        method: 'POST',
        body: JSON.stringify({ session_id: selectedSessionId }),
      })
      setAuditState({
        loading: false,
        error: '',
        message: `Audit verdict: ${result.verdict} | Flag created: ${result.flag_created}`,
      })
      await Promise.all([loadSessionDetail(selectedSessionId), loadFlags()])
    } catch (error) {
      setAuditState({ loading: false, error: error.message, message: '' })
    }
  }

  async function fetchReport() {
    if (!selectedSessionId) return
    setReportState({ loading: true, error: '', message: '' })
    try {
      const report = await apiFetch(`/audit/report/${selectedSessionId}`)
      setLastReport(report)
      setReportState({ loading: false, error: '', message: 'Report fetched.' })
    } catch (error) {
      setReportState({ loading: false, error: error.message, message: '' })
    }
  }

  async function resolveFlag(flagId) {
    setResolveState({ loading: true, error: '', message: '' })
    try {
      await apiFetch(`/flags/${flagId}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ resolved: true }),
      })
      setResolveState({ loading: false, error: '', message: `Resolved flag: ${flagId}` })
      await loadFlags()
    } catch (error) {
      setResolveState({ loading: false, error: error.message, message: '' })
    }
  }

  useEffect(() => {
    loadSessions()
  }, [])

  useEffect(() => {
    if (selectedSessionId) {
      loadSessionDetail(selectedSessionId)
      loadFlags()
      setLastReport(null)
      setAuditState(initialActionState)
      setReportState(initialActionState)
    }
  }, [selectedSessionId])

  return (
    <div className="app-shell">
      <header>
        <h1>AI-Agent-Auditor Dashboard</h1>
        <p className="muted">API Base: {API_BASE}</p>
      </header>

      <div className="grid">
        <Panel title="1) Sessions">
          <button onClick={loadSessions} disabled={sessionsLoading}>
            {sessionsLoading ? 'Loading...' : 'Refresh Sessions'}
          </button>
          {sessionsError && <p className="error">{sessionsError}</p>}

          <div className="list">
            {sessions.map((session) => (
              <button
                key={session.id}
                className={session.id === selectedSessionId ? 'list-item selected' : 'list-item'}
                onClick={() => setSelectedSessionId(session.id)}
              >
                <span>{session.agent_name}</span>
                <code>{session.id}</code>
              </button>
            ))}
            {!sessionsLoading && sessions.length === 0 && <p className="muted">No sessions found.</p>}
          </div>
        </Panel>

        <Panel title="2) Session Detail + Events">
          {detailLoading && <p className="muted">Loading session detail...</p>}
          {detailError && <p className="error">{detailError}</p>}

          {sessionDetail && (
            <>
              <KeyValue label="Session ID" value={sessionDetail.id} />
              <KeyValue label="Agent" value={sessionDetail.agent_name} />
              <KeyValue label="Model" value={sessionDetail.model_used} />
              <KeyValue label="Status" value={sessionDetail.status} />

              <h3>Events ({events.length})</h3>
              <div className="events">
                {events.map((event) => (
                  <article key={event.id} className="event-card">
                    <div className="event-header">
                      <strong>#{event.sequence_num}</strong>
                      <span>{event.model}</span>
                      <span>{event.latency_ms}ms</span>
                    </div>
                    <p>
                      <strong>Prompt:</strong> {event.prompt}
                    </p>
                    <p>
                      <strong>Response:</strong> {event.response}
                    </p>
                  </article>
                ))}
                {!detailLoading && events.length === 0 && (
                  <p className="muted">No events for selected session.</p>
                )}
              </div>
            </>
          )}
        </Panel>

        <Panel title="3) Flags">
          <button onClick={loadFlags} disabled={flagsLoading || !selectedSessionId}>
            {flagsLoading ? 'Loading...' : 'Refresh Flags'}
          </button>
          {flagsError && <p className="error">{flagsError}</p>}

          <h3>All Flags ({allFlags.length})</h3>
          <div className="compact-list">
            {allFlags.map((flag) => (
              <div key={flag.id}>
                <code>{flag.id}</code> - {flag.severity} - {flag.resolved ? 'resolved' : 'open'}
              </div>
            ))}
            {!flagsLoading && allFlags.length === 0 && <p className="muted">No flags yet.</p>}
          </div>

          <h3>Selected Session Flags ({selectedSessionFlags.length})</h3>
          <div className="compact-list">
            {selectedSessionFlags.map((flag) => (
              <div key={flag.id} className="flag-row">
                <div>
                  <strong>{flag.flag_type}</strong> - {flag.description}
                  <div className="muted">
                    {flag.severity} | {flag.resolved ? 'resolved' : 'open'}
                  </div>
                </div>
                <button
                  onClick={() => resolveFlag(flag.id)}
                  disabled={resolveState.loading || flag.resolved}
                >
                  {flag.resolved ? 'Resolved' : 'Resolve'}
                </button>
              </div>
            ))}
            {!flagsLoading && selectedSessionFlags.length === 0 && (
              <p className="muted">No flags for selected session.</p>
            )}
          </div>
          {resolveState.error && <p className="error">{resolveState.error}</p>}
          {resolveState.message && <p className="success">{resolveState.message}</p>}
        </Panel>

        <Panel title="4) Audit Actions">
          <div className="actions">
            <button onClick={generateAudit} disabled={auditState.loading || !selectedSessionId}>
              {auditState.loading ? 'Generating...' : 'Generate Audit'}
            </button>
            <button onClick={fetchReport} disabled={reportState.loading || !selectedSessionId}>
              {reportState.loading ? 'Fetching...' : 'Fetch Report'}
            </button>
          </div>

          {auditState.error && <p className="error">{auditState.error}</p>}
          {auditState.message && <p className="success">{auditState.message}</p>}
          {reportState.error && <p className="error">{reportState.error}</p>}
          {reportState.message && <p className="success">{reportState.message}</p>}

          {lastReport && (
            <pre className="report-json">{JSON.stringify(lastReport, null, 2)}</pre>
          )}
        </Panel>
      </div>
    </div>
  )
}

export default App

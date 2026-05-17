import { useCallback, useRef } from 'react'
import { apiFetch } from '../api/client'
import {
  AGENTS,
  connectAuditLiveStream,
  initialRunningAgentResults,
  mapAgentKey,
} from '../api/auditStream'

const EVENT_COLORS = {
  audit_start: '#6366f1',
  audit_request: '#6366f1',
  agent_result: '#10b981',
  flag_raised: '#ef4444',
  verdict: '#f1f5f9',
  error: '#ef4444',
}

const AGENT_META = {
  hallucination: { label: 'Hallucination Agent', color: '#ef4444' },
  safety: { label: 'Safety Agent', color: '#f59e0b' },
  cost: { label: 'Cost Agent', color: '#3b82f6' },
  compliance: { label: 'Compliance Agent', color: '#6366f1' },
}

export function useAuditRunner({ auditState, setAuditState, setAuditEventSource }) {
  const esRef = useRef(null)

  const closeStream = useCallback(() => {
    if (esRef.current) {
      esRef.current.close()
      esRef.current = null
    }
    setAuditEventSource(null)
  }, [setAuditEventSource])

  const appendLog = useCallback(
    (type, description) => {
      const ts = new Date().toLocaleTimeString()
      setAuditState((prev) => ({
        ...prev,
        eventLog: [
          { ts, type, description, color: EVENT_COLORS[type] || '#94a3b8' },
          ...(prev.eventLog || []),
        ].slice(0, 120),
      }))
    },
    [setAuditState],
  )

  const appendDebateEntry = useCallback(
    (entry) => {
      setAuditState((prev) => ({
        ...prev,
        debateEntries: [...(prev.debateEntries || []), entry],
      }))
    },
    [setAuditState],
  )

  const applyAgentResult = useCallback(
    (data) => {
      const key = mapAgentKey(data)
      const score = Number(data?.score ?? data?.value ?? data?.overall_score)
      if (!key || !Number.isFinite(score)) return

      const roundedScore = Math.round(score)
      const flagged = Boolean(data?.flagged || data?.flag_created || score < 70)
      const finding = flagged
        ? String(data?.finding || data?.description || `${key} anomaly detected`)
        : 'No anomalies detected'

      setAuditState((prev) => ({
        ...prev,
        agentResults: {
          ...(prev.agentResults || {}),
          [key]: { score: roundedScore, finding, status: 'complete', flagged },
        },
      }))

      const agentName = AGENT_META[key]?.label || key
      appendLog('agent_result', `${agentName} returned score ${roundedScore}/100`)
      appendDebateEntry({
        agent: agentName,
        color: AGENT_META[key]?.color || '#94a3b8',
        score: roundedScore,
        finding,
        timestamp: new Date().toISOString(),
        type: 'agent_result',
      })
    },
    [appendDebateEntry, appendLog, setAuditState],
  )

  const finishAudit = useCallback(
    (normalized) => {
      if (!normalized) return
      const nextResults = {}
      AGENTS.forEach((agent) => {
        const score = Number(normalized?.agent_scores?.[agent] ?? normalized?.scores?.[agent])
        if (Number.isFinite(score)) {
          const flagged = score < 70
          nextResults[agent] = {
            score: Math.round(score),
            finding: flagged ? `${AGENT_META[agent].label} score below threshold` : 'No anomalies detected',
            status: 'complete',
            flagged,
          }
        }
      })

      setAuditState((prev) => ({
        ...prev,
        agentResults: { ...(prev.agentResults || {}), ...nextResults },
        verdict: normalized.verdict || prev.verdict,
        overallScore: Math.round(Number(normalized.overall_score || 0)),
        status: 'complete',
        completedAt: Date.now(),
        error: null,
      }))
      appendLog(
        'verdict',
        `Committee verdict: ${normalized.verdict || 'UNKNOWN'} · Overall score ${Math.round(Number(normalized.overall_score || 0))}/100`,
      )
    },
    [appendLog, setAuditState],
  )

  const runAudit = useCallback(
    async (sessionId, sessionName, sessionEventCount = 0) => {
      if (!sessionId) return

      let alreadyRunning = false
      const runStartedAt = Date.now()
      setAuditState((prev) => {
        if (prev.status === 'running') {
          alreadyRunning = true
          return prev
        }
        return {
          ...prev,
          sessionId,
          sessionName: sessionName || prev.sessionName,
          status: 'running',
          agentResults: initialRunningAgentResults(),
          verdict: null,
          overallScore: null,
          dissentScore: null,
          eventLog: [],
          flagsRaised: [],
          startedAt: runStartedAt,
          completedAt: null,
          error: null,
          eventCount: sessionEventCount,
          debateEntries: [],
        }
      })
      if (alreadyRunning) return

      closeStream()
      appendLog('audit_request', 'Connecting to 4-agent audit stream…')

      const hardTimeout = setTimeout(() => {
        closeStream()
        setAuditState((prev) => ({
          ...prev,
          status: prev.status === 'running' ? 'complete' : prev.status,
          completedAt: Date.now(),
        }))
      }, 120000)

      const es = connectAuditLiveStream(sessionId, {
        onAuditStart: () => {
          appendLog('audit_start', 'Audit committee started · agents analyzing session')
        },
        onAgentResult: (data) => {
          applyAgentResult(data)
        },
        onFlagRaised: (data) => {
          const row = {
            severity: String(data?.severity || 'high'),
            flag_type: String(data?.flag_type || 'compliance'),
            description: String(data?.description || 'Flag raised during audit'),
            timestamp: new Date().toISOString(),
          }
          setAuditState((prev) => ({ ...prev, flagsRaised: [row, ...(prev.flagsRaised || [])] }))
          appendLog('flag_raised', `Flag raised: ${row.severity} ${row.flag_type}`)
        },
        onVerdict: (data) => {
          setAuditState((prev) => ({
            ...prev,
            verdict: data?.verdict || prev.verdict,
            overallScore: Math.round(Number(data?.overall_score ?? prev.overallScore ?? 0)),
          }))
        },
        onComplete: () => {
          clearTimeout(hardTimeout)
          closeStream()
          setAuditState((prev) => ({
            ...prev,
            status: prev.status === 'running' ? 'complete' : prev.status,
            completedAt: Date.now(),
          }))
        },
        onAuditResult: (normalized) => {
          finishAudit(normalized)
          setAuditState((prev) => ({
            ...prev,
            status: 'complete',
            completedAt: Date.now(),
          }))
        },
        onError: (message) => {
          clearTimeout(hardTimeout)
          appendLog('error', message)
          setAuditState((prev) => ({ ...prev, status: 'error', error: message, completedAt: Date.now() }))
          closeStream()
        },
        onStreamError: () => {
          setAuditState((prev) => {
            if (prev.status === 'complete' || prev.status === 'error') return prev
            return { ...prev, error: prev.error || 'Stream disconnected' }
          })
        },
      })

      esRef.current = es
      setAuditEventSource(es)

      try {
        const sessionFlags = await apiFetch(`/flags/${sessionId}`).catch(() => [])
        if (Array.isArray(sessionFlags) && sessionFlags.length > 0) {
          setAuditState((prev) => ({
            ...prev,
            flagsRaised: sessionFlags.map((flag) => ({
              severity: flag.severity || 'unknown',
              flag_type: flag.flag_type || 'compliance',
              description: flag.description || flag.flag_type || 'Flag raised',
              timestamp: flag.created_at || new Date().toISOString(),
            })),
          }))
        }
      } catch {
        // non-fatal
      }
    },
    [appendLog, applyAgentResult, closeStream, finishAudit, setAuditEventSource, setAuditState],
  )

  return { runAudit, closeStream }
}

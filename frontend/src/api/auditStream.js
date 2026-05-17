import { getApiBase } from './client'

const AGENTS = ['hallucination', 'safety', 'cost', 'compliance']

export function mapAgentKey(payload) {
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

/**
 * Connect to GET /audit/live/{sessionId} — runs audit and streams agent progress.
 */
export function connectAuditLiveStream(sessionId, handlers = {}) {
  const apiBase = getApiBase()
  const es = new EventSource(`${apiBase}/audit/live/${encodeURIComponent(sessionId)}`)

  const {
    onAuditStart,
    onAgentResult,
    onFlagRaised,
    onVerdict,
    onComplete,
    onAuditResult,
    onError,
    onStreamError,
  } = handlers

  const parseData = (raw) => {
    try {
      return JSON.parse(raw || '{}')
    } catch {
      return null
    }
  }

  const handlePayload = (payload) => {
    if (!payload) return
    const type = String(payload.type || '')

    if (type === 'audit_start' || type === 'session_start') {
      onAuditStart?.(payload)
      return
    }

    if (type === 'agent_result' || type === 'audit_result') {
      const data = payload.data || payload
      if (type === 'audit_result') {
        onAuditResult?.(data)
        return
      }
      onAgentResult?.(data, payload)
      return
    }

    if (type === 'flag_raised') {
      onFlagRaised?.(payload.data || payload)
      return
    }

    if (type === 'verdict' || type === 'complete') {
      const data = payload.data || payload
      if (type === 'verdict') onVerdict?.(data, payload)
      if (type === 'complete') onComplete?.(data, payload)
      return
    }

    if (type === 'error') {
      onError?.(String(payload.message || payload.error || 'Audit stream error'))
    }
  }

  es.onmessage = (event) => {
    handlePayload(parseData(event.data))
  }

  es.addEventListener('verdict', (event) => {
    const parsed = parseData(event.data)
    const data = parsed?.data || parsed
    onVerdict?.(data, parsed)
  })

  es.addEventListener('complete', () => {
    onComplete?.({ status: 'complete' }, { type: 'complete' })
  })

  es.onerror = () => {
    onStreamError?.()
  }

  return es
}

export function initialRunningAgentResults() {
  return Object.fromEntries(
    AGENTS.map((key) => [key, { score: null, finding: 'Analyzing...', status: 'running', flagged: false }]),
  )
}

export { AGENTS }

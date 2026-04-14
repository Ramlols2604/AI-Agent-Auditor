import { apiFetch } from './client'

export function generateAudit(sessionId) {
  return apiFetch('/audit/generate', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId }),
  })
}

export function getAuditReport(sessionId) {
  return apiFetch(`/audit/report/${sessionId}`)
}

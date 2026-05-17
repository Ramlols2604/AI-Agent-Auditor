import { apiFetch } from './client'

export function getAuditReport(sessionId) {
  return apiFetch(`/audit/report/${sessionId}`)
}

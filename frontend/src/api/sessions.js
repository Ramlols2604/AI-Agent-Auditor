import { apiFetch } from './client'

export function listSessions() {
  return apiFetch('/sessions')
}

export function getSession(sessionId) {
  return apiFetch(`/sessions/${sessionId}`)
}

export function listSessionEvents(sessionId) {
  return apiFetch(`/sessions/${sessionId}/events`)
}

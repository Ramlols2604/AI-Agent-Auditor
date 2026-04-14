import { apiFetch } from './client'

export function listFlags() {
  return apiFetch('/flags')
}

export function listSessionFlags(sessionId) {
  return apiFetch(`/flags/${sessionId}`)
}

export function resolveFlag(flagId, resolved = true) {
  return apiFetch(`/flags/${flagId}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ resolved }),
  })
}

const DEFAULT_API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'
const API_BASE_STORAGE_KEY = 'auditor_api_base_url'

export class RateLimitError extends Error {
  constructor(message, retryAfter = 60, limitType = '') {
    super(message)
    this.name = 'RateLimitError'
    this.retryAfter = retryAfter
    this.limitType = limitType
  }
}

export function getApiBase() {
  const override = typeof window !== 'undefined' ? window.localStorage.getItem(API_BASE_STORAGE_KEY) : null
  return override || DEFAULT_API_BASE
}

export async function apiFetch(path, options = {}) {
  const response = await fetch(`${getApiBase()}${path}`, {
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
    if (response.status === 429) {
      const retryHeader = response.headers.get('Retry-After')
      const retryAfter = Number(retryHeader) || body?.retry_after_seconds || 60
      const detail = body?.detail || 'Rate limit exceeded. Please wait and retry.'
      throw new RateLimitError(detail, retryAfter, body?.limit_type || response.headers.get('X-RateLimit-Type') || '')
    }
    const detail = body?.detail || `Request failed: ${response.status}`
    throw new Error(detail)
  }

  return body
}

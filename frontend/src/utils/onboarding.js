export const ONBOARDING_KEY = 'sentinel_onboarding_complete'

export function isOnboardingComplete() {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === 'true'
  } catch {
    return false
  }
}

export function markOnboardingComplete() {
  try {
    localStorage.setItem(ONBOARDING_KEY, 'true')
  } catch {
    /* ignore */
  }
}

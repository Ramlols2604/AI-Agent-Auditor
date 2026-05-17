const STORAGE_KEY = 'sentinel_notifications_enabled'

export function notificationsEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false'
  } catch {
    return true
  }
}

export function setNotificationsEnabled(enabled) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false')
  } catch {
    /* ignore */
  }
}

export async function requestNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported'
  }
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}

export function showBrowserNotification({ title, body, tag, onClick }) {
  if (!notificationsEnabled()) return
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  if (document.visibilityState === 'visible') return

  try {
    const n = new Notification(title, {
      body,
      tag: tag || title,
      icon: '/favicon.svg',
    })
    if (onClick) {
      n.onclick = () => {
        window.focus()
        onClick()
        n.close()
      }
    }
  } catch {
    /* ignore */
  }
}

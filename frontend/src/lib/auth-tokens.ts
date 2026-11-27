let accessToken: string | null = null
let sessionExpiryListener: (() => void) | null = null
let sessionVersion = 0

const REFRESH_TOKEN_KEY = 'workbench_refresh_token'

export function setTokens(access: string, refresh: string) {
  sessionVersion += 1
  accessToken = access

  try {
    sessionStorage.setItem(REFRESH_TOKEN_KEY, refresh)
  } catch {
    // Storage unavailable: the current in-memory session can still work.
  }
}

export function rotateTokens(access: string, refresh: string, expectedVersion: number, expectedRefresh: string): boolean {
  if (sessionVersion !== expectedVersion || getRefreshToken() !== expectedRefresh) return false
  try { sessionStorage.setItem(REFRESH_TOKEN_KEY, refresh) } catch { return false }
  accessToken = access
  return true
}

export function getAccessToken() {
  return accessToken
}

export function getRefreshToken(): string | null {
  try {
    return sessionStorage.getItem(REFRESH_TOKEN_KEY)
  } catch {
    return null
  }
}

export function clearTokens() {
  sessionVersion += 1
  accessToken = null

  try {
    sessionStorage.removeItem(REFRESH_TOKEN_KEY)
  } catch {
    // Nothing else is required when storage is unavailable.
  }
}

export function getSessionVersion() {
  return sessionVersion
}

/** Allows transport code to notify the React auth boundary after a confirmed
 * refresh-token rejection, without coupling the Apollo client to React. */
export function onSessionExpired(listener: (() => void) | null) {
  sessionExpiryListener = listener
  return () => { if (sessionExpiryListener === listener) sessionExpiryListener = null }
}

export function notifySessionExpired() {
  sessionExpiryListener?.()
}

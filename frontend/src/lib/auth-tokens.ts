let accessToken: string | null = null

const REFRESH_TOKEN_KEY = 'workbench_refresh_token'

export function setTokens(access: string, refresh: string) {
  accessToken = access

  try {
    sessionStorage.setItem(REFRESH_TOKEN_KEY, refresh)
  } catch {
    // Storage unavailable: the current in-memory session can still work.
  }
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
  accessToken = null

  try {
    sessionStorage.removeItem(REFRESH_TOKEN_KEY)
  } catch {
    // Nothing else is required when storage is unavailable.
  }
}
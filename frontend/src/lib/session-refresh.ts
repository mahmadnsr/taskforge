import { clearTokens, getRefreshToken, getSessionVersion, notifySessionExpired, rotateTokens } from './auth-tokens'

export type RefreshOutcome = 'success' | 'expired' | 'unavailable' | 'stale'
const endpoint = import.meta.env.VITE_GRAPHQL_URL || 'http://localhost:3000/graphql'
type PendingRefresh = { version: number, promise: Promise<RefreshOutcome>, rotatedToken: string | null, logoutHandlesRotation: boolean }
let pending: PendingRefresh | null = null
let refreshedUser: { id: string, name: string, email: string } | null = null
export function getRefreshedUser() { return refreshedUser }

/** Capture the result of a refresh already in flight before invalidating the
 * local session. Logout must revoke a token that rotated before it completed. */
export function pendingRotatedToken(version: number): Promise<string | null> {
  const current = pending?.version === version ? pending : null
  if (!current) return Promise.resolve(null)
  current.logoutHandlesRotation = true
  return new Promise(resolve => {
    // A stalled refresh must not leave logout pending indefinitely. A late
    // rotation falls back to the coordinator's stale-token revocation path.
    const timeout = setTimeout(() => {
      current.logoutHandlesRotation = false
      resolve(null)
    }, 10_000)
    void current.promise.then(() => {
      clearTimeout(timeout)
      resolve(current.rotatedToken)
    })
  })
}

export function refreshSession(expectedVersion = getSessionVersion()): Promise<RefreshOutcome> {
  if (expectedVersion !== getSessionVersion()) return Promise.resolve('stale')
  if (pending?.version === expectedVersion) return pending.promise
  const token = getRefreshToken()
  if (!token) return Promise.resolve('expired')
  const entry: PendingRefresh = { version: expectedVersion, promise: null as unknown as Promise<RefreshOutcome>, rotatedToken: null, logoutHandlesRotation: false }
  const promise = fetch(endpoint, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: 'mutation Refresh($input: RefreshTokenInput!) { refresh(input: $input) { accessToken refreshToken user { id name email } } }', variables: { input: { refreshToken: token } } }),
  }).then(async (response): Promise<RefreshOutcome> => {
    if (response.status >= 500 || response.status === 429) return 'unavailable'
    const result = await response.json() as { data?: { refresh?: { accessToken: string, refreshToken: string, user: { id: string, name: string, email: string } } }, errors?: { extensions?: { code?: string } }[] }
    const payload = result.data?.refresh
    if (payload) {
      entry.rotatedToken = payload.refreshToken
      if (!rotateTokens(payload.accessToken, payload.refreshToken, expectedVersion, token)) {
        // Rotation completed on the server after this browser session ended.
        if (!entry.logoutHandlesRotation) {
          void fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'mutation Logout($input: RefreshTokenInput!) { logout(input: $input) }', variables: { input: { refreshToken: payload.refreshToken } } }) }).catch(() => undefined)
        }
        return 'stale'
      }
      refreshedUser = payload.user
      return 'success'
    }
    if (result.errors?.some(item => item.extensions?.code === 'UNAUTHENTICATED') || response.status === 401) {
      if (expectedVersion !== getSessionVersion() || getRefreshToken() !== token) return 'stale'
      clearTokens(); notifySessionExpired(); return 'expired'
    }
    return 'unavailable'
  }).catch(() => 'unavailable' as const).finally(() => { if (pending?.promise === promise) pending = null })
  entry.promise = promise
  pending = entry
  return promise
}

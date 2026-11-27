import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearTokens, getAccessToken, getRefreshToken, getSessionVersion, onSessionExpired, setTokens } from './auth-tokens'
import { pendingRotatedToken, refreshSession } from './session-refresh'

const payload = (access: string, refresh: string) => ({ ok: true, status: 200, json: async () => ({ data: { refresh: { accessToken: access, refreshToken: refresh, user: { id: 'u1', name: 'User', email: 'u@example.test' } } } }) })
const rejected = () => ({ ok: true, status: 200, json: async () => ({ errors: [{ extensions: { code: 'UNAUTHENTICATED' } }] }) })
let respond: ((value: unknown) => void) | undefined
let expired: ReturnType<typeof vi.fn<() => void>>

beforeEach(() => {
  sessionStorage.clear(); clearTokens(); setTokens('old-access', 'old-refresh')
  expired = vi.fn<() => void>(); onSessionExpired(() => { expired() })
  vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { respond = resolve })))
})
afterEach(() => { onSessionExpired(null); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('single-flight session refresh', () => {
  it('rotates once for concurrent callers', async () => {
    const first = refreshSession(); const second = refreshSession()
    expect(fetch).toHaveBeenCalledOnce()
    respond?.(payload('new-access', 'new-refresh'))
    expect(await Promise.all([first, second])).toEqual(['success', 'success'])
    expect(getAccessToken()).toBe('new-access'); expect(getRefreshToken()).toBe('new-refresh')
  })

  it('clears a confirmed rejected session exactly once', async () => {
    const first = refreshSession(); const second = refreshSession()
    respond?.(rejected())
    expect(await Promise.all([first, second])).toEqual(['expired', 'expired'])
    expect(expired).toHaveBeenCalledOnce(); expect(getAccessToken()).toBeNull(); expect(getRefreshToken()).toBeNull()
  })

  it('keeps valid tokens on network and server failures', async () => {
    const network = refreshSession(); respond?.(Promise.reject(new Error('offline')))
    expect(await network).toBe('unavailable')
    const server = refreshSession(); respond?.({ status: 503 })
    expect(await server).toBe('unavailable')
    expect(getRefreshToken()).toBe('old-refresh'); expect(expired).not.toHaveBeenCalled()
  })

  it('cannot restore a logged-out or replaced session', async () => {
    const old = refreshSession(); clearTokens(); setTokens('other-access', 'other-refresh')
    respond?.(payload('stale-access', 'rotated-old-refresh'))
    expect(await old).toBe('stale')
    expect(getAccessToken()).toBe('other-access'); expect(getRefreshToken()).toBe('other-refresh')
    expect(expired).not.toHaveBeenCalled()
  })

  it('cannot restore a logged-out session after a late rotation', async () => {
    const old = refreshSession(); clearTokens()
    respond?.(payload('stale-access', 'rotated-old-refresh'))
    expect(await old).toBe('stale')
    expect(getAccessToken()).toBeNull(); expect(getRefreshToken()).toBeNull()
    expect(expired).not.toHaveBeenCalled()
  })

  it('hands a late rotated token to logout without issuing duplicate revocation', async () => {
    const old = refreshSession()
    const rotated = pendingRotatedToken(getSessionVersion())
    clearTokens()
    respond?.(payload('stale-access', 'rotated-old-refresh'))
    expect(await old).toBe('stale')
    expect(await rotated).toBe('rotated-old-refresh')
    expect(fetch).toHaveBeenCalledOnce()
    expect(getRefreshToken()).toBeNull()
  })

  it('bounds logout waiting and revokes a rotation that arrives after the timeout', async () => {
    vi.useFakeTimers()
    const old = refreshSession()
    const rotated = pendingRotatedToken(getSessionVersion())
    clearTokens()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await rotated).toBeNull()
    respond?.(payload('stale-access', 'rotated-old-refresh'))
    expect(await old).toBe('stale')
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(getRefreshToken()).toBeNull()
  })

  it('does not restore a session if best-effort stale-token revocation fails', async () => {
    const old = refreshSession()
    clearTokens()
    const fetcher = vi.mocked(fetch)
    fetcher.mockRejectedValueOnce(new Error('revocation unavailable'))
    respond?.(payload('stale-access', 'rotated-old-refresh'))
    expect(await old).toBe('stale')
    expect(getAccessToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
    expect(expired).not.toHaveBeenCalled()
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('ignores an old rejection after a different account logs in', async () => {
    const old = refreshSession(); clearTokens(); setTokens('other-access', 'other-refresh')
    respond?.(rejected())
    expect(await old).toBe('stale')
    expect(getRefreshToken()).toBe('other-refresh'); expect(expired).not.toHaveBeenCalled()
  })
})

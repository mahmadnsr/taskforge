import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearTokens, setTokens } from './auth-tokens'
import { readNotificationStream } from './notification-stream'

afterEach(() => {
  clearTokens()
  vi.unstubAllGlobals()
})

describe('notification stream', () => {
  it('sends the access token only in an Authorization header and consumes sync/change events', async () => {
    setTokens('test-access', 'test-refresh')
    const fetchMock = vi.fn().mockResolvedValue(new Response('event: sync\ndata: {}\n\nevent: changed\ndata: {}\n\n', {
      headers: { 'Content-Type': 'text/event-stream' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const onChange = vi.fn()
    expect(await readNotificationStream(new AbortController().signal, onChange)).toBe('disconnected')
    expect(onChange.mock.calls).toEqual([['sync'], ['changed']])
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).not.toContain('test-access')
    expect(options.headers.Authorization).toBe('Bearer test-access')
    expect(options.cache).toBe('no-store')
  })

  it('recognizes expired authentication without opening a persistent stream', async () => {
    setTokens('expired-access', 'test-refresh')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })))
    expect(await readNotificationStream(new AbortController().signal, vi.fn())).toBe('unauthorized')
  })
})

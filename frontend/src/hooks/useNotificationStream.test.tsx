import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useNotificationStream } from './useNotificationStream'

const mocks = vi.hoisted(() => ({
  read: vi.fn(), refresh: vi.fn(), refetch: vi.fn(),
}))
vi.mock('../auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' }, refreshAccessToken: mocks.refresh }) }))
vi.mock('../lib/notification-stream', () => ({ readNotificationStream: mocks.read }))
vi.mock('../lib/apollo', () => ({ apolloClient: { refetchQueries: mocks.refetch } }))

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('notification stream lifecycle', () => {
  it('reconnects after interruption and aborts the connection on unmount', async () => {
    vi.useFakeTimers()
    mocks.read.mockResolvedValue('disconnected')
    const view = renderHook(() => useNotificationStream())
    await act(async () => { await Promise.resolve() })
    expect(mocks.read).toHaveBeenCalledTimes(1)
    const firstSignal = mocks.read.mock.calls[0][0] as AbortSignal
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(mocks.read).toHaveBeenCalledTimes(2)
    view.unmount()
    expect(firstSignal.aborted).toBe(true)
    await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
    expect(mocks.read).toHaveBeenCalledTimes(2)
  })

  it('refreshes expired access authentication before reconnecting', async () => {
    vi.useFakeTimers()
    mocks.read.mockResolvedValueOnce('unauthorized').mockResolvedValueOnce('disconnected')
    mocks.refresh.mockResolvedValue(true)
    const view = renderHook(() => useNotificationStream())
    await act(async () => { await Promise.resolve() })
    expect(mocks.refresh).toHaveBeenCalledOnce()
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(mocks.read).toHaveBeenCalledTimes(2)
    view.unmount()
  })
})

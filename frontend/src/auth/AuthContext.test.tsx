import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AuthProvider } from './AuthContext'
import { useAuth } from './useAuth'
import { clearTokens, getRefreshToken, setTokens } from '../lib/auth-tokens'

const mocks = vi.hoisted(() => ({
  clearStore: vi.fn(async () => undefined),
  logout: vi.fn<(token: string) => Promise<void>>(async () => undefined),
  login: vi.fn(async () => ({ data: { login: { accessToken: 'other-access', refreshToken: 'other-refresh', user: { id: 'u2', name: 'Other', email: 'other@example.test' } } } })),
}))

vi.mock('../lib/apollo', () => ({ apolloClient: { clearStore: mocks.clearStore } }))
vi.mock('@apollo/client/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@apollo/client/react')>()
  return {
    ...actual,
    useMutation: (document: { definitions: { name?: { value: string } }[] }) => {
      const name = document.definitions.find(item => item.name)?.name?.value
      return [name === 'Logout'
        ? ({ variables }: { variables: { input: { refreshToken: string } } }) => mocks.logout(variables.input.refreshToken)
        : name === 'Login' ? mocks.login
        : vi.fn()]
    },
  }
})

function LogoutButton() {
  const { logout, login } = useAuth()
  return <><button onClick={() => { void logout().catch(() => undefined) }}>Log out</button><button onClick={() => { void login('other@example.test', 'password') }}>Log in</button></>
}

const payload = (refreshToken: string) => ({
  status: 200,
  json: async () => ({ data: { refresh: { accessToken: 'new-access', refreshToken, user: { id: 'u1', name: 'User', email: 'u@example.test' } } } }),
})

let respond: ((value: unknown) => void) | undefined

beforeEach(() => {
  sessionStorage.clear()
  clearTokens()
  setTokens('old-access', 'old-refresh')
  mocks.clearStore.mockClear()
  mocks.logout.mockReset().mockResolvedValue(undefined)
  mocks.login.mockClear()
  vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { respond = resolve })))
})

afterEach(() => { vi.unstubAllGlobals(); clearTokens() })

describe('logout during refresh rotation', () => {
  it('revokes the newly rotated token when logout races refresh', async () => {
    render(<AuthProvider><LogoutButton /></AuthProvider>)
    expect(fetch).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
    expect(mocks.logout).not.toHaveBeenCalled()
    respond?.(payload('rotated-refresh'))
    await waitFor(() => expect(mocks.logout).toHaveBeenCalledWith('rotated-refresh'))
    expect(mocks.logout).toHaveBeenCalledOnce()
    expect(getRefreshToken()).toBeNull()
  })

  it('keeps the browser logged out if rotated-token revocation fails', async () => {
    mocks.logout.mockImplementation(async (token: string) => {
      if (token === 'rotated-refresh') throw new Error('server unavailable')
    })
    render(<AuthProvider><LogoutButton /></AuthProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
    respond?.(payload('rotated-refresh'))
    await waitFor(() => expect(mocks.logout).toHaveBeenCalledOnce())
    expect(getRefreshToken()).toBeNull()
  })

  it('revokes the original token when refresh fails before rotation', async () => {
    render(<AuthProvider><LogoutButton /></AuthProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
    respond?.(Promise.reject(new Error('offline')))
    await waitFor(() => expect(mocks.logout).toHaveBeenCalledWith('old-refresh'))
    expect(mocks.logout).toHaveBeenCalledOnce()
    expect(getRefreshToken()).toBeNull()
  })

  it('does not clear or replace a newer login when an old refresh finishes', async () => {
    render(<AuthProvider><LogoutButton /></AuthProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
    await waitFor(() => expect(getRefreshToken()).toBe('other-refresh'))
    const clearsBeforeOldResponse = mocks.clearStore.mock.calls.length
    respond?.(payload('rotated-refresh'))
    await waitFor(() => expect(mocks.logout).toHaveBeenCalledWith('rotated-refresh'))
    expect(getRefreshToken()).toBe('other-refresh')
    expect(mocks.clearStore).toHaveBeenCalledTimes(clearsBeforeOldResponse)
  })
})

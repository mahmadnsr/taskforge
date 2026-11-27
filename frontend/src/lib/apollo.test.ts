import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gql } from '@apollo/client'
import { apolloClient } from './apollo'
import { clearTokens, getAccessToken, setTokens } from './auth-tokens'

const unauthorized = { errors: [{ message: 'Authentication required', extensions: { code: 'UNAUTHENTICATED' } }] }
const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
const query = gql`query SecureCheck { me { id } }`
const mutation = gql`mutation ChangeSomething { changeSomething }`

beforeEach(async () => { clearTokens(); sessionStorage.clear(); setTokens('old', 'refresh'); await apolloClient.clearStore() })
afterEach(() => { vi.unstubAllGlobals(); clearTokens() })

describe('Apollo authentication retry', () => {
  it('refreshes and retries a read once with the rotated access token', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { operationName?: string }
      calls.push(body.operationName ?? 'refresh')
      if (calls.length === 1) return response(unauthorized)
      if (calls.length === 2) return response({ data: { refresh: { accessToken: 'new', refreshToken: 'rotated', user: { id: 'u', name: 'U', email: 'u@example.test' } } } })
      expect((init.headers as Record<string, string>).authorization).toBe('Bearer new')
      return response({ data: { me: { id: 'u' } } })
    }))
    expect((await apolloClient.query<{ me: { id: string } }>({ query, fetchPolicy: 'no-cache' })).data?.me.id).toBe('u')
    expect(calls).toHaveLength(3)
    expect(getAccessToken()).toBe('new')
  })

  it('never automatically replays a mutation or retries a second auth rejection', async () => {
    const fetcher = vi.fn(async () => response(unauthorized))
    vi.stubGlobal('fetch', fetcher)
    await expect(apolloClient.mutate({ mutation })).rejects.toThrow()
    expect(fetcher).toHaveBeenCalledOnce()
    await expect(apolloClient.query({ query, fetchPolicy: 'no-cache' })).rejects.toThrow()
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
})

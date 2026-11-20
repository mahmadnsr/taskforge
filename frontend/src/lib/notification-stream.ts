import { getAccessToken } from './auth-tokens'

const endpoint = new URL(import.meta.env.VITE_GRAPHQL_URL || 'http://localhost:3000/graphql')
endpoint.pathname = '/notifications/stream'
endpoint.search = ''

export async function readNotificationStream(
  signal: AbortSignal,
  onChange: (kind: 'sync' | 'changed') => void,
): Promise<'unauthorized' | 'disconnected'> {
  const token = getAccessToken()
  if (!token) return 'unauthorized'
  const response = await fetch(endpoint.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
    cache: 'no-store',
    signal,
  })
  if (response.status === 401) return 'unauthorized'
  if (!response.ok || !response.body) return 'disconnected'

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let boundary = buffer.indexOf('\n\n')
      while (boundary >= 0) {
        const event = buffer.slice(0, boundary).replaceAll('\r', '')
        buffer = buffer.slice(boundary + 2)
        const kind = /^event: (sync|changed)$/m.exec(event)?.[1]
        if (kind === 'sync' || kind === 'changed') onChange(kind)
        boundary = buffer.indexOf('\n\n')
      }
      if (buffer.length > 4096) throw new Error('Invalid notification stream')
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  return 'disconnected'
}

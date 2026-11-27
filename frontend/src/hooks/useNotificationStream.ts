import { useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { apolloClient } from '../lib/apollo'
import { readNotificationStream } from '../lib/notification-stream'
import { getSessionVersion } from '../lib/auth-tokens'
import { refreshSession } from '../lib/session-refresh'

export function useNotificationStream() {
  const { user } = useAuth()
  const userId = user?.id
  const [hasUpdate, setHasUpdate] = useState(false)

  useEffect(() => {
    if (!userId) return
    const controller = new AbortController()
    let reconnect: ReturnType<typeof setTimeout> | undefined
    let delay = 1000
    const sessionVersion = getSessionVersion()

    const connect = async () => {
      try {
        const result = await readNotificationStream(controller.signal, (kind) => {
          if (controller.signal.aborted) return
          if (kind === 'changed') setHasUpdate(true)
          void apolloClient.refetchQueries({ include: ['MyNotifications', 'UnreadCount'] })
        })
        if (controller.signal.aborted) return
        if (result === 'unauthorized') {
          const outcome = await refreshSession(sessionVersion)
          if (outcome === 'expired' || outcome === 'stale' || controller.signal.aborted) return
        }
        if (result === 'unauthorized') delay = 1000
      } catch {
        if (controller.signal.aborted) return
      }
      if (!controller.signal.aborted) {
        reconnect = setTimeout(() => void connect(), delay)
        delay = Math.min(delay * 2, 30000)
      }
    }
    void connect()
    return () => {
      controller.abort()
      clearTimeout(reconnect)
    }
  }, [userId])

  return { hasUpdate, clearUpdate: () => setHasUpdate(false) }
}

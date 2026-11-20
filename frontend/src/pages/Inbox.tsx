import { useEffect, useState } from 'react'
import { gql } from '@apollo/client'
import { useMutation, useQuery } from '@apollo/client/react'
import { Link } from 'react-router-dom'
import {
  BellIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ListIcon,
} from '../components/icons'

const MY_ORGANIZATIONS = gql`
  query MyOrganizations {
    myOrganizations {
      id
      name
      slug
    }
  }
`

const MY_NOTIFICATIONS = gql`
  query MyNotifications($input: NotificationsPaginationInput!) {
    myNotifications(input: $input) {
      items {
        id
        organizationId
        taskId
        type
        message
        readAt
        createdAt
      }
      nextCursor
      hasMore
    }
  }
`

const UNREAD_COUNT = gql`
  query UnreadCount($organizationId: String!) {
    unreadNotificationCount(organizationId: $organizationId)
  }
`

const MARK_AS_READ = gql`
  mutation MarkNotificationAsRead($input: MarkNotificationReadInput!) {
    markNotificationAsRead(input: $input) {
      id
      readAt
    }
  }
`

const MARK_ALL_AS_READ = gql`
  mutation MarkAllNotificationsAsRead($input: MarkAllNotificationsReadInput!) {
    markAllNotificationsAsRead(input: $input)
  }
`

type NotificationType =
  | 'TASK_ASSIGNED'
  | 'TASK_STATUS_CHANGED'
  | 'TASK_COMMENTED'
  | 'TASK_DEADLINE_REMINDER'

type Notification = {
  id: string
  organizationId: string
  taskId: string
  type: NotificationType
  message: string
  readAt: string | null
  createdAt: string
}

type NotificationsPage = {
  items: Notification[]
  nextCursor: string | null
  hasMore: boolean
}

type MyNotificationsData = {
  myNotifications: NotificationsPage
}

type UnreadCountData = {
  unreadNotificationCount: number
}

type Organization = {
  id: string
  name: string
  slug: string
}

type MyOrganizationsData = {
  myOrganizations: Organization[]
}

const TYPE_CONFIG: Record<
  NotificationType,
  { label: string; badgeCls: string }
> = {
  TASK_ASSIGNED: {
    label: 'Assigned',
    badgeCls: 'border-teal-500/20 bg-teal-500/10 text-teal-400',
  },
  TASK_STATUS_CHANGED: {
    label: 'Status Change',
    badgeCls: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
  },
  TASK_COMMENTED: {
    label: 'Comment',
    badgeCls: 'border-violet-500/20 bg-violet-500/10 text-violet-400',
  },
  TASK_DEADLINE_REMINDER: {
    label: 'Reminder',
    badgeCls: 'border-amber-500/20 bg-amber-500/10 text-amber-400',
  },
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export default function Inbox() {
  const [selectedOrgId, setSelectedOrgId] = useState('')
  const [filter, setFilter] = useState<'ALL' | 'UNREAD'>('ALL')
  const [errorMsg, setErrorMsg] = useState('')

  const { data: orgsData } =
    useQuery<MyOrganizationsData>(MY_ORGANIZATIONS)

  const orgs = orgsData?.myOrganizations ?? []

  useEffect(() => {
    const syncSelectedOrg = () => {
      if (orgs.length > 0 && !selectedOrgId) {
        setSelectedOrgId(orgs[0].id)
      }
    }
    syncSelectedOrg()
  }, [orgs, selectedOrgId])

  const {
    data: notifData,
    loading: notifLoading,
    error: notifError,
    fetchMore,
    refetch,
  } = useQuery<MyNotificationsData>(MY_NOTIFICATIONS, {
    variables: {
      input: {
        organizationId: selectedOrgId,
        first: 15,
      },
    },
    skip: !selectedOrgId,
    fetchPolicy: 'cache-and-network',
  })

  const { data: unreadData, refetch: refetchUnread } = useQuery<UnreadCountData>(
    UNREAD_COUNT,
    {
      variables: { organizationId: selectedOrgId },
      skip: !selectedOrgId,
      fetchPolicy: 'cache-and-network',
    },
  )

  const [markAsRead, { loading: markingRead }] = useMutation(MARK_AS_READ)
  const [markAllAsRead, { loading: markingAllRead }] =
    useMutation(MARK_ALL_AS_READ)

  const page = notifData?.myNotifications
  const allNotifications = page?.items ?? []
  const unreadCount = unreadData?.unreadNotificationCount ?? 0

  const notifications =
    filter === 'UNREAD'
      ? allNotifications.filter((n) => !n.readAt)
      : allNotifications

  async function handleMarkRead(notificationId: string) {
    if (!selectedOrgId) return
    try {
      await markAsRead({
        variables: {
          input: {
            organizationId: selectedOrgId,
            notificationId,
          },
        },
      })
      await refetch()
      await refetchUnread()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to mark as read')
    }
  }

  async function handleMarkAllRead() {
    if (!selectedOrgId) return
    try {
      await markAllAsRead({
        variables: {
          input: {
            organizationId: selectedOrgId,
          },
        },
      })
      await refetch()
      await refetchUnread()
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to mark all as read',
      )
    }
  }

  async function handleLoadMore() {
    if (!page?.hasMore || !page.nextCursor) return
    await fetchMore({
      variables: {
        input: {
          organizationId: selectedOrgId,
          first: 15,
          after: page.nextCursor,
        },
      },
      updateQuery: (prev, { fetchMoreResult }) => {
        if (!fetchMoreResult) return prev
        return {
          myNotifications: {
            ...fetchMoreResult.myNotifications,
            items: [
              ...prev.myNotifications.items,
              ...fetchMoreResult.myNotifications.items,
            ],
          },
        }
      },
    })
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-400">
            Activity & Updates
          </p>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-[32px] font-light tracking-tight text-white">
              Inbox
            </h1>
            {unreadCount > 0 && (
              <span className="inline-flex items-center rounded-full border border-teal-500/20 bg-teal-500/10 px-2.5 py-0.5 text-xs font-medium text-teal-300">
                {unreadCount} unread
              </span>
            )}
          </div>
          <p className="mt-1 text-[13px] text-zinc-400">
            Real-time notifications about assignments, tasks, and comments.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Org Selector */}
          {orgs.length > 1 && (
            <div className="relative">
              <select
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(e.target.value)}
                className="h-10 appearance-none rounded-xl border border-white/10 bg-[#0a0a0a] pl-4 pr-9 text-xs font-medium text-zinc-200 outline-none transition hover:border-white/20 focus:border-teal-500/50"
              >
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <ChevronDownIcon className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-zinc-400" />
            </div>
          )}

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={markingAllRead}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-xs font-medium text-zinc-200 transition hover:bg-white/10 disabled:opacity-50"
            >
              <CheckCircleIcon className="h-4 w-4 text-teal-400" />
              Mark all as read
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-xs text-rose-300"
        >
          {errorMsg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-white/[0.06]">
        <button
          type="button"
          onClick={() => setFilter('ALL')}
          className={`border-b-2 px-5 py-3 text-xs font-medium transition ${
            filter === 'ALL'
              ? 'border-teal-400 text-white'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          All ({allNotifications.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter('UNREAD')}
          className={`border-b-2 px-5 py-3 text-xs font-medium transition ${
            filter === 'UNREAD'
              ? 'border-teal-400 text-white'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Unread ({unreadCount})
        </button>
      </div>

      {/* Notifications List */}
      {notifLoading && allNotifications.length === 0 ? (
        <div className="grid place-items-center py-20 text-zinc-500">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
          <p className="mt-4 text-xs">Loading notifications…</p>
        </div>
      ) : notifError ? (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-8 text-center">
          <p className="text-sm text-rose-300">{notifError.message}</p>
        </div>
      ) : notifications.length === 0 ? (
        <div className="rounded-3xl border border-white/[0.06] bg-[#0a0a0a] py-20 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-white/5 bg-white/[0.02] text-zinc-600">
            <BellIcon className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-sm font-medium text-zinc-200">
            {filter === 'UNREAD' ? 'No unread notifications' : 'Inbox is empty'}
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            {filter === 'UNREAD'
              ? 'You are all caught up! Switch to All to review past updates.'
              : 'When tasks are assigned, updated, or commented on, you will see notifications here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((item) => {
            const config = TYPE_CONFIG[item.type] ?? {
              label: 'Notification',
              badgeCls: 'border-zinc-500/20 bg-zinc-500/10 text-zinc-400',
            }
            const isUnread = !item.readAt

            return (
              <div
                key={item.id}
                className={`group relative flex flex-col justify-between gap-4 rounded-2xl border p-4 transition duration-200 sm:flex-row sm:items-center ${
                  isUnread
                    ? 'border-white/[0.1] bg-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                    : 'border-white/[0.04] bg-[#080808] opacity-75 hover:opacity-100'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                      isUnread ? 'bg-teal-400 shadow-[0_0_8px_rgba(45,212,191,0.8)]' : 'bg-transparent'
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider ${config.badgeCls}`}
                      >
                        {config.label}
                      </span>
                      <span className="text-[11px] text-zinc-500">
                        {formatDate(item.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[13.5px] leading-relaxed text-zinc-200">
                      {item.message}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
                  <Link
                    to="/tasks"
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 text-[11.5px] font-medium text-zinc-300 transition hover:bg-white/10 hover:text-white"
                  >
                    <ListIcon className="h-3.5 w-3.5" />
                    View task
                  </Link>

                  {isUnread && (
                    <button
                      type="button"
                      onClick={() => handleMarkRead(item.id)}
                      disabled={markingRead}
                      title="Mark as read"
                      className="inline-flex h-8 items-center rounded-lg border border-white/10 px-3 text-[11.5px] font-medium text-zinc-400 transition hover:border-teal-500/40 hover:bg-teal-500/10 hover:text-teal-300 disabled:opacity-50"
                    >
                      Mark read
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          {page?.hasMore && (
            <div className="pt-4 text-center">
              <button
                type="button"
                onClick={handleLoadMore}
                className="rounded-xl border border-white/10 bg-white/5 px-6 py-2.5 text-xs font-medium text-zinc-300 transition hover:bg-white/10"
              >
                Load more notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

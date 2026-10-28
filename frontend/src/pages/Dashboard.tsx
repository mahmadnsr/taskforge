import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { gql } from '@apollo/client'
import { useQuery } from '@apollo/client/react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import {
  AlertIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ClockIcon,
  FolderIcon,
  ListIcon,
  PlayCircleIcon,
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

const DASHBOARD_SUMMARY = gql`
  query DashboardSummary($organizationId: ID!) {
    dashboardSummary(organizationId: $organizationId) {
      totalProjects
      totalTasks
      pendingTasks
      inProgressTasks
      completedTasks
      overdueTasks
    }
  }
`

const ORGANIZATION_PROJECTS = gql`
  query OrganizationProjects(
    $organizationId: ID!
    $includeArchived: Boolean!
  ) {
    projects(
      organizationId: $organizationId
      includeArchived: $includeArchived
    ) {
      id
      name
      description
      status
      createdAt
    }
  }
`

type Organization = {
  id: string
  name: string
  slug: string
}

type DashboardSummary = {
  totalProjects?: number
  totalTasks?: number
  pendingTasks?: number
  inProgressTasks?: number
  completedTasks?: number
  overdueTasks?: number
}

type Project = {
  id: string
  name?: string
  description?: string | null
  status?: string
  createdAt?: string
}

type OrganizationsQueryData = {
  myOrganizations: Organization[]
}

type DashboardSummaryQueryData = {
  dashboardSummary: DashboardSummary
}

type ProjectsQueryData = {
  projects: Project[]
}

type OrganizationVariables = {
  organizationId: string
}

type ProjectsVariables = OrganizationVariables & {
  includeArchived: boolean
}

type Tone = 'default' | 'accent' | 'success' | 'warning' | 'danger'

const toneStyles: Record<Tone, { icon: string; value: string }> = {
  default: {
    icon: 'bg-(--surface-hover) text-(--text-secondary)',
    value: 'text-(--text-primary)',
  },
  accent: {
    icon: 'bg-(--accent-subtle) text-(--accent)',
    value: 'text-(--text-primary)',
  },
  success: {
    icon: 'bg-(--success-bg) text-(--success)',
    value: 'text-(--text-primary)',
  },
  warning: {
    icon: 'bg-(--warning-bg) text-(--warning)',
    value: 'text-(--text-primary)',
  },
  danger: {
    icon: 'bg-(--danger-bg) text-(--danger)',
    value: 'text-(--danger)',
  },
}

function formatDate(value?: string): string {
  if (!value) return 'Date unavailable'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Date unavailable'
  }

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function getGreeting(): string {
  const hour = new Date().getHours()

  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function formatStatus(status?: string): string {
  if (!status) return 'Active'

  const text = status.replace(/_/g, ' ').toLowerCase()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function statusBadgeClass(status?: string): string {
  const value = (status ?? 'ACTIVE').toUpperCase()

  if (value === 'ACTIVE') {
    return 'border-emerald-400/20 bg-(--success-bg) text-(--success)'
  }
  if (value.includes('HOLD') || value.includes('PAUSE')) {
    return 'border-amber-400/20 bg-(--warning-bg) text-(--warning)'
  }
  if (value.includes('COMPLET')) {
    return 'border-(--accent-border) bg-(--accent-subtle) text-(--accent-text)'
  }
  return 'border-(--border) bg-(--surface-hover) text-(--text-secondary)'
}

function Metric({
  label,
  value,
  icon,
  tone = 'default',
}: {
  label: string
  value: number
  icon: ReactNode
  tone?: Tone
}) {
  const styles = toneStyles[tone]

  return (
    <article className="rounded-xl border border-(--border-subtle) bg-(--surface) p-4 transition-colors hover:border-(--border)">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] text-(--text-secondary)">{label}</p>

        <span
          className={`grid size-7 shrink-0 place-items-center rounded-lg ${styles.icon}`}
        >
          {icon}
        </span>
      </div>

      <p
        className={`mt-3 text-2xl font-semibold tracking-tight tabular-nums ${styles.value}`}
      >
        {value.toLocaleString()}
      </p>
    </article>
  )
}

function TaskProgress({ summary }: { summary: DashboardSummary }) {
  const total = summary.totalTasks ?? 0
  const completed = summary.completedTasks ?? 0
  const inProgress = summary.inProgressTasks ?? 0
  const pending = summary.pendingTasks ?? 0

  if (total <= 0) {
    return (
      <p className="mt-4 text-[13px] text-(--text-muted)">
        No tasks in this workspace yet.
      </p>
    )
  }

  const share = (count: number) => Math.min(100, (count / total) * 100)
  const completedPercent = Math.round(share(completed))

  const segments = [
    { label: 'Completed', count: completed, color: 'bg-emerald-400' },
    { label: 'In progress', count: inProgress, color: 'bg-cyan-400' },
    { label: 'Pending', count: pending, color: 'bg-zinc-500' },
  ]

  return (
    <div className="mt-4 rounded-xl border border-(--border-subtle) bg-(--surface) p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[13px] font-medium text-(--text-primary)">
          Task progress
        </p>
        <p className="text-[13px] text-(--text-secondary)">
          {completed.toLocaleString()} of {total.toLocaleString()} completed
          <span className="ml-2 text-(--text-muted)">
            ({completedPercent}%)
          </span>
        </p>
      </div>

      <div
        role="img"
        aria-label={`${completed} completed, ${inProgress} in progress, ${pending} pending out of ${total} tasks`}
        className="mt-3 flex h-2 overflow-hidden rounded-full bg-(--surface-hover)"
      >
        {segments.map((segment) =>
          segment.count > 0 ? (
            <div
              key={segment.label}
              className={segment.color}
              style={{ width: `${share(segment.count)}%` }}
            />
          ) : null,
        )}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-(--text-secondary)">
        {segments.map((segment) => (
          <li key={segment.label} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`size-2 rounded-full ${segment.color}`}
            />
            {segment.label}
            <span className="tabular-nums text-(--text-muted)">
              {segment.count.toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function SectionLoader({ label }: { label: string }) {
  return (
    <div
      className="flex items-center gap-3 py-8 text-sm text-(--text-secondary)"
      role="status"
      aria-live="polite"
    >
      <span
        aria-hidden="true"
        className="size-4 animate-spin rounded-full border-2 border-(--border) border-t-(--accent)"
      />
      {label}
    </div>
  )
}

function ErrorNotice({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-rose-400/20 bg-(--danger-bg) p-4">
      <AlertIcon className="size-4 shrink-0 text-(--danger)" />

      <p role="alert" className="text-[13px] text-(--danger)">
        {message}
      </p>

      <button
        type="button"
        onClick={onRetry}
        className="tf-btn tf-btn-secondary ml-auto min-h-8 px-3 py-1.5 text-xs"
      >
        Try again
      </button>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()

  const [organizationId, setOrganizationId] = useState<string>('')

  const {
    data: organizationsData,
    loading: organizationsLoading,
    error: organizationsError,
    refetch: refetchOrganizations,
  } = useQuery<OrganizationsQueryData>(MY_ORGANIZATIONS, {
    fetchPolicy: 'cache-and-network',
  })

  const organizations = organizationsData?.myOrganizations ?? []

  useEffect(() => {
    if (organizations.length === 0) {
      setOrganizationId('')
      return
    }

    setOrganizationId((currentId) => {
      const exists = organizations.some(
        (organization) => organization.id === currentId,
      )

      if (exists) return currentId

      return organizations[0]?.id ?? ''
    })
  }, [organizations])

  const {
    data: summaryData,
    loading: summaryLoading,
    error: summaryError,
    refetch: refetchSummary,
  } = useQuery<DashboardSummaryQueryData, OrganizationVariables>(
    DASHBOARD_SUMMARY,
    {
      variables: { organizationId },
      skip: !organizationId,
      fetchPolicy: 'cache-and-network',
    },
  )

  const {
    data: projectsData,
    loading: projectsLoading,
    error: projectsError,
    refetch: refetchProjects,
  } = useQuery<ProjectsQueryData, ProjectsVariables>(
    ORGANIZATION_PROJECTS,
    {
      variables: {
        organizationId,
        includeArchived: false,
      },
      skip: !organizationId,
      fetchPolicy: 'cache-and-network',
    },
  )

  const summary = summaryData?.dashboardSummary
  const projects = projectsData?.projects ?? []

  async function handleRetry(): Promise<void> {
    const requests: Promise<unknown>[] = [refetchOrganizations()]

    if (organizationId) {
      requests.push(refetchSummary(), refetchProjects())
    }

    await Promise.allSettled(requests)
  }

  const pageError = summaryError || projectsError
  const visibleProjects = projects.slice(0, 5)

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-semibold tracking-tight text-(--text-primary) sm:text-[28px]">
            {getGreeting()}
            {user?.name ? `, ${user.name}` : ''}
          </h1>

          <p className="mt-1.5 max-w-xl text-sm text-(--text-secondary)">
            Here&apos;s what&apos;s happening across your workspace.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          {!organizationsLoading && organizations.length > 0 && (
            <div className="w-full sm:w-56">
              <label
                htmlFor="organization"
                className="mb-1.5 block text-xs font-medium text-(--text-muted)"
              >
                Workspace
              </label>

              <div className="relative">
                <select
                  id="organization"
                  value={organizationId}
                  onChange={(event) => setOrganizationId(event.target.value)}
                  className="tf-input appearance-none pr-9"
                >
                  {organizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name}
                    </option>
                  ))}
                </select>

                <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-(--text-muted)" />
              </div>
            </div>
          )}

          <Link to="/projects" className="tf-btn tf-btn-primary">
            View projects
            <ArrowRightIcon className="size-4" />
          </Link>
        </div>
      </header>

      {organizationsLoading && organizations.length === 0 ? (
        <SectionLoader label="Loading your workspaces…" />
      ) : organizationsError && organizations.length === 0 ? (
        <div className="mt-10">
          <ErrorNotice
            message="Could not load your workspaces. Please try again."
            onRetry={handleRetry}
          />
        </div>
      ) : organizations.length === 0 ? (
        <section className="mt-10 rounded-xl border border-dashed border-(--border) px-6 py-12 text-center">
          <div className="mx-auto grid size-11 place-items-center rounded-xl bg-(--surface-hover) text-(--text-secondary)">
            <FolderIcon />
          </div>

          <h2 className="mt-4 text-base font-semibold text-(--text-primary)">
            No workspace found
          </h2>

          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-(--text-secondary)">
            Your account is not associated with an organization yet. Once you
            belong to a workspace, its projects and tasks will appear here.
          </p>
        </section>
      ) : (
        <>
          <section aria-labelledby="metrics-heading" className="mt-10">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2
                id="metrics-heading"
                className="text-sm font-semibold text-(--text-primary)"
              >
                Overview
              </h2>

              {summaryLoading && summary && (
                <span role="status" className="text-xs text-(--text-muted)">
                  Updating…
                </span>
              )}
            </div>

            {summaryLoading && !summary ? (
              <SectionLoader label="Loading workspace metrics…" />
            ) : summaryError && !summary ? (
              <ErrorNotice
                message="Could not load workspace metrics."
                onRetry={handleRetry}
              />
            ) : summary ? (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <Metric
                    label="Projects"
                    value={summary.totalProjects ?? 0}
                    icon={<FolderIcon className="size-4" />}
                  />

                  <Metric
                    label="Total tasks"
                    value={summary.totalTasks ?? 0}
                    icon={<ListIcon className="size-4" />}
                  />

                  <Metric
                    label="Pending"
                    value={summary.pendingTasks ?? 0}
                    icon={<ClockIcon className="size-4" />}
                    tone="warning"
                  />

                  <Metric
                    label="In progress"
                    value={summary.inProgressTasks ?? 0}
                    icon={<PlayCircleIcon className="size-4" />}
                    tone="accent"
                  />

                  <Metric
                    label="Completed"
                    value={summary.completedTasks ?? 0}
                    icon={<CheckCircleIcon className="size-4" />}
                    tone="success"
                  />

                  <Metric
                    label="Overdue"
                    value={summary.overdueTasks ?? 0}
                    icon={<AlertIcon className="size-4" />}
                    tone={(summary.overdueTasks ?? 0) > 0 ? 'danger' : 'default'}
                  />
                </div>

                <TaskProgress summary={summary} />
              </>
            ) : null}
          </section>

          <section aria-labelledby="projects-heading" className="mt-12">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h2
                  id="projects-heading"
                  className="text-sm font-semibold text-(--text-primary)"
                >
                  Recent projects
                </h2>

                {projects.length > 0 && (
                  <p className="mt-1 text-xs text-(--text-muted)">
                    Showing {visibleProjects.length} of {projects.length}
                  </p>
                )}
              </div>

              <Link
                to="/projects"
                className="inline-flex items-center gap-1.5 rounded-md text-[13px] font-medium text-(--accent) transition-colors hover:text-(--accent-hover)"
              >
                View all projects
                <ArrowRightIcon className="size-3.5" />
              </Link>
            </div>

            {projectsLoading && !projectsData ? (
              <SectionLoader label="Loading projects…" />
            ) : projectsError && !projectsData ? (
              <ErrorNotice
                message="Could not load projects."
                onRetry={handleRetry}
              />
            ) : projects.length === 0 ? (
              <div className="rounded-xl border border-dashed border-(--border) px-6 py-12 text-center">
                <div className="mx-auto grid size-11 place-items-center rounded-xl bg-(--surface-hover) text-(--text-secondary)">
                  <FolderIcon />
                </div>

                <h3 className="mt-4 text-sm font-semibold text-(--text-primary)">
                  No active projects yet
                </h3>

                <p className="mx-auto mt-2 max-w-md text-[13px] leading-6 text-(--text-secondary)">
                  Your projects will appear here when they are available in
                  this workspace.
                </p>

                <Link
                  to="/projects"
                  className="tf-btn tf-btn-secondary mt-5"
                >
                  Open project management
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-(--border-subtle) overflow-hidden rounded-xl border border-(--border-subtle) bg-(--surface)">
                {visibleProjects.map((project) => {
                  const projectName =
                    project.name?.trim() || 'Untitled project'

                  return (
                    <li
                      key={project.id}
                      className="flex flex-col gap-2 p-4 transition-colors hover:bg-(--surface-hover) sm:flex-row sm:items-start sm:gap-4"
                    >
                      <div className="flex min-w-0 flex-1 gap-3">
                        <span
                          aria-hidden="true"
                          className="grid size-9 shrink-0 place-items-center rounded-lg bg-(--surface-hover) text-sm font-semibold text-(--accent-text)"
                        >
                          {projectName.charAt(0).toUpperCase()}
                        </span>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                            <h3 className="break-words text-sm font-medium text-(--text-primary)">
                              {projectName}
                            </h3>

                            <span
                              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass(
                                project.status,
                              )}`}
                            >
                              {formatStatus(project.status)}
                            </span>
                          </div>

                          {project.description && (
                            <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-(--text-secondary)">
                              {project.description}
                            </p>
                          )}
                        </div>
                      </div>

                      <time
                        dateTime={project.createdAt}
                        className="shrink-0 pl-12 text-xs text-(--text-muted) sm:pl-0 sm:pt-1"
                      >
                        Created {formatDate(project.createdAt)}
                      </time>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {pageError && (summary || projectsData) && (
            <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/20 bg-(--warning-bg) p-4 text-[13px]">
              <AlertIcon className="size-4 shrink-0 text-(--warning)" />

              <p className="text-(--text-secondary)">
                Some workspace data could not be refreshed.
              </p>

              <button
                type="button"
                onClick={handleRetry}
                className="font-medium text-(--accent) hover:text-(--accent-hover)"
              >
                Retry
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
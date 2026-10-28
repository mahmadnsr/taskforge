import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { gql } from '@apollo/client'
import { useQuery } from '@apollo/client/react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import {
  AlertIcon, ArrowRightIcon, CheckCircleIcon, ChevronDownIcon,
  ClockIcon, FolderIcon, ListIcon, PlayCircleIcon,
} from '../components/icons'

const MY_ORGANIZATIONS = gql`
  query MyOrganizations { myOrganizations { id name slug } }
`
const DASHBOARD_SUMMARY = gql`
  query DashboardSummary($organizationId: ID!) {
    dashboardSummary(organizationId: $organizationId) {
      totalProjects totalTasks pendingTasks inProgressTasks completedTasks overdueTasks
    }
  }
`
const ORGANIZATION_PROJECTS = gql`
  query OrganizationProjects($organizationId: ID!, $includeArchived: Boolean!) {
    projects(organizationId: $organizationId, includeArchived: $includeArchived) {
      id name description status createdAt
    }
  }
`

type Organization = { id: string; name: string; slug: string }
type DashboardSummary = {
  totalProjects?: number; totalTasks?: number; pendingTasks?: number
  inProgressTasks?: number; completedTasks?: number; overdueTasks?: number
}
type Project = { id: string; name?: string; description?: string | null; status?: string; createdAt?: string }
type OrganizationsQueryData = { myOrganizations: Organization[] }
type DashboardSummaryQueryData = { dashboardSummary: DashboardSummary }
type ProjectsQueryData = { projects: Project[] }
type OrganizationVariables = { organizationId: string }
type ProjectsVariables = OrganizationVariables & { includeArchived: boolean }
type Tone = 'default' | 'accent' | 'success' | 'warning' | 'danger'

const metricStyles: Record<Tone, { icon: string }> = {
  default: { icon: 'text-stone-400' },
  accent: { icon: 'text-stone-700' },
  success: { icon: 'text-emerald-600' },
  warning: { icon: 'text-amber-600' },
  danger: { icon: 'text-rose-500' },
}

function formatDate(value?: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
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
  if (value === 'ACTIVE') return 'border-emerald-100 bg-emerald-50 text-emerald-700'
  if (value.includes('HOLD') || value.includes('PAUSE')) return 'border-amber-100 bg-amber-50 text-amber-700'
  if (value.includes('COMPLET')) return 'border-stone-200 bg-stone-50 text-stone-600'
  return 'border-stone-200 bg-stone-50 text-stone-500'
}

function Metric({ label, value, icon, tone = 'default' }: {
  label: string; value: number; icon: ReactNode; tone?: Tone
}) {
  return (
    <article className="rounded-lg border border-stone-200 bg-white px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-stone-400">{label}</p>
        <span className={`shrink-0 ${metricStyles[tone].icon}`}>{icon}</span>
      </div>
      <p className="mt-2 text-[20px] font-normal leading-none tracking-tight text-stone-900 tabular-nums">
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
  const overdue = summary.overdueTasks ?? 0

  if (!total) {
    return (
      <div className="mt-4 rounded-lg border border-stone-200 bg-white p-5 text-[12.5px] text-stone-400">
        No tasks in this workspace yet.
      </div>
    )
  }

  const percent = Math.round(Math.min(100, (completed / total) * 100))
  const segments = [
    { label: 'Completed', count: completed, color: 'bg-emerald-500' },
    { label: 'In progress', count: inProgress, color: 'bg-stone-700' },
    { label: 'Pending', count: pending, color: 'bg-stone-300' },
  ]

  return (
    <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(220px,0.6fr)]">
      <section className="rounded-lg border border-stone-200 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-stone-400">Progress</p>
            <h3 className="mt-1 text-[13.5px] font-normal text-stone-900">Work at a glance</h3>
          </div>
          <p className="text-[18px] font-normal text-stone-900 tabular-nums">
            {percent}%
          </p>
        </div>

        <div
          role="img"
          aria-label={`${completed} completed, ${inProgress} in progress, ${pending} pending of ${total}`}
          className="mt-4 flex h-1 overflow-hidden rounded-full bg-stone-100"
        >
          {segments.map((s) =>
            s.count > 0 ? (
              <div
                key={s.label}
                className={s.color}
                style={{ width: `${Math.min(100, (s.count / total) * 100)}%` }}
              />
            ) : null,
          )}
        </div>

        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[11.5px] text-stone-500">
          {segments.map((s) => (
            <li key={s.label} className="flex items-center gap-2">
              <span className={`size-1.5 rounded-full ${s.color}`} />
              <span>{s.label}</span>
              <span className="font-normal text-stone-800 tabular-nums">{s.count.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-stone-200 bg-white p-5">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-amber-700">Overdue</p>
        <p className="mt-2 text-[24px] font-normal leading-none tracking-tight text-stone-900 tabular-nums">
          {overdue.toLocaleString()}
        </p>
        <p className="mt-1 text-[11.5px] text-stone-500">
          {overdue === 1 ? 'task is overdue' : 'tasks are overdue'}
        </p>
        <p className="mt-4 border-t border-stone-100 pt-3 text-[11px] leading-5 text-stone-400">
          Review overdue work and update status as your team progresses.
        </p>
      </section>
    </div>
  )
}

function SectionLoader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-6 text-[12px] text-stone-400" role="status" aria-live="polite">
      <span aria-hidden="true" className="size-3.5 animate-spin rounded-full border-2 border-stone-200 border-t-stone-700" />
      {label}
    </div>
  )
}

function ErrorNotice({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-rose-100 bg-rose-50/60 px-4 py-3">
      <AlertIcon className="size-3.5 shrink-0 text-rose-500" />
      <p role="alert" className="text-[12px] text-rose-700">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="ml-auto rounded-md border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-medium text-rose-700 transition-colors hover:bg-rose-50"
      >
        Try again
      </button>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const [organizationId, setOrganizationId] = useState('')

  const { data: organizationsData, loading: organizationsLoading, error: organizationsError, refetch: refetchOrganizations } = useQuery<OrganizationsQueryData>(MY_ORGANIZATIONS, { fetchPolicy: 'cache-and-network' })
  const organizations = organizationsData?.myOrganizations ?? []

  useEffect(() => {
    if (!organizations.length) { setOrganizationId(''); return }
    setOrganizationId((currentId) => organizations.some((o) => o.id === currentId) ? currentId : organizations[0]?.id ?? '')
  }, [organizations])

  const { data: summaryData, loading: summaryLoading, error: summaryError, refetch: refetchSummary } = useQuery<DashboardSummaryQueryData, OrganizationVariables>(DASHBOARD_SUMMARY, {
    variables: { organizationId }, skip: !organizationId, fetchPolicy: 'cache-and-network',
  })
  const { data: projectsData, loading: projectsLoading, error: projectsError, refetch: refetchProjects } = useQuery<ProjectsQueryData, ProjectsVariables>(ORGANIZATION_PROJECTS, {
    variables: { organizationId, includeArchived: false }, skip: !organizationId, fetchPolicy: 'cache-and-network',
  })

  const summary = summaryData?.dashboardSummary
  const projects = projectsData?.projects ?? []
  const workspaceName = organizations.find((o) => o.id === organizationId)?.name ?? 'Your workspace'

  async function handleRetry(): Promise<void> {
    const requests: Promise<unknown>[] = [refetchOrganizations()]
    if (organizationId) requests.push(refetchSummary(), refetchProjects())
    await Promise.allSettled(requests)
  }

  const pageError = summaryError || projectsError
  const visibleProjects = projects.slice(0, 5)

  return (
    <div className="mx-auto w-full max-w-[1180px] pb-10">
      {/* HERO */}
      <section className="rounded-xl border border-stone-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl">
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-stone-400">
              Workspace overview
            </p>
            <p className="mt-3 text-[12.5px] text-stone-500">
              {getGreeting()}{user?.name ? `, ${user.name}` : ''}
            </p>
            <h1 className="mt-1 text-[20px] font-normal tracking-tight text-stone-900 sm:text-[22px]">
              Make progress, not just plans.
            </h1>
            <p className="mt-2 max-w-md text-[12.5px] leading-6 text-stone-400">
              Your team&apos;s work, projects, and momentum — all in one place.
            </p>
          </div>

          <div className="flex w-full flex-col gap-2.5 sm:flex-row lg:w-auto">
            {!organizationsLoading && organizations.length > 0 && (
              <div className="relative min-w-0 flex-1 lg:w-56 lg:flex-none">
                <select
                  id="organization"
                  value={organizationId}
                  onChange={(event) => setOrganizationId(event.target.value)}
                  className="h-9 w-full appearance-none rounded-md border border-stone-200 bg-white pl-3 pr-8 text-[12.5px] text-stone-800 outline-none transition-colors hover:border-stone-300 focus:border-stone-400"
                  aria-label="Current workspace"
                >
                  {organizations.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
                <ChevronDownIcon className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-stone-400" />
              </div>
            )}
            <Link
              to="/projects"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-stone-900 px-3.5 text-[12.5px] font-medium text-white transition-colors hover:bg-stone-800"
            >
              Projects
              <ArrowRightIcon className="size-3.5" />
            </Link>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-stone-100 pt-4 text-[11.5px] text-stone-400">
          <span className="flex items-center gap-1.5">
            <FolderIcon className="size-3.5 text-stone-400" />
            {summary?.totalProjects ?? (summaryLoading ? '—' : 0)} projects
          </span>
          <span className="hidden h-3 w-px bg-stone-200 sm:block" />
          <span className="flex items-center gap-1.5">
            <ListIcon className="size-3.5 text-stone-400" />
            {summary?.totalTasks ?? (summaryLoading ? '—' : 0)} tasks
          </span>
          <span className="hidden h-3 w-px bg-stone-200 sm:block" />
          <span className="truncate text-stone-500">{workspaceName}</span>
        </div>
      </section>

      {organizationsLoading && !organizations.length ? (
        <div className="mt-6"><SectionLoader label="Loading your workspaces…" /></div>
      ) : organizationsError && !organizations.length ? (
        <div className="mt-6"><ErrorNotice message="Could not load your workspaces." onRetry={handleRetry} /></div>
      ) : !organizations.length ? (
        <section className="mt-6 rounded-xl border border-dashed border-stone-300 bg-white/60 px-6 py-12 text-center">
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-stone-400">Getting started</p>
          <h2 className="mt-2 text-[15px] font-normal text-stone-900">No workspace found</h2>
          <p className="mx-auto mt-2 max-w-md text-[12px] leading-5 text-stone-400">
            Your account is not associated with an organization yet.
          </p>
        </section>
      ) : (
        <>
          {/* METRICS */}
          <section aria-labelledby="metrics-heading" className="mt-8">
            <div className="mb-3 flex items-end justify-between gap-3">
              <h2 id="metrics-heading" className="text-[13.5px] font-normal text-stone-900">
                At a glance
              </h2>
              {summaryLoading && summary && (
                <span role="status" className="text-[11px] text-stone-400">Syncing…</span>
              )}
            </div>

            {summaryLoading && !summary ? (
              <SectionLoader label="Loading metrics…" />
            ) : summaryError && !summary ? (
              <ErrorNotice message="Could not load metrics." onRetry={handleRetry} />
            ) : summary ? (
              <>
                <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 2xl:grid-cols-6">
                  <Metric label="Projects" value={summary.totalProjects ?? 0} icon={<FolderIcon className="size-3.5" />} />
                  <Metric label="Total tasks" value={summary.totalTasks ?? 0} icon={<ListIcon className="size-3.5" />} />
                  <Metric label="Pending" value={summary.pendingTasks ?? 0} icon={<ClockIcon className="size-3.5" />} tone="warning" />
                  <Metric label="In progress" value={summary.inProgressTasks ?? 0} icon={<PlayCircleIcon className="size-3.5" />} tone="accent" />
                  <Metric label="Completed" value={summary.completedTasks ?? 0} icon={<CheckCircleIcon className="size-3.5" />} tone="success" />
                  <Metric label="Overdue" value={summary.overdueTasks ?? 0} icon={<AlertIcon className="size-3.5" />} tone={(summary.overdueTasks ?? 0) > 0 ? 'danger' : 'default'} />
                </div>
                <TaskProgress summary={summary} />
              </>
            ) : null}
          </section>

          {/* PROJECTS */}
          <section aria-labelledby="projects-heading" className="mt-8">
            <div className="mb-3 flex items-end justify-between gap-3">
              <h2 id="projects-heading" className="text-[13.5px] font-normal text-stone-900">
                Recent projects
              </h2>
              <Link
                to="/projects"
                className="inline-flex items-center gap-1 text-[11.5px] font-medium text-stone-500 transition-colors hover:text-stone-900"
              >
                View all
                <ArrowRightIcon className="size-3" />
              </Link>
            </div>

            {projectsLoading && !projectsData ? (
              <SectionLoader label="Loading projects…" />
            ) : projectsError && !projectsData ? (
              <ErrorNotice message="Could not load projects." onRetry={handleRetry} />
            ) : !projects.length ? (
              <div className="rounded-xl border border-dashed border-stone-300 bg-white/60 px-6 py-12 text-center">
                <h3 className="text-[13.5px] font-normal text-stone-900">No projects yet</h3>
                <p className="mx-auto mt-1.5 max-w-md text-[12px] leading-5 text-stone-400">
                  Create one to bring your team&apos;s work together.
                </p>
                <Link
                  to="/projects"
                  className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-md bg-stone-900 px-3 text-[11.5px] font-medium text-white transition-colors hover:bg-stone-800"
                >
                  Go to projects
                  <ArrowRightIcon className="size-3" />
                </Link>
              </div>
            ) : (
              <ul className="grid gap-2.5 md:grid-cols-2 2xl:grid-cols-3">
                {visibleProjects.map((project) => {
                  const name = project.name?.trim() || 'Untitled project'
                  return (
                    <li
                      key={project.id}
                      className="flex flex-col rounded-lg border border-stone-200 bg-white p-4 transition-colors hover:border-stone-300"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="min-w-0 flex-1 truncate text-[13px] font-normal text-stone-900">
                          {name}
                        </h3>
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9.5px] font-medium uppercase tracking-[0.06em] ${statusBadgeClass(project.status)}`}>
                          {formatStatus(project.status)}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-2 min-h-[36px] text-[12px] leading-[18px] text-stone-400">
                        {project.description?.trim() || 'A shared space for your team to organize work.'}
                      </p>
                      <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-3 text-[11px] text-stone-400">
                        <span>Created {formatDate(project.createdAt)}</span>
                        <ArrowRightIcon className="size-3" />
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {pageError && (summary || projectsData) && (
            <div className="mt-5 flex flex-wrap items-center gap-2 rounded-lg border border-amber-100 bg-amber-50/60 px-4 py-2.5 text-[11.5px]">
              <AlertIcon className="size-3.5 shrink-0 text-amber-600" />
              <p className="text-amber-800">Some data could not be refreshed.</p>
              <button
                type="button"
                onClick={handleRetry}
                className="ml-auto rounded-md px-2 py-0.5 font-medium text-amber-800 transition-colors hover:bg-amber-100/60"
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
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { gql } from '@apollo/client'
import { useQuery } from '@apollo/client/react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { EmployeeAnalyticsPanel, ProjectAnalyticsPanel } from './AnalyticsPanels'
import './workspace-pages.css'
import './Dashboard.css'
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

const metricStyles: Record<Tone, { icon: string, bg: string, shadow: string }> = {
  default: { icon: 'text-zinc-300', bg: 'bg-zinc-500/10', shadow: 'group-hover:shadow-[0_0_20px_rgba(161,161,170,0.15)]' },
  accent: { icon: 'text-teal-400', bg: 'bg-teal-500/10', shadow: 'group-hover:shadow-[0_0_20px_rgba(20,184,166,0.2)]' },
  success: { icon: 'text-emerald-400', bg: 'bg-emerald-500/10', shadow: 'group-hover:shadow-[0_0_20px_rgba(16,185,129,0.2)]' },
  warning: { icon: 'text-amber-400', bg: 'bg-amber-500/10', shadow: 'group-hover:shadow-[0_0_20px_rgba(245,158,11,0.2)]' },
  danger: { icon: 'text-rose-400', bg: 'bg-rose-500/10', shadow: 'group-hover:shadow-[0_0_20px_rgba(244,63,94,0.2)]' },
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
  if (value === 'ACTIVE') return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.1)]'
  if (value.includes('HOLD') || value.includes('PAUSE')) return 'border-amber-500/20 bg-amber-500/10 text-amber-400'
  if (value.includes('COMPLET')) return 'border-zinc-500/20 bg-zinc-500/10 text-zinc-300'
  return 'border-white/10 bg-white/5 text-zinc-400'
}

function Metric({ label, value, icon, tone = 'default' }: {
  label: string; value: number; icon: ReactNode; tone?: Tone
}) {
  const style = metricStyles[tone]
  return (
    <article className={`dashboard-metric dashboard-tone-${tone} group relative overflow-hidden rounded-3xl p-[1px] transition-all duration-300 hover:-translate-y-1`}>
      <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="dashboard-metric-surface relative h-full rounded-[23px] border border-white/[0.06] bg-[#0a0a0a] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-colors group-hover:bg-[#0c0c0c]">
        <div className="flex items-start justify-between gap-4">
          <p className="dashboard-metric-label text-[10.5px] font-semibold uppercase tracking-[0.16em] text-zinc-500 group-hover:text-zinc-400">{label}</p>
          <span className={`dashboard-metric-icon grid place-items-center rounded-xl p-2.5 ring-1 ring-white/5 transition-all duration-300 group-hover:scale-110 ${style.bg} ${style.icon} ${style.shadow}`}>
            {icon}
          </span>
        </div>
        <p className="dashboard-metric-value mt-4 text-[40px] font-light leading-none tracking-[-0.05em] text-white tabular-nums">
          {value.toLocaleString()}
        </p>
      </div>
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
      <div className="dashboard-empty-progress mt-4 rounded-3xl border border-white/[0.06] bg-[#0a0a0a] p-6 text-[13.5px] font-light text-zinc-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        No tasks in this workspace yet. Progress will appear here soon.
      </div>
    )
  }

  const percent = Math.round(Math.min(100, (completed / total) * 100))
  const segments = [
    { label: 'Completed', count: completed, color: 'bg-emerald-500' },
    { label: 'In progress', count: inProgress, color: 'bg-teal-500' },
    { label: 'Pending', count: pending, color: 'bg-zinc-600' },
  ]

  return (
    <div className="dashboard-progress-grid mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(240px,0.6fr)]">
      <section className="dashboard-progress-card relative overflow-hidden rounded-3xl border border-white/[0.06] bg-[#0a0a0a] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="dashboard-eyebrow text-[10.5px] font-semibold uppercase tracking-[0.16em] text-teal-400/80">Progress</p>
            <h3 className="dashboard-card-title mt-2 text-[18px] font-medium tracking-tight text-white">Root task completion</h3>
          </div>
          <p className="dashboard-progress-value text-[32px] font-light leading-none tracking-[-0.04em] text-white tabular-nums">{percent}%</p>
        </div>
        <div role="img" aria-label={`${completed} completed, ${inProgress} in progress, ${pending} pending of ${total}`} className="dashboard-progress-bar mt-6 flex h-2 overflow-hidden rounded-full bg-zinc-800/50">
          {segments.map((s) =>
            s.count > 0 ? <div key={s.label} className={`${s.color} transition-[width] duration-700 ease-out shadow-[0_0_10px_rgba(0,0,0,0.5)]`} style={{ width: `${Math.min(100, (s.count / total) * 100)}%` }} /> : null,
          )}
        </div>
        <ul className="dashboard-progress-legend mt-6 flex flex-wrap gap-x-8 gap-y-3 text-[13px] font-light tracking-wide text-zinc-400">
          {segments.map((s) => (
            <li key={s.label} className="flex items-center gap-2">
              <span className={`size-2 rounded-full ${s.color}`} />
              <span>{s.label}</span>
              <span className="font-medium text-white tabular-nums">{s.count.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="dashboard-overdue-card relative overflow-hidden rounded-3xl border border-amber-500/10 bg-gradient-to-br from-amber-500/[0.04] to-transparent p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:p-8">
        <div className="absolute -right-6 -top-6 size-32 rounded-full bg-amber-500/10 blur-3xl" />
        <p className="dashboard-eyebrow relative text-[10.5px] font-semibold uppercase tracking-[0.16em] text-amber-500">Overdue</p>
        <p className="dashboard-overdue-value relative mt-3 text-[40px] font-light leading-none tracking-[-0.05em] text-white tabular-nums">{overdue.toLocaleString()}</p>
        <p className="relative mt-2 text-[13.5px] font-light text-zinc-400">{overdue === 1 ? 'task is overdue' : 'tasks are overdue'}</p>
        <p className="relative mt-6 border-t border-white/5 pt-4 text-[12.5px] font-light leading-relaxed text-zinc-500">
          Review overdue work and update status as your team progresses.
        </p>
      </section>
    </div>
  )
}

function SectionLoader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-8 text-[13.5px] font-light tracking-wide text-zinc-500" role="status" aria-live="polite">
      <span className="size-4 animate-spin rounded-full border-2 border-zinc-800 border-t-teal-500" />
      {label}
    </div>
  )
}

function ErrorNotice({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-5 py-3.5 backdrop-blur-md">
      <AlertIcon className="size-4 shrink-0 text-rose-400" />
      <p role="alert" className="text-[13px] font-light text-rose-200">{message}</p>
      <button type="button" onClick={onRetry} className="ml-auto rounded-lg border border-rose-500/30 bg-rose-500/20 px-3 py-1.5 text-[12px] font-medium tracking-wide text-rose-300 transition-colors hover:bg-rose-500/30">
        Try again
      </button>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const [organizationId, setOrganizationId] = useState('')

  const { data: organizationsData, loading: organizationsLoading, error: organizationsError, refetch: refetchOrganizations } = useQuery<OrganizationsQueryData>(MY_ORGANIZATIONS, { fetchPolicy: 'cache-and-network' })
  const organizations = useMemo(() => organizationsData?.myOrganizations ?? [], [organizationsData])

  useEffect(() => {
    const syncOrganizationId = () => {
      if (!organizations.length) {
        setOrganizationId('')
        return
      }
      setOrganizationId((currentId) => organizations.some((o) => o.id === currentId) ? currentId : organizations[0]?.id ?? '')
    }
    syncOrganizationId()
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
    <div className="modern-workspace-page dashboard-page mx-auto w-full max-w-[1440px] pb-12">
      {/* Hero */}
      <section className="dashboard-hero relative overflow-hidden rounded-3xl border border-white/[0.06] bg-[#0a0a0a] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:p-1">

        {/* Deep Emerald + Grid Background */}
        <div className="emerald-bg absolute inset-0" />
        <div className="camo-grid absolute inset-0" />
        <div className="absolute inset-0 bg-gradient-to-br from-teal-500/[0.05] to-transparent" />

        <div className="dashboard-hero-inner relative rounded-[22px] bg-gradient-to-b from-white/[0.02] to-transparent p-6 sm:p-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-xl">
              <p className="dashboard-eyebrow text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-400">Workspace overview</p>
              <p className="dashboard-greeting mt-4 text-[14.5px] font-light tracking-wide text-zinc-400">{getGreeting()}{user?.name ? `, ${user.name}` : ''}</p>
              <h1 className="mt-2 text-[38px] font-medium leading-[1.1] tracking-[-0.04em] text-white sm:text-[42px]">
                Make progress, not just plans.
              </h1>
              <p className="dashboard-description mt-3.5 max-w-md text-[15px] font-light leading-relaxed tracking-wide text-zinc-500">
                Your team&apos;s work, projects, and momentum — all in one place.
              </p>
            </div>

            <div className="dashboard-actions flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
              {!organizationsLoading && organizations.length > 0 && (
                <div className="relative min-w-0 flex-1 lg:w-64 lg:flex-none">
                  <select
                    id="organization"
                    value={organizationId}
                    onChange={(event) => setOrganizationId(event.target.value)}
                    className="h-11 w-full appearance-none rounded-full border border-white/10 bg-[#0a0a0a]/50 pl-5 pr-10 text-[13px] font-medium tracking-wide text-zinc-200 shadow-sm outline-none backdrop-blur-md transition-all hover:border-white/20 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20"
                    aria-label="Current workspace"
                  >
                    {organizations.map((o) => <option key={o.id} value={o.id} className="bg-zinc-900">{o.name}</option>)}
                  </select>
                  <ChevronDownIcon className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
                </div>
              )}
              <Link to="/projects" className="group relative inline-flex h-11 items-center justify-center gap-2 overflow-hidden rounded-xl border border-white/30 bg-gradient-to-b from-white to-zinc-100 px-6 text-[13.5px] font-medium tracking-wide text-zinc-900 shadow-[inset_0_1px_0_rgba(255,255,255,1),0_2px_4px_rgba(0,0,0,0.1)] transition-all hover:-translate-y-0.5 hover:from-white hover:to-white hover:shadow-[inset_0_1px_0_rgba(255,255,255,1),0_4px_8px_rgba(0,0,0,0.15)]">
                <span className="relative z-10 flex items-center gap-2">
                  Projects <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
              </Link>
            </div>
          </div>
          <div className="dashboard-summary-meta relative mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-white/[0.06] pt-6 text-[12.5px] font-light tracking-wide text-zinc-500">
            <span className="flex items-center gap-2"><FolderIcon className="size-4 text-teal-500/70" />{summary?.totalProjects ?? (summaryLoading ? '—' : 0)} projects</span>
            <span className="hidden h-3 w-px bg-white/10 sm:block" />
            <span className="flex items-center gap-2"><ListIcon className="size-4 text-teal-500/70" />{summary?.totalTasks ?? (summaryLoading ? '—' : 0)} tasks</span>
            <span className="hidden h-3 w-px bg-white/10 sm:block" />
            <span className="truncate text-zinc-400">{workspaceName}</span>
          </div>
        </div>
      </section>

      {organizationsLoading && !organizations.length ? (
        <div className="mt-8"><SectionLoader label="Loading your workspaces…" /></div>
      ) : organizationsError && !organizations.length ? (
        <div className="mt-8"><ErrorNotice message="Could not load your workspaces." onRetry={handleRetry} /></div>
      ) : !organizations.length ? (
        <section className="mt-8 rounded-3xl border border-dashed border-white/10 bg-[#0a0a0a] px-6 py-20 text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-2xl border border-white/10 bg-white/5 text-zinc-400"><FolderIcon className="size-7" /></div>
          <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-400">Getting started</p>
          <h2 className="mt-3 text-[22px] font-light tracking-tight text-white">No workspace found</h2>
          <p className="mx-auto mt-2.5 max-w-md text-[14px] font-light leading-relaxed text-zinc-500">Your account is not associated with an organization yet.</p>
        </section>
      ) : (
        <>
          <section aria-labelledby="metrics-heading" className="dashboard-section mt-10">
            <div className="mb-5 flex items-end justify-between gap-3">
              <h2 id="metrics-heading" className="text-[20px] font-medium tracking-tight text-white">At a glance</h2>
              {summaryLoading && summary && <span role="status" className="text-[12.5px] font-light tracking-wide text-zinc-500 animate-pulse">Syncing…</span>}
            </div>

            {summaryLoading && !summary ? (
              <SectionLoader label="Loading metrics…" />
            ) : summaryError && !summary ? (
              <ErrorNotice message="Could not load metrics." onRetry={handleRetry} />
            ) : summary ? (
              <>
                <div className="dashboard-metric-grid grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
                  <Metric label="Projects" value={summary.totalProjects ?? 0} icon={<FolderIcon className="size-4" />} />
                  <Metric label="Total tasks" value={summary.totalTasks ?? 0} icon={<ListIcon className="size-4" />} />
                  <Metric label="Pending" value={summary.pendingTasks ?? 0} icon={<ClockIcon className="size-4" />} tone="warning" />
                  <Metric label="In progress" value={summary.inProgressTasks ?? 0} icon={<PlayCircleIcon className="size-4" />} tone="accent" />
                  <Metric label="Completed" value={summary.completedTasks ?? 0} icon={<CheckCircleIcon className="size-4" />} tone="success" />
                  <Metric label="Overdue" value={summary.overdueTasks ?? 0} icon={<AlertIcon className="size-4" />} tone={(summary.overdueTasks ?? 0) > 0 ? 'danger' : 'default'} />
                </div>
                <TaskProgress summary={summary} />
                {user?.id && <div className="mt-6"><EmployeeAnalyticsPanel organizationId={organizationId} employeeId={user.id} /></div>}
              </>
            ) : null}
          </section>

          {visibleProjects[0] && <section className="dashboard-section mt-10" aria-label="Featured project analytics">
            <h2 className="mb-4 text-[20px] font-medium tracking-tight text-white">{visibleProjects[0].name || 'Project'} health</h2>
            <ProjectAnalyticsPanel organizationId={organizationId} projectId={visibleProjects[0].id} />
          </section>}

          <section aria-labelledby="projects-heading" className="dashboard-section mt-12">
            <div className="mb-5 flex items-end justify-between gap-3">
              <h2 id="projects-heading" className="text-[20px] font-medium tracking-tight text-white">Recent projects</h2>
              <Link to="/projects" className="group inline-flex items-center gap-1.5 text-[13px] font-medium tracking-wide text-teal-400 transition-colors hover:text-teal-300">
                View all <ArrowRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>

            {projectsLoading && !projectsData ? (
              <SectionLoader label="Loading projects…" />
            ) : projectsError && !projectsData ? (
              <ErrorNotice message="Could not load projects." onRetry={handleRetry} />
            ) : !projects.length ? (
              <div className="rounded-3xl border border-dashed border-white/10 bg-[#0a0a0a] px-6 py-20 text-center">
                <div className="mx-auto grid size-14 place-items-center rounded-xl border border-white/10 bg-white/5 text-zinc-400"><FolderIcon className="size-6" /></div>
                <h3 className="mt-6 text-[20px] font-light tracking-tight text-white">No projects yet</h3>
                <p className="mx-auto mt-2.5 max-w-md text-[14px] font-light leading-relaxed text-zinc-500">Create one to bring your team&apos;s work together.</p>
                <Link to="/projects" className="mt-7 inline-flex h-10 items-center gap-2 rounded-xl border border-white/30 bg-gradient-to-b from-white to-zinc-100 px-5 text-[13.5px] font-medium tracking-wide text-zinc-900 shadow-[inset_0_1px_0_rgba(255,255,255,1),0_2px_4px_rgba(0,0,0,0.1)] transition-all hover:-translate-y-0.5 hover:from-white hover:to-white hover:shadow-[inset_0_1px_0_rgba(255,255,255,1),0_4px_8px_rgba(0,0,0,0.15)]">
                  Go to projects <ArrowRightIcon className="size-3.5" />
                </Link>
              </div>
            ) : (
              <ul className="dashboard-project-grid grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {visibleProjects.map((project) => {
                  const name = project.name?.trim() || 'Untitled project'
                  return (
                    <li key={project.id} className="dashboard-project-card group relative overflow-hidden rounded-3xl p-[1px] transition-all duration-300 hover:-translate-y-1">
                      <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                      <div className="dashboard-project-surface relative flex h-full flex-col rounded-[23px] border border-white/[0.06] bg-[#0a0a0a] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-colors group-hover:bg-[#0c0c0c]">

                        {/* Hover Glow Left Line */}
                        <div className="absolute left-0 top-1/2 h-0 w-[2.5px] -translate-y-1/2 rounded-r-full bg-teal-500 opacity-0 shadow-[0_0_12px_rgba(20,184,166,0.8)] transition-all duration-300 group-hover:h-12 group-hover:opacity-100" />

                        <div className="absolute -right-6 -top-6 size-24 rounded-full bg-teal-500/5 blur-2xl transition-all group-hover:bg-teal-500/10" />
                        <div className="relative flex items-start justify-between gap-3">
                          <h3 className="min-w-0 flex-1 truncate text-[15px] font-medium tracking-tight text-zinc-100 group-hover:text-white">{name}</h3>
                          <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest ${statusBadgeClass(project.status)}`}>
                            {formatStatus(project.status)}
                          </span>
                        </div>
                        <p className="relative mt-3 line-clamp-2 min-h-[40px] text-[13px] font-light leading-relaxed text-zinc-500 group-hover:text-zinc-400">
                          {project.description?.trim() || 'A shared space for your team to organize work.'}
                        </p>
                        <div className="relative mt-6 flex items-center justify-between border-t border-white/5 pt-4 text-[11.5px] font-medium tracking-wide text-zinc-500">
                          <span>Created {formatDate(project.createdAt)}</span>
                          <span className="grid size-8 place-items-center rounded-lg bg-white/5 transition-colors group-hover:bg-white/10 group-hover:text-white">
                            <ArrowRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                          </span>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {pageError && (summary || projectsData) && (
            <div className="mt-8 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-5 py-3.5 text-[13px] font-light tracking-wide">
              <AlertIcon className="size-4 shrink-0 text-amber-400" />
              <p className="text-amber-200">Some data could not be refreshed.</p>
              <button type="button" onClick={handleRetry} className="ml-auto rounded-lg px-3 py-1 font-medium text-amber-300 transition-colors hover:bg-amber-500/20">Retry</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

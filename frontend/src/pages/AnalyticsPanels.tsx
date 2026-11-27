import { useState } from 'react'
import { useQuery } from '@apollo/client/react'
import { EMPLOYEE_ANALYTICS, PROJECT_ANALYTICS } from './analytics.graphql'

type EmployeeData = {
  employeeAnalytics: {
    assigned: number; completed: number; pending: number; inProgress: number; overdue: number
    completionRate: number; onTimeCompleted: number; lateCompleted: number; timingUnknown: number
    workloadByProject: { projectId: string; projectName: string; assigned: number; completed: number; overdue: number }[]
  }
}
type ProjectData = {
  projectAnalytics: {
    progress: { taskCount: number; percent: number }
    statusDistribution: { status: string; count: number }[]
    overdueTasks: number; health: string
    memberWorkload: { userId: string; name: string | null; assigned: number; completed: number; overdue: number }[]
    recentActivity: { taskId: string; type: string; actorName: string | null; createdAt: string }[]
  }
}

export function ProgressBar({ percent, label }: { percent: number; label: string }) {
  return <div role="progressbar" aria-label={label} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className="analytics-progress h-2 overflow-hidden rounded-full bg-white/10">
    <div className="h-full bg-teal-500 transition-all" style={{ width: `${percent}%` }} />
  </div>
}

export function EmployeeAnalyticsPanel({ organizationId, employeeId, projectId, title = 'My workload' }: {
  organizationId: string; employeeId: string; projectId?: string; title?: string
}) {
  const { data, loading, error, refetch } = useQuery<EmployeeData>(EMPLOYEE_ANALYTICS, {
    variables: { input: { organizationId, employeeId, projectId: projectId ?? null } },
    skip: !organizationId || !employeeId, fetchPolicy: 'cache-and-network',
  })
  const value = data?.employeeAnalytics
  return <section aria-label={title} className="analytics-panel rounded-3xl border border-white/[0.08] bg-[#0a0a0a] p-5 sm:p-6">
    <h3 className="text-base font-medium text-white">{title}</h3>
    {loading && !value && <p role="status" className="mt-3 text-sm text-zinc-500">Loading employee analytics…</p>}
    {error && <p role="alert" className="mt-3 text-sm text-rose-300">Could not load employee analytics. <button type="button" onClick={() => void refetch()} className="underline">Retry</button></p>}
    {value && <>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {[['Assigned', value.assigned], ['Completed', value.completed], ['Pending', value.pending], ['In progress', value.inProgress], ['Overdue', value.overdue], ['On time', value.onTimeCompleted], ['Late', value.lateCompleted], ['Timing unknown', value.timingUnknown]].map(([label, count]) =>
          <div key={label} className="analytics-stat rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 text-xl text-white">{count}</p></div>)}
      </div>
      <p className="mt-4 text-sm text-zinc-300">Completion rate: {value.completionRate}%</p>
      <ProgressBar percent={value.completionRate} label="Employee completion rate" />
      {value.workloadByProject.length > 0 && <div className="mt-4"><h4 className="text-xs font-medium uppercase tracking-widest text-zinc-500">By project</h4><ul className="mt-2 space-y-1 text-sm text-zinc-300">{value.workloadByProject.map((item) => <li key={item.projectId} className="flex justify-between gap-3"><span className="truncate">{item.projectName}</span><span>{item.completed}/{item.assigned} complete · {item.overdue} overdue</span></li>)}</ul></div>}
      <p className="mt-3 text-xs text-zinc-500">On-time and late counts use recorded completion events. Missing or changed deadlines are counted as unknown.</p>
    </>}
  </section>
}

export function ProjectAnalyticsPanel({ organizationId, projectId, canViewMembers = false }: {
  organizationId: string; projectId: string; canViewMembers?: boolean
}) {
  const [employeeId, setEmployeeId] = useState('')
  const { data, loading, error, refetch } = useQuery<ProjectData>(PROJECT_ANALYTICS, {
    variables: { input: { organizationId, projectId } }, skip: !organizationId || !projectId, fetchPolicy: 'cache-and-network',
  })
  const value = data?.projectAnalytics
  return <section aria-label="Project analytics" className="analytics-panel rounded-3xl border border-white/[0.08] bg-[#0a0a0a] p-5 sm:p-6">
    <h3 className="text-base font-medium text-white">Project analytics</h3>
    {loading && !value && <p role="status" className="mt-3 text-sm text-zinc-500">Loading project analytics…</p>}
    {error && <p role="alert" className="mt-3 text-sm text-rose-300">Could not load project analytics. <button type="button" onClick={() => void refetch()} className="underline">Retry</button></p>}
    {value && <>
      <div className="mt-4 flex items-center justify-between text-sm text-zinc-300"><span>{value.progress.taskCount} root tasks · {value.health.replace('_', ' ').toLowerCase()}</span><span>{value.progress.percent}%</span></div>
      <ProgressBar percent={value.progress.percent} label="Project progress" />
      <p className="mt-3 text-xs text-zinc-500">Progress averages root tasks. Completed tasks count as 100%; otherwise nonempty checklist and subtask percentages share equal weight. An overdue work item marks the project at risk.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div><h4 className="text-xs font-medium uppercase tracking-widest text-zinc-500">Task status</h4><ul className="mt-2 space-y-1 text-sm text-zinc-300">{value.statusDistribution.map((item) => <li key={item.status} className="flex justify-between"><span>{item.status.replace('_', ' ').toLowerCase()}</span><span>{item.count}</span></li>)}</ul><p className="mt-2 text-xs text-rose-300">{value.overdueTasks} overdue work items</p></div>
        <div><h4 className="text-xs font-medium uppercase tracking-widest text-zinc-500">Member workload</h4><ul className="mt-2 space-y-1 text-sm text-zinc-300">{value.memberWorkload.map((item) => <li key={item.userId} className="flex justify-between gap-2"><span className="truncate">{item.name ?? 'Former member'}</span><span>{item.completed}/{item.assigned} · {item.overdue} overdue</span>{canViewMembers && <button type="button" onClick={() => setEmployeeId(item.userId)} className="text-teal-400 underline">Details</button>}</li>)}</ul></div>
      </div>
      {canViewMembers && employeeId && <div className="mt-5"><EmployeeAnalyticsPanel organizationId={organizationId} employeeId={employeeId} projectId={projectId} title="Member analytics" /></div>}
      <div className="mt-5"><h4 className="text-xs font-medium uppercase tracking-widest text-zinc-500">Recent activity</h4>{value.recentActivity.length ? <ul className="mt-2 space-y-2 text-sm text-zinc-300">{value.recentActivity.map((item, index) => <li key={`${item.taskId}-${item.createdAt}-${index}`} className="flex flex-wrap justify-between gap-2"><span>{item.actorName ?? 'Former member'} · {item.type.replaceAll('_', ' ').toLowerCase()}</span><time dateTime={item.createdAt} className="text-zinc-500">{new Date(item.createdAt).toLocaleString()}</time></li>)}</ul> : <p className="mt-2 text-sm text-zinc-500">No recent activity.</p>}</div>
    </>}
  </section>
}

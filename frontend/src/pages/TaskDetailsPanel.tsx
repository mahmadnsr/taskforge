import { useApolloClient, useQuery } from '@apollo/client/react'
import type { DocumentNode } from 'graphql'
import { useEffect, useRef, useState } from 'react'
import {
  ADD_CHECKLIST_ITEM, ASSIGN_SUBTASK, CHANGE_SUBTASK_STATUS, CREATE_SUBTASK,
  DELETE_CHECKLIST_ITEM, DELETE_SUBTASK, REORDER_CHECKLIST_ITEMS,
  SET_CHECKLIST_ITEM_COMPLETED, SUBTASKS, TASK_ACTIVITY, TASK_CHECKLIST, TASK_DETAILS_PROJECT_MEMBERS,
  UPDATE_CHECKLIST_ITEM, UPDATE_SUBTASK,
} from './task-details.graphql'
import { TASK_PROGRESS } from './analytics.graphql'
import { ProgressBar } from './AnalyticsPanels'

type Status = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE'
type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
type Task = {
  id: string; organizationId: string; projectId: string; title: string
  description: string | null; status: Status; priority: Priority
  assigneeId: string | null; dueDate: string | null; parentId?: string | null
}
type ChecklistItem = { id: string; content: string; completed: boolean; position: number }
type Activity = { id: string; actorName: string | null; type: string; details: string; createdAt: string }

const statusLabels: Record<Status, string> = {
  TODO: 'To do', IN_PROGRESS: 'In progress', IN_REVIEW: 'In review', DONE: 'Done',
}
const nextStatuses: Record<Status, Status[]> = {
  TODO: ['IN_PROGRESS'], IN_PROGRESS: ['IN_REVIEW'],
  IN_REVIEW: ['IN_PROGRESS', 'DONE'], DONE: [],
}
const activityLabels: Record<string, string> = {
  TASK_CREATED: 'created the task', TASK_UPDATED: 'updated task details',
  TASK_STATUS_CHANGED: 'changed task status', TASK_ASSIGNED: 'changed assignment',
  TASK_PRIORITY_CHANGED: 'changed priority', TASK_DEADLINE_CHANGED: 'changed deadline',
  SUBTASK_CREATED: 'created a subtask', SUBTASK_UPDATED: 'updated a subtask',
  SUBTASK_STATUS_CHANGED: 'changed subtask status', SUBTASK_COMPLETED: 'completed a subtask',
  SUBTASK_ASSIGNED: 'changed subtask assignment', SUBTASK_PRIORITY_CHANGED: 'changed subtask priority',
  SUBTASK_DEADLINE_CHANGED: 'changed subtask deadline', SUBTASK_DELETED: 'deleted a subtask',
  SUBTASK_ACTIVITY_SNAPSHOT: 'worked on a deleted subtask',
  CHECKLIST_ITEM_CREATED: 'added a checklist item', CHECKLIST_ITEM_UPDATED: 'edited a checklist item',
  CHECKLIST_ITEM_COMPLETED: 'changed checklist completion', CHECKLIST_ITEM_DELETED: 'deleted a checklist item',
}
const inputClass = 'min-h-10 w-full rounded-xl border border-white/10 bg-[#080808] px-3 py-2 text-sm text-zinc-200 outline-none focus:border-teal-500/50'
const buttonClass = 'rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40'

function message(error: unknown) {
  return error instanceof Error ? error.message : 'Please try again.'
}

function activityDetails(value: string) {
  try {
    const details: unknown = JSON.parse(value)
    if (!details || typeof details !== 'object' || Array.isArray(details)) return ''
    const data = details as Record<string, unknown>
    if (typeof data.old === 'string' || typeof data.new === 'string' || typeof data.old === 'boolean' || typeof data.new === 'boolean') {
      return `${String(data.old ?? 'None')} → ${String(data.new ?? 'None')}`
    }
    if (Array.isArray(data.changedFields)) return `Changed: ${data.changedFields.filter((field): field is string => typeof field === 'string').join(', ')}`
    if (typeof data.originalType === 'string') return activityLabels[data.originalType] ?? 'Previous subtask activity'
  } catch { /* Ignore older or malformed details. */ }
  return ''
}

function ActivityTimeline({ organizationId, taskId, refreshKey }: { organizationId: string; taskId: string; refreshKey: number }) {
  const [moreLoading, setMoreLoading] = useState(false)
  const [moreError, setMoreError] = useState('')
  const { data, loading, error, fetchMore, refetch } = useQuery<{
    taskActivity: { items: Activity[]; nextCursor: string | null; hasMore: boolean }
  }>(TASK_ACTIVITY, {
    variables: { input: { organizationId, taskId, first: 10 } },
    fetchPolicy: 'cache-and-network',
  })
  const previousRefresh = useRef(refreshKey)
  useEffect(() => {
    if (previousRefresh.current === refreshKey) return
    previousRefresh.current = refreshKey
    void refetch({ input: { organizationId, taskId, first: 10 } })
  }, [refreshKey, refetch, organizationId, taskId])
  const page = data?.taskActivity
  async function loadMore() {
    if (!page?.nextCursor || moreLoading) return
    setMoreLoading(true)
    setMoreError('')
    try {
      await fetchMore({
        variables: { input: { organizationId, taskId, first: 10, after: page.nextCursor } },
        updateQuery: (previous, { fetchMoreResult }) => {
          if (!fetchMoreResult) return previous
          const existing = previous.taskActivity.items
          const seen = new Set(existing.map((entry) => entry.id))
          return { taskActivity: {
            ...fetchMoreResult.taskActivity,
            items: [...existing, ...fetchMoreResult.taskActivity.items.filter((entry) => !seen.has(entry.id))],
          } }
        },
      })
    } catch (cause) { setMoreError(message(cause)) }
    finally { setMoreLoading(false) }
  }
  return (
    <section aria-label="Activity history" className="space-y-3">
      <h3 className="text-base font-medium text-white">Activity history</h3>
      {loading && !page && <p role="status" className="text-sm text-zinc-500">Loading activity…</p>}
      {error && <p role="alert" className="text-sm text-rose-300">{message(error)}</p>}
      {!loading && !error && page?.items.length === 0 && <p className="text-sm text-zinc-500">No activity yet.</p>}
      <ol className="space-y-3 border-l border-white/10 pl-4">
        {page?.items.map((entry) => (
          <li key={entry.id} className="relative text-sm text-zinc-300 before:absolute before:-left-[21px] before:top-1.5 before:size-2 before:rounded-full before:bg-teal-500">
            <span className="font-medium text-zinc-100">{entry.actorName ?? 'Former team member'}</span>{' '}
            {activityLabels[entry.type] ?? 'updated the task'}
            <time dateTime={entry.createdAt} className="ml-2 text-xs text-zinc-500">{new Date(entry.createdAt).toLocaleString()}</time>
            {activityDetails(entry.details) && <p className="mt-1 break-words text-xs text-zinc-500">{activityDetails(entry.details)}</p>}
          </li>
        ))}
      </ol>
      {moreError && <p role="alert" className="text-sm text-rose-300">{moreError}</p>}
      {page?.hasMore && <button type="button" disabled={moreLoading || loading} onClick={() => void loadMore()} className={buttonClass}>
        {moreLoading ? 'Loading…' : 'Load more activity'}
      </button>}
    </section>
  )
}

export function TaskDetailsPanel({ task, organizationId, role, userId, onClose, onTaskChanged }: {
  task: Task; organizationId: string; role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE' | undefined
  userId: string | undefined; onClose: () => void; onTaskChanged: () => void
}) {
  const client = useApolloClient()
  const canManage = role === 'ADMIN' || role === 'MANAGER'
  const canComplete = canManage || (role === 'EMPLOYEE' && task.assigneeId === userId)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [activityRefresh, setActivityRefresh] = useState(0)
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')
  const [editSubtaskId, setEditSubtaskId] = useState('')
  const [historySubtaskId, setHistorySubtaskId] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editPriority, setEditPriority] = useState<Priority>('MEDIUM')
  const [editDueDate, setEditDueDate] = useState('')
  const [newItem, setNewItem] = useState('')
  const [editItemId, setEditItemId] = useState('')
  const [editItemContent, setEditItemContent] = useState('')
  const scope = { organizationId, taskId: task.id }
  const subtasks = useQuery<{ subtasks: Task[] }>(SUBTASKS, {
    variables: { organizationId, parentId: task.id },
    skip: Boolean(task.parentId), fetchPolicy: 'cache-and-network',
  })
  const checklist = useQuery<{ taskChecklist: { items: ChecklistItem[]; completedCount: number; totalCount: number } }>(TASK_CHECKLIST, {
    variables: { input: scope }, fetchPolicy: 'cache-and-network',
  })
  const taskProgress = useQuery<{ taskProgress: { percent: number; checklistPercent: number; subtasksCompleted: number; subtasksTotal: number; subtaskPercent: number } }>(TASK_PROGRESS, {
    variables: { input: { organizationId, taskId: task.id } }, fetchPolicy: 'cache-and-network',
  })
  const members = useQuery<{ projectMembers: { user: { id: string; name: string } | null }[] }>(TASK_DETAILS_PROJECT_MEMBERS, {
    variables: { organizationId, projectId: task.projectId }, skip: !canManage,
  })

  async function execute(name: string, mutation: DocumentNode, variables: Record<string, unknown>, refresh: 'subtasks' | 'checklist') {
    if (busy) return false
    setBusy(name)
    setError('')
    try {
      await client.mutate({ mutation, variables })
      if (refresh === 'subtasks') {
        await subtasks.refetch()
        onTaskChanged()
      } else await checklist.refetch()
      await taskProgress.refetch()
      setActivityRefresh((value) => value + 1)
      return true
    } catch (cause) {
      setError(message(cause))
      return false
    } finally { setBusy('') }
  }

  const items = [...(checklist.data?.taskChecklist.items ?? [])].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
  const total = checklist.data?.taskChecklist.totalCount ?? 0
  const completed = checklist.data?.taskChecklist.completedCount ?? 0
  const progress = total ? Math.round((completed / total) * 100) : 0
  async function reorder(index: number, direction: -1 | 1) {
    const next = [...items]
    const swap = index + direction
    if (swap < 0 || swap >= next.length) return
    ;[next[index], next[swap]] = [next[swap], next[index]]
    await execute('reorder', REORDER_CHECKLIST_ITEMS, { input: { ...scope, itemIds: next.map((item) => item.id) } }, 'checklist')
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/80 p-3 backdrop-blur-sm sm:p-6" role="presentation">
      <section role="dialog" aria-modal="true" aria-label={`Details for ${task.title}`} className="my-6 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-white/10 bg-[#101012] p-5 shadow-2xl sm:p-8">
        <header className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
          <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-400">Task details</p><h2 className="mt-2 break-words text-xl text-white">{task.title}</h2></div>
          <button type="button" onClick={onClose} className={buttonClass}>Close</button>
        </header>
        {error && <p role="alert" className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}
        <div className="mt-6 space-y-9">
          <section aria-label="Task progress" className="space-y-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
            <div className="flex justify-between text-sm text-zinc-300"><h3>Task progress</h3><span>{taskProgress.data?.taskProgress.percent ?? 0}%</span></div>
            <ProgressBar percent={taskProgress.data?.taskProgress.percent ?? 0} label="Task progress" />
            {taskProgress.loading && !taskProgress.data && <p role="status" className="text-xs text-zinc-500">Loading progress…</p>}
            {taskProgress.error && <p role="alert" className="text-xs text-rose-300">Could not load progress. <button type="button" onClick={() => void taskProgress.refetch()} className="underline">Retry</button></p>}
            {taskProgress.data && <p className="text-xs text-zinc-500">Checklist {taskProgress.data.taskProgress.checklistPercent}% · Subtasks {taskProgress.data.taskProgress.subtasksCompleted}/{taskProgress.data.taskProgress.subtasksTotal} complete ({taskProgress.data.taskProgress.subtaskPercent}%)</p>}
          </section>
          {!task.parentId && <section aria-label="Subtasks" className="space-y-4">
            <h3 className="text-base font-medium text-white">Subtasks</h3>
            {subtasks.loading && !subtasks.data && <p role="status" className="text-sm text-zinc-500">Loading subtasks…</p>}
            {subtasks.error && <p role="alert" className="text-sm text-rose-300">{message(subtasks.error)}</p>}
            {!subtasks.loading && !subtasks.error && !subtasks.data?.subtasks.length && <p className="text-sm text-zinc-500">No subtasks yet.</p>}
            <div className="space-y-3">{subtasks.data?.subtasks.map((child) => (
              <article key={child.id} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="break-words text-sm font-medium text-zinc-100">{child.title}</p><p className="mt-1 text-xs text-zinc-500">{statusLabels[child.status]} · {child.priority.toLowerCase()}</p></div>
                  {canManage && <div className="flex gap-2"><button type="button" disabled={Boolean(busy)} onClick={() => { setEditSubtaskId(child.id); setEditTitle(child.title); setEditDescription(child.description ?? ''); setEditPriority(child.priority); setEditDueDate(child.dueDate?.slice(0, 10) ?? '') }} className={buttonClass}>Edit</button>
                    <button type="button" disabled={Boolean(busy)} onClick={() => { if (window.confirm(`Delete subtask “${child.title}”?`)) void execute('deleteSubtask', DELETE_SUBTASK, { organizationId, subtaskId: child.id }, 'subtasks') }} className={buttonClass}>Delete</button></div>}
                </div>
                {editSubtaskId === child.id && canManage && <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (!editTitle.trim() || editTitle.trim().length > 200 || editDescription.length > 5000) { setError('Check the subtask title and description lengths.'); return } void execute('updateSubtask', UPDATE_SUBTASK, { input: { organizationId, taskId: child.id, title: editTitle.trim(), description: editDescription.trim() || null, priority: editPriority, dueDate: editDueDate ? new Date(`${editDueDate}T12:00:00`).toISOString() : null } }, 'subtasks').then((saved) => { if (saved) setEditSubtaskId('') }) }}>
                  <input aria-label="Subtask title" maxLength={200} value={editTitle} onChange={(event) => setEditTitle(event.target.value)} className={inputClass} />
                  <select aria-label="Subtask priority" value={editPriority} onChange={(event) => setEditPriority(event.target.value as Priority)} className={inputClass}>{(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const).map((value) => <option key={value} value={value}>{value}</option>)}</select>
                  <textarea aria-label="Subtask description" maxLength={5000} value={editDescription} onChange={(event) => setEditDescription(event.target.value)} className={inputClass} />
                  <input aria-label="Subtask due date" type="date" value={editDueDate} onChange={(event) => setEditDueDate(event.target.value)} className={inputClass} />
                  <div className="flex gap-2"><button disabled={Boolean(busy)} className={buttonClass}>Save subtask</button><button type="button" onClick={() => setEditSubtaskId('')} className={buttonClass}>Cancel</button></div>
                </form>}
                <div className="mt-3 flex flex-wrap gap-3">
                  {(canManage || (role === 'EMPLOYEE' && child.assigneeId === userId)) && nextStatuses[child.status].length > 0 && <select aria-label={`Status for ${child.title}`} defaultValue="" disabled={Boolean(busy)} onChange={(event) => { const status = event.target.value as Status; if (nextStatuses[child.status].includes(status)) void execute('status', CHANGE_SUBTASK_STATUS, { input: { organizationId, taskId: child.id, status } }, 'subtasks') }} className={inputClass}><option value="">Change status…</option>{nextStatuses[child.status].map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select>}
                  {canManage && <select aria-label={`Assignee for ${child.title}`} value={child.assigneeId ?? ''} disabled={Boolean(busy) || members.loading || Boolean(members.error)} onChange={(event) => void execute('assign', ASSIGN_SUBTASK, { input: { organizationId, taskId: child.id, assigneeId: event.target.value || null } }, 'subtasks')} className={inputClass}><option value="">Unassigned</option>{members.data?.projectMembers.map(({ user }) => user && <option key={user.id} value={user.id}>{user.name}</option>)}</select>}
                </div>
                <button type="button" onClick={() => setHistorySubtaskId((value) => value === child.id ? '' : child.id)} className={`mt-3 ${buttonClass}`}>
                  {historySubtaskId === child.id ? 'Hide history' : 'View history'}
                </button>
                {historySubtaskId === child.id && <div className="mt-4 border-t border-white/10 pt-4"><ActivityTimeline key={child.id} organizationId={organizationId} taskId={child.id} refreshKey={activityRefresh} /></div>}
              </article>
            ))}</div>
            {members.error && canManage && <p role="alert" className="text-sm text-rose-300">Could not load project assignees: {message(members.error)}</p>}
            {canManage && <form onSubmit={(event) => { event.preventDefault(); const title = newSubtaskTitle.trim(); if (!title || title.length > 200) { setError('Subtask title must be 1 to 200 characters.'); return } void execute('createSubtask', CREATE_SUBTASK, { input: { organizationId, projectId: task.projectId, parentId: task.id, title } }, 'subtasks').then((saved) => { if (saved) setNewSubtaskTitle('') }) }} className="flex flex-col gap-2 sm:flex-row"><input aria-label="New subtask title" value={newSubtaskTitle} maxLength={200} onChange={(event) => setNewSubtaskTitle(event.target.value)} placeholder="Add a subtask…" className={inputClass} /><button disabled={Boolean(busy) || !newSubtaskTitle.trim()} className={buttonClass}>Add subtask</button></form>}
          </section>}

          <section aria-label="Checklist" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-base font-medium text-white">Checklist</h3><span className="text-xs text-zinc-400">{completed}/{total} complete · {progress}%</span></div>
            <div role="progressbar" aria-label="Checklist progress" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-teal-500 transition-all" style={{ width: `${progress}%` }} /></div>
            {checklist.loading && !checklist.data && <p role="status" className="text-sm text-zinc-500">Loading checklist…</p>}
            {checklist.error && <p role="alert" className="text-sm text-rose-300">{message(checklist.error)}</p>}
            {!checklist.loading && !checklist.error && items.length === 0 && <p className="text-sm text-zinc-500">No checklist items yet.</p>}
            <ol className="space-y-2">{items.map((item, index) => <li key={item.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.08] p-3">
              <input type="checkbox" aria-label={`Complete ${item.content}`} checked={item.completed} disabled={!canComplete || Boolean(busy)} onChange={(event) => void execute('completeItem', SET_CHECKLIST_ITEM_COMPLETED, { input: { ...scope, itemId: item.id, completed: event.target.checked } }, 'checklist')} className="accent-teal-500" />
              {editItemId === item.id ? <form className="flex min-w-0 flex-1 gap-2" onSubmit={(event) => { event.preventDefault(); const content = editItemContent.trim(); if (!content || content.length > 500) { setError('Checklist content must be 1 to 500 characters.'); return } void execute('editItem', UPDATE_CHECKLIST_ITEM, { input: { ...scope, itemId: item.id, content } }, 'checklist').then((saved) => { if (saved) setEditItemId('') }) }}><input aria-label="Edit checklist content" className={inputClass} maxLength={500} value={editItemContent} onChange={(event) => setEditItemContent(event.target.value)} /><button disabled={Boolean(busy)} className={buttonClass}>Save</button></form> : <span className={`min-w-0 flex-1 break-words text-sm ${item.completed ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>{item.content}</span>}
              {canManage && <div className="flex gap-1"><button type="button" aria-label={`Move ${item.content} up`} disabled={Boolean(busy) || index === 0} onClick={() => void reorder(index, -1)} className={buttonClass}>↑</button><button type="button" aria-label={`Move ${item.content} down`} disabled={Boolean(busy) || index === items.length - 1} onClick={() => void reorder(index, 1)} className={buttonClass}>↓</button><button type="button" disabled={Boolean(busy)} onClick={() => { setEditItemId(item.id); setEditItemContent(item.content) }} className={buttonClass}>Edit</button><button type="button" disabled={Boolean(busy)} onClick={() => { if (window.confirm('Delete this checklist item?')) void execute('deleteItem', DELETE_CHECKLIST_ITEM, { input: { ...scope, itemId: item.id } }, 'checklist') }} className={buttonClass}>Delete</button></div>}
            </li>)}</ol>
            {canManage && <form onSubmit={(event) => { event.preventDefault(); const content = newItem.trim(); if (!content || content.length > 500) { setError('Checklist content must be 1 to 500 characters.'); return } void execute('addItem', ADD_CHECKLIST_ITEM, { input: { ...scope, content } }, 'checklist').then((saved) => { if (saved) setNewItem('') }) }} className="flex flex-col gap-2 sm:flex-row"><input aria-label="New checklist item" className={inputClass} maxLength={500} value={newItem} onChange={(event) => setNewItem(event.target.value)} placeholder="Add a checklist item…" /><button disabled={Boolean(busy) || !newItem.trim()} className={buttonClass}>Add item</button></form>}
          </section>
          <ActivityTimeline key={task.id} organizationId={organizationId} taskId={task.id} refreshKey={activityRefresh} />
        </div>
      </section>
    </div>
  )
}

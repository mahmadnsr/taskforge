import { gql } from '@apollo/client'
import { useMutation, useQuery } from '@apollo/client/react'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { TaskDetailsPanel } from './TaskDetailsPanel'
import './workspace-pages.css'
import { MY_ORGANIZATIONS, ORGANIZATION_MEMBERS, ORGANIZATION_PROJECTS, SEARCH_PROJECT_TASKS, TASK_PROJECT_MEMBERS } from './tasks.graphql'

type Organization = { id: string; name: string; slug: string }
type Project = { id: string; organizationId: string; name: string; status: string }

type Task = {
  id: string
  organizationId: string
  projectId: string
  parentId?: string | null
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  createdById: string
  assigneeId: string | null
  dueDate: string | null
  createdAt: string
  updatedAt: string
}

type TaskPage = {
  tasks: Task[]
  totalCount: number
  hasNextPage: boolean
  limit: number
  offset: number
}

type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE'
type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'

type OrganizationsData = { myOrganizations: Organization[] }
type OrganizationRole = 'ADMIN' | 'MANAGER' | 'EMPLOYEE'
type OrganizationMember = {
  id?: string
  role: OrganizationRole
  user: {
    id: string
    name: string
    email: string
  }
}
type OrganizationMembersData = { organizationMembers: OrganizationMember[] }
type ProjectsData = { projects: Project[] }
type ProjectMembersData = { projectMembers: { userId: string }[] }
type SearchTasksData = { searchProjectTasks: TaskPage }

type TaskComment = {
  id: string
  content: string
  createdAt: string
  author?: { id: string; name: string }
}

type TaskCommentsPageData = {
  items: TaskComment[]
  nextCursor: string | null
  hasMore: boolean
}

type TaskCommentsData = {
  taskComments: TaskCommentsPageData
}

type SearchTasksVariables = {
  organizationId: string
  projectId: string
  filters: {
    status?: TaskStatus
    priority?: TaskPriority
    search?: string
    sortBy: 'CREATED_AT'
    sortDirection: 'DESC'
    limit: number
    offset: number
  }
}

type CreateTaskVariables = {
  input: {
    organizationId: string
    projectId: string
    title: string
    description?: string | null
    priority: TaskPriority
    dueDate?: string | null
    assigneeId?: string | null
  }
}

type ChangeStatusVariables = {
  input: {
    organizationId: string
    taskId: string
    status: TaskStatus
  }
}

type DeleteTaskVariables = {
  organizationId: string
  taskId: string
}

const CREATE_TASK = gql`
  mutation CreateTask($input: CreateTaskInput!) {
    createTask(input: $input) {
      id
      organizationId
      projectId
      title
      description
      status
      priority
      createdById
      assigneeId
      dueDate
      createdAt
      updatedAt
    }
  }
`

const CHANGE_TASK_STATUS = gql`
  mutation ChangeTaskStatus($input: ChangeTaskStatusInput!) {
    changeTaskStatus(input: $input) {
      id
      organizationId
      projectId
      title
      description
      status
      priority
      createdById
      assigneeId
      dueDate
      createdAt
      updatedAt
    }
  }
`

const DELETE_TASK = gql`
  mutation DeleteTask($organizationId: ID!, $taskId: ID!) {
    deleteTask(organizationId: $organizationId, taskId: $taskId)
  }
`


const UPDATE_TASK = gql`
  mutation UpdateTask($input: UpdateTaskInput!) {
    updateTask(input: $input) {
      id
      title
      description
      priority
      assigneeId
      dueDate
      updatedAt
    }
  }
`


const TASK_COMMENTS = gql`
  query TaskComments($input: TaskCommentsPaginationInput!) {
    taskComments(input: $input) {
      items {
        id
        content
        createdAt
        author {
          id
          name
        }
      }
      nextCursor
      hasMore
    }
  }
`

const CREATE_TASK_COMMENT = gql`
  mutation CreateTaskComment($input: CreateTaskCommentInput!) {
    createTaskComment(input: $input) {
      id
      content
      createdAt
      author {
        id
        name
      }
    }
  }
`

const PAGE_SIZE = 10

const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  IN_REVIEW: 'In review',
  DONE: 'Done',
}

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
}

const STATUS_STYLES: Record<TaskStatus, string> = {
  TODO: 'border-zinc-500/20 bg-zinc-500/10 text-zinc-400',
  IN_PROGRESS:
    'border-teal-500/20 bg-teal-500/10 text-teal-400 shadow-[0_0_10px_rgba(20,184,166,0.1)]',
  IN_REVIEW: 'border-amber-500/20 bg-amber-500/10 text-amber-400',
  DONE:
    'border-emerald-500/20 bg-emerald-500/10 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.1)]',
}

const PRIORITY_STYLES: Record<TaskPriority, string> = {
  LOW: 'text-zinc-400',
  MEDIUM: 'text-sky-400',
  HIGH: 'text-amber-400',
  URGENT: 'text-rose-400',
}

const NEXT_STATUSES: Record<TaskStatus, TaskStatus[]> = {
  TODO: ['IN_PROGRESS'],
  IN_PROGRESS: ['IN_REVIEW'],
  IN_REVIEW: ['IN_PROGRESS', 'DONE'],
  DONE: [],
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Something went wrong. Please try again.'
}

function formatDate(value: string | null): string {
  if (!value) return 'No due date'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return 'Date unavailable'

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function isOverdue(task: Task): boolean {
  if (!task.dueDate || task.status === 'DONE') return false

  const dueDate = new Date(task.dueDate)
  const today = new Date()

  today.setHours(0, 0, 0, 0)
  dueDate.setHours(0, 0, 0, 0)

  return dueDate < today
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}) {
  return (
    <label className="flex min-w-0 flex-col gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
        {label}
      </span>

      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full appearance-none rounded-xl border border-white/[0.08] bg-[#0a0a0a]/60 px-4 text-[13px] font-medium tracking-wide text-zinc-200 shadow-sm outline-none backdrop-blur-md transition-all hover:border-white/20 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20"
      >
        {children}
      </select>
    </label>
  )
}

function TaskModal({
  onClose,
  onCreate,
  saving,
  error,
  members,
  assigneesLoading,
  assigneesError,
}: {
  onClose: () => void
  onCreate: (input: {
    title: string
    description: string
    priority: TaskPriority
    dueDate: string
    assigneeId?: string | null
  }) => Promise<void>
  saving: boolean
  error: string
  members: OrganizationMember[]
  assigneesLoading: boolean
  assigneesError: boolean
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM')
  const [dueDate, setDueDate] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [validationError, setValidationError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const cleanTitle = title.trim()
    const cleanDescription = description.trim()

    const nextErrors: Record<string, string> = {}

    if (!cleanTitle) {
      nextErrors.title = 'Task title is required. Enter a clear, descriptive title.'
    } else if (cleanTitle.length > 200) {
      nextErrors.title = 'Task title must be 200 characters or fewer.'
    }

    if (cleanDescription.length > 5000) {
      nextErrors.description = 'Description must be 5,000 characters or fewer.'
    }

    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    setValidationError('')

    await onCreate({
      title: cleanTitle,
      description: cleanDescription,
      priority,
      dueDate,
      assigneeId: assigneeId || null,
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-md"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-task-title"
        className="my-auto w-full max-w-xl overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0a0a0a] p-1 shadow-2xl"
      >
        <div className="emerald-bg absolute inset-0" />
        <div className="camo-grid-dense absolute inset-0" />

        <div className="relative rounded-[22px] bg-gradient-to-b from-white/[0.02] to-transparent">
          <div className="flex items-start justify-between border-b border-white/[0.06] px-7 py-6">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-400">
                Task management
              </p>

              <h2
                id="create-task-title"
                className="mt-2 text-[22px] font-medium tracking-tight text-white"
              >
                Create a task
              </h2>

              <p className="mt-1.5 text-[13.5px] font-light text-zinc-400">
                Add a task to the selected project.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              aria-label="Close create task dialog"
              className="rounded-lg p-2 text-zinc-500 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 p-7">
            <div>
              <label
                htmlFor="task-title"
                className="mb-2.5 block text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-400"
              >
                Task title <span className="text-rose-500">*</span>
              </label>

              <input
                id="task-title"
                autoFocus
                required
                maxLength={200}
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value)
                  setFieldErrors((old) => ({ ...old, title: '' }))
                }}
                placeholder="e.g. Build the authentication flow"
                aria-invalid={Boolean(fieldErrors.title)}
                aria-describedby={fieldErrors.title ? 'task-title-error' : undefined}
                className={`w-full rounded-xl border ${fieldErrors.title ? 'border-rose-500 focus:border-rose-500' : 'border-white/10'} bg-[#0a0a0a]/50 px-5 py-3 text-[14px] text-zinc-200 placeholder:text-zinc-600 outline-none backdrop-blur-md transition-all hover:border-white/20 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20`}
              />
              {fieldErrors.title && <p id="task-title-error" role="alert" className="mt-2 text-xs text-rose-400">{fieldErrors.title}</p>}
            </div>

            <div>
              <label
                htmlFor="task-description"
                className="mb-2.5 block text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-400"
              >
                Description <span className="text-zinc-600">(optional)</span>
              </label>

              <textarea
                id="task-description"
                rows={4}
                maxLength={5000}
                value={description}
                onChange={(event) => {
                  setDescription(event.target.value)
                  setFieldErrors((old) => ({ ...old, description: '' }))
                }}
                placeholder="Add context, requirements, or acceptance criteria..."
                aria-invalid={Boolean(fieldErrors.description)}
                aria-describedby={fieldErrors.description ? 'task-description-error' : undefined}
                className={`w-full resize-y rounded-2xl border ${fieldErrors.description ? 'border-rose-500 focus:border-rose-500' : 'border-white/10'} bg-[#0a0a0a]/50 px-5 py-4 text-[14px] leading-relaxed text-zinc-200 placeholder:text-zinc-600 outline-none backdrop-blur-md transition-all hover:border-white/20 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20`}
              />
              {fieldErrors.description && <p id="task-description-error" role="alert" className="mt-2 text-xs text-rose-400">{fieldErrors.description}</p>}

              <p className="mt-2 pr-3 text-right text-[11px] font-medium tracking-wide text-zinc-600">
                {description.length}/5000
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Priority"
                value={priority}
                onChange={(value) => setPriority(value as TaskPriority)}
              >
                {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                  <option
                    key={value}
                    value={value}
                    className="bg-zinc-900"
                  >
                    {label}
                  </option>
                ))}
              </Select>

              <label className="flex min-w-0 flex-col gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Due date
                </span>

                <input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  className="h-11 w-full appearance-none rounded-xl border border-white/10 bg-[#0a0a0a]/50 px-4 text-[13px] font-medium text-zinc-200 shadow-sm outline-none backdrop-blur-md transition-all hover:border-white/20 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20"
                />
              </label>
            </div>

            <div>
              <label
                htmlFor="task-assignee"
                className="mb-2.5 block text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-400"
              >
                Assignee <span className="text-zinc-600">(optional)</span>
              </label>
              <select
                id="task-assignee"
                value={assigneeId}
                onChange={(event) => setAssigneeId(event.target.value)}
                disabled={assigneesLoading || assigneesError}
                className="h-11 w-full appearance-none rounded-xl border border-white/10 bg-[#0a0a0a]/50 px-4 text-[13px] font-medium text-zinc-200 outline-none backdrop-blur-md transition-all hover:border-white/20 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20"
              >
                <option value="" className="bg-zinc-900">Unassigned</option>
                {members.map((m) => (
                  <option key={m.user.id} value={m.user.id} className="bg-zinc-900">
                    {m.user.name} ({m.role})
                  </option>
                ))}
              </select>
              {assigneesLoading && <p role="status" className="mt-2 text-xs text-zinc-500">Loading eligible project members…</p>}
              {assigneesError && <p role="alert" className="mt-2 text-xs text-rose-300">Could not load project team. You can create an unassigned task.</p>}
              {!assigneesLoading && !assigneesError && members.length === 0 && <p className="mt-2 text-xs text-zinc-500">Add eligible members in Project Team before assigning tasks.</p>}
            </div>

            {(validationError || error) && (
              <p
                role="alert"
                className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-[13.5px] font-light text-rose-200"
              >
                {validationError || error}
              </p>
            )}

            <div className="flex flex-col-reverse gap-3 border-t border-white/[0.06] pt-6 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-xl border border-white/10 bg-white/5 px-6 py-2.5 text-[13.5px] font-medium tracking-wide text-zinc-300 transition hover:bg-white/10 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving}
                className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-xl border border-white/30 bg-gradient-to-b from-white to-zinc-100 px-6 py-2.5 text-[13.5px] font-medium tracking-wide text-zinc-900 shadow-[inset_0_1px_0_rgba(255,255,255,1),0_2px_4px_rgba(0,0,0,0.1)] transition-all hover:-translate-y-0.5 hover:from-white hover:to-white hover:shadow-[inset_0_1px_0_rgba(255,255,255,1),0_4px_8px_rgba(0,0,0,0.15)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="relative z-10">
                  {saving ? 'Creating task…' : 'Create task'}
                </span>

                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  )
}


function TaskEditModal({
  task,
  organizationId,
  onClose,
  onSaved,
  members,
  canAssign,
}: {
  task: Task
  organizationId: string
  onClose: () => void
  onSaved: () => void
  members: OrganizationMember[]
  canAssign: boolean
}) {
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? '')
  const [priority, setPriority] = useState<TaskPriority>(task.priority)
  const [dueDate, setDueDate] = useState(
    task.dueDate ? task.dueDate.slice(0, 10) : '',
  )
  const [assigneeId, setAssigneeId] = useState(task.assigneeId ?? '')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [updateTask, state] = useMutation(UPDATE_TASK)

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    const nextErrors: Record<string, string> = {}
    if (!title.trim()) {
      nextErrors.title = 'Task title is required.'
    }
    if (description.trim().length > 5000) {
      nextErrors.description = 'Description must be 5,000 characters or fewer.'
    }

    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    try {
      await updateTask({
        variables: {
          input: {
            organizationId,
            taskId: task.id,
            title: title.trim(),
            description: description.trim() || null,
            priority,
            dueDate: dueDate
              ? new Date(`${dueDate}T12:00:00`).toISOString()
              : null,
            assigneeId: assigneeId || null,
          },
        },
      })
      onSaved()
      onClose()
    } catch (cause) {
      setError(getErrorMessage(cause))
    }
  }

  const inputClass =
    'w-full rounded-xl border border-white/10 bg-[#080808] px-4 py-3 text-sm text-zinc-200 outline-none transition focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/10'

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !state.loading) onClose()
      }}
    >
      <form
        onSubmit={(event) => void save(event)}
        className="my-8 w-full max-w-xl rounded-3xl border border-white/10 bg-[#101012] p-6 shadow-2xl sm:p-8"
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-400">
              Task management
            </p>
            <h2 className="mt-2 text-2xl font-light text-white">Edit task</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={state.loading}
            className="rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-400 hover:bg-white/5 disabled:opacity-40"
          >
            Close
          </button>
        </div>

        <div className="space-y-5">
          <label className="block space-y-2">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Title
            </span>
            <input
              autoFocus
              maxLength={200}
              value={title}
              onChange={(event) => {
                setTitle(event.target.value)
                setFieldErrors((old) => ({ ...old, title: '' }))
              }}
              aria-invalid={Boolean(fieldErrors.title)}
              aria-describedby={fieldErrors.title ? 'edit-task-title-error' : undefined}
              className={`${inputClass} ${fieldErrors.title ? 'border-rose-500 focus:border-rose-500' : ''}`}
              required
            />
            {fieldErrors.title && (
              <p id="edit-task-title-error" role="alert" className="text-xs text-rose-400">
                {fieldErrors.title}
              </p>
            )}
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Description
            </span>
            <textarea
              rows={4}
              maxLength={5000}
              value={description}
              onChange={(event) => {
                setDescription(event.target.value)
                setFieldErrors((old) => ({ ...old, description: '' }))
              }}
              aria-invalid={Boolean(fieldErrors.description)}
              aria-describedby={fieldErrors.description ? 'edit-task-description-error' : undefined}
              className={`${inputClass} ${fieldErrors.description ? 'border-rose-500 focus:border-rose-500' : ''}`}
            />
            {fieldErrors.description && (
              <p id="edit-task-description-error" role="alert" className="text-xs text-rose-400">
                {fieldErrors.description}
              </p>
            )}
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                Priority
              </span>
              <select
                value={priority}
                onChange={(event) =>
                  setPriority(event.target.value as TaskPriority)
                }
                className={inputClass}
              >
                {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-2">
              <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                Due date
              </span>
              <input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          {canAssign && (
            <label className="block space-y-2">
              <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                Assignee
              </span>
              <select
                value={assigneeId}
                onChange={(event) => setAssigneeId(event.target.value)}
                className={inputClass}
              >
                <option value="" className="bg-zinc-900">Unassigned</option>
                {members.map((m) => (
                  <option key={m.user.id} value={m.user.id} className="bg-zinc-900">
                    {m.user.name} ({m.role})
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-300">
            {error}
          </p>
        )}

        <div className="mt-7 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={state.loading}
            className="rounded-xl border border-white/10 px-5 py-3 text-sm text-zinc-300 hover:bg-white/5 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={state.loading}
            className="rounded-xl bg-gradient-to-b from-white to-zinc-200 px-5 py-3 text-sm font-semibold text-zinc-900 transition hover:from-white hover:to-white disabled:opacity-50"
          >
            {state.loading ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  )
}

function TaskCommentsPanel({
  task,
  organizationId,
  onClose,
}: {
  task: Task
  organizationId: string
  onClose: () => void
}) {
  const [content, setContent] = useState('')
  const [error, setError] = useState('')
  const [createComment, createState] = useMutation(CREATE_TASK_COMMENT)

  const { data, loading, error: queryError, fetchMore } = useQuery<TaskCommentsData>(TASK_COMMENTS, {
    variables: {
      input: {
        organizationId,
        taskId: task.id,
        first: 10,
      },
    },
    fetchPolicy: 'cache-and-network',
  })

  const page = data?.taskComments
  const comments = page?.items ?? []

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = content.trim()
    if (!trimmed) return

    setError('')
    try {
      await createComment({
        variables: {
          input: {
            organizationId,
            taskId: task.id,
            content: trimmed,
          },
        },
      })
      setContent('')
    } catch (cause) {
      setError(getErrorMessage(cause))
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`Comments for ${task.title}`}
        className="my-8 flex max-h-[85vh] w-full max-w-2xl flex-col rounded-3xl border border-white/10 bg-[#101012] shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-white/[0.06] p-6 sm:p-8">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-400">
              Discussion
            </p>
            <h2 className="mt-2 break-words text-xl font-light text-white">
              {task.title}
            </h2>
            <p className="mt-1 text-sm text-zinc-500">Task comments</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-400 hover:bg-white/5"
          >
            Close
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6 sm:p-8">
          {loading && !page && (
            <p className="text-sm text-zinc-500">Loading comments…</p>
          )}
          {queryError && (
            <p role="alert" className="text-sm text-rose-300">
              {getErrorMessage(queryError)}
            </p>
          )}
          {!loading && comments.length === 0 && !queryError && (
            <p className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">
              No comments yet. Start the conversation.
            </p>
          )}
          {comments.map((comment: TaskComment) => (
            <article
              key={comment.id}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-zinc-200">
                  {comment.author?.name ?? 'Team member'}
                </p>
                <time className="text-xs text-zinc-600">
                  {formatDate(comment.createdAt)}
                </time>
              </div>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-400">
                {comment.content}
              </p>
            </article>
          ))}
          {page?.hasMore && page.nextCursor && (
            <button
              type="button"
              onClick={() =>
                void fetchMore({
                  variables: {
                    input: {
                      organizationId,
                      taskId: task.id,
                      first: 10,
                      after: page.nextCursor,
                    },
                  },
                  updateQuery: (previous: TaskCommentsData, { fetchMoreResult }: { fetchMoreResult: TaskCommentsData }) => {
                    if (!fetchMoreResult) return previous
                    return {
                      ...fetchMoreResult,
                      taskComments: {
                        ...fetchMoreResult.taskComments,
                        items: [
                          ...(previous?.taskComments?.items ?? []),
                          ...(fetchMoreResult.taskComments?.items ?? []),
                        ],
                      },
                    }
                  },
                })
              }
              className="w-full rounded-xl border border-white/10 px-4 py-3 text-sm text-zinc-400 transition hover:bg-white/5"
            >
              Load more comments
            </button>
          )}
        </div>

        <form onSubmit={(event) => void submit(event)} className="border-t border-white/[0.06] p-6 sm:p-8">
          <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
            Add a comment
          </label>
          <textarea
            rows={3}
            maxLength={5000}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Share an update with your team…"
            className="w-full resize-y rounded-xl border border-white/10 bg-[#080808] px-4 py-3 text-sm text-zinc-200 outline-none transition placeholder:text-zinc-600 focus:border-teal-500/50"
          />
          {(error || createState.error) && (
            <p role="alert" className="mt-2 text-sm text-rose-300">
              {error || getErrorMessage(createState.error)}
            </p>
          )}
          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              disabled={!content.trim() || createState.loading}
              className="rounded-xl bg-gradient-to-b from-white to-zinc-200 px-5 py-3 text-sm font-semibold text-zinc-900 transition hover:from-white hover:to-white disabled:opacity-40"
            >
              {createState.loading ? 'Posting…' : 'Post comment'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

export default function Tasks() {
  const { user } = useAuth()
  const [organizationId, setOrganizationId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [offset, setOffset] = useState(0)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [commentsTask, setCommentsTask] = useState<Task | null>(null)
  const [detailsTask, setDetailsTask] = useState<Task | null>(null)
  const [mutationError, setMutationError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim())
      setOffset(0)
    }, 300)

    return () => window.clearTimeout(timer)
  }, [search])

  const {
    data: organizationsData,
    loading: organizationsLoading,
    error: organizationsError,
  } = useQuery<OrganizationsData>(MY_ORGANIZATIONS)

  const organizations = organizationsData?.myOrganizations ?? []

  const selectedOrganizationId = organizations.some(
    (organization) => organization.id === organizationId,
  )
    ? organizationId
    : organizations[0]?.id ?? ''

  const { data: membersData, loading: membersLoading, error: membersError } = useQuery<
    OrganizationMembersData,
    { organizationId: string }
  >(ORGANIZATION_MEMBERS, {
    variables: { organizationId: selectedOrganizationId },
    skip: !selectedOrganizationId,
    fetchPolicy: 'cache-and-network',
  })

  const currentMember = (membersData?.organizationMembers ?? []).find(
    (member) => member.user.id === user?.id,
  )
  const currentRole = !membersLoading && !membersError ? currentMember?.role : undefined
  const canManageTasks = currentRole === 'ADMIN' || currentRole === 'MANAGER'

  const {
    data: projectsData,
    loading: projectsLoading,
    error: projectsError,
  } = useQuery<ProjectsData>(ORGANIZATION_PROJECTS, {
    variables: {
      organizationId: selectedOrganizationId,
      includeArchived: false,
    },
    skip: !selectedOrganizationId,
    fetchPolicy: 'cache-and-network',
  })

  const projects = useMemo(
    () => (projectsData?.projects ?? []).filter((project) => project.status !== 'ARCHIVED'),
    [projectsData?.projects],
  )

  const selectedProjectId = projects.some(
    (project) => project.id === projectId,
  )
    ? projectId
    : projects[0]?.id ?? ''

  const {
    data: projectMembersData,
    loading: projectMembersLoading,
    error: projectMembersError,
  } = useQuery<ProjectMembersData>(TASK_PROJECT_MEMBERS, {
    variables: { organizationId: selectedOrganizationId, projectId: selectedProjectId },
    skip: !canManageTasks || !selectedProjectId,
    fetchPolicy: 'cache-and-network',
  })
  const projectMemberIds = new Set(projectMembersData?.projectMembers.map((member) => member.userId) ?? [])
  const eligibleAssignees = !projectMembersLoading && !projectMembersError
    ? (membersData?.organizationMembers ?? []).filter((member) =>
      projectMemberIds.has(member.user.id) &&
      (currentRole === 'ADMIN' || member.role === 'EMPLOYEE'))
    : []

  const filters: SearchTasksVariables['filters'] = {
    sortBy: 'CREATED_AT',
    sortDirection: 'DESC',
    limit: PAGE_SIZE,
    offset,
    ...(statusFilter ? { status: statusFilter as TaskStatus } : {}),
    ...(priorityFilter ? { priority: priorityFilter as TaskPriority } : {}),
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
  }

  const {
    data: tasksData,
    loading: tasksLoading,
    error: tasksError,
    refetch: refetchTasks,
  } = useQuery<SearchTasksData, SearchTasksVariables>(SEARCH_PROJECT_TASKS, {
    variables: {
      organizationId: selectedOrganizationId,
      projectId: selectedProjectId,
      filters,
    },
    skip: !selectedOrganizationId || !selectedProjectId,
    fetchPolicy: 'cache-and-network',
    notifyOnNetworkStatusChange: true,
  })

  const [createTask, createState] = useMutation<
    { createTask: Task },
    CreateTaskVariables
  >(CREATE_TASK)

  const [changeTaskStatus, statusState] = useMutation<
    { changeTaskStatus: Task },
    ChangeStatusVariables
  >(CHANGE_TASK_STATUS)

  const [deleteTask, deleteState] = useMutation<
    { deleteTask: boolean },
    DeleteTaskVariables
  >(DELETE_TASK)

  const page = tasksData?.searchProjectTasks
  const tasks = useMemo(() => page?.tasks ?? [], [page])
  const totalCount = page?.totalCount ?? 0
  const hasNextPage = page?.hasNextPage ?? false
  const pageNumber = Math.floor(offset / PAGE_SIZE) + 1

  const taskCounts = useMemo(
    () => ({
      TODO: tasks.filter((task) => task.status === 'TODO').length,
      IN_PROGRESS: tasks.filter((task) => task.status === 'IN_PROGRESS').length,
      IN_REVIEW: tasks.filter((task) => task.status === 'IN_REVIEW').length,
      DONE: tasks.filter((task) => task.status === 'DONE').length,
    }),
    [tasks],
  )

  function resetPagination() {
    setOffset(0)
  }

  async function handleCreate(input: {
    title: string
    description: string
    priority: TaskPriority
    dueDate: string
    assigneeId?: string | null
  }) {
    if (!canManageTasks || !selectedProjectId) return
    if (input.assigneeId && !eligibleAssignees.some((member) => member.user.id === input.assigneeId)) {
      setMutationError('Assignee must be an eligible member of this project.')
      return
    }
    setMutationError('')
    setNotice('')

    try {
      await createTask({
        variables: {
          input: {
            organizationId: selectedOrganizationId,
            projectId: selectedProjectId,
            title: input.title,
            description: input.description || undefined,
            priority: input.priority,
            dueDate: input.dueDate
              ? new Date(`${input.dueDate}T12:00:00`).toISOString()
              : undefined,
            assigneeId: input.assigneeId || undefined,
          },
        },
      })

      setCreateModalOpen(false)
      setNotice('Task created successfully.')
      setOffset(0)

      await refetchTasks({
        organizationId: selectedOrganizationId,
        projectId: selectedProjectId,
        filters: { ...filters, offset: 0 },
      })
    } catch (error) {
      setMutationError(getErrorMessage(error))
    }
  }

  async function handleStatusChange(task: Task, status: TaskStatus) {
    setMutationError('')
    setNotice('')

    try {
      await changeTaskStatus({
        variables: {
          input: {
            organizationId: selectedOrganizationId,
            taskId: task.id,
            status,
          },
        },
      })

      setNotice(`Task status updated to ${STATUS_LABELS[status]}.`)
      await refetchTasks()
    } catch (error) {
      setMutationError(getErrorMessage(error))
    }
  }

  async function handleDeleteTask(task: Task) {
    const confirmed = window.confirm(
      `Delete "${task.title}"?\n\nThis action cannot be undone. Related comments, notifications, and reminders may also be deleted.`,
    )

    if (!confirmed) return

    setMutationError('')
    setNotice('')

    try {
      const result = await deleteTask({
        variables: {
          organizationId: selectedOrganizationId,
          taskId: task.id,
        },
      })

      if (!result.data?.deleteTask) {
        throw new Error('The task could not be deleted. Please try again.')
      }

      setNotice(`"${task.title}" was deleted successfully.`)

      const nextOffset =
        tasks.length === 1 && offset > 0
          ? Math.max(0, offset - PAGE_SIZE)
          : offset

      if (nextOffset !== offset) {
        setOffset(nextOffset)
      }

      await refetchTasks({
        organizationId: selectedOrganizationId,
        projectId: selectedProjectId,
        filters: {
          ...filters,
          offset: nextOffset,
        },
      })
    } catch (error) {
      setMutationError(getErrorMessage(error))
    }
  }

  const loading = organizationsLoading || projectsLoading

  if (loading && organizations.length === 0) {
    return (
      <section className="grid min-h-[360px] place-items-center">
        <div className="text-center">
          <div className="mx-auto size-8 animate-spin rounded-full border-2 border-zinc-800 border-t-teal-500" />
          <p className="mt-4 text-[13.5px] font-light tracking-wide text-zinc-500">
            Loading your workspace…
          </p>
        </div>
      </section>
    )
  }

  const initialError = organizationsError || projectsError || membersError

  if (initialError) {
    return (
      <section className="modern-workspace-page rounded-2xl border border-rose-500/20 bg-rose-500/10 p-6">
        <h2 className="text-[15px] font-medium text-rose-200">
          Unable to load tasks workspace
        </h2>
        <p className="mt-2 text-[13.5px] leading-6 text-rose-300/70">
          {getErrorMessage(initialError)}
        </p>
      </section>
    )
  }

  if (organizations.length === 0) {
    return (
      <section className="modern-workspace-page rounded-2xl border border-zinc-800 bg-[#0a0a0a] px-6 py-16 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-400">
          Workspace
        </p>
        <h2 className="mt-3 text-xl font-light text-white">No organization yet</h2>
        <p className="mx-auto mt-2 max-w-sm text-[13.5px] font-light leading-6 text-zinc-500">
          Create or join an organization before managing tasks.
        </p>
      </section>
    )
  }

  return (
    <div className="modern-workspace-page tasks-page relative min-h-screen bg-[#09090b] text-zinc-300 selection:bg-teal-500/30">
      {/* Premium Background Elements */}
      <div className="bg-grid-pattern pointer-events-none absolute inset-0 -z-10 opacity-40" />
      <div className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[600px] w-[1000px] -translate-x-1/2 animate-float rounded-[100%] bg-teal-500/[0.04] blur-[150px]" />
      <div className="bg-noise pointer-events-none absolute inset-0 -z-10 mix-blend-overlay opacity-50" />

      <div className="mx-auto max-w-[1200px] pb-16 pt-10">
        {/* Hero Section */}
        <section className="relative overflow-hidden rounded-3xl border border-white/[0.06] bg-[#0a0a0a] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="emerald-bg absolute inset-0" />
          <div className="camo-grid absolute inset-0" />
          <div className="absolute inset-0 bg-gradient-to-br from-teal-500/[0.05] to-transparent" />

          <div className="relative rounded-[22px] bg-gradient-to-b from-white/[0.02] to-transparent p-6 sm:p-10">
            <div className="flex flex-col justify-between gap-8 xl:flex-row xl:items-end">
              <div className="max-w-2xl">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-teal-400">
                  Workspace / Task management
                </p>

                <h1 className="mt-3 text-[42px] font-light tracking-tight text-white sm:text-[48px]">
                  Manage your tasks<span className="text-teal-400">.</span>
                </h1>

                <p className="mt-3.5 max-w-lg text-[15px] font-light leading-relaxed tracking-wide text-zinc-400">
                  Organize work, track progress, and keep your team moving forward.
                  Everything you need in one place.
                </p>
              </div>

              {canManageTasks && (
              <button
                type="button"
                onClick={() => {
                  setMutationError('')
                  setNotice('')
                  setCreateModalOpen(true)
                }}
                disabled={!selectedProjectId}
                className="group relative inline-flex min-h-11 items-center justify-center gap-2 self-start overflow-hidden rounded-xl border border-white/20 bg-gradient-to-b from-white to-zinc-200 px-6 py-2.5 text-[13.5px] font-semibold tracking-wide text-zinc-900 shadow-[inset_0_1px_0_rgba(255,255,255,1),0_2px_4px_rgba(0,0,0,0.1)] transition-all hover:-translate-y-0.5 hover:from-white hover:to-white hover:shadow-[inset_0_1px_0_rgba(255,255,255,1),0_4px_8px_rgba(0,0,0,0.15)] disabled:cursor-not-allowed disabled:opacity-60 xl:self-auto"
              >
                <span className="relative z-10 flex items-center gap-2">
                  <span className="mb-0.5 text-[18px] leading-none">+</span>
                  Create task
                </span>
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />
              </button>
              )}
            </div>

            {/* Stats Cards */}
            <div className="relative mt-10 grid grid-cols-2 gap-4 border-t border-white/[0.06] pt-8 sm:grid-cols-4">
              {(
                [
                  ['To do', taskCounts.TODO, 'text-zinc-300'],
                  ['In progress', taskCounts.IN_PROGRESS, 'text-teal-400'],
                  ['In review', taskCounts.IN_REVIEW, 'text-amber-400'],
                  ['Done', taskCounts.DONE, 'text-emerald-400'],
                ] as const
              ).map(([label, count, color]) => (
                <div
                  key={label}
                  className="rounded-2xl border border-white/[0.04] bg-white/[0.02] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-md"
                >
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    {label}
                  </p>
                  <p className={`mt-3 text-[36px] font-light leading-none tracking-tight tabular-nums ${color}`}>
                    {count}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Filter Section */}
        <section className="mt-6 grid gap-5 rounded-3xl border border-white/[0.06] bg-[#0a0a0a]/60 p-6 shadow-[0_0_50px_-12px_rgba(0,0,0,0.6)] backdrop-blur-xl sm:grid-cols-2 lg:grid-cols-4">
          <Select
            label="Organization"
            value={selectedOrganizationId}
            onChange={(value) => {
              setOrganizationId(value)
              setProjectId('')
              setCreateModalOpen(false)
              setEditingTask(null)
              setDetailsTask(null)
              resetPagination()
              setNotice('')
              setMutationError('')
            }}
          >
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id} className="bg-zinc-900">
                {organization.name}
              </option>
            ))}
          </Select>

          <Select
            label="Project"
            value={selectedProjectId}
            onChange={(value) => {
              setProjectId(value)
              setCreateModalOpen(false)
              setEditingTask(null)
              setDetailsTask(null)
              resetPagination()
              setNotice('')
              setMutationError('')
            }}
          >
            {projects.length === 0 ? (
              <option value="">No active projects</option>
            ) : (
              projects.map((project) => (
                <option key={project.id} value={project.id} className="bg-zinc-900">
                  {project.name}
                </option>
              ))
            )}
          </Select>

          <Select
            label="Status"
            value={statusFilter}
            onChange={(value) => {
              setStatusFilter(value)
              resetPagination()
            }}
          >
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value} className="bg-zinc-900">
                {label}
              </option>
            ))}
          </Select>

          <Select
            label="Priority"
            value={priorityFilter}
            onChange={(value) => {
              setPriorityFilter(value)
              resetPagination()
            }}
          >
            <option value="">All priorities</option>
            {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
              <option key={value} value={value} className="bg-zinc-900">
                {label}
              </option>
            ))}
          </Select>
        </section>

        {/* Tasks List Section */}
        <section className="mt-10 space-y-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h3 className="text-[24px] font-light tracking-tight text-white">
                Project tasks
              </h3>
              <p className="mt-1 text-[13.5px] font-light tracking-wide text-zinc-500">
                Showing {totalCount} {totalCount === 1 ? 'task' : 'tasks'} in this project
              </p>
            </div>

            <div className="relative w-full sm:max-w-xs">
              <svg
                className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-zinc-500"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-4-4" />
              </svg>

              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search tasks..."
                className="h-11 w-full rounded-full border border-white/10 bg-[#0a0a0a]/50 py-2.5 pl-11 pr-4 text-[13.5px] font-light text-zinc-200 placeholder:text-zinc-600 outline-none backdrop-blur-md transition-all hover:border-white/20 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
          </div>

          {notice && (
            <div
              role="status"
              className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-3.5 text-[13.5px] font-light tracking-wide text-emerald-300"
            >
              {notice}
            </div>
          )}

          {mutationError && !createModalOpen && (
            <div
              role="alert"
              className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-5 py-3.5 text-[13.5px] font-light leading-relaxed text-rose-200"
            >
              {mutationError}
            </div>
          )}

          {tasksError && (
            <div
              role="alert"
              className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-5 py-3.5 text-[13.5px] font-light leading-relaxed text-rose-200"
            >
              {getErrorMessage(tasksError)}
            </div>
          )}

          {!selectedProjectId ? (
            <div className="rounded-3xl border border-dashed border-white/[0.08] bg-[#0a0a0a]/50 px-6 py-24 text-center">
              <h4 className="text-[18px] font-normal text-white">
                No active project selected
              </h4>
              <p className="mx-auto mt-2 max-w-sm text-[14px] font-light leading-relaxed text-zinc-500">
                Create a project or select another organization to start managing tasks.
              </p>
            </div>
          ) : tasksLoading && !page ? (
            <div className="grid min-h-[300px] place-items-center rounded-3xl border border-white/[0.06] bg-[#0a0a0a]/50">
              <div className="text-center">
                <div className="mx-auto size-8 animate-spin rounded-full border-2 border-zinc-800 border-t-teal-500" />
                <p className="mt-4 text-[13.5px] font-light text-zinc-500">
                  Loading tasks…
                </p>
              </div>
            </div>
          ) : tasks.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/[0.08] bg-[#0a0a0a]/50 px-6 py-24 text-center">
              <div className="mx-auto grid size-14 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.03] text-zinc-500">
                <svg
                  className="size-6"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
                </svg>
              </div>

              <h4 className="mt-5 text-[20px] font-normal text-white">No tasks found</h4>
              <p className="mx-auto mt-2 max-w-md text-[14px] font-light leading-relaxed text-zinc-500">
                {search || statusFilter || priorityFilter
                  ? 'Try changing your search or filters.'
                  : canManageTasks
                    ? 'Create the first task for this project to get work moving.'
                    : 'No tasks have been added to this project yet.'}
              </p>

              {canManageTasks && !search && !statusFilter && !priorityFilter && (
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(true)}
                  className="mt-6 inline-flex items-center gap-2 rounded-xl border border-white/20 bg-gradient-to-b from-white to-zinc-200 px-5 py-2.5 text-[13px] font-medium tracking-wide text-zinc-900 shadow-sm transition-all hover:-translate-y-0.5 hover:from-white hover:to-white"
                >
                  Create first task
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-hidden rounded-3xl border border-white/[0.06] bg-[#0a0a0a]/60 shadow-[0_0_50px_-12px_rgba(0,0,0,0.6)] backdrop-blur-xl">
              <div className="hidden grid-cols-[minmax(0,1fr)_130px_100px_150px] gap-6 border-b border-white/[0.06] bg-white/[0.02] px-8 py-4 md:grid">
                {['Task', 'Status', 'Priority', 'Due date'].map((label) => (
                  <span
                    key={label}
                    className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-zinc-500"
                  >
                    {label}
                  </span>
                ))}
              </div>

              <div className="divide-y divide-white/[0.04]">
                {tasks.map((task) => {
                  const nextStatuses = NEXT_STATUSES[task.status]

                  return (
                    <article
                      key={task.id}
                      className="group relative grid gap-6 px-8 py-6 transition-all duration-200 hover:bg-white/[0.02] md:grid-cols-[minmax(0,1fr)_130px_100px_150px] md:items-center"
                    >
                      <div className="absolute left-0 top-1/2 h-0 w-[2.5px] -translate-y-1/2 rounded-r-full bg-teal-500 opacity-0 shadow-[0_0_12px_rgba(20,184,166,0.8)] transition-all duration-300 group-hover:h-14 group-hover:opacity-100" />

                      <div className="min-w-0">
                        <h4 className="break-words text-[15px] font-medium tracking-tight text-zinc-100 group-hover:text-white">
                          {task.title}
                        </h4>

                        {task.description && (
                          <p className="mt-2 line-clamp-2 text-[13.5px] font-light leading-relaxed text-zinc-500 group-hover:text-zinc-400">
                            {task.description}
                          </p>
                        )}

                        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
                          {canManageTasks && (
                          <button
                            type="button"
                            onClick={() => setEditingTask(task)}
                            className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:border-teal-500/30 hover:text-teal-300"
                          >
                            Edit
                          </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setCommentsTask(task)}
                            className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:border-teal-500/30 hover:text-teal-300"
                          >
                            Comments
                          </button>
                          <button
                            type="button"
                            onClick={() => setDetailsTask(task)}
                            className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:border-teal-500/30 hover:text-teal-300"
                          >
                            Details
                          </button>
                          <p className="text-[11px] font-light tracking-wide text-zinc-600">
                            Created {formatDate(task.createdAt)}
                          </p>

                          {canManageTasks && (
                          <button
                            type="button"
                            onClick={() => void handleDeleteTask(task)}
                            disabled={deleteState.loading}
                            aria-label={`Delete task: ${task.title}`}
                            title="Delete task"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/20 bg-rose-500/[0.06] px-2.5 py-1.5 text-[11px] font-medium tracking-wide text-rose-400 transition hover:border-rose-500/40 hover:bg-rose-500/15 hover:text-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <svg
                              className="size-3.5"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.7"
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14M10 10v6m4-6v6"
                              />
                            </svg>
                            {deleteState.loading ? 'Deleting…' : 'Delete'}
                          </button>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-start gap-2">
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-widest ${STATUS_STYLES[task.status]}`}
                        >
                          {STATUS_LABELS[task.status]}
                        </span>

                        {(canManageTasks ||
                          (currentRole === 'EMPLOYEE' && task.assigneeId === user?.id)) &&
                          nextStatuses.length > 0 &&
                          (canManageTasks || task.status !== 'IN_REVIEW') && (
                          <label className="relative w-full">
                            <select
                              value=""
                              disabled={statusState.loading}
                              onChange={(event) => {
                                const nextStatus = event.target.value as TaskStatus
                                if (nextStatuses.includes(nextStatus)) {
                                  void handleStatusChange(task, nextStatus)
                                }
                              }}
                              className="w-full appearance-none rounded-full border border-white/10 bg-[#050505] px-3 py-1.5 text-[10.5px] font-medium tracking-wide text-zinc-400 outline-none transition-all hover:border-white/20 focus:border-teal-500/50 disabled:opacity-50"
                            >
                              <option value="">Change status…</option>
                              {nextStatuses.map((status) => (
                                <option key={status} value={status} className="bg-zinc-900">
                                  {task.status === 'IN_REVIEW' ? status === 'DONE' ? 'Approve' : 'Request changes' : STATUS_LABELS[status]}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`size-1.5 shrink-0 rounded-full ${
                            task.priority === 'URGENT'
                              ? 'bg-rose-400'
                              : task.priority === 'HIGH'
                                ? 'bg-amber-400'
                                : task.priority === 'MEDIUM'
                                  ? 'bg-sky-400'
                                  : 'bg-zinc-500'
                          }`}
                        />
                        <span
                          className={`text-[13px] font-medium tracking-wide ${PRIORITY_STYLES[task.priority]}`}
                        >
                          {PRIORITY_LABELS[task.priority]}
                        </span>
                      </div>

                      <div>
                        <p
                          className={`text-[13px] font-light tracking-wide ${
                            isOverdue(task) ? 'text-rose-400' : 'text-zinc-400'
                          }`}
                        >
                          {formatDate(task.dueDate)}
                        </p>

                        {isOverdue(task) && (
                          <p className="mt-1 text-[9.5px] font-semibold uppercase tracking-wider text-rose-500">
                            Overdue
                          </p>
                        )}

                        {task.assigneeId && (
                          <p className="mt-1 truncate text-[11.5px] font-light text-zinc-600">
                            Assigned
                          </p>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>

              <div className="flex flex-col gap-3 border-t border-white/[0.04] bg-[#050505]/50 px-8 py-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
                  Page {pageNumber} · {totalCount} total tasks
                </p>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={offset === 0 || tasksLoading}
                    onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}
                    className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-[12.5px] font-medium tracking-wide text-zinc-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    Previous
                  </button>

                  <button
                    type="button"
                    disabled={!hasNextPage || tasksLoading}
                    onClick={() => setOffset((value) => value + PAGE_SIZE)}
                    className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-[12.5px] font-medium tracking-wide text-zinc-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {canManageTasks && editingTask && (
        <TaskEditModal
          task={editingTask}
          organizationId={selectedOrganizationId}
          onClose={() => setEditingTask(null)}
          onSaved={() => {
            setNotice('Task updated successfully.')
            void refetchTasks()
          }}
          members={eligibleAssignees}
          canAssign={canManageTasks && !projectMembersLoading && !projectMembersError && Boolean(projectMembersData)}
        />
      )}

      {commentsTask && (
        <TaskCommentsPanel
          task={commentsTask}
          organizationId={selectedOrganizationId}
          onClose={() => setCommentsTask(null)}
        />
      )}

      {detailsTask && detailsTask.organizationId === selectedOrganizationId && detailsTask.projectId === selectedProjectId && (
        <TaskDetailsPanel
          key={detailsTask.id}
          task={tasks.find((item) => item.id === detailsTask.id) ?? detailsTask}
          organizationId={selectedOrganizationId}
          role={currentRole}
          userId={user?.id}
          eligibleAssigneeIds={eligibleAssignees.map((member) => member.user.id)}
          assigneesReady={!projectMembersLoading && !projectMembersError && Boolean(projectMembersData)}
          onClose={() => setDetailsTask(null)}
          onTaskChanged={() => { void refetchTasks() }}
        />
      )}

      {canManageTasks && createModalOpen && selectedProjectId && (
        <TaskModal
          onClose={() => {
            if (!createState.loading) {
              setCreateModalOpen(false)
              setMutationError('')
            }
          }}
          onCreate={handleCreate}
          saving={createState.loading}
          error={mutationError}
          members={eligibleAssignees}
          assigneesLoading={projectMembersLoading}
          assigneesError={Boolean(projectMembersError)}
        />
      )}
    </div>
  )
}

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MockedProvider } from '@apollo/client/testing/react'
import { TaskDetailsPanel } from './TaskDetailsPanel'
import {
  CREATE_SUBTASK, SET_CHECKLIST_ITEM_COMPLETED, SUBTASKS, TASK_ACTIVITY,
  TASK_CHECKLIST, TASK_DETAILS_PROJECT_MEMBERS,
} from './task-details.graphql'
import { TASK_PROGRESS } from './analytics.graphql'

const task = {
  id: 'task-1', organizationId: 'org-1', projectId: 'project-1', title: 'Plan launch',
  description: null, status: 'TODO' as const, priority: 'MEDIUM' as const,
  assigneeId: 'user-1', dueDate: null, parentId: null,
}
const activity = { taskActivity: { items: [], nextCursor: null, hasMore: false } }
const checklist = (completed: boolean) => ({ taskChecklist: {
  items: [{ id: 'item-1', organizationId: 'org-1', taskId: 'task-1', content: 'Review copy', completed, position: 0, createdAt: '2026-11-20T00:00:00Z', updatedAt: '2026-11-20T00:00:00Z' }],
  completedCount: completed ? 1 : 0, totalCount: 1,
} })
const child = { ...task, id: 'child-1', parentId: task.id, title: 'Write copy', createdById: 'user-1', createdAt: '2026-11-20T00:00:00Z', updatedAt: '2026-11-20T00:00:00Z' }
const subtaskMock = (subtasks: typeof child[] = []) => ({ request: { query: SUBTASKS, variables: { organizationId: 'org-1', parentId: 'task-1' } }, result: { data: { subtasks } } })
const checklistMock = (completed = false) => ({ request: { query: TASK_CHECKLIST, variables: { input: { organizationId: 'org-1', taskId: 'task-1' } } }, result: { data: checklist(completed) } })
const activityMock = () => ({ request: { query: TASK_ACTIVITY, variables: { input: { organizationId: 'org-1', taskId: 'task-1', first: 10 } } }, result: { data: activity } })
const membersMock = () => ({ request: { query: TASK_DETAILS_PROJECT_MEMBERS, variables: { organizationId: 'org-1', projectId: 'project-1' } }, result: { data: { projectMembers: [{ user: { id: 'user-1', name: 'Alex' } }] } } })
const progressMock = (percent = 0) => ({ request: { query: TASK_PROGRESS, variables: { input: { organizationId: 'org-1', taskId: 'task-1' } } }, result: { data: { taskProgress: { taskId: 'task-1', percent, checklistPercent: percent, checklistCompleted: percent ? 1 : 0, checklistTotal: 1, subtaskPercent: 0, subtasksCompleted: 0, subtasksTotal: 0 } } } })

function show(mocks: React.ComponentProps<typeof MockedProvider>['mocks'], role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE' = 'EMPLOYEE') {
  return render(<MockedProvider mocks={[progressMock(), ...(mocks ?? [])]}><TaskDetailsPanel task={task} organizationId="org-1" role={role} userId="user-1" onClose={vi.fn()} onTaskChanged={vi.fn()} /></MockedProvider>)
}

describe('task details GraphQL integration', () => {
  it('shows loading and then empty subtask and activity states', async () => {
    show([subtaskMock(), checklistMock(), activityMock()])
    expect(screen.getByText('Loading subtasks…')).toBeInTheDocument()
    expect(await screen.findByText('No subtasks yet.')).toBeInTheDocument()
    expect(await screen.findByText('No activity yet.')).toBeInTheDocument()
    expect(await screen.findByText('0/1 complete · 0%')).toBeInTheDocument()
    expect(await screen.findByRole('progressbar', { name: 'Task progress' })).toHaveAttribute('aria-valuenow', '0')
  })

  it('shows query errors without exposing edit actions to employees', async () => {
    show([
      { request: { query: SUBTASKS, variables: { organizationId: 'org-1', parentId: 'task-1' } }, error: new Error('Subtasks unavailable') },
      checklistMock(), activityMock(),
    ])
    expect(await screen.findByText('Subtasks unavailable')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add subtask' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add item' })).not.toBeInTheDocument()
  })

  it('updates completion and refetches checklist counts and activity', async () => {
    show([
      subtaskMock(), checklistMock(), activityMock(),
      { request: { query: SET_CHECKLIST_ITEM_COMPLETED, variables: { input: { organizationId: 'org-1', taskId: 'task-1', itemId: 'item-1', completed: true } } }, result: { data: { setChecklistItemCompleted: { id: 'item-1', completed: true, updatedAt: '2026-11-20T01:00:00Z' } } } },
      checklistMock(true), activityMock(), progressMock(100),
    ])
    const checkbox = await screen.findByRole('checkbox', { name: 'Complete Review copy' })
    fireEvent.click(checkbox)
    expect(await screen.findByText('1/1 complete · 100%')).toBeInTheDocument()
    expect(checkbox).toBeChecked()
    await waitFor(() => expect(screen.getByRole('progressbar', { name: 'Task progress' })).toHaveAttribute('aria-valuenow', '100'))
  })

  it('creates a subtask and refetches the list', async () => {
    show([
      subtaskMock(), checklistMock(), activityMock(), membersMock(),
      { request: { query: CREATE_SUBTASK, variables: { input: { organizationId: 'org-1', projectId: 'project-1', parentId: 'task-1', title: 'Write copy' } } }, result: { data: { createSubtask: { id: 'child-1', parentId: 'task-1', title: 'Write copy', status: 'TODO', assigneeId: null } } } },
      subtaskMock([child]), activityMock(), progressMock(),
    ], 'ADMIN')
    await screen.findByText('No subtasks yet.')
    fireEvent.change(await screen.findByRole('textbox', { name: 'New subtask title' }), { target: { value: 'Write copy' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add subtask' }))
    await waitFor(() => expect(screen.getByText('Write copy')).toBeInTheDocument())
  })

  it('keeps checklist state and shows a mutation error when completion fails', async () => {
    show([
      subtaskMock(), checklistMock(), activityMock(),
      { request: { query: SET_CHECKLIST_ITEM_COMPLETED, variables: { input: { organizationId: 'org-1', taskId: 'task-1', itemId: 'item-1', completed: true } } }, error: new Error('Update rejected') },
    ])
    const checkbox = await screen.findByRole('checkbox', { name: 'Complete Review copy' })
    fireEvent.click(checkbox)
    expect(await screen.findByText('Update rejected')).toBeInTheDocument()
    expect(checkbox).not.toBeChecked()
  })

  it('loads more activity without duplicating existing entries', async () => {
    const entry = (id: string) => ({ id, taskId: 'task-1', organizationId: 'org-1', actorId: 'user-1', actorName: 'Alex', type: 'TASK_CREATED', details: '{}', createdAt: '2026-11-20T00:00:00Z' })
    show([
      subtaskMock(), checklistMock(),
      { request: { query: TASK_ACTIVITY, variables: { input: { organizationId: 'org-1', taskId: 'task-1', first: 10 } } }, result: { data: { taskActivity: { items: [entry('one')], nextCursor: 'cursor', hasMore: true } } } },
      { request: { query: TASK_ACTIVITY, variables: { input: { organizationId: 'org-1', taskId: 'task-1', first: 10, after: 'cursor' } } }, result: { data: { taskActivity: { items: [entry('one'), entry('two')], nextCursor: null, hasMore: false } } } },
    ])
    fireEvent.click(await screen.findByRole('button', { name: 'Load more activity' }))
    await waitFor(() => expect(screen.getAllByText('Alex')).toHaveLength(2))
    expect(screen.queryByRole('button', { name: 'Load more activity' })).not.toBeInTheDocument()
  })
})

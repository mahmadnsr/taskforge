import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MockedProvider } from '@apollo/client/testing/react'
import { TaskDetailsPanel } from './TaskDetailsPanel'
import {
  ADD_CHECKLIST_ITEM, CREATE_SUBTASK, SET_CHECKLIST_ITEM_COMPLETED, SUBTASKS, TASK_ACTIVITY,
  TASK_CHECKLIST, TASK_DETAILS_PROJECT_MEMBERS,
  TASK_DEPENDENCIES, DEPENDENCY_CANDIDATES,
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
const child = { ...task, status: 'TODO' as 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE', id: 'child-1', parentId: task.id, title: 'Write copy', createdById: 'user-1', createdAt: '2026-11-20T00:00:00Z', updatedAt: '2026-11-20T00:00:00Z' }
const subtaskMock = (subtasks: typeof child[] = []) => ({ request: { query: SUBTASKS, variables: { organizationId: 'org-1', parentId: 'task-1' } }, result: { data: { subtasks } } })
const checklistMock = (completed = false) => ({ request: { query: TASK_CHECKLIST, variables: { input: { organizationId: 'org-1', taskId: 'task-1' } } }, result: { data: checklist(completed) } })
const activityMock = () => ({ request: { query: TASK_ACTIVITY, variables: { input: { organizationId: 'org-1', taskId: 'task-1', first: 10 } } }, result: { data: activity } })
const membersMock = (projectMembers = [{ user: { id: 'user-1', name: 'Alex' } }]) => ({ request: { query: TASK_DETAILS_PROJECT_MEMBERS, variables: { organizationId: 'org-1', projectId: 'project-1' } }, result: { data: { projectMembers } } })
const progressMock = (percent = 0, checklistPercent = percent, subtaskPercent = 0, subtasksTotal = 0) => ({ request: { query: TASK_PROGRESS, variables: { input: { organizationId: 'org-1', taskId: 'task-1' } } }, result: { data: { taskProgress: { taskId: 'task-1', percent, checklistPercent, checklistCompleted: checklistPercent ? 1 : 0, checklistTotal: 1, subtaskPercent, subtasksCompleted: 0, subtasksTotal } } } })
const dependencyMock = (taskDependencies: { taskId: string; blockingTaskId: string; blockingTitle: string; blockingStatus: string }[] = []) => ({ request: { query: TASK_DEPENDENCIES, variables: { organizationId: 'org-1', taskId: 'task-1' } }, result: { data: { taskDependencies } } })
const candidateMock = () => ({ request: { query: DEPENDENCY_CANDIDATES, variables: { organizationId: 'org-1', projectId: 'project-1', filters: { limit: 100 } } }, result: { data: { searchProjectTasks: { tasks: [{ id: 'blocker-1', title: 'Design database', status: 'TODO' }] } } } })

function show(mocks: React.ComponentProps<typeof MockedProvider>['mocks'], role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE' = 'EMPLOYEE', initialProgress = progressMock(), eligibleAssigneeIds: string[] = []) {
  return render(<MockedProvider mocks={[initialProgress, ...(mocks ?? [])]}><TaskDetailsPanel task={task} organizationId="org-1" role={role} userId="user-1" eligibleAssigneeIds={eligibleAssigneeIds} onClose={vi.fn()} onTaskChanged={vi.fn()} /></MockedProvider>)
}

describe('task details GraphQL integration', () => {
  it('shows blocking tasks to employees without dependency edit controls', async () => {
    show([subtaskMock(), checklistMock(), activityMock(), dependencyMock([{ taskId: 'task-1', blockingTaskId: 'blocker-1', blockingTitle: 'Design database', blockingStatus: 'TODO' }])])
    expect(await screen.findByText(/Design database/)).toBeInTheDocument()
    expect(screen.getByText('Blocking')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add dependency' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
  })

  it('shows same-project dependency controls to managers', async () => {
    show([subtaskMock(), checklistMock(), activityMock(), dependencyMock(), candidateMock(), membersMock()], 'MANAGER')
    expect(await screen.findByRole('option', { name: 'Design database (To do)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add dependency' })).toBeInTheDocument()
  })
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
    expect(screen.queryByRole('button', { name: /Add Subtask/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add Checklist Item/ })).not.toBeInTheDocument()
  })

  it('allows an assigned employee to change subtask status without assignment controls', async () => {
    show([subtaskMock([child]), checklistMock(), activityMock()])
    expect(await screen.findByText('Write copy')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Status for Write copy' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Assignee for Write copy' })).not.toBeInTheDocument()
  })

  it('shows review actions to a manager and hides them from an assigned employee', async () => {
    const submitted = { ...child, status: 'IN_REVIEW' as const }
    const employeeView = show([subtaskMock([submitted]), checklistMock(), activityMock()])
    expect(await screen.findByText('Write copy')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Status for Write copy' })).not.toBeInTheDocument()
    employeeView.unmount()

    show([subtaskMock([submitted]), checklistMock(), activityMock(), membersMock()], 'MANAGER')
    const review = await screen.findByRole('combobox', { name: 'Status for Write copy' })
    expect(within(review).getByRole('option', { name: 'Approve' })).toBeInTheDocument()
    expect(within(review).getByRole('option', { name: 'Request changes' })).toBeInTheDocument()
  })

  it('offers only eligible project employees for manager subtask assignment', async () => {
    show([
      subtaskMock([{ ...child, assigneeId: 'employee-1' }]), checklistMock(), activityMock(),
      membersMock([
        { user: { id: 'admin-1', name: 'Admin' } },
        { user: { id: 'manager-1', name: 'Manager' } },
        { user: { id: 'employee-1', name: 'Employee' } },
      ]),
    ], 'MANAGER', progressMock(), ['employee-1'])
    const assignee = await screen.findByRole('combobox', { name: 'Assignee for Write copy' })
    expect(await within(assignee).findByRole('option', { name: 'Employee' })).toBeInTheDocument()
    expect(within(assignee).queryByRole('option', { name: 'Admin' })).not.toBeInTheDocument()
    expect(within(assignee).queryByRole('option', { name: 'Manager' })).not.toBeInTheDocument()
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
      subtaskMock(), checklistMock(true), activityMock(), membersMock(),
      { request: { query: CREATE_SUBTASK, variables: { input: { organizationId: 'org-1', projectId: 'project-1', parentId: 'task-1', title: 'Write copy' } } }, result: { data: { createSubtask: { id: 'child-1', parentId: 'task-1', title: 'Write copy', status: 'TODO', assigneeId: null } } } },
      subtaskMock([child]), activityMock(), progressMock(50, 100, 0, 1),
    ], 'ADMIN', progressMock(100, 100, 0, 0))
    await screen.findByText('No subtasks yet.')
    await waitFor(() => expect(screen.getByRole('progressbar', { name: 'Task progress' })).toHaveAttribute('aria-valuenow', '100'))
    fireEvent.click(screen.getByRole('button', { name: '+ Add Subtask' }))
    fireEvent.change(await screen.findByRole('textbox', { name: 'New subtask title' }), { target: { value: 'Write copy' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Subtask' }))
    await waitFor(() => expect(screen.getByText('Write copy')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole('progressbar', { name: 'Task progress' })).toHaveAttribute('aria-valuenow', '50'))
    expect(screen.getByText('Checklist 100% · Subtasks 0/1 complete (0%)')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Subtask added.')
  })

  it('adds a checklist item from the visible manager action', async () => {
    const emptyChecklist = { taskChecklist: { items: [], completedCount: 0, totalCount: 0 } }
    show([
      subtaskMock(),
      { request: { query: TASK_CHECKLIST, variables: { input: { organizationId: 'org-1', taskId: 'task-1' } } }, result: { data: emptyChecklist } },
      activityMock(), membersMock(),
      { request: { query: ADD_CHECKLIST_ITEM, variables: { input: { organizationId: 'org-1', taskId: 'task-1', content: 'Approve copy' } } }, result: { data: { addChecklistItem: { id: 'item-1', content: 'Approve copy', completed: false, position: 0 } } } },
      checklistMock(), progressMock(), activityMock(),
    ], 'MANAGER')
    await screen.findByText('No checklist items yet.')
    await screen.findByText('Checklist 0% · Subtasks 0/0 complete (0%)')
    fireEvent.click(screen.getByRole('button', { name: '+ Add Checklist Item' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'New checklist item' }), { target: { value: 'Approve copy' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Checklist Item' }))
    expect(await screen.findByRole('checkbox', { name: 'Complete Review copy' })).toBeInTheDocument()
    expect(await screen.findByText('Checklist item added.')).toBeInTheDocument()
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

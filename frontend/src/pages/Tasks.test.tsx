import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MockedProvider } from '@apollo/client/testing/react'
import Tasks from './Tasks'
import { MY_ORGANIZATIONS, ORGANIZATION_MEMBERS, ORGANIZATION_PROJECTS, SEARCH_PROJECT_TASKS, TASK_PROJECT_MEMBERS } from './tasks.graphql'

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1', name: 'Alex', email: 'alex@example.test' } }),
}))

const organizationId = 'org-1'
const projectId = 'project-1'
const task = {
  id: 'task-1', organizationId, projectId, parentId: null,
  title: 'Plan launch', description: null, status: 'TODO', priority: 'MEDIUM',
  createdById: 'manager-1', assigneeId: 'user-1', dueDate: null,
  createdAt: '2026-11-20T00:00:00Z', updatedAt: '2026-11-20T00:00:00Z',
}

function renderTasks(role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'missing' | 'error', taskItems = [task]) {
  const members = role === 'missing' ? [] : [
    { id: 'member-1', role, user: { id: 'user-1', name: 'Alex', email: 'alex@example.test' } },
    { id: 'member-2', role: 'ADMIN', user: { id: 'admin-1', name: 'Admin User', email: 'admin@example.test' } },
    { id: 'member-3', role: 'MANAGER', user: { id: 'manager-1', name: 'Manager User', email: 'manager@example.test' } },
    { id: 'member-4', role: 'EMPLOYEE', user: { id: 'employee-1', name: 'Eligible Employee', email: 'employee@example.test' } },
    { id: 'member-5', role: 'EMPLOYEE', user: { id: 'employee-2', name: 'Outside Project', email: 'outside@example.test' } },
  ]
  const mocks = [
    { request: { query: MY_ORGANIZATIONS }, result: { data: { myOrganizations: [{ id: organizationId, name: 'QA Org', slug: 'qa-org' }] } } },
    role === 'error'
      ? { request: { query: ORGANIZATION_MEMBERS, variables: { organizationId } }, error: new Error('Membership unavailable') }
      : { request: { query: ORGANIZATION_MEMBERS, variables: { organizationId } }, result: { data: { organizationMembers: members } } },
    { request: { query: ORGANIZATION_PROJECTS, variables: { organizationId, includeArchived: false } }, result: { data: { projects: [{ id: projectId, organizationId, name: 'Launch', status: 'ACTIVE' }] } } },
    { request: { query: TASK_PROJECT_MEMBERS, variables: { organizationId, projectId } }, result: { data: { projectMembers: [{ userId: 'user-1' }, { userId: 'admin-1' }, { userId: 'manager-1' }, { userId: 'employee-1' }] } } },
    { request: { query: SEARCH_PROJECT_TASKS, variables: { organizationId, projectId, filters: { sortBy: 'CREATED_AT', sortDirection: 'DESC', limit: 10, offset: 0 } } }, result: { data: { searchProjectTasks: { tasks: taskItems, totalCount: taskItems.length, hasNextPage: false, limit: 10, offset: 0 } } } },
  ]
  return render(<MockedProvider mocks={mocks}><Tasks /></MockedProvider>)
}

describe('task permission controls', () => {
  it('does not show creation or ownership controls before permissions load', () => {
    renderTasks('MANAGER')
    expect(screen.queryByRole('button', { name: /Create task/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Create a task' })).not.toBeInTheDocument()
  })

  it('hides creation and editing from an employee while retaining task actions', async () => {
    renderTasks('EMPLOYEE')
    expect(await screen.findByText('Plan launch')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Create task/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Delete task/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Assignee' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Comments' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Details' })).toBeInTheDocument()
    expect(screen.getByText('Change status…')).toBeInTheDocument()
  })

  it('does not offer empty-state task creation to employees', async () => {
    renderTasks('EMPLOYEE', [])
    expect(await screen.findByText('No tasks found')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create first task' })).not.toBeInTheDocument()
    expect(screen.getByText('No tasks have been added to this project yet.')).toBeInTheDocument()
  })

  it('does not assume management permission when membership is unavailable', async () => {
    renderTasks('missing')
    expect(await screen.findByText('Plan launch')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Create task/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  })

  it('shows a membership error without exposing task management', async () => {
    renderTasks('error')
    expect(await screen.findByText('Unable to load tasks workspace')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Create task/i })).not.toBeInTheDocument()
  })

  it.each(['ADMIN', 'MANAGER'] as const)('allows %s to open task creation', async (role) => {
    renderTasks(role)
    await screen.findByText('Plan launch')
    const button = await screen.findByRole('button', { name: /Create task/i })
    expect(button).toBeEnabled()
    fireEvent.click(button)
    expect(screen.getByRole('dialog', { name: 'Create a task' })).toBeInTheDocument()
  })

  it('offers only project employees to a manager, without adding organization members implicitly', async () => {
    renderTasks('MANAGER')
    await screen.findByText('Plan launch')
    fireEvent.click(screen.getByRole('button', { name: /Create task/i }))
    const assignee = screen.getByRole('combobox', { name: /Assignee/i })
    await waitFor(() => expect(assignee).toBeEnabled())
    expect(screen.getByRole('option', { name: 'Eligible Employee (EMPLOYEE)' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Admin User|Manager User|Outside Project/ })).not.toBeInTheDocument()
  })

  it('preserves admin assignment options for project members of any role', async () => {
    renderTasks('ADMIN')
    await screen.findByText('Plan launch')
    fireEvent.click(screen.getByRole('button', { name: /Create task/i }))
    const assignee = screen.getByRole('combobox', { name: /Assignee/i })
    await waitFor(() => expect(assignee).toBeEnabled())
    expect(screen.getByRole('option', { name: 'Admin User (ADMIN)' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Manager User (MANAGER)' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Eligible Employee (EMPLOYEE)' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Outside Project/ })).not.toBeInTheDocument()
  })
})

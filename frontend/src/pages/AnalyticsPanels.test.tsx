import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MockedProvider } from '@apollo/client/testing/react'
import { EmployeeAnalyticsPanel, ProjectAnalyticsPanel } from './AnalyticsPanels'
import { EMPLOYEE_ANALYTICS, PROJECT_ANALYTICS } from './analytics.graphql'

const org = 'org-1'
const project = 'project-1'
const user = 'user-1'

describe('analytics GraphQL panels', () => {
  it('shows employee loading and completion metrics', async () => {
    render(<MockedProvider mocks={[{ request: { query: EMPLOYEE_ANALYTICS, variables: { input: { organizationId: org, employeeId: user, projectId: null } } }, result: { data: { employeeAnalytics: {
      employeeId: user, assigned: 4, completed: 2, pending: 1, inProgress: 1, overdue: 1,
      completionRate: 50, onTimeCompleted: 1, lateCompleted: 1, timingUnknown: 0,
      workloadByProject: [{ projectId: project, projectName: 'Launch', assigned: 4, completed: 2, overdue: 1 }],
    } } } }]}><EmployeeAnalyticsPanel organizationId={org} employeeId={user} /></MockedProvider>)
    expect(screen.getByText('Loading employee analytics…')).toBeInTheDocument()
    expect(await screen.findByText('Completion rate: 50%')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Employee completion rate' })).toHaveAttribute('aria-valuenow', '50')
    expect(screen.getByText('Launch')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'My workload' })).toHaveClass('analytics-panel')
  })

  it('shows a project error and retry action', async () => {
    render(<MockedProvider mocks={[{ request: { query: PROJECT_ANALYTICS, variables: { input: { organizationId: org, projectId: project } } }, error: new Error('Unavailable') }]}><ProjectAnalyticsPanel organizationId={org} projectId={project} /></MockedProvider>)
    expect(await screen.findByText(/Could not load project analytics/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('shows project health, progress, workload, and recent activity', async () => {
    render(<MockedProvider mocks={[{ request: { query: PROJECT_ANALYTICS, variables: { input: { organizationId: org, projectId: project } } }, result: { data: { projectAnalytics: {
      progress: { projectId: project, taskCount: 2, percent: 75 }, health: 'AT_RISK', overdueTasks: 1,
      statusDistribution: [{ status: 'TODO', count: 1 }, { status: 'DONE', count: 1 }],
      memberWorkload: [{ userId: user, name: 'Alex', assigned: 2, completed: 1, overdue: 1 }],
      recentActivity: [{ taskId: 'task-1', type: 'TASK_CREATED', actorName: 'Alex', createdAt: '2026-11-20T00:00:00Z' }],
    } } } }]}><ProjectAnalyticsPanel organizationId={org} projectId={project} /></MockedProvider>)
    expect(await screen.findByRole('progressbar', { name: 'Project progress' })).toHaveAttribute('aria-valuenow', '75')
    expect(screen.getByText('2 root tasks · at risk')).toBeInTheDocument()
    expect(screen.getByText('1 overdue work items')).toBeInTheDocument()
    expect(screen.getByText(/task created/)).toBeInTheDocument()
  })
})

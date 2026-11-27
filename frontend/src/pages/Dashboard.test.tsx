import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { gql } from '@apollo/client'
import { MockedProvider } from '@apollo/client/testing/react'
import { MemoryRouter } from 'react-router-dom'
import Dashboard from './Dashboard'

vi.mock('../auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1', name: 'Alex' } }) }))
vi.mock('./AnalyticsPanels', () => ({ EmployeeAnalyticsPanel: () => null, ProjectAnalyticsPanel: () => null }))

const organizations = gql`query MyOrganizations { myOrganizations { id name slug } }`
const summary = gql`query DashboardSummary($organizationId: ID!) {
  dashboardSummary(organizationId: $organizationId) {
    totalProjects totalTasks pendingTasks inProgressTasks completedTasks overdueTasks
  }
}`
const projects = gql`query OrganizationProjects($organizationId: ID!, $includeArchived: Boolean!) {
  projects(organizationId: $organizationId, includeArchived: $includeArchived) {
    id name description status createdAt
  }
}`

describe('Dashboard workspace overview', () => {
  it('keeps all six KPIs and switches summary data with the chosen organization', async () => {
    const mocks = [
      { request: { query: organizations }, result: { data: { myOrganizations: [{ id: 'org-1', name: 'First', slug: 'first' }, { id: 'org-2', name: 'Second', slug: 'second' }] } } },
      ...['org-1', 'org-2'].flatMap((organizationId, index) => [
        { request: { query: summary, variables: { organizationId } }, result: { data: { dashboardSummary: { totalProjects: index + 1, totalTasks: 4, pendingTasks: 1, inProgressTasks: 1, completedTasks: 2, overdueTasks: 0 } } } },
        { request: { query: projects, variables: { organizationId, includeArchived: false } }, result: { data: { projects: [] } } },
      ]),
    ]
    const { container } = render(<MemoryRouter><MockedProvider mocks={mocks}><Dashboard /></MockedProvider></MemoryRouter>)
    expect(await screen.findByText('First', { selector: 'option' })).toBeInTheDocument()
    expect(await screen.findByText('Total tasks')).toBeInTheDocument()
    expect(container.querySelectorAll('.dashboard-metric')).toHaveLength(6)
    expect(container.querySelector('.dashboard-metric-grid')).toBeInTheDocument()
    expect(container.querySelector('.dashboard-page')).toHaveClass('max-w-[1440px]')
    for (const label of ['Pending', 'In progress', 'Completed', 'Overdue']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    }
    fireEvent.change(screen.getByRole('combobox', { name: 'Current workspace' }), { target: { value: 'org-2' } })
    expect(await screen.findByText('Second', { selector: 'option' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Current workspace' })).toHaveValue('org-2')
  })
})

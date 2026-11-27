import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { gql } from '@apollo/client'
import { MockedProvider } from '@apollo/client/testing/react'
import { MemoryRouter } from 'react-router-dom'
import Projects from './Projects'

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1', name: 'Alex', email: 'alex@example.test' } }),
}))

const organizations = gql`query MyOrganizations { myOrganizations { id name slug } }`
const organizationMembers = gql`query OrganizationMembers($organizationId: ID!) {
  organizationMembers(organizationId: $organizationId) { id role user { id name email } }
}`
const projects = gql`query OrganizationProjects($organizationId: ID!, $includeArchived: Boolean!) {
  projects(organizationId: $organizationId, includeArchived: $includeArchived) {
    id name description status createdAt updatedAt
  }
}`
const projectMembers = gql`query ProjectMembers($organizationId: ID!, $projectId: ID!) {
  projectMembers(organizationId: $organizationId, projectId: $projectId) {
    id userId projectId user { id name email } createdAt
  }
}`

function show(role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE', projectRows = [{ id: 'project-1', name: 'Launch', description: null, status: 'ACTIVE', createdAt: '2026-11-20T00:00:00Z', updatedAt: '2026-11-20T00:00:00Z' }]) {
  const members = [
    { id: 'member-1', role, user: { id: 'user-1', name: 'Alex', email: 'alex@example.test' } },
    { id: 'member-2', role: 'ADMIN', user: { id: 'admin-1', name: 'Admin User', email: 'admin@example.test' } },
    { id: 'member-3', role: 'MANAGER', user: { id: 'manager-1', name: 'Other Manager', email: 'manager@example.test' } },
    { id: 'member-4', role: 'EMPLOYEE', user: { id: 'employee-1', name: 'On Team', email: 'on-team@example.test' } },
    { id: 'member-5', role: 'EMPLOYEE', user: { id: 'employee-2', name: 'Available Employee', email: 'available@example.test' } },
  ]
  const team = [
    { id: 'project-member-1', userId: 'user-1', projectId: 'project-1', user: members[0]!.user, createdAt: '2026-11-20T00:00:00Z' },
    { id: 'project-member-2', userId: 'employee-1', projectId: 'project-1', user: members[3]!.user, createdAt: '2026-11-20T00:00:00Z' },
  ]
  const mocks = [
    { request: { query: organizations }, result: { data: { myOrganizations: [{ id: 'org-1', name: 'QA Org', slug: 'qa-org' }] } } },
    { request: { query: organizationMembers, variables: { organizationId: 'org-1' } }, result: { data: { organizationMembers: members } } },
    { request: { query: projects, variables: { organizationId: 'org-1', includeArchived: true } }, result: { data: { projects: projectRows } } },
    { request: { query: projectMembers, variables: { organizationId: 'org-1', projectId: 'project-1' } }, result: { data: { projectMembers: team } } },
  ]
  return render(<MemoryRouter><MockedProvider mocks={mocks}><Projects /></MockedProvider></MemoryRouter>)
}

describe('Project Team controls', () => {
  it('lets a manager open an authorized team and select only existing employees', async () => {
    show('MANAGER')
    fireEvent.click(await screen.findByRole('button', { name: 'Project Team' }))
    expect(await screen.findByRole('dialog', { name: 'Project Team for Launch' })).toBeInTheDocument()
    expect(await screen.findByRole('option', { name: 'Available Employee (EMPLOYEE)' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Admin User|Other Manager|On Team/ })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(1)
  })

  it('allows an admin to appoint an existing manager through Project Team', async () => {
    show('ADMIN')
    fireEvent.click(await screen.findByRole('button', { name: 'Project Team' }))
    expect(await screen.findByRole('option', { name: 'Other Manager (MANAGER)' })).toBeInTheDocument()
  })

  it('does not expose project team management to employees', async () => {
    show('EMPLOYEE')
    expect(await screen.findByText('Launch')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Project Team' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New project' })).not.toBeInTheDocument()
  })

  it('filters projects by status and search without changing the selected organization', async () => {
    show('EMPLOYEE', [
      { id: 'project-1', name: 'Launch', description: null, status: 'ACTIVE', createdAt: '2026-11-20T00:00:00Z', updatedAt: '2026-11-20T00:00:00Z' },
      { id: 'project-2', name: 'Legacy', description: null, status: 'ARCHIVED', createdAt: '2026-11-19T00:00:00Z', updatedAt: '2026-11-19T00:00:00Z' },
    ])
    expect(await screen.findByRole('heading', { name: 'Launch' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter projects by status' }), { target: { value: 'ARCHIVED' } })
    expect(screen.queryByRole('heading', { name: 'Launch' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Legacy' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search projects' }), { target: { value: 'missing' } })
    expect(screen.queryByRole('heading', { name: 'Legacy' })).not.toBeInTheDocument()
  })
})

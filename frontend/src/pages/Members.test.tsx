import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { gql } from '@apollo/client'
import { MockedProvider } from '@apollo/client/testing/react'
import { MemoryRouter } from 'react-router-dom'
import Members from './Members'

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1', name: 'Alex', email: 'alex@example.test' } }),
}))

const organizations = gql`query MyOrganizations { myOrganizations { id name slug } }`
const organizationMembers = gql`query OrganizationMembers($organizationId: ID!) {
  organizationMembers(organizationId: $organizationId) {
    id role user { id name email createdAt }
  }
}`

function show(role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE') {
  const mocks = [
    { request: { query: organizations }, result: { data: { myOrganizations: [{ id: 'org-1', name: 'QA Org', slug: 'qa-org' }] } } },
    { request: { query: organizationMembers, variables: { organizationId: 'org-1' } }, result: { data: { organizationMembers: [{ id: 'member-1', role, user: { id: 'user-1', name: 'Alex', email: 'alex@example.test', createdAt: '2026-11-20T00:00:00Z' } }] } } },
  ]
  return render(<MemoryRouter><MockedProvider mocks={mocks}><Members /></MockedProvider></MemoryRouter>)
}

describe('organization invitation controls', () => {
  it('allows ADMIN to open the organization invitation form and choose roles', async () => {
    show('ADMIN')
    fireEvent.click(await screen.findByRole('button', { name: /Invite member/i }))
    const dialog = screen.getByRole('dialog', { name: 'Invite a member' })
    expect(within(dialog).getByRole('option', { name: 'Manager' })).toBeInTheDocument()
    expect(within(dialog).getByRole('option', { name: 'Employee' })).toBeInTheDocument()
  })

  it.each(['MANAGER', 'EMPLOYEE'] as const)('hides invitation controls from %s', async (role) => {
    show(role)
    expect(await screen.findByText(`Your role: ${role}`)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Invite member/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Invite a member' })).not.toBeInTheDocument()
  })
})

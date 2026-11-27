import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { gql } from '@apollo/client'
import { MockedProvider } from '@apollo/client/testing/react'
import { MemoryRouter } from 'react-router-dom'
import Inbox from './Inbox'

const organizations = gql`query MyOrganizations { myOrganizations { id name slug } }`
const notifications = gql`query MyNotifications($input: NotificationsPaginationInput!) {
  myNotifications(input: $input) { items { id organizationId taskId type message readAt createdAt } nextCursor hasMore }
}`
const unread = gql`query UnreadCount($organizationId: String!) { unreadNotificationCount(organizationId: $organizationId) }`

describe('Inbox notification states', () => {
  it('shows readable read and unread cards and filters unread items', async () => {
    const mocks = [
      { request: { query: organizations }, result: { data: { myOrganizations: [{ id: 'org-1', name: 'First', slug: 'first' }] } } },
      { request: { query: notifications, variables: { input: { organizationId: 'org-1', first: 15 } } }, result: { data: { myNotifications: { items: [
        { id: 'one', organizationId: 'org-1', taskId: 'task-1', type: 'TASK_ASSIGNED', message: 'New assignment', readAt: null, createdAt: '2026-11-20T00:00:00Z' },
        { id: 'two', organizationId: 'org-1', taskId: 'task-2', type: 'TASK_COMMENTED', message: 'Past comment', readAt: '2026-11-20T01:00:00Z', createdAt: '2026-11-20T00:00:00Z' },
      ], nextCursor: null, hasMore: false } } } },
      { request: { query: unread, variables: { organizationId: 'org-1' } }, result: { data: { unreadNotificationCount: 1 } } },
    ]
    render(<MemoryRouter><MockedProvider mocks={mocks}><Inbox /></MockedProvider></MemoryRouter>)
    const newMessage = await screen.findByText('New assignment')
    const oldMessage = screen.getByText('Past comment')
    expect(newMessage.closest('.inbox-notification')).toHaveClass('is-unread')
    expect(oldMessage.closest('.inbox-notification')).toHaveClass('is-read')
    fireEvent.click(await screen.findByRole('button', { name: 'Unread (1)' }))
    expect(screen.getByText('New assignment')).toBeInTheDocument()
    expect(screen.queryByText('Past comment')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unread (1)' })).toHaveAttribute('aria-pressed', 'true')
  })
})

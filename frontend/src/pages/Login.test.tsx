import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Login from './Login'

vi.mock('../auth/useAuth', () => ({ useAuth: () => ({ isAuthenticated: false, login: vi.fn() }) }))

describe('login session notice', () => {
  it('shows confirmed expiry inside the login form', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { message: 'Your session has expired. Please log in again.' } }]}>
        <Routes><Route path="/login" element={<Login />} /></Routes>
      </MemoryRouter>,
    )
    const notice = screen.getByRole('status')
    expect(notice).toHaveTextContent('Your session has expired. Please log in again.')
    expect(notice.closest('form')).toBeNull()
    expect(notice.parentElement?.querySelector('form')).toBeInTheDocument()
  })
})

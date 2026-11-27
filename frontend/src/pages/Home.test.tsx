import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Home from './Home'
import { THEME_KEY } from '../theme'

const auth = vi.hoisted(() => ({
  isAuthenticated: false,
  isInitializing: false,
  logout: vi.fn(),
}))

vi.mock('../auth/useAuth', () => ({ useAuth: () => auth }))

describe('Home navigation', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.dataset.theme = 'dark'
    auth.isAuthenticated = false
    auth.isInitializing = false
    auth.logout.mockReset()
  })

  it('keeps landing sections and account calls to action available', () => {
    render(<MemoryRouter><Home /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Make space for')
    expect(screen.getByRole('link', { name: /Start your workspace/ })).toHaveAttribute('href', '/register')
    expect(screen.getAllByRole('link', { name: 'Product' })[0]).toHaveAttribute('href', '#features')
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('uses a sticky navigation surface that matches the page background', () => {
    const { container } = render(<MemoryRouter><Home /></MemoryRouter>)
    const page = container.querySelector('.home-page')
    const header = screen.getByRole('banner')

    expect(page).toHaveClass('home-page')
    expect(header).toHaveClass('home-navbar')
    expect(header.className).not.toMatch(/backdrop|shadow/)
    expect(container.querySelector('.home-hero')).toBeInTheDocument()
    expect(container.querySelector('.home-hero-grid')).toBeInTheDocument()
  })

  it('persists theme changes from the icon-only navbar control', () => {
    render(<MemoryRouter><Home /></MemoryRouter>)
    const toggle = screen.getByRole('button', { name: 'Switch to light theme' })
    expect(toggle).not.toHaveTextContent(/theme/i)
    fireEvent.click(toggle)
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem(THEME_KEY)).toBe('light')
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeInTheDocument()
  })

  it('shows dashboard, logout, and dashboard CTAs for an authenticated user', () => {
    auth.isAuthenticated = true
    const { container } = render(<MemoryRouter><Home /></MemoryRouter>)
    expect(screen.getAllByRole('link', { name: 'Dashboard' })[0]).toHaveAttribute('href', '/dashboard')
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Go to dashboard/ })).toHaveAttribute('href', '/dashboard')
    expect(container.querySelector('.home-nav-actions a[href="/login"]')).not.toBeInTheDocument()
  })

  it('does not show guest actions while authentication is restoring and logs out once', async () => {
    auth.isInitializing = true
    const { rerender, container } = render(<MemoryRouter><Home /></MemoryRouter>)
    expect(screen.getByText('Loading account…')).toBeInTheDocument()
    expect(container.querySelector('.home-nav-actions a[href="/login"]')).not.toBeInTheDocument()
    auth.isInitializing = false
    auth.isAuthenticated = true
    let finishLogout: (() => void) | undefined
    auth.logout.mockImplementation(() => new Promise<void>((resolve) => { finishLogout = () => { auth.isAuthenticated = false; resolve() } }))
    rerender(<MemoryRouter><Home /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
    fireEvent.click(screen.getByRole('button', { name: 'Signing out…' }))
    expect(auth.logout).toHaveBeenCalledTimes(1)
    finishLogout?.()
    await waitFor(() => expect(auth.logout).toHaveBeenCalledTimes(1))
  })
})

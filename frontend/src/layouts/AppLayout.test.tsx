import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import AppLayout from './AppLayout'
import { THEME_KEY } from '../theme'

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1', name: 'Alex', role: 'ADMIN' }, logout: vi.fn() }),
}))

vi.mock('../hooks/useNotificationStream', () => ({
  useNotificationStream: () => ({ hasUpdate: false, clearUpdate: vi.fn() }),
}))

describe('AppLayout navigation and theme controls', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.dataset.theme = 'dark'
  })

  it('uses an icon-only persistent theme toggle and preserves active navigation', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AppLayout><p>Dashboard content</p></AppLayout>
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveClass('is-active')
    expect(screen.getByRole('link', { name: 'TaskForge Home' })).toHaveAttribute('href', '/')
    const toggle = screen.getByRole('button', { name: 'Switch to light theme' })
    expect(toggle).toHaveAttribute('title', 'Switch to light theme')
    expect(toggle).not.toHaveTextContent(/theme/i)

    fireEvent.click(toggle)
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem(THEME_KEY)).toBe('light')
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeInTheDocument()
    expect(container.querySelector('.app-shell')).toBeInTheDocument()
    expect(container.querySelector('.app-header')).toBeInTheDocument()
    expect(container.querySelector('.app-main')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(container.querySelector('.app-sidebar-desktop')).toHaveClass('is-collapsed')
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'TaskForge Home' })).toBeInTheDocument()
  })
})

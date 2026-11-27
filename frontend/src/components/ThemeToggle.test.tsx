import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ThemeToggle } from './ThemeToggle'

describe('ThemeToggle', () => {
  it('shows the moon action in light mode', () => {
    const onToggle = vi.fn()
    render(<ThemeToggle theme="light" onToggle={onToggle} />)

    const button = screen.getByRole('button', { name: 'Switch to dark theme' })
    expect(button).toHaveAttribute('title', 'Switch to dark theme')
    expect(button.querySelector('.theme-toggle-icon')).toBeInTheDocument()
    expect(button).not.toHaveTextContent(/theme/i)
    fireEvent.click(button)
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('shows the sun action in dark mode', () => {
    render(<ThemeToggle theme="dark" onToggle={() => undefined} />)
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})

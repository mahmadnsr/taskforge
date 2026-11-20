import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Logo } from './Logo'

describe('Logo', () => {
  it('renders the Work-Bench logo image', () => {
    render(<Logo />)

    const logo = screen.getByAltText('Work-Bench Logo')
    expect(logo).toBeInTheDocument()
  })

  it('applies the default size class', () => {
    render(<Logo />)

    const logo = screen.getByAltText('Work-Bench Logo')
    expect(logo).toHaveClass('size-16')
  })

  it('applies a custom className when provided', () => {
    render(<Logo className="size-20" />)

    const logo = screen.getByAltText('Work-Bench Logo')
    expect(logo).toHaveClass('size-20')
  })
})

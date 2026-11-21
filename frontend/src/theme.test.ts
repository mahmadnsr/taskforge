import { afterEach, describe, expect, it, vi } from 'vitest'
import { readTheme, setTheme, THEME_KEY } from './theme'

afterEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
  vi.restoreAllMocks()
})

describe('theme preference', () => {
  it('defaults to light and ignores unexpected stored values', () => {
    expect(readTheme()).toBe('light')
    localStorage.setItem(THEME_KEY, 'unexpected')
    expect(readTheme()).toBe('light')
  })

  it('persists dark theme and restores it on a later read', () => {
    setTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(readTheme()).toBe('dark')
    setTheme('light')
    expect(readTheme()).toBe('light')
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { readTheme, setTheme, THEME_KEY } from './theme'

afterEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
  vi.restoreAllMocks()
})

describe('theme preference', () => {
  it('defaults to dark and ignores unexpected stored values', () => {
    expect(readTheme()).toBe('dark')
    localStorage.setItem(THEME_KEY, 'unexpected')
    expect(readTheme()).toBe('dark')
  })

  it('restores explicit dark and light preferences and switches themes', () => {
    setTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(readTheme()).toBe('dark')
    setTheme('light')
    expect(readTheme()).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('falls back to dark when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('unavailable') })
    expect(readTheme()).toBe('dark')
  })
})

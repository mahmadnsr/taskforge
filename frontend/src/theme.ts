export type Theme = 'light' | 'dark'

export const THEME_KEY = 'taskforge-theme'

export function readTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#111827' : '#f8fafc')
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // The current tab still switches theme when storage is unavailable.
  }
}

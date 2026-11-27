import { MoonIcon, SunIcon } from './icons'
import type { Theme } from '../theme'

export function ThemeToggle({
  theme,
  onToggle,
  className = '',
}: {
  theme: Theme
  onToggle: () => void
  className?: string
}) {
  const nextTheme = theme === 'light' ? 'dark' : 'light'
  const label = `Switch to ${nextTheme} theme`

  return (
    <button
      type="button"
      className={`theme-toggle ${className}`.trim()}
      onClick={onToggle}
      aria-label={label}
      title={label}
      aria-pressed={theme === 'dark'}
    >
      {theme === 'light' ? (
        <MoonIcon className="theme-toggle-icon size-5" />
      ) : (
        <SunIcon className="theme-toggle-icon size-5" />
      )}
    </button>
  )
}

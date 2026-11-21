import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { BellIcon, ChevronsLeftIcon, ChevronsRightIcon, CloseIcon, DashboardIcon, FolderIcon, InboxIcon, ListIcon, LogOutIcon, MenuIcon, UsersIcon } from '../components/icons'
import { Logo } from '../components/Logo'
import { useNotificationStream } from '../hooks/useNotificationStream'
import { readTheme, setTheme, type Theme } from '../theme'
import './AppLayout.css'

const navigation = [
  { label: 'Workspace', items: [{ label: 'Dashboard', to: '/dashboard', icon: DashboardIcon }, { label: 'Inbox', to: '/inbox', icon: InboxIcon }] },
  { label: 'Manage', items: [{ label: 'Projects', to: '/projects', icon: FolderIcon }, { label: 'Tasks', to: '/tasks', icon: ListIcon }, { label: 'Team', to: '/members', icon: UsersIcon }] },
]

export default function AppLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [theme, updateTheme] = useState<Theme>(readTheme)
  const menuButton = useRef<HTMLButtonElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const { user, logout } = useAuth()
  const { hasUpdate, clearUpdate } = useNotificationStream()
  const location = useLocation()
  const navigate = useNavigate()
  const userName = (user as { name?: string } | null)?.name ?? 'Account'
  const userRole = (user as { role?: string } | null)?.role ?? ''
  const initials = userName.slice(0, 2).toUpperCase()
  const currentItem = navigation.flatMap(group => group.items).find(item => location.pathname.startsWith(item.to))

  useEffect(() => {
    if (!mobileOpen) return
    const opener = menuButton.current
    closeButton.current?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false)
      if (event.key !== 'Tab') return
      const sidebar = closeButton.current?.closest('aside')
      const controls = sidebar?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]')
      if (!controls?.length) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleKey)
    return () => { document.removeEventListener('keydown', handleKey); opener?.focus() }
  }, [mobileOpen])

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    updateTheme(next)
  }
  const handleLogout = () => { void logout(); navigate('/login', { replace: true }) }

  const sidebarBody = (isCollapsed: boolean, onNavigate?: () => void) => <>
    <div className="app-sidebar-brand">
      <Logo className="size-9 shrink-0" />
      {!isCollapsed && <span className="app-brand-name">TaskForge</span>}
      {!onNavigate && <button type="button" className="app-icon-button app-collapse-button" onClick={() => setCollapsed(value => !value)} aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!isCollapsed}>{isCollapsed ? <ChevronsRightIcon className="size-4" /> : <ChevronsLeftIcon className="size-4" />}</button>}
    </div>
    <nav className="app-sidebar-nav" aria-label="Primary navigation">
      {navigation.map(group => <div className="app-nav-group" key={group.label}>
        {!isCollapsed && <p className="app-nav-heading">{group.label}</p>}
        <ul>{group.items.map(item => { const Icon = item.icon; return <li key={item.to}><NavLink to={item.to} onClick={onNavigate} aria-label={isCollapsed ? item.label : undefined} title={isCollapsed ? item.label : undefined} className={({ isActive }) => `app-nav-link${isActive ? ' is-active' : ''}${isCollapsed ? ' is-collapsed' : ''}`}><Icon className="size-[18px] shrink-0" />{!isCollapsed && <span>{item.label}</span>}</NavLink></li> })}</ul>
      </div>)}
    </nav>
    <div className="app-sidebar-footer"><div className="app-avatar" aria-hidden="true">{initials}</div>{!isCollapsed && <div className="app-account"><span>{userName}</span>{userRole && <small>{userRole}</small>}</div>}<button type="button" onClick={handleLogout} className="app-icon-button" aria-label="Sign out" title="Sign out"><LogOutIcon className="size-[18px]" /></button></div>
  </>

  return <div className="app-shell">
    <a className="app-skip-link" href="#main-content">Skip to content</a>
    <aside className={`app-sidebar app-sidebar-desktop${collapsed ? ' is-collapsed' : ''}`}>{sidebarBody(collapsed)}</aside>
    {mobileOpen && <div className="app-mobile-layer"><button type="button" className="app-mobile-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} /><aside className="app-sidebar app-sidebar-mobile" aria-label="Mobile navigation"><button ref={closeButton} type="button" className="app-icon-button app-mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><CloseIcon className="size-5" /></button>{sidebarBody(false, () => setMobileOpen(false))}</aside></div>}
    <div className="app-workspace"><header className="app-header">
      <button ref={menuButton} type="button" className="app-icon-button app-menu-button" onClick={() => setMobileOpen(true)} aria-label="Open navigation" aria-expanded={mobileOpen}><MenuIcon className="size-5" /></button>
      <div className="app-page-title"><span>Workspace</span><strong>{currentItem?.label ?? 'Dashboard'}</strong></div>
      <div className="app-header-actions"><button type="button" className="app-theme-button" onClick={toggleTheme} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} aria-pressed={theme === 'dark'}>{theme === 'light' ? 'Dark theme' : 'Light theme'}</button><NavLink to="/inbox" onClick={clearUpdate} aria-label={hasUpdate ? 'Notifications, new updates' : 'Notifications'} className="app-icon-button app-notifications"><BellIcon className="size-5" />{hasUpdate && <span className="app-notification-dot" aria-hidden="true" />}</NavLink><div className="app-avatar app-header-avatar" aria-label={userName}>{initials}</div></div>
    </header><main id="main-content" className="app-main" tabIndex={-1}><div className="app-content">{children}</div></main></div>
  </div>
}

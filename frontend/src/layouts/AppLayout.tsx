import { useState } from 'react'
import type { ComponentType, ReactNode, SVGProps } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import {
  CalendarIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  CloseIcon,
  DashboardIcon,
  FolderIcon,
  InboxIcon,
  ListIcon,
  LogOutIcon,
  MenuIcon,
  UsersIcon,
} from '../components/icons'

type NavIcon = ComponentType<SVGProps<SVGSVGElement>>

const navigation: {
  label: string
  items: { label: string; to: string; icon: NavIcon }[]
}[] = [
  {
    label: 'Workspace',
    items: [
      { label: 'Dashboard', to: '/dashboard', icon: DashboardIcon },
      { label: 'Projects', to: '/projects', icon: FolderIcon },
      { label: 'Members', to: '/members', icon: UsersIcon },
    ],
  },
]

const upcomingFeatures: { label: string; icon: NavIcon }[] = [
  { label: 'My tasks', icon: ListIcon },
  { label: 'Inbox', icon: InboxIcon },
  { label: 'Calendar', icon: CalendarIcon },
]

export default function AppLayout({
  children,
}: {
  children: ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState('')

  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // The mobile drawer is always shown expanded.
  const expanded = sidebarOpen || mobileSidebarOpen
  const initial = user?.name?.charAt(0)?.toUpperCase() || 'U'

  async function handleLogout() {
    setLoggingOut(true)
    setLogoutError('')

    try {
      await logout()
      navigate('/login', { replace: true })
    } catch {
      setLogoutError('Could not sign out. Please try again.')
    } finally {
      setLoggingOut(false)
    }
  }

  function closeMobileSidebar() {
    setMobileSidebarOpen(false)
  }

  const itemBase =
    'flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors'

  return (
    <div className="min-h-screen bg-(--background) text-(--text-primary)">
      <a
        href="#app-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-(--accent) focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-[#082f38]"
      >
        Skip to content
      </a>

      {mobileSidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          onClick={closeMobileSidebar}
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-(--border-subtle) bg-(--background-secondary) transition-[width,transform] duration-200 ${
          expanded ? 'w-64' : 'w-[76px]'
        } ${
          mobileSidebarOpen
            ? 'translate-x-0'
            : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Brand */}
        <div
          className={`flex h-[60px] shrink-0 items-center gap-3 border-b border-(--border-subtle) px-4 ${
            expanded ? '' : 'justify-center'
          }`}
        >
          <NavLink
            to="/dashboard"
            aria-label="TaskForge home"
            onClick={closeMobileSidebar}
            className="grid size-9 shrink-0 place-items-center rounded-lg bg-(--accent) text-base font-extrabold text-[#082f38] transition-colors hover:bg-(--accent-hover)"
          >
            T
          </NavLink>

          {expanded && (
            <p className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight text-(--text-primary)">
              TaskForge
            </p>
          )}

          {mobileSidebarOpen && (
            <button
              type="button"
              onClick={closeMobileSidebar}
              aria-label="Close navigation menu"
              className="grid size-8 place-items-center rounded-lg text-(--text-secondary) transition-colors hover:bg-(--surface-hover) hover:text-(--text-primary) md:hidden"
            >
              <CloseIcon />
            </button>
          )}
        </div>

        {/* Account */}
        <div className="shrink-0 border-b border-(--border-subtle) p-3">
          <div
            className={`flex items-center gap-3 rounded-lg p-2 ${
              expanded ? '' : 'justify-center'
            }`}
          >
            <div
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center rounded-full border border-(--accent-border) bg-(--accent-subtle) text-xs font-semibold text-(--accent-text)"
            >
              {initial}
            </div>

            {expanded && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-(--text-primary)">
                  {user?.name || 'Your account'}
                </p>
                {user?.email && (
                  <p className="truncate text-xs text-(--text-muted)">
                    {user.email}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav
          aria-label="Workspace navigation"
          className="flex-1 space-y-6 overflow-y-auto px-3 py-4"
        >
          {navigation.map((group) => (
            <div key={group.label}>
              {expanded && (
                <p className="mb-2 px-3 text-[11px] font-medium uppercase tracking-wider text-(--text-muted)">
                  {group.label}
                </p>
              )}

              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    title={expanded ? undefined : item.label}
                    onClick={closeMobileSidebar}
                    className={({ isActive }) =>
                      `${itemBase} ${expanded ? '' : 'justify-center'} ${
                        isActive
                          ? 'bg-(--surface-hover) font-medium text-(--text-primary)'
                          : 'text-(--text-secondary) hover:bg-(--surface) hover:text-(--text-primary)'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon
                          className={`size-[18px] shrink-0 ${
                            isActive ? 'text-(--accent)' : ''
                          }`}
                        />
                        {expanded && (
                          <span className="truncate">{item.label}</span>
                        )}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}

          <div>
            {expanded && (
              <p className="mb-2 px-3 text-[11px] font-medium uppercase tracking-wider text-(--text-muted)">
                Coming soon
              </p>
            )}

            <div className="space-y-0.5">
              {upcomingFeatures.map((item) => (
                <div
                  key={item.label}
                  aria-disabled="true"
                  title={`${item.label} — coming soon`}
                  className={`${itemBase} cursor-not-allowed text-(--text-disabled) ${
                    expanded ? '' : 'justify-center'
                  }`}
                >
                  <item.icon className="size-[18px] shrink-0" />
                  {expanded && (
                    <>
                      <span className="truncate">{item.label}</span>
                      <span className="ml-auto rounded border border-(--border-subtle) px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                        Soon
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </nav>

        {/* Footer */}
        <div className="shrink-0 space-y-0.5 border-t border-(--border-subtle) p-3">
          {logoutError && (
            <p
              role="alert"
              className="mb-2 px-2 text-xs leading-5 text-(--danger)"
            >
              {logoutError}
            </p>
          )}

          <button
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            title={sidebarOpen ? undefined : 'Expand sidebar'}
            className={`${itemBase} hidden w-full text-(--text-secondary) hover:bg-(--surface) hover:text-(--text-primary) md:flex ${
              sidebarOpen ? '' : 'justify-center'
            }`}
          >
            {sidebarOpen ? <ChevronsLeftIcon /> : <ChevronsRightIcon />}
            {sidebarOpen && <span>Collapse</span>}
          </button>

          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            title={expanded ? undefined : 'Sign out'}
            className={`${itemBase} w-full text-(--text-secondary) hover:bg-(--danger-bg) hover:text-(--danger) disabled:opacity-50 ${
              expanded ? '' : 'justify-center'
            }`}
          >
            <LogOutIcon />
            {expanded && (
              <span>{loggingOut ? 'Signing out…' : 'Sign out'}</span>
            )}
          </button>
        </div>
      </aside>

      <div
        className={`min-h-screen transition-[margin] duration-200 ${
          sidebarOpen ? 'md:ml-64' : 'md:ml-[76px]'
        }`}
      >
        <header className="sticky top-0 z-30 flex h-[60px] items-center gap-3 border-b border-(--border-subtle) bg-(--background)/90 px-4 backdrop-blur-xl sm:px-6">
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label="Open navigation menu"
            className="grid size-9 place-items-center rounded-lg border border-(--border) text-(--text-secondary) transition-colors hover:bg-(--surface-hover) hover:text-(--text-primary) md:hidden"
          >
            <MenuIcon />
          </button>

          <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
            <p className="truncate text-[13px] text-(--text-muted)">
              TaskForge
              <span className="mx-2 text-(--text-disabled)">/</span>
              <span className="text-(--text-primary)">
                {navigation[0].items.find(
                  (item) => item.to === location.pathname,
                )?.label || 'Workspace'}
              </span>
            </p>
          </nav>

          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden max-w-40 truncate text-[13px] text-(--text-secondary) sm:block">
              {user?.name || 'Account'}
            </span>

            <div
              aria-hidden="true"
              className="grid size-8 place-items-center rounded-full border border-(--accent-border) bg-(--accent-subtle) text-xs font-semibold text-(--accent-text)"
            >
              {initial}
            </div>
          </div>
        </header>

        <main id="app-content" className="min-h-[calc(100vh-60px)]">
          {children}
        </main>
      </div>
    </div>
  )
}
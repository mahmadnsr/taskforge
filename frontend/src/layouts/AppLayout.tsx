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
      { label: 'Inbox', to: '/inbox', icon: InboxIcon },
      { label: 'Calendar', to: '/calendar', icon: CalendarIcon },
    ],
  },
  {
    label: 'Manage',
    items: [
      { label: 'Projects', to: '/projects', icon: FolderIcon },
      { label: 'Tasks', to: '/tasks', icon: ListIcon },
      { label: 'Team', to: '/team', icon: UsersIcon },
    ],
  },
]

const iconCls = 'h-[17px] w-[17px] shrink-0 [stroke-width:1.4]'

export default function AppLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const userName = (user as { name?: string } | null)?.name ?? 'Account'
  const userRole = (user as { role?: string } | null)?.role ?? ''
  const initials = userName.slice(0, 2).toUpperCase()

  const currentItem = navigation
    .flatMap((group) => group.items)
    .find((item) => location.pathname.startsWith(item.to))

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const sidebarBody = (isCollapsed: boolean, onNavigate?: () => void) => (
    <>
      {/* brand */}
      <div
        className={`flex h-16 shrink-0 items-center border-b border-stone-100 ${
          isCollapsed ? 'justify-center px-0' : 'gap-2.5 px-5'
        }`}
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-teal-700">
          <span className="h-2 w-2 rounded-[2px] bg-teal-50" />
        </div>
        {!isCollapsed && (
          <span className="truncate text-[13px] font-light tracking-[0.14em] text-stone-800">
            WORKSPACE
          </span>
        )}
      </div>

      {/* nav */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-5">
        {navigation.map((group) => (
          <div key={group.label} className="mb-7 last:mb-0">
            {isCollapsed ? (
              <div className="mx-auto mb-3 h-px w-6 bg-stone-200" />
            ) : (
              <p className="mb-2 px-3 text-[9.5px] font-medium uppercase tracking-[0.22em] text-stone-400">
                {group.label}
              </p>
            )}

            <ul className="space-y-px">
              {group.items.map((item) => {
                const Icon = item.icon
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      onClick={onNavigate}
                      title={isCollapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        [
                          'group relative flex items-center rounded-lg transition-colors duration-150',
                          isCollapsed
                            ? 'mx-auto h-10 w-10 justify-center'
                            : 'gap-3 px-3 py-2 text-[13px] font-light tracking-wide',
                          isActive
                            ? 'bg-teal-50/80 text-teal-900'
                            : 'text-stone-500 hover:bg-stone-100/70 hover:text-stone-800',
                        ].join(' ')
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && !isCollapsed && (
                            <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-full bg-teal-600" />
                          )}
                          <Icon
                            className={`${iconCls} ${
                              isActive
                                ? 'text-teal-700'
                                : 'text-stone-400 group-hover:text-stone-600'
                            }`}
                          />
                          {!isCollapsed && <span className="truncate">{item.label}</span>}
                        </>
                      )}
                    </NavLink>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* footer: user + collapse */}
      <div className="shrink-0 border-t border-stone-100 p-2.5">
        <div
          className={`flex items-center rounded-lg ${
            isCollapsed ? 'flex-col gap-2 py-1' : 'gap-2.5 px-2 py-2'
          }`}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-100 text-[11px] font-medium tracking-wide text-stone-500">
            {initials}
          </div>

          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-light tracking-wide text-stone-800">
                {userName}
              </p>
              {userRole && (
                <p className="truncate text-[11px] font-light tracking-wide text-stone-400">
                  {userRole}
                </p>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleLogout}
            title="Sign out"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
          >
            <LogOutIcon className="h-[15px] w-[15px] [stroke-width:1.4]" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className={`mt-1 hidden w-full items-center rounded-lg py-1.5 text-[11px] font-light tracking-wide text-stone-400 transition-colors hover:bg-stone-100/70 hover:text-stone-600 lg:flex ${
            collapsed ? 'justify-center' : 'justify-end px-2'
          }`}
        >
          {collapsed ? (
            <ChevronsRightIcon className="h-4 w-4 [stroke-width:1.4]" />
          ) : (
            <ChevronsLeftIcon className="h-4 w-4 [stroke-width:1.4]" />
          )}
        </button>
      </div>
    </>
  )

  return (
    <div className="flex min-h-screen bg-[#F6F6F4] text-stone-700 antialiased">
      {/* desktop sidebar */}
      <aside
        className={`hidden shrink-0 flex-col border-r border-stone-200/70 bg-white transition-[width] duration-300 ease-out lg:flex ${
          collapsed ? 'w-[72px]' : 'w-[244px]'
        }`}
      >
        {sidebarBody(collapsed)}
      </aside>

      {/* mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-stone-900/15 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-[260px] flex-col border-r border-stone-200/70 bg-white shadow-[0_16px_48px_-16px_rgba(28,25,23,0.18)]">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-5 z-10 flex h-7 w-7 items-center justify-center rounded-md text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
            >
              <CloseIcon className="h-4 w-4 [stroke-width:1.4]" />
            </button>
            {sidebarBody(false, () => setMobileOpen(false))}
          </aside>
        </div>
      )}

      {/* main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-stone-200/70 bg-[#F6F6F4]/85 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-stone-500 transition-colors hover:bg-white hover:text-stone-800 lg:hidden"
          >
            <MenuIcon className="h-[18px] w-[18px] [stroke-width:1.4]" />
          </button>

          <div className="min-w-0">
            <p className="text-[9.5px] font-medium uppercase tracking-[0.22em] text-stone-400">
              {currentItem ? 'Workspace' : 'Overview'}
            </p>
            <h1 className="truncate text-[13.5px] font-light tracking-wide text-stone-800">
              {currentItem?.label ?? 'Dashboard'}
            </h1>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-stone-200 bg-white text-[11px] font-medium tracking-wide text-stone-500">
              {initials}
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1440px]">{children}</div>
        </main>
      </div>
    </div>
  )
}
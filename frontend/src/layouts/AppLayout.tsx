import { useState } from 'react'
import type { ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import {
  BellIcon, ChevronsLeftIcon, ChevronsRightIcon, CloseIcon,
  DashboardIcon, FolderIcon, InboxIcon, ListIcon, LogOutIcon,
  MenuIcon, UsersIcon,
} from '../components/icons'
import { Logo } from '../components/Logo' // Reusable Logo Import
import { useNotificationStream } from '../hooks/useNotificationStream'


const navigation = [
  {
    label: 'Workspace',
    items: [
      { label: 'Dashboard', to: '/dashboard', icon: DashboardIcon },
      { label: 'Inbox', to: '/inbox', icon: InboxIcon },
    ],
  },
  {
    label: 'Manage',
    items: [
      { label: 'Projects', to: '/projects', icon: FolderIcon },
      { label: 'Tasks', to: '/tasks', icon: ListIcon },
      { label: 'Team', to: '/members', icon: UsersIcon },
    ],
  },
]

const iconCls = 'h-[18px] w-[18px] shrink-0 [stroke-width:1.5]'

export default function AppLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const { user, logout } = useAuth()
  const { hasUpdate, clearUpdate } = useNotificationStream()
  const location = useLocation()
  const navigate = useNavigate()

  const userName = (user as { name?: string } | null)?.name ?? 'Account'
  const userRole = (user as { role?: string } | null)?.role ?? ''
  const initials = userName.slice(0, 2).toUpperCase()

  const currentItem = navigation.flatMap((g) => g.items).find((item) => location.pathname.startsWith(item.to))

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const sidebarBody = (isCollapsed: boolean, onNavigate?: () => void) => (
    <>
      <div className={`flex h-[72px] shrink-0 items-center border-b border-white/[0.06] transition-all ${isCollapsed ? 'flex-col justify-center gap-1.5 px-0' : 'justify-between px-5'}`}>
        <div className="flex items-center gap-3">

          {/* Reusable Logo with increased size */}
          <Logo className="size-10 shrink-0" />

          {!isCollapsed && (
            <span className="truncate text-[16px] font-semibold tracking-tight text-white">
              Work-Bench
            </span>
          )}
        </div>

        {!onNavigate && (
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="hidden lg:flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-white/10 hover:text-white"
          >
            {isCollapsed ? <ChevronsRightIcon className="h-4 w-4" /> : <ChevronsLeftIcon className="h-4 w-4" />}
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-6">
        {navigation.map((group) => (
          <div key={group.label} className="mb-8 last:mb-0">
            {isCollapsed ? (
              <div className="mx-auto mb-4 h-px w-6 bg-white/10" />
            ) : (
              <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                {group.label}
              </p>
            )}

            <ul className="space-y-1">
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
                          'group relative flex items-center rounded-xl transition-all duration-300',
                          isCollapsed ? 'mx-auto h-10 w-10 justify-center' : 'gap-3 px-3 py-2.5 text-[13.5px]',
                          isActive
                            ? 'bg-white/[0.08] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]'
                            : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200',
                        ].join(' ')
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && !isCollapsed && (
                            <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-teal-400 shadow-[0_0_8px_rgba(45,212,191,0.6)]" />
                          )}
                          <Icon className={`${iconCls} transition-colors ${isActive ? 'text-teal-400' : 'text-zinc-500 group-hover:text-zinc-300'}`} />
                          {!isCollapsed && <span className="truncate font-medium">{item.label}</span>}
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

      <div className="shrink-0 border-t border-white/[0.06] p-3">
        <div className={`flex items-center rounded-xl transition-all hover:bg-white/[0.04] ${isCollapsed ? 'flex-col gap-2 py-2' : 'gap-3 px-2 py-2'}`}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-zinc-700 to-zinc-800 text-[12px] font-semibold text-zinc-200 ring-1 ring-white/10">
            {initials}
          </div>

          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-zinc-200">{userName}</p>
              {userRole && <p className="truncate text-[11px] text-zinc-500">{userRole}</p>}
            </div>
          )}

          <button
            type="button"
            onClick={handleLogout}
            title="Sign out"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOutIcon className="h-4 w-4 [stroke-width:1.5]" />
          </button>
        </div>
      </div>
    </>
  )

  return (
    <div className="flex min-h-screen bg-[#050505] text-zinc-300 antialiased selection:bg-teal-500/30">
      <aside className={`hidden shrink-0 flex-col border-r border-white/[0.06] bg-[#050505]/80 backdrop-blur-2xl transition-[width] duration-300 ease-out lg:flex ${collapsed ? 'w-[76px]' : 'w-[260px]'}`}>
        {sidebarBody(collapsed)}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-[280px] flex-col border-r border-white/[0.06] bg-[#050505] shadow-2xl">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-4 top-5 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
            {sidebarBody(false, () => setMobileOpen(false))}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-[72px] items-center gap-4 border-b border-white/[0.06] bg-[#050505]/80 px-6 backdrop-blur-2xl lg:px-10">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white lg:hidden"
          >
            <MenuIcon className="h-5 w-5" />
          </button>

          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
              {currentItem ? 'Workspace' : 'Overview'}
            </p>
            <h1 className="truncate text-[15px] font-medium text-zinc-100">
              {currentItem?.label ?? 'Dashboard'}
            </h1>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <NavLink
              to="/inbox"
              onClick={clearUpdate}
              title="Notifications"
              className="relative flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/10 hover:text-white"
            >
              <BellIcon className="h-5 w-5" />
              {hasUpdate && <span aria-label="New notifications" className="absolute right-1 top-1 h-2 w-2 rounded-full bg-teal-400" />}
            </NavLink>

            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 text-[12px] font-medium text-zinc-300 ring-1 ring-white/10 transition-transform hover:scale-105">
              {initials}
            </div>
          </div>
        </header>

        <main className="relative flex-1 px-6 py-8 lg:px-10">
          <div className="mx-auto w-full max-w-[1200px]">{children}</div>
        </main>
      </div>
    </div>
  )
}

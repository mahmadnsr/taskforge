import { lazy, Suspense, useEffect } from 'react'
import { ApolloProvider } from '@apollo/client/react'
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { useAuth } from './auth/useAuth'
import { apolloClient } from './lib/apollo'
import AppLayout from './layouts/AppLayout'
import { Logo } from './components/Logo'

const Tasks = lazy(() => import('./pages/Tasks'))
const Home = lazy(() => import('./pages/Home'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const Projects = lazy(() => import('./pages/Projects'))
const Members = lazy(() => import('./pages/Members'))
const AcceptInvitation = lazy(() => import('./pages/AcceptInvitation'))
const Inbox = lazy(() => import('./pages/Inbox'))

function PageLoader() {
  return (
    <main
      className="grid min-h-screen place-items-center bg-[#F6F6F4] text-stone-700"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-4">
        <div
          className="size-9 animate-spin rounded-full border-2 border-stone-200 border-t-teal-700"
          aria-hidden="true"
        />
        <p className="text-[13px] font-light tracking-wide text-stone-400">
          Loading Work-Bench…
        </p>
      </div>
    </main>
  )
}

function DocumentTitle() {
  const { pathname } = useLocation()
  useEffect(() => {
    const titles: Record<string, string> = {
      '/': 'TaskForge — Team Workspace',
      '/dashboard': 'Dashboard | TaskForge',
      '/projects': 'Projects | TaskForge',
      '/tasks': 'Tasks | TaskForge',
      '/inbox': 'Inbox | TaskForge',
      '/members': 'Team | TaskForge',
      '/login': 'Log in | TaskForge',
      '/register': 'Create account | TaskForge',
      '/accept-invitation': 'Join your team | TaskForge',
    }
    document.title = titles[pathname] ?? 'TaskForge'
  }, [pathname])
  return null
}

function NotFound() {
  const { isAuthenticated, isInitializing } = useAuth()
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--app-bg)] px-5 text-[var(--app-text)]">
      <section className="w-full max-w-md text-center">
        <Link to="/" className="mx-auto inline-flex items-center gap-3 rounded-xl px-3 py-2 text-[var(--app-text)] transition hover:bg-[var(--app-surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--app-focus)]">
          <Logo className="size-[68px]" /><span className="text-xl font-bold tracking-tight">TaskForge</span>
        </Link>
        <p className="mt-8 text-xs font-semibold uppercase tracking-[.18em] text-[var(--app-accent)]">
          Error 404
        </p>

        <h1 className="mt-3 text-[32px] font-semibold tracking-tight">
          Page not found
        </h1>

        <p className="mt-3 text-[15px] leading-7 text-[var(--app-muted)]">
          This address does not exist or may have moved. Choose a safe place to continue.
        </p>

        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link to="/" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--app-accent)] px-5 text-sm font-semibold text-[var(--app-bg)] transition hover:bg-[var(--app-nav-hover)]">Go to Home</Link>
          {!isInitializing && isAuthenticated && <Link to="/dashboard" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--app-surface)] px-5 text-sm font-semibold text-[var(--app-text)] shadow-[var(--app-shadow)] transition hover:bg-[var(--app-surface-hover)]">Go to Dashboard</Link>}
        </div>
      </section>
    </main>
  )
}

function ProtectedRoute({
  children,
}: {
  children: React.ReactNode
}) {
  const { isAuthenticated, isInitializing, sessionExpired } = useAuth()
  const location = useLocation()

  if (isInitializing) {
    return <PageLoader />
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: `${location.pathname}${location.search}`,
          message: sessionExpired ? 'Your session has expired. Please log in again.' : undefined,
        }}
      />
    )
  }

  return children
}

function LoginRoute() {
  return <Login />
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <DocumentTitle />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/register" element={<Register />} />

        <Route
          path="/accept-invitation"
          element={
            <ProtectedRoute>
              <AcceptInvitation />
            </ProtectedRoute>
          }
        />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Dashboard />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/inbox"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Inbox />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/projects"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Projects />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/tasks"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Tasks />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/members"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Members />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <ApolloProvider client={apolloClient}>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ApolloProvider>
  )
}

import { lazy, Suspense } from 'react'
import { ApolloProvider } from '@apollo/client/react'
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { apolloClient } from './lib/apollo'
import AppLayout from './layouts/AppLayout'

const Home = lazy(() => import('./pages/Home'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const Projects = lazy(() => import('./pages/Projects'))
const Members = lazy(() => import('./pages/Members'))
const AcceptInvitation = lazy(() => import('./pages/AcceptInvitation'))

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

function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#F6F6F4] px-5 text-stone-700">
      <section className="max-w-md text-center">
        <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-teal-700/80">
          Error 404
        </p>

        <h1 className="mt-4 text-[28px] font-light tracking-tight text-stone-900">
          Page not found
        </h1>

        <p className="mt-3 text-[13px] font-light leading-7 text-stone-400">
          The page you are looking for does not exist.
        </p>

        <Link
          to="/"
          className="mt-6 inline-flex min-h-10 items-center justify-center rounded-xl bg-teal-700 px-5 py-3 text-[12.5px] font-medium tracking-wide text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#F6F6F4]"
        >
          Back to Work-Bench
        </Link>
      </section>
    </main>
  )
}

function ProtectedRoute({
  children,
}: {
  children: React.ReactNode
}) {
  const { isAuthenticated, isInitializing } = useAuth()
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
        }}
      />
    )
  }

  return children
}

function LoginRoute() {
  const location = useLocation()

  const message = (
    location.state as { message?: string } | null
  )?.message

  return (
    <>
      {message && (
        <div
          role="status"
          className="fixed left-1/2 top-4 z-10 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-[12.5px] font-light text-emerald-800 shadow-[0_8px_24px_-14px_rgba(28,25,23,0.12)]"
        >
          {message}
        </div>
      )}

      <Login />
    </>
  )
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
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
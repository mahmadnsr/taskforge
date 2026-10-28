import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

const EMAIL_MAX_LENGTH = 254
const PASSWORD_MAX_LENGTH = 72

type LoginLocationState = {
  from?: string
}

export default function Login() {
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const redirectTo =
    (location.state as LoginLocationState | null)?.from || '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (isAuthenticated) {
    return <Navigate to={redirectTo} replace />
  }

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()

    if (loading) return

    setError('')

    const normalizedEmail = email.trim()

    if (
      normalizedEmail.length === 0 ||
      normalizedEmail.length > EMAIL_MAX_LENGTH
    ) {
      setError('Please enter a valid email address.')
      return
    }

    if (
      password.length === 0 ||
      password.length > PASSWORD_MAX_LENGTH
    ) {
      setError('Password must be between 1 and 72 characters.')
      return
    }

    setLoading(true)

    try {
      await login(normalizedEmail, password)
      navigate(redirectTo, { replace: true })
    } catch {
      setError('Unable to sign in. Check your credentials and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#080d18] px-5 py-10">
      <section className="w-full max-w-md">
        <Link to="/" className="mb-9 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-cyan-400 text-lg font-black text-slate-950">
            T
          </span>
          <span className="text-2xl font-bold tracking-tight text-white">
            TaskForge
          </span>
        </Link>

        <div className="rounded-2xl border border-white/10 bg-white/4 p-7 shadow-2xl shadow-black/20 sm:p-9">
          <p className="mb-3 text-sm font-semibold text-cyan-400">
            YOUR WORKSPACE AWAITS
          </p>

          <h1 className="text-3xl font-bold tracking-tight text-white">
            Welcome back
          </h1>

          <p className="mt-2 text-sm leading-6 text-slate-400">
            Sign in to manage your projects and collaborate with your team.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-medium text-slate-200"
              >
                Email address
              </label>

              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                inputMode="email"
                maxLength={EMAIL_MAX_LENGTH}
                required
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value)
                  if (error) setError('')
                }}
                placeholder="you@company.com"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'login-error' : undefined}
                className="w-full rounded-xl border border-white/10 bg-[#0c1322] px-4 py-3 text-white placeholder:text-slate-600 focus:border-cyan-400"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-medium text-slate-200"
              >
                Password
              </label>

              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                maxLength={PASSWORD_MAX_LENGTH}
                required
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value)
                  if (error) setError('')
                }}
                placeholder="Enter your password"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'login-error' : undefined}
                className="w-full rounded-xl border border-white/10 bg-[#0c1322] px-4 py-3 text-white placeholder:text-slate-600 focus:border-cyan-400"
              />
            </div>

            {error && (
              <p
                id="login-error"
                role="alert"
                className="rounded-lg border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-300"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="w-full rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-400">
            New to TaskForge?{' '}
            <Link
              to="/register"
              state={{ from: redirectTo }}
              className="font-semibold text-cyan-400 hover:text-cyan-300"
            >
              Create an account
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-slate-600">
          Built for focused teams and better work.
        </p>
      </section>
    </main>
  )
}
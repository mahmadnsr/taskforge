import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { Logo } from '../components/Logo' // Naya Logo Import

const EMAIL_MAX_LENGTH = 254
const PASSWORD_MAX_LENGTH = 128

type LoginLocationState = {
  from?: string
  message?: string
}

export default function Login() {
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const redirectTo = (location.state as LoginLocationState | null)?.from || '/dashboard'
  const sessionMessage = (location.state as LoginLocationState | null)?.message

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  if (isAuthenticated) {
    return <Navigate to={redirectTo} replace />
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (loading) return
    setError('')

    const normalizedEmail = email.trim()

    const nextErrors: Record<string, string> = {}

    if (
      normalizedEmail.length === 0 ||
      normalizedEmail.length > EMAIL_MAX_LENGTH ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ) {
      nextErrors.email = 'Enter a valid email address (e.g. name@company.com).'
    }

    if (password.length === 0 || password.length > PASSWORD_MAX_LENGTH) {
      nextErrors.password = 'Password is required and must be 128 characters or fewer.'
    }

    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

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
    <main className="auth-page relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050505] px-5 py-10 text-zinc-300 selection:bg-teal-500/30">
      <div className="bg-grid-pattern absolute inset-0 -z-10" />
      <div className="absolute left-1/2 top-0 -z-10 h-150 w-250 -translate-x-1/2 bg-teal-500/10 blur-[150px] animate-float rounded-[100%]" />
      <div className="absolute inset-0 bg-noise -z-10 mix-blend-overlay" />

      <section className="w-full max-w-md">

        {/* Naya Reusable Logo, Size Bada */}
        <Link to="/" className="mb-8 flex items-center justify-center gap-3 transition-transform hover:scale-105">
          <Logo className="size-28" />
          <span className="text-[24px] font-semibold tracking-tight text-white">TaskForge</span>
        </Link>

        <div className="relative overflow-hidden rounded-3xl border border-white/6 bg-[#0a0a0a] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="emerald-bg absolute inset-0" />
          <div className="camo-grid-dense absolute inset-0" />

          <div className="relative rounded-[22px] bg-linear-to-b from-white/[0.02] to-transparent p-7 sm:p-9">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-teal-400">
              Your workspace awaits
            </p>

            <h1 className="mt-2 text-[28px] font-light tracking-tight text-white">
              Welcome back
            </h1>

            <p className="mt-2 text-[13px] leading-relaxed text-zinc-500">
              Sign in to manage your projects and collaborate with your team.
            </p>

            {sessionMessage && (
              <p role="status" className="mt-5 rounded-xl bg-teal-400/10 px-4 py-3 text-[14px] leading-6 text-teal-200">
                {sessionMessage}
              </p>
            )}

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div>
                <label htmlFor="email" className="mb-2 block text-[13px] font-medium text-zinc-300">
                  Email address <span className="ml-1 text-rose-500">*</span>
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
                    setFieldErrors((old) => ({ ...old, email: '' }))
                    if (error) setError('')
                  }}
                  placeholder="you@company.com"
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
                  className={`w-full rounded-full border ${fieldErrors.email ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/20' : 'border-white/10 focus:border-teal-500/50 focus:ring-teal-500/20'} bg-[#0a0a0a]/50 px-5 py-3 text-[14px] text-zinc-200 placeholder:text-zinc-600 outline-none backdrop-blur-md transition-all hover:border-white/20 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20`}
                />
                {fieldErrors.email && <p id="login-email-error" role="alert" className="mt-2 text-xs text-rose-400">{fieldErrors.email}</p>}
              </div>

              <div>
                <label htmlFor="password" className="mb-2 block text-[13px] font-medium text-zinc-300">
                  Password <span className="ml-1 text-rose-500">*</span>
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
                    setFieldErrors((old) => ({ ...old, password: '' }))
                    if (error) setError('')
                  }}
                  placeholder="Enter your password"
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
                  className={`w-full rounded-full border ${fieldErrors.password ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/20' : 'border-white/10 focus:border-teal-500/50 focus:ring-teal-500/20'} bg-[#0a0a0a]/50 px-5 py-3 text-[14px] text-zinc-200 placeholder:text-zinc-600 outline-none backdrop-blur-md transition-all hover:border-white/20 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20`}
                />
                {fieldErrors.password && <p id="login-password-error" role="alert" className="mt-2 text-xs text-rose-400">{fieldErrors.password}</p>}
              </div>

              {error && (
                <p id="login-error" role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-[13px] text-rose-200">
                  {error}
                </p>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  aria-busy={loading}
                  className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl border border-white/30 bg-gradient-to-b from-white to-zinc-100 px-6 py-2.5 text-[14px] font-medium tracking-wide text-zinc-900 shadow-[inset_0_1px_0_rgba(255,255,255,1),0_2px_4px_rgba(0,0,0,0.1)] transition-all hover:-translate-y-0.5 hover:from-white hover:to-white hover:shadow-[inset_0_1px_0_rgba(255,255,255,1),0_4px_8px_rgba(0,0,0,0.15)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="relative z-10">
                    {loading ? 'Signing in…' : 'Sign in'}
                  </span>
                  <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                </button>
              </div>
            </form>

            <p className="mt-6 text-center text-[13px] text-zinc-500">
              New to TaskForge?{' '}
              <Link to="/register" state={{ from: redirectTo }} className="font-medium text-teal-400 transition-colors hover:text-teal-300">
                Create an account
              </Link>
            </p>
          </div>
        </div>

        <p className="mt-8 text-center text-[11px] font-medium tracking-wide text-zinc-600">
          Built for focused teams and better work.
        </p>
      </section>
    </main>
  )
}

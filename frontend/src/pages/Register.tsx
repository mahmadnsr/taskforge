import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { Logo } from '../components/Logo'
import {
  validateFullName,
  validateEmail,
  validatePassword,
  validateOrganizationName,
} from '../utils/validation'

const NAME_MAX_LENGTH = 60
const EMAIL_MAX_LENGTH = 254
const PASSWORD_MIN_LENGTH = 10
const PASSWORD_MAX_LENGTH = 128
const ORGANIZATION_MAX_LENGTH = 150

type RegisterLocationState = {
  from?: string
}

function getInvitationToken(from: string | undefined, search: string): string {
  const directToken = new URLSearchParams(search).get('token')
  if (directToken) return directToken
  if (!from) return ''
  try {
    const destination = new URL(from, window.location.origin)
    if (destination.origin !== window.location.origin || destination.pathname !== '/accept-invitation') return ''
    return destination.searchParams.get('token') ?? ''
  } catch {
    return ''
  }
}

export default function Register() {
  const { register, registerWithInvitation, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const locationState = location.state as RegisterLocationState | null

  const invitationToken = getInvitationToken(locationState?.from, location.search)
  const isInvitationRegistration = invitationToken.length > 0

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (loading) return
    setError('')

    const normalizedName = name.trim()
    const normalizedEmail = email.trim()
    const normalizedOrganization = organizationName.trim()

    const errors: Record<string, string> = {}

    const nameResult = validateFullName(normalizedName)
    const emailResult = validateEmail(normalizedEmail)
    const passwordResult = validatePassword(password)

    if (!nameResult.valid) errors.name = nameResult.message
    if (!emailResult.valid) errors['register-email'] = emailResult.message
    if (!passwordResult.valid) errors['register-password'] = passwordResult.message

    if (!isInvitationRegistration) {
      const organizationResult = validateOrganizationName(normalizedOrganization)
      if (!organizationResult.valid) errors.organization = organizationResult.message
    }

    setFieldErrors(errors)

    if (Object.keys(errors).length > 0) {
      setError('Please correct the highlighted fields.')
      return
    }

    setLoading(true)
    try {
      if (isInvitationRegistration) {
        await registerWithInvitation(normalizedName, normalizedEmail, password, invitationToken)
      } else {
        await register(normalizedName, normalizedEmail, password, normalizedOrganization)
      }

      navigate('/login', {
        replace: true,
        state: {
          message: isInvitationRegistration
            ? 'Your account has been created and you have joined the invited organization. Please sign in.'
            : 'Account created successfully. Please sign in.',
        },
      })
    } catch {
      setError(
        isInvitationRegistration
          ? 'Unable to complete invitation signup. Check that the invitation is valid, has not expired, and matches the email address you were invited with.'
          : 'Unable to create your account. Please check your details and try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050505] px-5 py-10 text-zinc-300 selection:bg-teal-500/30">
      <div className="bg-grid-pattern absolute inset-0 -z-10" />
      <div className="absolute left-1/2 top-0 -z-10 h-[600px] w-[1000px] -translate-x-1/2 bg-teal-500/10 blur-[150px] animate-float rounded-[100%]" />
      <div className="absolute inset-0 bg-noise -z-10 mix-blend-overlay" />

      <section className="w-full max-w-md">

        {/* Naya Reusable Logo, Size Bada */}
        <Link to="/" className="mb-8 flex items-center justify-center gap-3 transition-transform hover:scale-105">
          <Logo className="size-14" />
          <span className="text-[24px] font-semibold tracking-tight text-white">Work-Bench</span>
        </Link>

        <div className="relative overflow-hidden rounded-3xl border border-white/[0.06] bg-[#0a0a0a] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="emerald-bg absolute inset-0" />
          <div className="camo-grid-dense absolute inset-0" />

          <div className="relative rounded-[22px] bg-gradient-to-b from-white/[0.02] to-transparent p-7 sm:p-9">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-teal-400">
              {isInvitationRegistration ? 'Team Invitation' : 'Get started'}
            </p>

            <h1 className="mt-2 text-[28px] font-light tracking-tight text-white">
              {isInvitationRegistration ? 'Join your team' : 'Create your workspace'}
            </h1>

            <p className="mt-2 text-[13px] leading-relaxed text-zinc-500">
              {isInvitationRegistration
                ? 'Create your account to join the organization that invited you.'
                : 'Set up your account and organization in a few steps.'}
            </p>

            <form onSubmit={handleSubmit} className="mt-7 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field id="name" label="Full name" value={name} onChange={(value) => { setName(value); setFieldErrors((old) => ({ ...old, name: "" })) }} error={fieldErrors.name} placeholder="Your name" autoComplete="name" maxLength={NAME_MAX_LENGTH} required />
                {!isInvitationRegistration && (
                  <Field id="organization" label="Organization name" value={organizationName} onChange={(value) => { setOrganizationName(value); setFieldErrors((old) => ({ ...old, organization: "" })) }} error={fieldErrors.organization} placeholder="Company" maxLength={ORGANIZATION_MAX_LENGTH} required />
                )}
              </div>

              <Field id="register-email" label="Work email" type="email" value={email} onChange={(value) => { setEmail(value); setFieldErrors((old) => ({ ...old, "register-email": "" })) }} error={fieldErrors["register-email"]} placeholder="you@company.com" autoComplete="email" maxLength={EMAIL_MAX_LENGTH} inputMode="email" required />
              <Field id="register-password" label="Password" type="password" value={password} onChange={(value) => { setPassword(value); setFieldErrors((old) => ({ ...old, "register-password": "" })) }} error={fieldErrors["register-password"]} placeholder="Create a strong password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} required />

              {error && (
                <p id="register-error" role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-[13px] text-rose-200">
                  {error}
                </p>
              )}

              <div className="pt-3">
                <button
                  type="submit"
                  disabled={loading}
                  aria-busy={loading}
                  className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl border border-white/30 bg-gradient-to-b from-white to-zinc-100 px-6 py-2.5 text-[14px] font-medium tracking-wide text-zinc-900 shadow-[inset_0_1px_0_rgba(255,255,255,1),0_2px_4px_rgba(0,0,0,0.1)] transition-all hover:-translate-y-0.5 hover:from-white hover:to-white hover:shadow-[inset_0_1px_0_rgba(255,255,255,1),0_4px_8px_rgba(0,0,0,0.15)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="relative z-10">
                    {loading ? 'Creating account…' : isInvitationRegistration ? 'Join team' : 'Create account'}
                  </span>
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                </button>
              </div>
            </form>

            <p className="mt-6 text-center text-[13px] text-zinc-500">
              Already have an account?{' '}
              <Link
                to="/login"
                state={isInvitationRegistration ? { from: `/accept-invitation?token=${encodeURIComponent(invitationToken)}` } : undefined}
                className="font-medium text-teal-400 transition-colors hover:text-teal-300"
              >
                Sign in
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

type FieldProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  type?: string
  autoComplete?: string
  minLength?: number
  maxLength: number
  inputMode?: 'text' | 'email'
  required?: boolean
  error?: string
}

function Field({ id, label, value, onChange, placeholder, type = 'text', autoComplete, minLength, maxLength, inputMode, required = true, error }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-[13px] font-medium text-zinc-300">
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        autoCapitalize={type === 'email' ? 'none' : undefined}
        spellCheck={type === 'email' ? false : undefined}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        minLength={minLength}
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-full border ${error ? 'border-rose-500/70' : 'border-white/10'} bg-[#0a0a0a]/50 px-5 py-3 text-[14px] text-zinc-200 placeholder:text-zinc-600 outline-none backdrop-blur-md transition-all hover:border-white/20 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20`}
      />
      {error && <p id={`${id}-error`} className="mt-1.5 text-xs text-rose-300" role="alert">{error}</p>}
    </div>
  )
}
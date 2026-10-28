import { useState } from 'react'
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

const NAME_MAX_LENGTH = 100
const EMAIL_MAX_LENGTH = 254
const PASSWORD_MIN_LENGTH = 8
const PASSWORD_MAX_LENGTH = 72
const ORGANIZATION_MAX_LENGTH = 100

type RegisterLocationState = {
  from?: string
}

function getInvitationToken(
  from: string | undefined,
  search: string,
): string {
  // Support a token passed directly to /register?token=...
  const directToken = new URLSearchParams(search).get('token')

  if (directToken) {
    return directToken
  }

  if (!from) {
    return ''
  }

  try {
    // Only accept invitation tokens from our invitation route.
    const destination = new URL(from, window.location.origin)

    if (
      destination.origin !== window.location.origin ||
      destination.pathname !== '/accept-invitation'
    ) {
      return ''
    }

    return destination.searchParams.get('token') ?? ''
  } catch {
    return ''
  }
}

export default function Register() {
  const {
    register,
    registerWithInvitation,
    isAuthenticated,
  } = useAuth()

  const navigate = useNavigate()
  const location = useLocation()

  const locationState =
    location.state as RegisterLocationState | null

  const invitationToken = getInvitationToken(
    locationState?.from,
    location.search,
  )

  const isInvitationRegistration = invitationToken.length > 0

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()

    if (loading) return

    setError('')

    const normalizedName = name.trim()
    const normalizedEmail = email.trim()
    const normalizedOrganization = organizationName.trim()

    if (
      normalizedName.length === 0 ||
      normalizedName.length > NAME_MAX_LENGTH
    ) {
      setError('Name must be between 1 and 100 characters.')
      return
    }

    if (
      normalizedEmail.length === 0 ||
      normalizedEmail.length > EMAIL_MAX_LENGTH
    ) {
      setError('Please enter a valid email address.')
      return
    }

    if (!isInvitationRegistration) {
      if (
        normalizedOrganization.length === 0 ||
        normalizedOrganization.length > ORGANIZATION_MAX_LENGTH
      ) {
        setError('Organization name must be between 1 and 100 characters.')
        return
      }
    }

    if (
      password.length < PASSWORD_MIN_LENGTH ||
      password.length > PASSWORD_MAX_LENGTH
    ) {
      setError('Password must be between 8 and 72 characters.')
      return
    }

    setLoading(true)

    try {
      if (isInvitationRegistration) {
        await registerWithInvitation(
          normalizedName,
          normalizedEmail,
          password,
          invitationToken,
        )
      } else {
        await register(
          normalizedName,
          normalizedEmail,
          password,
          normalizedOrganization,
        )
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
          : 'Unable to create your account. Please check your details and try again.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#080d18] px-5 py-10">
      <section className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-cyan-400 text-lg font-black text-slate-950">
            T
          </span>
          <span className="text-2xl font-bold text-white">TaskForge</span>
        </Link>

        <div className="rounded-2xl border border-white/10 bg-white/4 p-7 shadow-2xl sm:p-9">
          <p className="mb-3 text-sm font-semibold text-cyan-400">
            {isInvitationRegistration
              ? 'TEAM INVITATION'
              : 'GET STARTED'}
          </p>

          <h1 className="text-3xl font-bold text-white">
            {isInvitationRegistration
              ? 'Join your team'
              : 'Create your workspace'}
          </h1>

          <p className="mt-2 text-sm leading-6 text-slate-400">
            {isInvitationRegistration
              ? 'Create your account to join the organization that invited you.'
              : 'Set up your account and organization in a few steps.'}
          </p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <Field
              id="name"
              label="Full name"
              value={name}
              onChange={setName}
              placeholder="Your name"
              autoComplete="name"
              maxLength={NAME_MAX_LENGTH}
            />

            <Field
              id="register-email"
              label="Work email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@company.com"
              autoComplete="email"
              maxLength={EMAIL_MAX_LENGTH}
              inputMode="email"
            />

            {!isInvitationRegistration && (
              <Field
                id="organization"
                label="Organization name"
                value={organizationName}
                onChange={setOrganizationName}
                placeholder="Your team or company"
                maxLength={ORGANIZATION_MAX_LENGTH}
              />
            )}

            <Field
              id="register-password"
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="Create a strong password"
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LENGTH}
              maxLength={PASSWORD_MAX_LENGTH}
            />

            {error && (
              <p
                id="register-error"
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
              {loading
                ? 'Creating account…'
                : isInvitationRegistration
                  ? 'Create account and join team'
                  : 'Create account'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-400">
            Already have an account?{' '}
            <Link
              to="/login"
              state={
                isInvitationRegistration
                  ? { from: `/accept-invitation?token=${encodeURIComponent(invitationToken)}` }
                  : undefined
              }
              className="font-semibold text-cyan-400 hover:text-cyan-300"
            >
              Sign in
            </Link>
          </p>
        </div>
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
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  autoComplete,
  minLength,
  maxLength,
  inputMode,
}: FieldProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-sm font-medium text-slate-200"
      >
        {label}
      </label>

      <input
        id={id}
        name={id}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        autoCapitalize={type === 'email' ? 'none' : undefined}
        spellCheck={type === 'email' ? false : undefined}
        required
        minLength={minLength}
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-white/10 bg-[#0c1322] px-4 py-3 text-white placeholder:text-slate-600 focus:border-cyan-400"
      />
    </div>
  )
}
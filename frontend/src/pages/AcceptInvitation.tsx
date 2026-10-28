import { useState } from 'react'
import { gql } from '@apollo/client'
import { useMutation } from '@apollo/client/react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

const ACCEPT_INVITATION = gql`
  mutation AcceptInvitation($input: AcceptInvitationInput!) {
    acceptInvitation(input: $input) {
      id
      name
      slug
    }
  }
`

type Organization = {
  id: string
  name: string
  slug: string
}

type AcceptInvitationData = {
  acceptInvitation: Organization
}

type AcceptInvitationVariables = {
  input: {
    token: string
  }
}

export default function AcceptInvitation() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const [token, setToken] = useState(searchParams.get('token') ?? '')
  const [error, setError] = useState('')
  const [organization, setOrganization] = useState<Organization | null>(null)

  const [acceptInvitation, { loading }] = useMutation<
    AcceptInvitationData,
    AcceptInvitationVariables
  >(ACCEPT_INVITATION)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setOrganization(null)

    const normalizedToken = token.trim()

    if (!normalizedToken || normalizedToken.length > 128) {
      setError('Enter a valid invitation token.')
      return
    }

    try {
      const result = await acceptInvitation({
        variables: {
          input: { token: normalizedToken },
        },
      })

      const acceptedOrganization = result.data?.acceptInvitation

      if (!acceptedOrganization) {
        throw new Error('The invitation could not be accepted.')
      }

      setOrganization(acceptedOrganization)
    } catch {
      setError(
        'Unable to accept this invitation. Check that the token is valid, has not expired, and belongs to your signed-in email address.',
      )
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#080d18] px-5 py-10 text-slate-200">
      <section className="w-full max-w-lg">
        <Link to="/dashboard" className="mb-8 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-cyan-400 text-lg font-black text-slate-950">
            W
          </span>
          <span className="text-2xl font-bold tracking-tight text-white">
            Work-Bench
          </span>
        </Link>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-7 shadow-2xl sm:p-9">
          <p className="text-sm font-semibold text-cyan-400">
            TEAM INVITATION
          </p>

          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">
            Join an organization
          </h1>

          <p className="mt-3 text-sm leading-6 text-slate-400">
            Enter the invitation token you received. You must be signed in
            with the email address to which the invitation was sent.
          </p>

          {organization ? (
            <div className="mt-7 space-y-5">
              <div
                role="status"
                className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4"
              >
                <p className="font-semibold text-emerald-300">
                  Invitation accepted
                </p>
                <p className="mt-2 text-sm text-slate-300">
                  You have joined {organization.name}.
                </p>
              </div>

              <button
                type="button"
                onClick={() => navigate('/members', { replace: true })}
                className="w-full rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300"
              >
                Open workspace members
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-7 space-y-5">
              <div>
                <label
                  htmlFor="invitation-token"
                  className="mb-2 block text-sm font-medium text-slate-200"
                >
                  Invitation token
                </label>

                <textarea
                  id="invitation-token"
                  value={token}
                  onChange={(event) => {
                    setToken(event.target.value)
                    setError('')
                  }}
                  required
                  maxLength={128}
                  rows={3}
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="Paste your invitation token"
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'invitation-error' : undefined}
                  className="w-full resize-y rounded-xl border border-white/10 bg-[#0c1322] px-4 py-3 font-mono text-sm text-white placeholder:font-sans placeholder:text-slate-600 outline-none focus:border-cyan-400"
                />
              </div>

              {error && (
                <p
                  id="invitation-error"
                  role="alert"
                  className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-3 text-sm leading-6 text-rose-300"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="w-full rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-60"
              >
                {loading ? 'Accepting invitation…' : 'Accept invitation'}
              </button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-slate-500">
            <Link
              to="/dashboard"
              className="text-cyan-400 transition hover:text-cyan-300"
            >
              Back to dashboard
            </Link>
          </p>
        </div>
      </section>
    </main>
  )
}

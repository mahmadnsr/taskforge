import { useState } from 'react'
import { gql } from '@apollo/client'
import { useMutation, useQuery } from '@apollo/client/react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

const MY_ORGANIZATIONS = gql`
  query MyOrganizations {
    myOrganizations {
      id
      name
      slug
    }
  }
`

const ORGANIZATION_MEMBERS = gql`
  query OrganizationMembers($organizationId: ID!) {
    organizationMembers(organizationId: $organizationId) {
      id
      role
      user {
        id
        name
        email
        createdAt
      }
    }
  }
`

const INVITE_MEMBER = gql`
  mutation InviteMember($input: InviteMemberInput!) {
    inviteMember(input: $input) {
      id
      email
      role
      expiresAt
      inviteToken
    }
  }
`

const UPDATE_MEMBER_ROLE = gql`
  mutation UpdateMemberRole($input: UpdateMemberRoleInput!) {
    updateMemberRole(input: $input) {
      id
      role
    }
  }
`

const REMOVE_MEMBER = gql`
  mutation RemoveMember($organizationId: ID!, $userId: ID!) {
    removeMember(organizationId: $organizationId, userId: $userId)
  }
`

type Role = 'ADMIN' | 'MANAGER' | 'EMPLOYEE'

type Organization = {
  id: string
  name: string
  slug: string
}

type Member = {
  id: string
  role: Role
  user: {
    id: string
    name: string
    email: string
    createdAt: string
  }
}

type Invitation = {
  id: string
  email: string
  role: Role
  expiresAt: string
  inviteToken: string | null
}

type OrganizationsData = {
  myOrganizations: Organization[]
}

type MembersData = {
  organizationMembers: Member[]
}

type InviteData = {
  inviteMember: Invitation
}

type UpdateRoleData = {
  updateMemberRole: {
    id: string
    role: Role
  }
}

type RemoveMemberData = {
  removeMember: boolean
}

type InviteVariables = {
  input: {
    organizationId: string
    email: string
    role: Role
  }
}

type UpdateRoleVariables = {
  input: {
    organizationId: string
    userId: string
    role: Role
  }
}

type RemoveMemberVariables = {
  organizationId: string
  userId: string
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Something went wrong. Please try again.'
}

function RoleBadge({ role }: { role: Role }) {
  const styles: Record<Role, string> = {
    ADMIN: 'border-violet-400/20 bg-violet-400/10 text-violet-300',
    MANAGER: 'border-cyan-400/20 bg-cyan-400/10 text-cyan-300',
    EMPLOYEE: 'border-slate-400/20 bg-slate-400/10 text-slate-300',
  }

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${styles[role]}`}
    >
      {role.charAt(0) + role.slice(1).toLowerCase()}
    </span>
  )
}

function Initials({ name }: { name: string }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase()

  return (
    <span
      aria-hidden="true"
      className="grid size-10 shrink-0 place-items-center rounded-xl border border-cyan-400/15 bg-cyan-400/[0.08] text-sm font-semibold text-cyan-300"
    >
      {initials || '?'}
    </span>
  )
}

export default function Members() {
  const { user } = useAuth()
  const [organizationId, setOrganizationId] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('EMPLOYEE')
  const [pageError, setPageError] = useState('')
  const [notice, setNotice] = useState('')
  const [inviteToken, setInviteToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<Member | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState<'ALL' | Role>('ALL')

  const {
    data: organizationsData,
    loading: organizationsLoading,
    error: organizationsError,
  } = useQuery<OrganizationsData>(MY_ORGANIZATIONS, {
    fetchPolicy: 'cache-and-network',
  })

  const organizations = organizationsData?.myOrganizations ?? []

  const selectedOrganizationId = organizations.some(
    (organization) => organization.id === organizationId,
  )
    ? organizationId
    : organizations[0]?.id ?? ''

  const selectedOrganization = organizations.find(
    (organization) => organization.id === selectedOrganizationId,
  )

  const {
    data: membersData,
    loading: membersLoading,
    error: membersError,
    refetch: refetchMembers,
  } = useQuery<MembersData, { organizationId: string }>(
    ORGANIZATION_MEMBERS,
    {
      variables: { organizationId: selectedOrganizationId },
      skip: !selectedOrganizationId,
      fetchPolicy: 'cache-and-network',
    },
  )

  const [inviteMember, inviteState] = useMutation<
    InviteData,
    InviteVariables
  >(INVITE_MEMBER)

  const [updateMemberRole, updateRoleState] = useMutation<
    UpdateRoleData,
    UpdateRoleVariables
  >(UPDATE_MEMBER_ROLE)

  const [removeMember, removeState] = useMutation<
    RemoveMemberData,
    RemoveMemberVariables
  >(REMOVE_MEMBER)

  const members = membersData?.organizationMembers ?? []

  const memberCounts = {
    total: members.length,
    admins: members.filter((member) => member.role === 'ADMIN').length,
    managers: members.filter((member) => member.role === 'MANAGER').length,
    employees: members.filter((member) => member.role === 'EMPLOYEE').length,
  }

  const normalizedSearch = searchTerm.trim().toLowerCase()

  const filteredMembers = members.filter((member) => {
    const matchesRole =
      roleFilter === 'ALL' || member.role === roleFilter

    const matchesSearch =
      !normalizedSearch ||
      member.user.name.toLowerCase().includes(normalizedSearch) ||
      member.user.email.toLowerCase().includes(normalizedSearch)

    return matchesRole && matchesSearch
  })

  // Role controls are shown only when the server has identified the caller's
  // membership. Backend authorization remains the source of truth.
  const currentMember = members.find(
    (member) => member.user.id === user?.id,
  )

  const currentRole = currentMember?.role
  const canManageMembers = currentRole === 'ADMIN'
  const canInvite = currentRole === 'ADMIN' || currentRole === 'MANAGER'

  async function handleInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPageError('')
    setNotice('')
    setInviteToken(null)
    setCopied(false)

    const email = inviteEmail.trim().toLowerCase()

    if (!email) {
      setPageError('Enter the email address of the person you want to invite.')
      return
    }

    try {
      const result = await inviteMember({
        variables: {
          input: {
            organizationId: selectedOrganizationId,
            email,
            role: inviteRole,
          },
        },
      })

      const invitation = result.data?.inviteMember

      if (!invitation) {
        throw new Error('The invitation could not be created.')
      }

      setInviteToken(invitation.inviteToken)
      setNotice(
        invitation.inviteToken
          ? 'Invitation created. Copy the token and share it securely with the invitee.'
          : 'Invitation created, but no invitation email was sent by the current backend flow.',
      )
      setInviteEmail('')
      await refetchMembers()
    } catch (error) {
      setPageError(getErrorMessage(error))
    }
  }

  async function handleRoleChange(member: Member, role: Role) {
    if (role === member.role) return

    setPageError('')
    setNotice('')

    try {
      await updateMemberRole({
        variables: {
          input: {
            organizationId: selectedOrganizationId,
            userId: member.user.id,
            role,
          },
        },
      })

      setNotice(`Updated ${member.user.name}'s role.`)
      await refetchMembers()
    } catch (error) {
      setPageError(getErrorMessage(error))
    }
  }

  async function handleRemove() {
    if (!confirmRemove) return

    setPageError('')
    setNotice('')

    try {
      await removeMember({
        variables: {
          organizationId: selectedOrganizationId,
          userId: confirmRemove.user.id,
        },
      })

      setNotice(`${confirmRemove.user.name} was removed from this organization.`)
      setConfirmRemove(null)
      await refetchMembers()
    } catch (error) {
      setPageError(getErrorMessage(error))
    }
  }

  async function handleCopyToken() {
    if (!inviteToken) return

    try {
      await navigator.clipboard.writeText(inviteToken)
      setCopied(true)
    } catch {
      setPageError('Could not copy the token. Select and copy it manually.')
    }
  }

  function closeInviteModal() {
    if (inviteState.loading) return

    setInviteOpen(false)
    setInviteEmail('')
    setInviteToken(null)
    setCopied(false)
    setPageError('')
    setNotice('')
  }

  return (
    <main className="min-h-screen bg-[#080d18] text-slate-200">
      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#080d18]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link
            to="/dashboard"
            className="flex shrink-0 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-cyan-400 text-sm font-black text-slate-950">
              W
            </span>
            <span className="text-lg font-semibold tracking-tight text-white">
              Work-Bench
            </span>
          </Link>

          <nav
            aria-label="Main navigation"
            className="flex items-center gap-1 sm:gap-2"
          >
            <Link
              to="/dashboard"
              className="rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:bg-white/[0.04] hover:text-white"
            >
              Dashboard
            </Link>
            <Link
              to="/projects"
              className="rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:bg-white/[0.04] hover:text-white"
            >
              Projects
            </Link>
            <Link
              to="/members"
              aria-current="page"
              className="rounded-lg bg-white/[0.06] px-3 py-2 text-sm font-medium text-white"
            >
              Members
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-400">
              Workspace
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Members
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">
              Manage your organization, review team roles, and invite people to
              collaborate.
            </p>
          </div>

          {canInvite && (
            <button
              type="button"
              onClick={() => {
                setPageError('')
                setNotice('')
                setInviteOpen(true)
              }}
              disabled={!selectedOrganizationId}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span aria-hidden="true" className="text-lg leading-none">+</span>
              Invite member
            </button>
          )}
        </div>

        <section className="mt-8 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-white">Organization</p>
              <p className="mt-1 text-sm text-slate-500">
                Choose which workspace you want to manage.
              </p>
            </div>

            <select
              aria-label="Select organization"
              value={selectedOrganizationId}
              onChange={(event) => {
                setOrganizationId(event.target.value)
                setPageError('')
                setNotice('')
              }}
              disabled={organizationsLoading || organizations.length === 0}
              className="w-full rounded-xl border border-white/10 bg-[#0b1220] px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/60 sm:max-w-sm"
            >
              {organizations.length === 0 && (
                <option value="">No organizations available</option>
              )}
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </div>
        </section>

        {(pageError || organizationsError || membersError) && (
          <div
            role="alert"
            className="mt-6 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-4 text-sm leading-6 text-rose-300"
          >
            {pageError ||
              organizationsError?.message ||
              membersError?.message}
          </div>
        )}

        {notice && (
          <div
            role="status"
            className="mt-6 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4 text-sm leading-6 text-emerald-300"
          >
            {notice}
          </div>
        )}

        <section
          aria-label="Organization member summary"
          className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          {[
            { label: 'Total members', count: memberCounts.total, description: 'People in this organization', accent: 'text-white' },
            { label: 'Admins', count: memberCounts.admins, description: 'Organization administrators', accent: 'text-violet-300' },
            { label: 'Managers', count: memberCounts.managers, description: 'Team managers', accent: 'text-cyan-300' },
            { label: 'Employees', count: memberCounts.employees, description: 'Team contributors', accent: 'text-slate-200' },
          ].map((card) => (
            <article key={card.label} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
              <p className="text-sm font-medium text-slate-400">{card.label}</p>
              <p className={`mt-3 text-3xl font-semibold tracking-tight ${card.accent}`}>{card.count}</p>
              <p className="mt-2 text-xs text-slate-500">{card.description}</p>
            </article>
          ))}
        </section>

        <section aria-label="Search and filter members" className="mt-6 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="w-full lg:max-w-md">
              <label htmlFor="member-search" className="mb-2 block text-sm font-medium text-slate-300">
                Search team
              </label>
              <input
                id="member-search"
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by name or email..."
                className="w-full rounded-xl border border-white/10 bg-[#0b1220] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400/60"
              />
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-slate-300">Filter by role</p>
              <div className="flex flex-wrap gap-2">
                {([
                  ['ALL', 'All members'],
                  ['ADMIN', 'Admins'],
                  ['MANAGER', 'Managers'],
                  ['EMPLOYEE', 'Employees'],
                ] as const).map(([role, label]) => {
                  const active = roleFilter === role
                  return (
                    <button
                      key={role}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setRoleFilter(role)}
                      className={active
                        ? 'rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-sm font-medium text-cyan-300'
                        : 'rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-400 transition hover:bg-white/[0.04] hover:text-white'}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {(searchTerm || roleFilter !== 'ALL') && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('')
                setRoleFilter('ALL')
              }}
              className="mt-4 text-sm font-medium text-cyan-300 transition hover:text-cyan-200"
            >
              Clear search and filters
            </button>
          )}
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.025]">
          <div className="flex flex-col gap-2 border-b border-white/[0.07] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h2 className="font-semibold text-white">
                {selectedOrganization?.name ?? 'Organization members'}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Showing {filteredMembers.length} of {members.length} members
              </p>
            </div>
            <span className="text-xs text-slate-500">
              {currentRole ? `Your role: ${currentRole}` : 'Loading your role…'}
            </span>
          </div>

          {organizationsLoading && !organizationsData ? (
            <div className="p-8 text-sm text-slate-400">
              Loading organizations…
            </div>
          ) : organizations.length === 0 ? (
            <div className="p-10 text-center">
              <h3 className="font-medium text-white">No organization found</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Create or join an organization before managing its members.
              </p>
            </div>
          ) : membersLoading && !membersData ? (
            <div className="p-8 text-sm text-slate-400">
              Loading members…
            </div>
          ) : members.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-400">
              No members found for this organization.
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="p-10 text-center">
              <h3 className="font-medium text-white">No matching members</h3>
              <p className="mt-2 text-sm text-slate-400">
                Try another name, email address, or role filter.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('')
                  setRoleFilter('ALL')
                }}
                className="mt-4 text-sm font-medium text-cyan-300 hover:text-cyan-200"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left">
                <thead className="bg-white/[0.02] text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th scope="col" className="px-6 py-4 font-medium">Member</th>
                    <th scope="col" className="px-6 py-4 font-medium">Role</th>
                    <th scope="col" className="px-6 py-4 font-medium">Joined</th>
                    {canManageMembers && (
                      <th scope="col" className="px-6 py-4 text-right font-medium">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {filteredMembers.map((member) => (
                    <tr
                      key={member.id}
                      className="transition hover:bg-white/[0.02]"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Initials name={member.user.name} />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-white">
                              {member.user.name}
                              {member.user.id === user?.id && (
                                <span className="ml-2 text-xs font-normal text-slate-500">
                                  You
                                </span>
                              )}
                            </p>
                            <p className="mt-1 truncate text-sm text-slate-500">
                              {member.user.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <RoleBadge role={member.role} />
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-400">
                        {new Intl.DateTimeFormat(undefined, {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        }).format(new Date(member.user.createdAt))}
                      </td>
                      {canManageMembers && (
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <select
                              aria-label={`Change role for ${member.user.name}`}
                              value={member.role}
                              disabled={
                                member.user.id === user?.id ||
                                updateRoleState.loading
                              }
                              onChange={(event) =>
                                void handleRoleChange(
                                  member,
                                  event.target.value as Role,
                                )
                              }
                              className="rounded-lg border border-white/10 bg-[#0b1220] px-2 py-2 text-xs text-slate-200 outline-none focus:border-cyan-400/60 disabled:opacity-50"
                            >
                              <option value="ADMIN">Admin</option>
                              <option value="MANAGER">Manager</option>
                              <option value="EMPLOYEE">Employee</option>
                            </select>
                            <button
                              type="button"
                              disabled={
                                member.user.id === user?.id ||
                                removeState.loading
                              }
                              onClick={() => setConfirmRemove(member)}
                              className="rounded-lg border border-rose-400/20 px-3 py-2 text-xs font-medium text-rose-300 transition hover:bg-rose-400/10 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Remove
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {inviteOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/65 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeInviteModal()
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-title"
            className="my-auto w-full max-w-lg rounded-2xl border border-white/10 bg-[#101827] shadow-2xl shadow-black/40"
          >
            <div className="flex items-start justify-between border-b border-white/[0.07] px-6 py-5">
              <div>
                <h2 id="invite-title" className="text-lg font-semibold text-white">
                  Invite a member
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-400">
                  Invite someone to {selectedOrganization?.name ?? 'your organization'}.
                </p>
              </div>
              <button
                type="button"
                onClick={closeInviteModal}
                disabled={inviteState.loading}
                aria-label="Close invitation dialog"
                className="rounded-lg px-3 py-2 text-slate-400 hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleInvite} className="space-y-5 p-6">
              <div>
                <label
                  htmlFor="invite-email"
                  className="mb-2 block text-sm font-medium text-slate-200"
                >
                  Email address
                </label>
                <input
                  id="invite-email"
                  type="email"
                  required
                  maxLength={254}
                  autoFocus
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="colleague@example.com"
                  className="w-full rounded-xl border border-white/10 bg-[#0b1220] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/60"
                />
              </div>

              <div>
                <label
                  htmlFor="invite-role"
                  className="mb-2 block text-sm font-medium text-slate-200"
                >
                  Organization role
                </label>
                <select
                  id="invite-role"
                  value={inviteRole}
                  onChange={(event) => setInviteRole(event.target.value as Role)}
                  className="w-full rounded-xl border border-white/10 bg-[#0b1220] px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/60"
                >
                  {currentRole === 'ADMIN' && (
                    <option value="MANAGER">Manager</option>
                  )}
                  <option value="EMPLOYEE">Employee</option>
                </select>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Managers can invite employees only.
                </p>
              </div>

              {inviteToken && (
                <div className="space-y-3 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.05] p-4">
                  <p className="text-sm font-medium text-cyan-200">
                    Development invitation token
                  </p>
                  <p className="break-all font-mono text-xs leading-5 text-slate-300">
                    {inviteToken}
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleCopyToken()}
                    className="rounded-lg border border-cyan-400/25 px-3 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-400/10"
                  >
                    {copied ? 'Copied' : 'Copy token'}
                  </button>
                  <p className="text-xs leading-5 text-slate-500">
                    Share this token securely. The invitee must sign in with
                    the same email address as the invitation and accept it
                    through the invitation flow.
                  </p>
                </div>
              )}

              {pageError && (
                <p
                  role="alert"
                  className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-3 text-sm leading-6 text-rose-300"
                >
                  {pageError}
                </p>
              )}

              <div className="flex flex-col-reverse gap-3 border-t border-white/[0.07] pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeInviteModal}
                  disabled={inviteState.loading}
                  className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/[0.04] disabled:opacity-50"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={inviteState.loading || !selectedOrganizationId}
                  className="rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-60"
                >
                  {inviteState.loading ? 'Creating invitation…' : 'Create invitation'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {confirmRemove && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-4 backdrop-blur-sm">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="remove-title"
            className="w-full max-w-md rounded-2xl border border-white/10 bg-[#101827] p-6 shadow-2xl"
          >
            <h2 id="remove-title" className="text-lg font-semibold text-white">
              Remove team member?
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              This removes <span className="font-medium text-white">{confirmRemove.user.name}</span> from this organization. Their user account will not be deleted.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmRemove(null)}
                disabled={removeState.loading}
                className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/[0.04]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleRemove()}
                disabled={removeState.loading}
                className="rounded-xl bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:opacity-60"
              >
                {removeState.loading ? 'Removing…' : 'Remove member'}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

// Read the current user id from the authenticated user stored by AuthContext.
// This helper is replaced below by the actual auth context integration.

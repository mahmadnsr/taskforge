import { useState } from 'react'
import { gql } from '@apollo/client'
import { useMutation, useQuery } from '@apollo/client/react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

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
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message.trim()
  ) {
    return error.message
  }

  return 'Something went wrong. Please try again.'
}

function RoleBadge({ role }: { role: Role }) {
  const styles: Record<Role, string> = {
    ADMIN:
      'border-violet-500/20 bg-violet-500/10 text-violet-400 shadow-[0_0_10px_rgba(139,92,246,0.1)]',
    MANAGER:
      'border-teal-500/20 bg-teal-500/10 text-teal-400 shadow-[0_0_10px_rgba(20,184,166,0.1)]',
    EMPLOYEE: 'border-zinc-500/20 bg-zinc-500/10 text-zinc-400',
  }

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-widest ${styles[role]}`}
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
      className="grid size-11 shrink-0 place-items-center rounded-xl border border-teal-500/20 bg-teal-500/10 text-[14px] font-medium text-teal-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
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
  const [inviteEmailError, setInviteEmailError] = useState('')
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
    : (organizations[0]?.id ?? '')

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
    const matchesRole = roleFilter === 'ALL' || member.role === roleFilter

    const matchesSearch =
      !normalizedSearch ||
      member.user.name.toLowerCase().includes(normalizedSearch) ||
      member.user.email.toLowerCase().includes(normalizedSearch)

    return matchesRole && matchesSearch
  })

  const currentMember = members.find(
    (member) =>
      member.user.id === user?.id ||
      member.user.email.toLowerCase() === user?.email?.toLowerCase(),
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

    if (!selectedOrganizationId) {
      setPageError('Select an organization before inviting a member.')
      return
    }

    const email = inviteEmail.trim().toLowerCase()

    if (
      !email ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      setInviteEmailError('Enter a valid email address (maximum 254 characters).')
      return
    }

    setInviteEmailError('')

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
      setInviteEmail('')
      setInviteEmailError('')

      setNotice(
        invitation.inviteToken
          ? 'Invitation created. Copy the token and share it securely with the invitee.'
          : 'Invitation created, but no invitation token was returned.',
      )

      try {
        await refetchMembers()
      } catch {
        setNotice(
          'Invitation created successfully, but the member list could not refresh. Reload the page to see the latest data.',
        )
      }
    } catch (error) {
      setPageError(getErrorMessage(error))
    }
  }

  async function handleRoleChange(member: Member, role: Role) {
    if (role === member.role) return

    if (!selectedOrganizationId) {
      setPageError('Select an organization before changing a member role.')
      return
    }

    setPageError('')
    setNotice('')

    try {
      const result = await updateMemberRole({
        variables: {
          input: {
            organizationId: selectedOrganizationId,
            userId: member.user.id,
            role,
          },
        },
      })

      if (!result.data?.updateMemberRole) {
        throw new Error("The member's role could not be updated.")
      }
    } catch (error) {
      setPageError(getErrorMessage(error))
      return
    }

    setNotice(`Updated ${member.user.name}'s role.`)

    try {
      await refetchMembers()
    } catch {
      setNotice(
        `Updated ${member.user.name}'s role successfully, but the member list could not refresh. Reload the page to see the latest data.`,
      )
    }
  }

  async function handleRemove() {
    if (!confirmRemove) return

    if (!selectedOrganizationId) {
      setPageError('Select an organization before removing a member.')
      return
    }

    setPageError('')
    setNotice('')

    const memberToRemove = confirmRemove

    try {
      const result = await removeMember({
        variables: {
          organizationId: selectedOrganizationId,
          userId: memberToRemove.user.id,
        },
      })

      if (result.data?.removeMember !== true) {
        throw new Error('The member could not be removed.')
      }
    } catch (error) {
      setPageError(getErrorMessage(error))
      return
    }

    setConfirmRemove(null)
    setNotice(`${memberToRemove.user.name} was removed from this organization.`)

    try {
      await refetchMembers()
    } catch {
      setNotice(
        `${memberToRemove.user.name} was removed successfully, but the member list could not refresh. Reload the page to see the latest data.`,
      )
    }
  }

  async function handleCopyToken() {
    if (!inviteToken) return

    try {
      await navigator.clipboard.writeText(inviteToken)
      setCopied(true)
      setPageError('')
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
    <main className="relative min-h-screen bg-[#050505] text-zinc-300 selection:bg-teal-500/30">
      {/* Background Elements */}
      <div className="bg-grid-pattern absolute inset-0 -z-10 pointer-events-none" />
      <div className="absolute left-1/2 top-0 -z-10 h-150 w-250 -translate-x-1/2 bg-teal-500/5 blur-[150px] animate-float rounded-[100%] pointer-events-none" />
      <div className="absolute inset-0 bg-noise -z-10 mix-blend-overlay pointer-events-none" />

      <div className="mx-auto max-w-300 px-6 pb-20 pt-10 sm:px-8">
        {/* Header Section */}
        <div className="mb-10 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <div className="mb-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-400">
              <Link to="/dashboard" className="transition hover:text-teal-300">
                Workspace
              </Link>
              <span aria-hidden="true" className="text-zinc-700">
                /
              </span>
              <span className="text-zinc-500">Members</span>
            </div>

            <h1 className="text-[36px] font-light tracking-[-0.03em] text-white">
              Members
            </h1>

            <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-zinc-500">
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
              className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-xl border border-white/30 bg-gradient-to-b from-white to-zinc-100 px-6 py-2.5 text-[13.5px] font-medium tracking-wide text-zinc-900 shadow-[inset_0_1px_0_rgba(255,255,255,1),0_2px_4px_rgba(0,0,0,0.1)] transition-all hover:-translate-y-0.5 hover:from-white hover:to-white hover:shadow-[inset_0_1px_0_rgba(255,255,255,1),0_4px_8px_rgba(0,0,0,0.15)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span aria-hidden="true" className="text-[18px] leading-none mb-0.5">
                +
              </span>
              Invite member
              <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
            </button>
          )}
        </div>

        {/* Organization Selector */}
        <section className="mb-8 overflow-hidden rounded-3xl border border-white/6 bg-[#0a0a0a] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[15px] font-medium tracking-tight text-white">
                Organization
              </p>
              <p className="mt-1 text-[13px] font-light text-zinc-500">
                Choose which workspace you want to manage.
              </p>
            </div>

            <div className="relative sm:w-72">
              <select
                aria-label="Select organization"
                value={selectedOrganizationId}
                onChange={(event) => {
                  setOrganizationId(event.target.value)
                  setPageError('')
                  setNotice('')
                }}
                disabled={organizationsLoading || organizations.length === 0}
                className="h-11 w-full appearance-none rounded-full border border-white/10 bg-[#050505] pl-5 pr-10 text-[13px] font-medium tracking-wide text-zinc-200 shadow-sm outline-none backdrop-blur-md transition-all hover:border-white/20 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20 disabled:opacity-50"
              >
                {organizations.length === 0 && (
                  <option value="">No organizations available</option>
                )}

                {organizations.map((organization) => (
                  <option
                    key={organization.id}
                    value={organization.id}
                    className="bg-zinc-900"
                  >
                    {organization.name}
                  </option>
                ))}
              </select>

              <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>
          </div>
        </section>

        {/* Alerts */}
        {(pageError || organizationsError || membersError) && (
          <div
            role="alert"
            className="mb-6 flex items-start justify-between gap-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-5 py-3.5 text-[13.5px] font-light tracking-wide text-rose-300 backdrop-blur-md"
          >
            <span>
              {pageError ||
                organizationsError?.message ||
                membersError?.message}
            </span>
          </div>
        )}

        {notice && (
          <div
            role="status"
            className="mb-6 flex items-start justify-between gap-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-3.5 text-[13.5px] font-light tracking-wide text-emerald-300 backdrop-blur-md"
          >
            <span>{notice}</span>
          </div>
        )}

        {/* Stats Cards */}
        <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: 'Total members',
              count: memberCounts.total,
              description: 'People in this organization',
              accent: 'text-white',
            },
            {
              label: 'Admins',
              count: memberCounts.admins,
              description: 'Organization administrators',
              accent: 'text-violet-400',
            },
            {
              label: 'Managers',
              count: memberCounts.managers,
              description: 'Team managers',
              accent: 'text-teal-400',
            },
            {
              label: 'Employees',
              count: memberCounts.employees,
              description: 'Team contributors',
              accent: 'text-zinc-400',
            },
          ].map((card) => (
            <article
              key={card.label}
              className="group relative overflow-hidden rounded-3xl border border-white/6 bg-[#0a0a0a] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-all duration-300 hover:bg-[#0c0c0c] hover:shadow-[0_8px_30px_rgba(0,0,0,0.3)]"
            >
              <div className="absolute -right-6 -top-6 size-24 rounded-full bg-teal-500/5 blur-2xl transition-all group-hover:bg-teal-500/10" />

              <p className="relative text-[10.5px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                {card.label}
              </p>

              <p
                className={`relative mt-4 text-[40px] font-light leading-none tracking-tighter tabular-nums ${card.accent}`}
              >
                {membersLoading && !membersData ? (
                  <span className="inline-block h-10 w-12 animate-pulse rounded bg-white/10" />
                ) : (
                  card.count
                )}
              </p>

              <p className="relative mt-3 text-[12.5px] font-light tracking-wide text-zinc-500">
                {card.description}
              </p>
            </article>
          ))}
        </section>

        {/* Search & Filters */}
        <section className="mb-8 rounded-3xl border border-white/6 bg-[#0a0a0a]/60 p-5 shadow-[0_0_50px_-12px_rgba(0,0,0,0.6)] backdrop-blur-xl sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="w-full lg:max-w-md">
              <label
                htmlFor="member-search"
                className="mb-2.5 block text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-400"
              >
                Search team
              </label>

              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500">
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-4-4" />
                  </svg>
                </span>

                <input
                  id="member-search"
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search by name or email..."
                  className="w-full rounded-full border border-white/10 bg-[#050505] py-2.5 pl-11 pr-4 text-[13.5px] font-light tracking-wide text-white placeholder:text-zinc-600 outline-none backdrop-blur-md transition-all hover:border-white/20 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20"
                />
              </div>
            </div>

            <div>
              <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
                Filter by role
              </p>

              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['ALL', 'All members'],
                    ['ADMIN', 'Admins'],
                    ['MANAGER', 'Managers'],
                    ['EMPLOYEE', 'Employees'],
                  ] as const
                ).map(([role, label]) => {
                  const active = roleFilter === role

                  return (
                    <button
                      key={role}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setRoleFilter(role)}
                      className={
                        active
                          ? 'rounded-full border border-teal-500/30 bg-teal-500/10 px-4 py-2 text-[12px] font-medium tracking-wide text-teal-400 shadow-[0_0_10px_rgba(20,184,166,0.1)]'
                          : 'rounded-full border border-white/10 bg-white/2 px-4 py-2 text-[12px] font-medium tracking-wide text-zinc-400 transition hover:bg-white/10 hover:text-white'
                      }
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
              className="mt-4 text-[12.5px] font-medium tracking-wide text-teal-400 transition hover:text-teal-300"
            >
              Clear search and filters
            </button>
          )}
        </section>

        {/* Members List */}
        <section className="overflow-hidden rounded-3xl border border-white/6 bg-[#0a0a0a]/60 shadow-[0_0_50px_-12px_rgba(0,0,0,0.6)] backdrop-blur-xl">
          <div className="flex flex-col gap-2 border-b border-white/6 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-[18px] font-medium tracking-tight text-white">
                {selectedOrganization?.name ?? 'Organization members'}
              </h2>

              <p className="mt-1.5 text-[13px] font-light tracking-wide text-zinc-500">
                Showing {filteredMembers.length} of {members.length} members
              </p>
            </div>

            <span className="text-[10.5px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
              {currentRole ? `Your role: ${currentRole}` : 'Loading your role…'}
            </span>
          </div>

          {organizationsLoading && !organizationsData ? (
            <div className="p-8 text-[13.5px] font-light text-zinc-400">
              Loading organizations…
            </div>
          ) : organizations.length === 0 ? (
            <div className="p-14 text-center">
              <h3 className="text-[18px] font-light text-white">
                No organization found
              </h3>

              <p className="mt-2 text-[13.5px] font-light leading-relaxed text-zinc-500">
                Create or join an organization before managing its members.
              </p>
            </div>
          ) : membersLoading && !membersData ? (
            <div className="divide-y divide-white/4">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="flex animate-pulse items-center gap-5 px-6 py-6"
                >
                  <div className="size-11 rounded-xl bg-white/5" />
                  <div className="flex-1 space-y-2.5">
                    <div className="h-4 w-48 rounded bg-white/5" />
                    <div className="h-3 w-72 max-w-full rounded bg-white/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : members.length === 0 ? (
            <div className="p-14 text-center text-[13.5px] font-light text-zinc-400">
              No members found for this organization.
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="p-14 text-center">
              <h3 className="text-[18px] font-light text-white">
                No matching members
              </h3>

              <p className="mt-2 text-[13.5px] font-light text-zinc-500">
                Try another name, email address, or role filter.
              </p>

              <button
                type="button"
                onClick={() => {
                  setSearchTerm('')
                  setRoleFilter('ALL')
                }}
                className="mt-5 text-[13px] font-medium text-teal-400 hover:text-teal-300 transition-colors"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-170 text-left">
                <thead className="bg-white/2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  <tr>
                    <th scope="col" className="px-6 py-4">
                      Member
                    </th>
                    <th scope="col" className="px-6 py-4">
                      Role
                    </th>
                    <th scope="col" className="px-6 py-4">
                      Joined
                    </th>
                    {canManageMembers && (
                      <th scope="col" className="px-6 py-4 text-right">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>

                <tbody className="divide-y divide-white/4">
                  {filteredMembers.map((member) => (
                    <tr
                      key={member.id}
                      className="group transition hover:bg-white/2"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <Initials name={member.user.name} />

                          <div className="min-w-0">
                            <p className="truncate text-[14.5px] font-medium tracking-tight text-zinc-100 group-hover:text-white">
                              {member.user.name}

                              {member.user.id === user?.id && (
                                <span className="ml-2 text-[10px] font-semibold uppercase tracking-widest text-teal-500/70">
                                  You
                                </span>
                              )}
                            </p>

                            <p className="mt-1 truncate text-[13px] font-light text-zinc-500">
                              {member.user.email}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <RoleBadge role={member.role} />
                      </td>

                      <td className="px-6 py-4 text-[13px] font-light text-zinc-500">
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
                              className="rounded-lg border border-white/10 bg-[#050505] px-3 py-1.5 text-[12px] font-medium text-zinc-300 outline-none transition hover:border-white/20 focus:border-teal-500/50 disabled:opacity-50"
                            >
                              <option value="ADMIN" className="bg-zinc-900">
                                Admin
                              </option>
                              <option value="MANAGER" className="bg-zinc-900">
                                Manager
                              </option>
                              <option value="EMPLOYEE" className="bg-zinc-900">
                                Employee
                              </option>
                            </select>

                            <button
                              type="button"
                              disabled={
                                member.user.id === user?.id ||
                                removeState.loading
                              }
                              onClick={() => setConfirmRemove(member)}
                              className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-1.5 text-[12px] font-medium text-rose-400 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-40"
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

      {/* Invite Modal */}
      {inviteOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-md"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeInviteModal()
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-title"
            className="my-auto w-full max-w-lg overflow-hidden rounded-3xl border border-white/8 bg-[#0a0a0a] p-1 shadow-2xl"
          >
            <div className="emerald-bg absolute inset-0" />
            <div className="camo-grid-dense absolute inset-0" />

            <div className="relative rounded-[22px] bg-gradient-to-b from-white/[0.02] to-transparent">
              <div className="flex items-start justify-between border-b border-white/[0.06] px-7 py-6">
                <div>
                  <h2
                    id="invite-title"
                    className="text-[22px] font-medium tracking-tight text-white"
                  >
                    Invite a member
                  </h2>

                  <p className="mt-1.5 text-[13.5px] font-light leading-relaxed text-zinc-400">
                    Invite someone to {selectedOrganization?.name ?? 'your organization'}.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeInviteModal}
                  disabled={inviteState.loading}
                  className="rounded-lg p-2 text-zinc-500 transition hover:bg-white/10 hover:text-white"
                >
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleInvite} className="space-y-5 p-7">
                <div>
                  <label
                    htmlFor="invite-email"
                    className="mb-2.5 block text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-400"
                  >
                    Email address <span className="text-rose-500">*</span>
                  </label>

                  <input
                    id="invite-email"
                    type="email"
                    required
                    maxLength={254}
                    autoFocus
                    value={inviteEmail}
                    onChange={(event) => {
                      setInviteEmail(event.target.value)
                      setInviteEmailError('')
                    }}
                    aria-invalid={Boolean(inviteEmailError)}
                    aria-describedby={inviteEmailError ? 'invite-email-error' : undefined}
                    placeholder="colleague@example.com"
                    className={`w-full rounded-full border ${inviteEmailError ? 'border-rose-500 focus:border-rose-500' : 'border-white/10 focus:border-teal-500/50'} bg-[#0a0a0a]/50 px-5 py-3 text-[14px] font-light text-zinc-200 placeholder:text-zinc-600 outline-none backdrop-blur-md transition-all hover:border-white/20 focus:ring-2 focus:ring-teal-500/20`}
                  />
                  {inviteEmailError && (
                    <p id="invite-email-error" role="alert" className="mt-2 text-xs text-rose-400">
                      {inviteEmailError}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="invite-role"
                    className="mb-2.5 block text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-400"
                  >
                    Organization role <span className="text-rose-500">*</span>
                  </label>

                  <div className="relative">
                    <select
                      id="invite-role"
                      value={inviteRole}
                      onChange={(event) =>
                        setInviteRole(event.target.value as Role)
                      }
                      className="h-12 w-full appearance-none rounded-full border border-white/10 bg-[#0a0a0a]/50 pl-5 pr-10 text-[14px] font-medium text-zinc-200 outline-none backdrop-blur-md transition-all hover:border-white/20 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20"
                    >
                      {currentRole === 'ADMIN' && (
                        <>
                          <option value="ADMIN" className="bg-zinc-900">
                            Admin
                          </option>
                          <option value="MANAGER" className="bg-zinc-900">
                            Manager
                          </option>
                        </>
                      )}

                      <option value="EMPLOYEE" className="bg-zinc-900">
                        Employee
                      </option>
                    </select>

                    <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500">
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </div>
                  </div>

                  <p className="mt-2 text-[11.5px] font-light leading-relaxed text-zinc-500">
                    Managers can invite employees only.
                  </p>
                </div>

                {inviteToken && (
                  <div className="space-y-3 rounded-2xl border border-teal-500/20 bg-teal-500/5 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                    <p className="text-[13px] font-medium text-teal-300">
                      Development invitation token
                    </p>

                    <p className="break-all font-mono text-[12px] leading-relaxed text-zinc-300">
                      {inviteToken}
                    </p>

                    <button
                      type="button"
                      onClick={() => void handleCopyToken()}
                      className="rounded-lg border border-teal-500/30 bg-teal-500/10 px-4 py-1.5 text-[12px] font-medium text-teal-300 transition hover:bg-teal-500/20"
                    >
                      {copied ? 'Copied' : 'Copy token'}
                    </button>

                    <p className="text-[11.5px] font-light leading-relaxed text-zinc-500">
                      Share this token securely. The invitee must sign in with
                      the same email address as the invitation and accept it
                      through the invitation flow.
                    </p>
                  </div>
                )}

                {pageError && (
                  <p
                    role="alert"
                    className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-[13.5px] font-light text-rose-200"
                  >
                    {pageError}
                  </p>
                )}

                <div className="flex flex-col-reverse gap-3 border-t border-white/[0.06] pt-5 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={closeInviteModal}
                    disabled={inviteState.loading}
                    className="rounded-xl border border-white/10 bg-white/5 px-6 py-2.5 text-[13.5px] font-medium tracking-wide text-zinc-300 transition hover:bg-white/10 disabled:opacity-50"
                  >
                    Close
                  </button>

                  <button
                    type="submit"
                    disabled={inviteState.loading || !selectedOrganizationId}
                    className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-xl border border-white/30 bg-gradient-to-b from-white to-zinc-100 px-6 py-2.5 text-[13.5px] font-medium tracking-wide text-zinc-900 shadow-[inset_0_1px_0_rgba(255,255,255,1),0_2px_4px_rgba(0,0,0,0.1)] transition-all hover:-translate-y-0.5 hover:from-white hover:to-white hover:shadow-[inset_0_1px_0_rgba(255,255,255,1),0_4px_8px_rgba(0,0,0,0.15)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="relative z-10">
                      {inviteState.loading
                        ? 'Creating invitation…'
                        : 'Create invitation'}
                    </span>

                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                  </button>
                </div>
              </form>
            </div>
          </section>
        </div>
      )}

      {/* Remove Confirmation Modal */}
      {confirmRemove && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-md">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="remove-title"
            className="w-full max-w-md overflow-hidden rounded-3xl border border-white/[0.06] bg-[#0a0a0a] p-8 shadow-2xl"
          >
            <div className="grid size-12 place-items-center rounded-2xl border border-rose-500/20 bg-rose-500/10 text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.1)]">
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </div>

            <h2
              id="remove-title"
              className="mt-6 text-[22px] font-light tracking-tight text-white"
            >
              Remove team member?
            </h2>

            <p className="mt-2.5 text-[14px] font-light leading-relaxed text-zinc-400">
              This removes{' '}
              <span className="font-medium text-zinc-200">
                {confirmRemove.user.name}
              </span>{' '}
              from this organization. Their user account will not be deleted.
            </p>

            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirmRemove(null)}
                disabled={removeState.loading}
                className="rounded-xl border border-white/10 bg-white/5 px-6 py-2.5 text-[13.5px] font-medium tracking-wide text-zinc-300 transition hover:bg-white/10 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => void handleRemove()}
                disabled={removeState.loading}
                className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-6 py-2.5 text-[13.5px] font-medium tracking-wide text-rose-400 transition hover:bg-rose-500/20 disabled:opacity-50"
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

import { useMemo, useState } from 'react'
import { gql } from '@apollo/client'
import { useMutation, useQuery } from '@apollo/client/react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { ProjectAnalyticsPanel } from './AnalyticsPanels'

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
      }
    }
  }
`

const ORGANIZATION_PROJECTS = gql`
  query OrganizationProjects(
    $organizationId: ID!
    $includeArchived: Boolean!
  ) {
    projects(
      organizationId: $organizationId
      includeArchived: $includeArchived
    ) {
      id
      name
      description
      status
      createdAt
      updatedAt
    }
  }
`

const CREATE_PROJECT = gql`
  mutation CreateProject($input: CreateProjectInput!) {
    createProject(input: $input) {
      id
      organizationId
      name
      description
      status
      createdAt
      updatedAt
    }
  }
`

const UPDATE_PROJECT = gql`
  mutation UpdateProject($input: UpdateProjectInput!) {
    updateProject(input: $input) {
      id
      organizationId
      name
      description
      status
      updatedAt
    }
  }
`

const ARCHIVE_PROJECT = gql`
  mutation ArchiveProject($organizationId: ID!, $projectId: ID!) {
    archiveProject(
      organizationId: $organizationId
      projectId: $projectId
    ) {
      id
      organizationId
      status
    }
  }
`

const PROJECT_MEMBERS = gql`
  query ProjectMembers($organizationId: ID!, $projectId: ID!) {
    projectMembers(organizationId: $organizationId, projectId: $projectId) {
      id
      userId
      projectId
      user {
        id
        name
        email
      }
      createdAt
    }
  }
`

const ADD_PROJECT_MEMBER = gql`
  mutation AddProjectMember($organizationId: ID!, $projectId: ID!, $userId: ID!) {
    addProjectMember(organizationId: $organizationId, projectId: $projectId, userId: $userId) {
      id
      userId
      projectId
      user {
        id
        name
        email
      }
    }
  }
`

const REMOVE_PROJECT_MEMBER = gql`
  mutation RemoveProjectMember($organizationId: ID!, $projectId: ID!, $userId: ID!) {
    removeProjectMember(organizationId: $organizationId, projectId: $projectId, userId: $userId)
  }
`

type ProjectMemberItem = {
  id: string
  userId: string
  projectId: string
  user?: {
    id: string
    name: string
    email: string
  }
  createdAt: string
}

type Organization = {
  id: string
  name: string
  slug: string
}

type Project = {
  id: string
  organizationId: string
  name: string
  description: string | null
  status: string
  createdAt: string
  updatedAt: string
}

type OrganizationsData = {
  myOrganizations: Organization[]
}

type ProjectsData = {
  projects: Project[]
}

type OrganizationMember = {
  id: string
  role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE'
  user: { id: string; name?: string; email?: string }
}

type OrganizationMembersData = {
  organizationMembers: OrganizationMember[]
}

type OrganizationVariables = {
  organizationId: string
}

type ProjectsVariables = OrganizationVariables & {
  includeArchived: boolean
}

type CreateProjectVariables = {
  input: {
    organizationId: string
    name: string
    description?: string | null
  }
}

type UpdateProjectVariables = {
  input: {
    organizationId: string
    projectId: string
    name?: string
    description?: string | null
  }
}

type ArchiveProjectVariables = {
  organizationId: string
  projectId: string
}

type Filter = 'ALL' | 'ACTIVE' | 'ARCHIVED'

function formatDate(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Date unavailable'
  }

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'Something went wrong. Please try again.'
}

function Icon({
  name,
  size = 18,
}: {
  name: 'plus' | 'search' | 'folder' | 'close' | 'arrow' | 'archive' | 'edit' | 'users'
  size?: number
}) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  }

  switch (name) {
    case 'plus':
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      )
    case 'search':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </svg>
      )
    case 'folder':
      return (
        <svg {...common}>
          <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </svg>
      )
    case 'close':
      return (
        <svg {...common}>
          <path d="m18 6-12 12M6 6l12 12" />
        </svg>
      )
    case 'arrow':
      return (
        <svg {...common}>
          <path d="M5 12h14m-6-6 6 6-6 6" />
        </svg>
      )
    case 'archive':
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="5" rx="1" />
          <path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9m-9 4h4" />
        </svg>
      )
    case 'edit':
      return (
        <svg {...common}>
          <path d="m14 5 5 5M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16z" />
        </svg>
      )
    case 'users':
      return (
        <svg {...common}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      )
  }
}

function StatusBadge({ status }: { status: string }) {
  const archived = status === 'ARCHIVED'

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-widest ${
        archived
          ? 'border-zinc-700 bg-zinc-800/50 text-zinc-400'
          : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.1)]'
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${
          archived ? 'bg-zinc-500' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]'
        }`}
      />
      {archived ? 'Archived' : 'Active'}
    </span>
  )
}

function ProjectMembersModal({
  project,
  organizationId,
  onClose,
  canManageMembers,
  organizationMembers,
}: {
  project: Project
  organizationId: string
  onClose: () => void
  canManageMembers: boolean
  organizationMembers: OrganizationMember[]
}) {
  const [selectedUserId, setSelectedUserId] = useState('')
  const [error, setError] = useState('')

  const { data, loading, error: membersError, refetch } = useQuery<{ projectMembers: ProjectMemberItem[] }>(
    PROJECT_MEMBERS,
    {
      variables: { organizationId, projectId: project.id },
      fetchPolicy: 'cache-and-network',
    },
  )

  const [addMember, { loading: adding }] = useMutation(ADD_PROJECT_MEMBER)
  const [removeMember, { loading: removing }] = useMutation(REMOVE_PROJECT_MEMBER)

  const members = data?.projectMembers ?? []
  const memberUserIds = new Set(members.map((m) => m.userId))

  const availableOrgMembers = organizationMembers.filter(
    (om) => !memberUserIds.has(om.user.id),
  )

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedUserId) return
    setError('')
    try {
      await addMember({
        variables: {
          organizationId,
          projectId: project.id,
          userId: selectedUserId,
        },
      })
      setSelectedUserId('')
      await refetch()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  async function handleRemove(userId: string) {
    setError('')
    try {
      await removeMember({
        variables: {
          organizationId,
          projectId: project.id,
          userId,
        },
      })
      await refetch()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`Members of ${project.name}`}
        className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#101012] p-6 shadow-2xl sm:p-8"
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] pb-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-400">
              Project membership
            </p>
            <h2 className="mt-1 text-xl font-light text-white">
              {project.name} — Members
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 p-2 text-zinc-400 hover:bg-white/5 hover:text-white"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300">
            {error}
          </p>
        )}

        {canManageMembers && project.status !== 'ARCHIVED' && (
          <form onSubmit={handleAdd} className="mt-6 flex gap-2">
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="h-10 flex-1 rounded-xl border border-white/10 bg-[#080808] px-3 text-xs text-zinc-200 outline-none focus:border-teal-500/50"
            >
              <option value="">Select organization member to assign…</option>
              {availableOrgMembers.map((om) => (
                <option key={om.id} value={om.user.id}>
                  {om.user?.name ?? om.user.id} ({om.role})
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={!selectedUserId || adding}
              className="rounded-xl bg-teal-500 px-4 text-xs font-semibold text-black transition hover:bg-teal-400 disabled:opacity-50"
            >
              {adding ? 'Adding…' : 'Add'}
            </button>
          </form>
        )}

        <div className="mt-6 space-y-2 max-h-72 overflow-y-auto">
          {loading ? (
            <p role="status" className="py-6 text-center text-xs text-zinc-500">Loading members…</p>
          ) : membersError ? (
            <p role="alert" className="py-6 text-center text-xs text-rose-300">
              Could not load project members.{' '}
              <button type="button" onClick={() => void refetch()} className="underline">
                Retry
              </button>
            </p>
          ) : members.length === 0 ? (
            <p className="py-6 text-center text-xs text-zinc-500">
              No members assigned to this project yet.
            </p>
          ) : (
            members.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs"
              >
                <div>
                  <p className="font-medium text-white">{m.user?.name ?? 'Member'}</p>
                  <p className="text-[11px] text-zinc-500">{m.user?.email}</p>
                </div>
                {canManageMembers && project.status !== 'ARCHIVED' && (
                  <button
                    type="button"
                    onClick={() => handleRemove(m.userId)}
                    disabled={removing}
                    className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-50"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}

function ProjectModal({
  project,
  organizationId,
  onClose,
  onSave,
  saving,
  error,
}: {
  project: Project | null
  organizationId: string
  onClose: () => void
  onSave: (name: string, description: string) => Promise<void>
  saving: boolean
  error: string
}) {
  const [name, setName] = useState(project?.name ?? '')
  const [description, setDescription] = useState(project?.description ?? '')
  const [validationError, setValidationError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedName = name.trim()
    const trimmedDescription = description.trim()

    const nextErrors: Record<string, string> = {}

    if (!trimmedName) {
      nextErrors.name = 'Project name is required. Enter a short, descriptive name.'
    } else if (trimmedName.length > 100) {
      nextErrors.name = 'Project name must be 100 characters or fewer.'
    }

    if (trimmedDescription.length > 1000) {
      nextErrors.description = 'Description must be 1,000 characters or fewer.'
    }

    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    setValidationError('')

    await onSave(trimmedName, trimmedDescription)
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-md"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) {
          onClose()
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-modal-title"
        className="my-auto w-full max-w-lg overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0a0a0a] p-1 shadow-2xl"
      >
        <div className="emerald-bg absolute inset-0" />
        <div className="camo-grid-dense absolute inset-0" />

        <div className="relative rounded-[22px] bg-gradient-to-b from-white/[0.02] to-transparent">
          <div className="flex items-start justify-between border-b border-white/[0.06] px-7 py-6">
            <div>
              <h2
                id="project-modal-title"
                className="text-[22px] font-medium tracking-tight text-white"
              >
                {project ? 'Edit project' : 'Create a project'}
              </h2>

              <p className="mt-1.5 text-[13.5px] font-light leading-relaxed text-zinc-400">
                {project
                  ? 'Update the details of your project.'
                  : 'Give your team a clear place to organize their work.'}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg p-2 text-zinc-500 transition hover:bg-white/10 hover:text-white"
            >
              <Icon name="close" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 p-7">
            <div>
              <label
                htmlFor="project-name"
                className="mb-2.5 block text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-400"
              >
                Project name <span className="text-rose-500">*</span>
              </label>

              <input
                id="project-name"
                autoFocus
                required
                maxLength={100}
                value={name}
                onChange={(event) => {
                  setName(event.target.value)
                  setFieldErrors((old) => ({ ...old, name: '' }))
                }}
                placeholder="e.g. Website redesign"
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={fieldErrors.name ? 'project-name-error' : undefined}
                className={`w-full rounded-full border ${fieldErrors.name ? 'border-rose-500 focus:border-rose-500' : 'border-white/10'} bg-[#0a0a0a]/50 px-5 py-3.5 text-[14.5px] font-light tracking-wide text-zinc-200 placeholder:text-zinc-600 outline-none backdrop-blur-md transition-all hover:border-white/20 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20`}
              />
              {fieldErrors.name && <p id="project-name-error" role="alert" className="mt-2 text-xs text-rose-400">{fieldErrors.name}</p>}

              <p className="mt-2 pr-3 text-right text-[11px] font-medium tracking-wide text-zinc-600">
                {name.length}/100
              </p>
            </div>

            <div>
              <label
                htmlFor="project-description"
                className="mb-2.5 block text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-400"
              >
                Description <span className="text-zinc-600">(optional)</span>
              </label>

              <textarea
                id="project-description"
                rows={4}
                maxLength={1000}
                value={description}
                onChange={(event) => {
                  setDescription(event.target.value)
                  setFieldErrors((old) => ({ ...old, description: '' }))
                }}
                placeholder="What is this project about?"
                aria-invalid={Boolean(fieldErrors.description)}
                aria-describedby={fieldErrors.description ? 'project-description-error' : undefined}
                className={`w-full resize-y rounded-2xl border ${fieldErrors.description ? 'border-rose-500 focus:border-rose-500' : 'border-white/10'} bg-[#0a0a0a]/50 px-5 py-4 text-[14px] font-light leading-relaxed text-zinc-200 placeholder:text-zinc-600 outline-none backdrop-blur-md transition-all hover:border-white/20 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20`}
              />
              {fieldErrors.description && <p id="project-description-error" role="alert" className="mt-2 text-xs text-rose-400">{fieldErrors.description}</p>}

              <p className="mt-2 pr-3 text-right text-[11px] font-medium tracking-wide text-zinc-600">
                {description.length}/1000
              </p>
            </div>

            <input type="hidden" value={organizationId} readOnly />

            {(validationError || error) && (
              <p
                role="alert"
                className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-[13.5px] font-light text-rose-200"
              >
                {validationError || error}
              </p>
            )}

            <div className="flex flex-col-reverse gap-3 border-t border-white/[0.06] pt-6 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-xl border border-white/10 bg-white/5 px-6 py-2.5 text-[13.5px] font-medium tracking-wide text-zinc-300 transition hover:bg-white/10 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving}
                className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-xl border border-white/30 bg-gradient-to-b from-white to-zinc-100 px-6 py-2.5 text-[13.5px] font-medium tracking-wide text-zinc-900 shadow-[inset_0_1px_0_rgba(255,255,255,1),0_2px_4px_rgba(0,0,0,0.1)] transition-all hover:-translate-y-0.5 hover:from-white hover:to-white hover:shadow-[inset_0_1px_0_rgba(255,255,255,1),0_4px_8px_rgba(0,0,0,0.15)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="relative z-10">
                  {saving
                    ? 'Saving…'
                    : project
                      ? 'Save changes'
                      : 'Create project'}
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  )
}

export default function Projects() {
  const { user } = useAuth()
  const [organizationId, setOrganizationId] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('ALL')
  const [modalProject, setModalProject] = useState<Project | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [membersProject, setMembersProject] = useState<Project | null>(null)
  const [analyticsProject, setAnalyticsProject] = useState<Project | null>(null)
  const [mutationError, setMutationError] = useState('')
  const [pageNotice, setPageNotice] = useState('')
  const [confirmArchive, setConfirmArchive] = useState<Project | null>(null)
  const [archiving, setArchiving] = useState(false)

  const {
    data: organizationsData,
    loading: organizationsLoading,
    error: organizationsError,
  } = useQuery<OrganizationsData>(MY_ORGANIZATIONS)

  const organizations = organizationsData?.myOrganizations ?? []

  const selectedOrganizationId =
    organizations.some((organization) => organization.id === organizationId)
      ? organizationId
      : organizations[0]?.id ?? ''

  const { data: membersData, error: membersError } = useQuery<
    OrganizationMembersData,
    OrganizationVariables
  >(
    ORGANIZATION_MEMBERS,
    {
      variables: { organizationId: selectedOrganizationId },
      skip: !selectedOrganizationId,
      fetchPolicy: 'cache-and-network',
    },
  )

  const currentMember = (membersData?.organizationMembers ?? []).find(
    (member) => member.user.id === user?.id,
  )
  const canCreateProject = currentMember?.role === 'ADMIN'
  const canViewMemberAnalytics = currentMember?.role === 'ADMIN' || currentMember?.role === 'MANAGER'

  const {
    data: projectsData,
    loading: projectsLoading,
    error: projectsError,
    refetch: refetchProjects,
  } = useQuery<ProjectsData, ProjectsVariables>(ORGANIZATION_PROJECTS, {
    variables: {
      organizationId: selectedOrganizationId,
      includeArchived: true,
    },
    skip: !selectedOrganizationId,
    fetchPolicy: 'cache-and-network',
  })

  const [createProject, createState] = useMutation<
    { createProject: Project },
    CreateProjectVariables
  >(CREATE_PROJECT)

  const [updateProject, updateState] = useMutation<
    { updateProject: Project },
    UpdateProjectVariables
  >(UPDATE_PROJECT)

  const [archiveProject] = useMutation<
    { archiveProject: Project },
    ArchiveProjectVariables
  >(ARCHIVE_PROJECT)

  const projects = projectsData?.projects ?? []

  const filteredProjects = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    return projects.filter((project) => {
      const matchesSearch =
        !normalizedSearch ||
        project.name.toLowerCase().includes(normalizedSearch) ||
        (project.description ?? '').toLowerCase().includes(normalizedSearch)

      const matchesFilter =
        filter === 'ALL' || project.status === filter

      return matchesSearch && matchesFilter
    })
  }, [projects, search, filter])

  const activeCount = projects.filter(
    (project) => project.status === 'ACTIVE',
  ).length

  const archivedCount = projects.filter(
    (project) => project.status === 'ARCHIVED',
  ).length

  function openCreateModal() {
    setMutationError('')
    setModalProject(null)
    setModalOpen(true)
  }

  function openEditModal(project: Project) {
    if (!canCreateProject) return

    setMutationError('')
    setModalProject(project)
    setModalOpen(true)
  }

  function closeModal() {
    if (createState.loading || updateState.loading) return

    setModalOpen(false)
    setModalProject(null)
    setMutationError('')
  }

  async function handleSave(name: string, description: string) {
    setMutationError('')

    try {
      if (modalProject) {
        await updateProject({
          variables: {
            input: {
              organizationId: selectedOrganizationId,
              projectId: modalProject.id,
              name,
              description,
            },
          },
        })

        setPageNotice('Project updated successfully.')
      } else {
        await createProject({
          variables: {
            input: {
              organizationId: selectedOrganizationId,
              name,
              description,
            },
          },
        })

        setPageNotice('Project created successfully.')
      }

      setModalOpen(false)
      setModalProject(null)

      await refetchProjects()
    } catch (error) {
      setMutationError(getErrorMessage(error))
    }
  }

  async function handleArchive() {
    if (!canCreateProject || !confirmArchive) return

    setArchiving(true)
    setMutationError('')

    try {
      await archiveProject({
        variables: {
          organizationId: selectedOrganizationId,
          projectId: confirmArchive.id,
        },
      })

      setPageNotice('Project archived successfully.')
      setConfirmArchive(null)

      await refetchProjects()
    } catch (error) {
      setMutationError(getErrorMessage(error))
    } finally {
      setArchiving(false)
    }
  }

  return (
    <main className="relative min-h-screen bg-[#050505] text-zinc-300 selection:bg-teal-500/30">
      {/* Background Elements */}
      <div className="bg-grid-pattern absolute inset-0 -z-10 pointer-events-none" />
      <div className="absolute left-1/2 top-0 -z-10 h-[600px] w-[1000px] -translate-x-1/2 bg-teal-500/5 blur-[150px] animate-float rounded-[100%] pointer-events-none" />
      <div className="absolute inset-0 bg-noise -z-10 mix-blend-overlay pointer-events-none" />

      {/* Main Content */}
      <div className="mx-auto max-w-[1200px] px-6 pb-20 pt-10 sm:px-8">

        {/* Header Section */}
        <div className="mb-12 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-5 flex items-center gap-2.5 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-teal-400">
              <Link to="/dashboard" className="transition hover:text-teal-300">
                Workspace
              </Link>
              <span aria-hidden="true" className="text-zinc-700">/</span>
              <span className="text-zinc-500">Projects</span>
            </div>

            <h1 className="text-[42px] font-medium leading-[1.1] tracking-[-0.04em] text-white">
              Projects
            </h1>

            <p className="mt-3.5 max-w-xl text-[15px] font-light leading-relaxed tracking-wide text-zinc-400">
              Plan work, organize ideas, and keep your team moving forward.
            </p>
          </div>

          {canCreateProject && (
          <button
            type="button"
            onClick={openCreateModal}
            disabled={!selectedOrganizationId || organizationsLoading}
            className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-xl border border-white/30 bg-gradient-to-b from-white to-zinc-100 px-6 py-2.5 text-[13.5px] font-medium tracking-wide text-zinc-900 shadow-[inset_0_1px_0_rgba(255,255,255,1),0_2px_4px_rgba(0,0,0,0.1)] transition-all hover:-translate-y-0.5 hover:from-white hover:to-white hover:shadow-[inset_0_1px_0_rgba(255,255,255,1),0_4px_8px_rgba(0,0,0,0.15)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Icon name="plus" size={16} />
            New project
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
          </button>
          )}
        </div>

        {/* Notices */}
        {pageNotice && (
          <div className="mb-6 flex items-start justify-between gap-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-3.5 text-[13.5px] font-light tracking-wide text-emerald-300 backdrop-blur-md">
            <span>{pageNotice}</span>
            <button
              type="button"
              onClick={() => setPageNotice('')}
              className="rounded p-0.5 hover:bg-white/10"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        )}

        {mutationError && !modalOpen && (
          <div className="mb-6 flex items-start justify-between gap-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-5 py-3.5 text-[13.5px] font-light tracking-wide text-rose-300 backdrop-blur-md">
            <span>{mutationError}</span>
            <button
              type="button"
              onClick={() => setMutationError('')}
              className="rounded p-0.5 hover:bg-white/10"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        )}

        {membersError && (
          <div role="alert" className="mb-6 rounded-xl border border-rose-500/20 bg-rose-500/10 px-5 py-3.5 text-[13.5px] font-light tracking-wide text-rose-300 backdrop-blur-md">
            Could not load your project permissions. Reload the page to try again.
          </div>
        )}

        {/* Content */}
        {organizationsLoading ? (
          <div className="space-y-5">
            <div className="h-28 animate-pulse rounded-3xl border border-white/[0.06] bg-white/[0.02]" />
            <div className="h-48 animate-pulse rounded-3xl border border-white/[0.06] bg-white/[0.02]" />
          </div>
        ) : organizationsError ? (
          <section className="rounded-3xl border border-rose-500/20 bg-rose-500/5 p-8">
            <h2 className="text-[18px] font-medium tracking-tight text-white">
              Could not load your organizations
            </h2>
            <p className="mt-2 text-[13.5px] font-light text-zinc-400">
              Check your connection and try again.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 rounded-lg border border-white/10 bg-white/5 px-5 py-2.5 text-[13px] font-medium tracking-wide text-white transition hover:bg-white/10"
            >
              Try again
            </button>
          </section>
        ) : organizations.length === 0 ? (
          <section className="rounded-3xl border border-white/[0.06] bg-[#0a0a0a] px-6 py-20 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <div className="mx-auto grid size-16 place-items-center rounded-2xl border border-white/10 bg-white/5 text-zinc-400">
              <Icon name="folder" size={28} />
            </div>
            <h2 className="mt-6 text-[22px] font-light tracking-tight text-white">
              No workspace found
            </h2>
            <p className="mx-auto mt-2.5 max-w-md text-[14px] font-light leading-relaxed text-zinc-500">
              Your account is not associated with an organization yet. Once you join a workspace, its projects will appear here.
            </p>
          </section>
        ) : (
          <>
            {/* Workspace Selector */}
            <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <span className="grid size-12 place-items-center rounded-xl border border-teal-500/20 bg-teal-500/10 text-teal-400 shadow-[0_0_20px_rgba(20,184,166,0.15)]">
                  <Icon name="folder" size={22} />
                </span>
                <div>
                  <p className="text-[16px] font-medium tracking-tight text-white">
                    {organizations.find(
                      (organization) =>
                        organization.id === selectedOrganizationId,
                    )?.name ?? 'Workspace'}
                  </p>
                  <p className="mt-0.5 text-[12.5px] font-light tracking-wide text-zinc-500">
                    {projectsLoading && !projectsData
                      ? 'Loading projects…'
                      : `${projects.length} ${
                          projects.length === 1 ? 'project' : 'projects'
                        } in this workspace`}
                  </p>
                </div>
              </div>

              {organizations.length > 1 && (
                <div className="relative sm:w-64">
                  <select
                    value={selectedOrganizationId}
                    onChange={(event) => {
                      setOrganizationId(event.target.value)
                      setSearch('')
                      setFilter('ALL')
                    }}
                    className="h-11 w-full appearance-none rounded-full border border-white/10 bg-[#0a0a0a]/50 pl-5 pr-10 text-[13.5px] font-medium tracking-wide text-zinc-200 shadow-sm outline-none backdrop-blur-md transition-all hover:border-white/20 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20"
                  >
                    {organizations.map((organization) => (
                      <option key={organization.id} value={organization.id} className="bg-zinc-900">
                        {organization.name}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </div>
              )}
            </div>

            {/* Stats Cards */}
            <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                {
                  label: 'Total projects',
                  value: projects.length,
                  detail: 'Across this workspace',
                },
                {
                  label: 'Active projects',
                  value: activeCount,
                  detail: 'Currently available',
                },
                {
                  label: 'Archived projects',
                  value: archivedCount,
                  detail: 'Kept for reference',
                },
              ].map((stat) => (
                <article
                  key={stat.label}
                  className="group relative overflow-hidden rounded-3xl border border-white/[0.06] bg-[#0a0a0a] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-all duration-300 hover:bg-[#0c0c0c] hover:shadow-[0_8px_30px_rgba(0,0,0,0.3)]"
                >
                  <div className="absolute -right-6 -top-6 size-24 rounded-full bg-teal-500/5 blur-2xl transition-all group-hover:bg-teal-500/10" />
                  <p className="relative text-[10.5px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{stat.label}</p>
                  <p className="relative mt-4 text-[40px] font-light leading-none tracking-[-0.05em] text-white tabular-nums">
                    {projectsLoading && !projectsData ? (
                      <span className="inline-block h-10 w-16 animate-pulse rounded bg-white/10" />
                    ) : (
                      stat.value
                    )}
                  </p>
                  <p className="relative mt-3 text-[12.5px] font-light tracking-wide text-zinc-500">{stat.detail}</p>
                </article>
              ))}
            </section>

            {/* Project List */}
            <section className="overflow-hidden rounded-3xl border border-white/[0.06] bg-[#0a0a0a]/60 shadow-[0_0_50px_-12px_rgba(0,0,0,0.6)] backdrop-blur-xl">
              <div className="border-b border-white/[0.06] p-6">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-[20px] font-medium tracking-tight text-white">All projects</h2>
                    <p className="mt-1.5 text-[13.5px] font-light tracking-wide text-zinc-500">Browse and manage your workspace projects.</p>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="relative min-w-0 sm:w-64">
                      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500">
                        <Icon name="search" size={16} />
                      </span>
                      <input
                        type="search"
                        aria-label="Search projects"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search projects…"
                        className="w-full rounded-full border border-white/10 bg-[#050505] py-2.5 pl-11 pr-4 text-[13.5px] font-light tracking-wide text-white placeholder:text-zinc-600 outline-none backdrop-blur-md transition-all hover:border-white/20 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20"
                      />
                    </div>

                    <label className="flex items-center gap-3 rounded-full border border-white/10 bg-[#050505] px-5 py-2.5 backdrop-blur-md transition-all hover:border-white/20">
                      <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-[0.15em] text-zinc-500">Status</span>
                      <select
                        aria-label="Filter projects by status"
                        value={filter}
                        onChange={(event) =>
                          setFilter(event.target.value as Filter)
                        }
                        className="min-w-0 appearance-none bg-transparent text-[13.5px] font-medium tracking-wide text-zinc-200 outline-none cursor-pointer"
                      >
                        <option value="ALL" className="bg-zinc-900">All</option>
                        <option value="ACTIVE" className="bg-zinc-900">Active</option>
                        <option value="ARCHIVED" className="bg-zinc-900">Archived</option>
                      </select>
                    </label>
                  </div>
                </div>
              </div>

              {projectsError && !projectsData ? (
                <div className="px-6 py-16 text-center">
                  <p role="alert" className="text-[13.5px] font-light tracking-wide text-rose-400">Could not load projects.</p>
                  <button
                    type="button"
                    onClick={() => void refetchProjects()}
                    className="mt-4 rounded-lg border border-white/10 bg-white/5 px-5 py-2.5 text-[13px] font-medium tracking-wide text-white transition hover:bg-white/10"
                  >
                    Retry
                  </button>
                </div>
              ) : projectsLoading && !projectsData ? (
                <div className="divide-y divide-white/[0.04]">
                  {[1, 2, 3].map((item) => (
                    <div key={item} className="flex animate-pulse items-center gap-5 px-6 py-6">
                      <div className="size-12 rounded-xl bg-white/5" />
                      <div className="flex-1 space-y-3">
                        <div className="h-4 w-48 rounded bg-white/5" />
                        <div className="h-3 w-72 max-w-full rounded bg-white/[0.03]" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredProjects.length === 0 ? (
                <div className="px-6 py-20 text-center sm:py-24">
                  <div className="mx-auto grid size-16 place-items-center rounded-2xl border border-white/[0.06] bg-white/[0.02] text-zinc-500">
                    <Icon name="folder" size={28} />
                  </div>
                  <h3 className="mt-6 text-[20px] font-light tracking-tight text-white">
                    {search || filter !== 'ALL'
                      ? 'No matching projects'
                      : 'Your next project starts here'}
                  </h3>
                  <p className="mx-auto mt-2.5 max-w-sm text-[14px] font-light leading-relaxed text-zinc-500">
                    {search || filter !== 'ALL'
                      ? 'Try a different search term or change the status filter.'
                      : 'Create a project to give your team a dedicated place to plan and organize work.'}
                  </p>
                  {search || filter !== 'ALL' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSearch('')
                        setFilter('ALL')
                      }}
                      className="mt-6 text-[14px] font-medium tracking-wide text-teal-400 transition hover:text-teal-300"
                    >
                      Clear filters
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={openCreateModal}
                      className="mt-7 inline-flex items-center gap-2 rounded-xl border border-white/30 bg-gradient-to-b from-white to-zinc-100 px-6 py-2.5 text-[13.5px] font-medium tracking-wide text-zinc-900 shadow-[inset_0_1px_0_rgba(255,255,255,1),0_2px_4px_rgba(0,0,0,0.1)] transition-all hover:-translate-y-0.5 hover:from-white hover:to-white hover:shadow-[inset_0_1px_0_rgba(255,255,255,1),0_4px_8px_rgba(0,0,0,0.15)]"
                    >
                      <Icon name="plus" size={16} />
                      Create your first project
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="hidden grid-cols-[minmax(0,1fr)_120px_125px_88px] gap-5 border-b border-white/[0.06] bg-white/[0.02] px-6 py-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500 md:grid">
                    <span>Project</span>
                    <span>Status</span>
                    <span>Created</span>
                    <span className="text-right">Actions</span>
                  </div>

                  <div className="divide-y divide-white/[0.04]">
                    {filteredProjects.map((project) => (
                      <article
                        key={project.id}
                        className="group relative grid gap-5 px-6 py-5 transition-all duration-200 hover:bg-white/[0.02] md:grid-cols-[minmax(0,1fr)_120px_125px_88px] md:items-center"
                      >
                        <div className="absolute left-0 top-1/2 h-0 w-[2.5px] -translate-y-1/2 rounded-r-full bg-teal-500 opacity-0 shadow-[0_0_12px_rgba(20,184,166,0.8)] transition-all duration-300 group-hover:h-12 group-hover:opacity-100" />

                        <div className="flex min-w-0 items-start gap-4">
                          <div className="grid size-12 shrink-0 place-items-center rounded-xl border border-white/[0.06] bg-white/5 text-zinc-400 transition-colors duration-300 group-hover:border-teal-500/30 group-hover:bg-teal-500/10 group-hover:text-teal-400">
                            <Icon name="folder" size={22} />
                          </div>
                          <div className="min-w-0">
                            <h3 className="break-words text-[15px] font-medium tracking-tight text-zinc-100 group-hover:text-white">
                              {project.name}
                            </h3>
                            <p className="mt-1 line-clamp-2 break-words text-[13px] font-light leading-relaxed text-zinc-500 group-hover:text-zinc-400">
                              {project.description || 'No description provided.'}
                            </p>
                            <p className="mt-2 text-[11px] font-medium tracking-wide text-zinc-600 md:hidden">
                              Created {formatDate(project.createdAt)}
                            </p>
                          </div>
                        </div>

                        <div>
                          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-zinc-600 md:hidden">Status</span>
                          <StatusBadge status={project.status} />
                        </div>

                        <div className="hidden text-[13px] font-light tracking-wide text-zinc-500 md:block">
                          {formatDate(project.createdAt)}
                        </div>

                        <div className="flex items-center justify-start gap-1.5 md:justify-end">
                          <button type="button" onClick={() => setAnalyticsProject(project)} aria-label={`Analytics for ${project.name}`} className="rounded-lg border border-white/10 px-2 py-1 text-xs text-teal-400 transition-colors hover:bg-teal-500/10">Analytics</button>
                          <button
                            type="button"
                            onClick={() => {
                              setMutationError('')
                              setMembersProject(project)
                            }}
                            aria-label={`Members of ${project.name}`}
                            title="Manage project members"
                            className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-white/10 hover:text-white"
                          >
                            <Icon name="users" size={16} />
                          </button>

                          {canCreateProject && project.status !== 'ARCHIVED' && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditModal(project)}
                                aria-label={`Edit ${project.name}`}
                                title="Edit project"
                                className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-white/10 hover:text-white"
                              >
                                <Icon name="edit" size={16} />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setMutationError('')
                                  setConfirmArchive(project)
                                }}
                                aria-label={`Archive ${project.name}`}
                                title="Archive project"
                                className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-amber-500/10 hover:text-amber-400"
                              >
                                <Icon name="archive" size={16} />
                              </button>
                            </>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              )}

              {projectsData && (
                <div className="border-t border-white/[0.04] bg-[#050505]/50 px-6 py-4 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
                  Showing {filteredProjects.length} of {projects.length}{' '}
                  {projects.length === 1 ? 'project' : 'projects'}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {modalOpen && selectedOrganizationId && canCreateProject && (
        <ProjectModal
          key={modalProject?.id ?? 'new-project'}
          project={modalProject}
          organizationId={selectedOrganizationId}
          onClose={closeModal}
          onSave={handleSave}
          saving={createState.loading || updateState.loading}
          error={mutationError}
        />
      )}

      {membersProject && selectedOrganizationId && (
        <ProjectMembersModal
          key={membersProject.id}
          project={membersProject}
          organizationId={selectedOrganizationId}
          onClose={() => setMembersProject(null)}
          canManageMembers={canCreateProject}
          organizationMembers={membersData?.organizationMembers ?? []}
        />
      )}

      {analyticsProject && selectedOrganizationId && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/80 p-3 backdrop-blur-sm sm:p-6" role="presentation">
          <section role="dialog" aria-modal="true" aria-label={`Analytics for ${analyticsProject.name}`} className="my-6 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-white/10 bg-[#101012] p-5 shadow-2xl sm:p-7">
            <div className="mb-5 flex items-center justify-between gap-3"><h2 className="text-xl text-white">{analyticsProject.name}</h2><button type="button" onClick={() => setAnalyticsProject(null)} className="rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-300">Close</button></div>
            <ProjectAnalyticsPanel organizationId={selectedOrganizationId} projectId={analyticsProject.id} canViewMembers={canViewMemberAnalytics} />
          </section>
        </div>
      )}

      {confirmArchive && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-md">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="archive-title"
            aria-describedby="archive-description"
            className="w-full max-w-md overflow-hidden rounded-3xl border border-white/[0.06] bg-[#0a0a0a] p-8 shadow-2xl"
          >
            <div className="grid size-12 place-items-center rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.1)]">
              <Icon name="archive" size={22} />
            </div>

            <h2 id="archive-title" className="mt-6 text-[22px] font-light tracking-tight text-white">
              Archive this project?
            </h2>

            <p id="archive-description" className="mt-2.5 text-[14px] font-light leading-relaxed text-zinc-400">
              <span className="font-medium text-zinc-200">{confirmArchive.name}</span>{' '}
              will be moved to archived projects. You can still find it using the Archived filter.
            </p>

            {mutationError && (
              <p role="alert" className="mt-5 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-[13.5px] font-light text-rose-300">
                {mutationError}
              </p>
            )}

            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={archiving}
                onClick={() => {
                  setConfirmArchive(null)
                  setMutationError('')
                }}
                className="rounded-xl border border-white/10 bg-white/5 px-6 py-2.5 text-[13.5px] font-medium tracking-wide text-zinc-300 transition hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={archiving}
                onClick={() => void handleArchive()}
                className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-6 py-2.5 text-[13.5px] font-medium tracking-wide text-amber-400 transition hover:bg-amber-500/20 disabled:opacity-50"
              >
                {archiving ? 'Archiving…' : 'Archive project'}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

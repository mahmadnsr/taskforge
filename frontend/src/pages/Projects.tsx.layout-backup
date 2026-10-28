import { useMemo, useState } from 'react'
import { gql } from '@apollo/client'
import { useMutation, useQuery } from '@apollo/client/react'
import { Link } from 'react-router-dom'

const MY_ORGANIZATIONS = gql`
  query MyOrganizations {
    myOrganizations {
      id
      name
      slug
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
  name: 'plus' | 'search' | 'folder' | 'close' | 'arrow' | 'archive' | 'edit'
  size?: number
}) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
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
  }
}

function StatusBadge({ status }: { status: string }) {
  const archived = status === 'ARCHIVED'

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium ${
        archived
          ? 'border-slate-500/25 bg-slate-500/10 text-slate-400'
          : 'border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-300'
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${
          archived ? 'bg-slate-500' : 'bg-emerald-400'
        }`}
      />
      {archived ? 'Archived' : 'Active'}
    </span>
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedName = name.trim()
    const trimmedDescription = description.trim()

    if (!trimmedName) {
      setValidationError('Please enter a project name.')
      return
    }

    if (trimmedName.length > 100) {
      setValidationError('Project name must be 100 characters or fewer.')
      return
    }

    if (trimmedDescription.length > 1000) {
      setValidationError('Description must be 1,000 characters or fewer.')
      return
    }

    setValidationError('')

    await onSave(trimmedName, trimmedDescription)
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/65 p-4 backdrop-blur-sm"
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
        className="my-auto w-full max-w-lg rounded-2xl border border-white/10 bg-[#101827] shadow-2xl shadow-black/40"
      >
        <div className="flex items-start justify-between border-b border-white/[0.07] px-6 py-5">
          <div>
            <h2
              id="project-modal-title"
              className="text-lg font-semibold tracking-tight text-white"
            >
              {project ? 'Edit project' : 'Create a project'}
            </h2>

            <p className="mt-1 text-sm leading-6 text-slate-400">
              {project
                ? 'Update the details of your project.'
                : 'Give your team a clear place to organize their work.'}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close dialog"
            className="rounded-lg p-2 text-slate-400 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <Icon name="close" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          <div>
            <label
              htmlFor="project-name"
              className="mb-2 block text-sm font-medium text-slate-200"
            >
              Project name <span className="text-rose-400">*</span>
            </label>

            <input
              id="project-name"
              autoFocus
              required
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Website redesign"
              className="w-full rounded-xl border border-white/10 bg-[#0b1220] px-4 py-3 text-sm text-white placeholder:text-slate-600 transition focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/10"
            />

            <p className="mt-1.5 text-right text-xs text-slate-500">
              {name.length}/100
            </p>
          </div>

          <div>
            <label
              htmlFor="project-description"
              className="mb-2 block text-sm font-medium text-slate-200"
            >
              Description <span className="text-slate-500">(optional)</span>
            </label>

            <textarea
              id="project-description"
              rows={4}
              maxLength={1000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What is this project about?"
              className="w-full resize-y rounded-xl border border-white/10 bg-[#0b1220] px-4 py-3 text-sm leading-6 text-white placeholder:text-slate-600 transition focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/10"
            />

            <p className="mt-1.5 text-right text-xs text-slate-500">
              {description.length}/1000
            </p>
          </div>

          <input type="hidden" value={organizationId} readOnly />

          {(validationError || error) && (
            <p
              role="alert"
              className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-3 text-sm leading-6 text-rose-300"
            >
              {validationError || error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-3 border-t border-white/[0.07] pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/[0.04] disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-60"
            >
              {saving
                ? 'Saving…'
                : project
                  ? 'Save changes'
                  : 'Create project'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

export default function Projects() {
  const [organizationId, setOrganizationId] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('ALL')
  const [modalProject, setModalProject] = useState<Project | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
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
    if (!confirmArchive) return

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
    <main className="min-h-screen bg-[#080d18] text-slate-200">
      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#080d18]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link
            to="/dashboard"
            className="flex shrink-0 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-cyan-400 text-sm font-black text-slate-950 shadow-lg shadow-cyan-400/10">
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
              aria-current="page"
              className="rounded-lg bg-white/[0.06] px-3 py-2 text-sm font-medium text-white"
            >
              Projects
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 pb-16 pt-8 sm:px-8 sm:pt-12">
        <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm text-slate-500">
              <Link
                to="/dashboard"
                className="transition hover:text-slate-300"
              >
                Workspace
              </Link>

              <span aria-hidden="true">/</span>

              <span className="text-slate-300">Projects</span>
            </div>

            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Projects
            </h1>

            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400 sm:text-base">
              Plan work, organize ideas, and keep your team moving forward.
            </p>
          </div>

          <button
            type="button"
            onClick={openCreateModal}
            disabled={!selectedOrganizationId || organizationsLoading}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-400/[0.08] transition hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#080d18] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon name="plus" size={17} />
            New project
          </button>
        </div>

        {pageNotice && (
          <div
            role="status"
            className="mb-6 flex items-start justify-between gap-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-4 py-3 text-sm text-emerald-300"
          >
            <span>{pageNotice}</span>

            <button
              type="button"
              onClick={() => setPageNotice('')}
              aria-label="Dismiss notification"
              className="rounded p-0.5 hover:bg-white/5"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        )}

        {mutationError && !modalOpen && (
          <div
            role="alert"
            className="mb-6 flex items-start justify-between gap-4 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-4 py-3 text-sm text-rose-300"
          >
            <span>{mutationError}</span>

            <button
              type="button"
              onClick={() => setMutationError('')}
              aria-label="Dismiss error"
              className="rounded p-0.5 hover:bg-white/5"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        )}

        {organizationsLoading ? (
          <div className="space-y-5" aria-label="Loading organizations">
            <div className="h-24 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.02]" />
            <div className="h-48 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.02]" />
          </div>
        ) : organizationsError ? (
          <section className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.04] p-6">
            <h2 className="font-medium text-white">
              Could not load your organizations
            </h2>

            <p className="mt-2 text-sm text-slate-400">
              Check your connection and try again.
            </p>

            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-lg border border-white/10 px-4 py-2 text-sm text-white transition hover:bg-white/[0.05]"
            >
              Try again
            </button>
          </section>
        ) : organizations.length === 0 ? (
          <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] px-6 py-16 text-center">
            <div className="mx-auto grid size-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.03] text-slate-400">
              <Icon name="folder" size={23} />
            </div>

            <h2 className="mt-5 text-lg font-semibold text-white">
              No workspace found
            </h2>

            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
              Your account is not associated with an organization yet. Once
              you join a workspace, its projects will appear here.
            </p>
          </section>
        ) : (
          <>
            <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-cyan-300">
                  <Icon name="folder" size={20} />
                </span>

                <div>
                  <p className="text-sm font-medium text-white">
                    {organizations.find(
                      (organization) =>
                        organization.id === selectedOrganizationId,
                    )?.name ?? 'Workspace'}
                  </p>

                  <p className="mt-0.5 text-xs text-slate-500">
                    {projectsLoading && !projectsData
                      ? 'Loading projects…'
                      : `${projects.length} ${
                          projects.length === 1 ? 'project' : 'projects'
                        } in this workspace`}
                  </p>
                </div>
              </div>

              {organizations.length > 1 && (
                <div className="sm:w-64">
                  <label
                    htmlFor="project-organization"
                    className="sr-only"
                  >
                    Select organization
                  </label>

                  <select
                    id="project-organization"
                    value={selectedOrganizationId}
                    onChange={(event) => {
                      setOrganizationId(event.target.value)
                      setSearch('')
                      setFilter('ALL')
                    }}
                    className="w-full rounded-xl border border-white/10 bg-[#0d1422] px-3 py-2.5 text-sm text-slate-200 focus:border-cyan-400/50"
                  >
                    {organizations.map((organization) => (
                      <option
                        key={organization.id}
                        value={organization.id}
                      >
                        {organization.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <section
              aria-label="Project statistics"
              className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3"
            >
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
                  className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 transition hover:border-white/[0.12] hover:bg-white/[0.03]"
                >
                  <p className="text-sm text-slate-400">{stat.label}</p>

                  <p className="mt-3 text-3xl font-semibold tracking-tight text-white">
                    {projectsLoading && !projectsData ? (
                      <span className="inline-block h-9 w-12 animate-pulse rounded bg-white/[0.07]" />
                    ) : (
                      stat.value
                    )}
                  </p>

                  <p className="mt-2 text-xs text-slate-500">
                    {stat.detail}
                  </p>
                </article>
              ))}
            </section>

            <section
              aria-labelledby="project-list-heading"
              className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c1320]/70"
            >
              <div className="border-b border-white/[0.07] p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2
                      id="project-list-heading"
                      className="font-semibold text-white"
                    >
                      All projects
                    </h2>

                    <p className="mt-1 text-sm text-slate-500">
                      Browse and manage your workspace projects.
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="relative min-w-0 sm:w-64">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                        <Icon name="search" size={17} />
                      </span>

                      <input
                        type="search"
                        aria-label="Search projects"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search projects…"
                        className="w-full rounded-xl border border-white/[0.09] bg-[#080d18] py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-slate-600 transition focus:border-cyan-400/50"
                      />
                    </div>

                    <label className="flex items-center gap-2 rounded-xl border border-white/[0.09] bg-[#080d18] px-3">
                      <span className="shrink-0 text-xs text-slate-500">
                        Status
                      </span>

                      <select
                        aria-label="Filter projects by status"
                        value={filter}
                        onChange={(event) =>
                          setFilter(event.target.value as Filter)
                        }
                        className="min-w-0 bg-transparent py-2.5 text-sm text-slate-200"
                      >
                        <option value="ALL">All projects</option>
                        <option value="ACTIVE">Active</option>
                        <option value="ARCHIVED">Archived</option>
                      </select>
                    </label>
                  </div>
                </div>
              </div>

              {projectsError && !projectsData ? (
                <div className="px-6 py-12 text-center">
                  <p role="alert" className="text-sm text-rose-300">
                    Could not load projects.
                  </p>

                  <button
                    type="button"
                    onClick={() => void refetchProjects()}
                    className="mt-4 rounded-lg border border-white/10 px-4 py-2 text-sm text-white transition hover:bg-white/[0.05]"
                  >
                    Retry
                  </button>
                </div>
              ) : projectsLoading && !projectsData ? (
                <div className="divide-y divide-white/[0.05]">
                  {[1, 2, 3].map((item) => (
                    <div
                      key={item}
                      className="flex animate-pulse items-center gap-4 px-5 py-5"
                    >
                      <div className="size-10 rounded-xl bg-white/[0.05]" />

                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-40 rounded bg-white/[0.06]" />
                        <div className="h-3 w-64 max-w-full rounded bg-white/[0.04]" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredProjects.length === 0 ? (
                <div className="px-6 py-16 text-center sm:py-20">
                  <div className="mx-auto grid size-14 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.025] text-slate-500">
                    <Icon name="folder" size={23} />
                  </div>

                  <h3 className="mt-5 font-semibold text-white">
                    {search || filter !== 'ALL'
                      ? 'No matching projects'
                      : 'Your next project starts here'}
                  </h3>

                  <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-400">
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
                      className="mt-5 text-sm font-medium text-cyan-300 transition hover:text-cyan-200"
                    >
                      Clear filters
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={openCreateModal}
                      className="mt-5 inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                    >
                      <Icon name="plus" size={16} />
                      Create your first project
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="hidden grid-cols-[minmax(0,1fr)_120px_125px_88px] gap-4 border-b border-white/[0.06] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 md:grid">
                    <span>Project</span>
                    <span>Status</span>
                    <span>Created</span>
                    <span className="text-right">Actions</span>
                  </div>

                  <div className="divide-y divide-white/[0.055]">
                    {filteredProjects.map((project) => (
                      <article
                        key={project.id}
                        className="group grid gap-4 px-4 py-5 transition hover:bg-white/[0.018] sm:px-5 md:grid-cols-[minmax(0,1fr)_120px_125px_88px] md:items-center"
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-cyan-400/[0.12] bg-cyan-400/[0.045] text-cyan-300">
                            <Icon name="folder" size={19} />
                          </div>

                          <div className="min-w-0">
                            <h3 className="break-words text-sm font-medium text-slate-100">
                              {project.name}
                            </h3>

                            <p className="mt-1 line-clamp-2 break-words text-sm leading-5 text-slate-500">
                              {project.description || 'No description provided.'}
                            </p>

                            <p className="mt-2 text-xs text-slate-600 md:hidden">
                              Created {formatDate(project.createdAt)}
                            </p>
                          </div>
                        </div>

                        <div>
                          <span className="mb-1 block text-xs text-slate-500 md:hidden">
                            Status
                          </span>

                          <StatusBadge status={project.status} />
                        </div>

                        <div className="hidden text-sm text-slate-400 md:block">
                          {formatDate(project.createdAt)}
                        </div>

                        <div className="flex items-center justify-start gap-1 md:justify-end">
                          {project.status !== 'ARCHIVED' && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditModal(project)}
                                aria-label={`Edit ${project.name}`}
                                title="Edit project"
                                className="rounded-lg p-2 text-slate-500 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
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
                                className="rounded-lg p-2 text-slate-500 transition hover:bg-amber-400/[0.08] hover:text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
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
                <div className="border-t border-white/[0.06] px-5 py-3 text-xs text-slate-500">
                  Showing {filteredProjects.length} of {projects.length}{' '}
                  {projects.length === 1 ? 'project' : 'projects'}
                </div>
              )}
            </section>
          </>
        )}

        <footer className="mt-8 flex flex-col gap-2 border-t border-white/[0.06] pt-5 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <p>Work-Bench · Workspace management</p>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 transition hover:text-slate-300"
          >
            Back to dashboard <Icon name="arrow" size={14} />
          </Link>
        </footer>
      </div>

      {modalOpen && selectedOrganizationId && (
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

      {confirmArchive && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-4 backdrop-blur-sm">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="archive-title"
            aria-describedby="archive-description"
            className="w-full max-w-md rounded-2xl border border-white/10 bg-[#101827] p-6 shadow-2xl shadow-black/40"
          >
            <div className="grid size-11 place-items-center rounded-xl border border-amber-400/20 bg-amber-400/[0.07] text-amber-300">
              <Icon name="archive" size={20} />
            </div>

            <h2
              id="archive-title"
              className="mt-5 text-lg font-semibold text-white"
            >
              Archive this project?
            </h2>

            <p
              id="archive-description"
              className="mt-2 text-sm leading-6 text-slate-400"
            >
              <span className="font-medium text-slate-200">
                {confirmArchive.name}
              </span>{' '}
              will be moved to archived projects. You can still find it using
              the Archived filter.
            </p>

            {mutationError && (
              <p
                role="alert"
                className="mt-4 rounded-lg border border-rose-400/20 bg-rose-400/[0.06] p-3 text-sm text-rose-300"
              >
                {mutationError}
              </p>
            )}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={archiving}
                onClick={() => {
                  setConfirmArchive(null)
                  setMutationError('')
                }}
                className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/[0.04]"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={archiving}
                onClick={() => void handleArchive()}
                className="rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 disabled:opacity-50"
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
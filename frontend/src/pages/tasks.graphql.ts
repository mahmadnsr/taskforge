import { gql } from '@apollo/client'

export const MY_ORGANIZATIONS = gql`
  query MyOrganizations {
    myOrganizations { id name slug }
  }
`

export const ORGANIZATION_MEMBERS = gql`
  query OrganizationMembers($organizationId: ID!) {
    organizationMembers(organizationId: $organizationId) {
      id role user { id name email }
    }
  }
`

export const ORGANIZATION_PROJECTS = gql`
  query OrganizationProjects($organizationId: ID!, $includeArchived: Boolean!) {
    projects(organizationId: $organizationId, includeArchived: $includeArchived) {
      id organizationId name status
    }
  }
`

export const SEARCH_PROJECT_TASKS = gql`
  query SearchProjectTasks($organizationId: ID!, $projectId: ID!, $filters: TaskQueryInput) {
    searchProjectTasks(organizationId: $organizationId, projectId: $projectId, filters: $filters) {
      tasks {
        id organizationId projectId parentId title description status priority
        createdById assigneeId dueDate createdAt updatedAt
      }
      totalCount hasNextPage limit offset
    }
  }
`

export const TASK_PROJECT_MEMBERS = gql`
  query TaskProjectMembers($organizationId: ID!, $projectId: ID!) {
    projectMembers(organizationId: $organizationId, projectId: $projectId) {
      userId
    }
  }
`

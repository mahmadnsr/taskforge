import { gql } from '@apollo/client'

export const SUBTASKS = gql`
  query Subtasks($organizationId: ID!, $parentId: ID!) {
    subtasks(organizationId: $organizationId, parentId: $parentId) {
      id parentId organizationId projectId title description status priority
      createdById assigneeId dueDate createdAt updatedAt
    }
  }
`

export const TASK_DETAILS_PROJECT_MEMBERS = gql`
  query TaskDetailsProjectMembers($organizationId: ID!, $projectId: ID!) {
    projectMembers(organizationId: $organizationId, projectId: $projectId) {
      user { id name }
    }
  }
`

export const CREATE_SUBTASK = gql`
  mutation CreateSubtask($input: CreateSubtaskInput!) {
    createSubtask(input: $input) { id parentId title status assigneeId }
  }
`
export const UPDATE_SUBTASK = gql`
  mutation UpdateSubtask($input: UpdateTaskInput!) {
    updateSubtask(input: $input) { id title description priority dueDate updatedAt }
  }
`
export const ASSIGN_SUBTASK = gql`
  mutation AssignSubtask($input: AssignTaskInput!) {
    assignSubtask(input: $input) { id assigneeId updatedAt }
  }
`
export const CHANGE_SUBTASK_STATUS = gql`
  mutation ChangeSubtaskStatus($input: ChangeTaskStatusInput!) {
    changeSubtaskStatus(input: $input) { id status updatedAt }
  }
`
export const DELETE_SUBTASK = gql`
  mutation DeleteSubtask($organizationId: ID!, $subtaskId: ID!) {
    deleteSubtask(organizationId: $organizationId, subtaskId: $subtaskId)
  }
`

export const TASK_CHECKLIST = gql`
  query TaskChecklist($input: ChecklistTaskInput!) {
    taskChecklist(input: $input) {
      items { id organizationId taskId content completed position createdAt updatedAt }
      completedCount totalCount
    }
  }
`
export const ADD_CHECKLIST_ITEM = gql`
  mutation AddChecklistItem($input: AddChecklistItemInput!) {
    addChecklistItem(input: $input) { id content completed position }
  }
`
export const UPDATE_CHECKLIST_ITEM = gql`
  mutation UpdateChecklistItem($input: UpdateChecklistItemInput!) {
    updateChecklistItem(input: $input) { id content updatedAt }
  }
`
export const SET_CHECKLIST_ITEM_COMPLETED = gql`
  mutation SetChecklistItemCompleted($input: SetChecklistItemCompletedInput!) {
    setChecklistItemCompleted(input: $input) { id completed updatedAt }
  }
`
export const DELETE_CHECKLIST_ITEM = gql`
  mutation DeleteChecklistItem($input: ChecklistItemInput!) {
    deleteChecklistItem(input: $input)
  }
`
export const REORDER_CHECKLIST_ITEMS = gql`
  mutation ReorderChecklistItems($input: ReorderChecklistItemsInput!) {
    reorderChecklistItems(input: $input) { id position }
  }
`

export const TASK_ACTIVITY = gql`
  query TaskActivity($input: TaskActivityInput!) {
    taskActivity(input: $input) {
      items { id taskId organizationId actorId actorName type details createdAt }
      nextCursor hasMore
    }
  }
`

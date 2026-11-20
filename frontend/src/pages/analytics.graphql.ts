import { gql } from '@apollo/client'

export const TASK_PROGRESS = gql`
  query TaskProgress($input: TaskProgressInput!) {
    taskProgress(input: $input) {
      taskId percent checklistPercent checklistCompleted checklistTotal
      subtaskPercent subtasksCompleted subtasksTotal
    }
  }
`

export const EMPLOYEE_ANALYTICS = gql`
  query EmployeeAnalytics($input: EmployeeAnalyticsInput!) {
    employeeAnalytics(input: $input) {
      employeeId assigned completed pending inProgress overdue completionRate
      onTimeCompleted lateCompleted timingUnknown
      workloadByProject { projectId projectName assigned completed overdue }
    }
  }
`

export const PROJECT_ANALYTICS = gql`
  query ProjectAnalytics($input: ProjectAnalyticsInput!) {
    projectAnalytics(input: $input) {
      progress { projectId taskCount percent }
      statusDistribution { status count }
      overdueTasks health
      memberWorkload { userId name assigned completed overdue }
      recentActivity { taskId type actorName createdAt }
    }
  }
`

import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { TaskStatus } from '@prisma/client';

@ObjectType()
export class TaskProgress {
  @Field(() => ID) taskId!: string;
  @Field(() => Int) checklistCompleted!: number;
  @Field(() => Int) checklistTotal!: number;
  @Field(() => Int) checklistPercent!: number;
  @Field(() => Int) subtasksCompleted!: number;
  @Field(() => Int) subtasksTotal!: number;
  @Field(() => Int) subtaskPercent!: number;
  @Field(() => Int, { description: 'DONE tasks are 100%. Otherwise, the mean of nonempty checklist and subtask percentages; empty tasks are 0%.' }) percent!: number;
}

@ObjectType()
export class ProjectProgress {
  @Field(() => ID) projectId!: string;
  @Field(() => Int) taskCount!: number;
  @Field(() => Int, { description: 'Average progress of nondeleted root tasks; empty projects are 0%.' }) percent!: number;
}

@ObjectType()
export class StatusCount {
  @Field(() => TaskStatus) status!: TaskStatus;
  @Field(() => Int) count!: number;
}

@ObjectType()
export class WorkloadItem {
  @Field(() => ID) userId!: string;
  @Field(() => String, { nullable: true }) name!: string | null;
  @Field(() => Int) assigned!: number;
  @Field(() => Int) completed!: number;
  @Field(() => Int) overdue!: number;
}

@ObjectType()
export class ProjectWorkloadItem {
  @Field(() => ID) projectId!: string;
  @Field() projectName!: string;
  @Field(() => Int) assigned!: number;
  @Field(() => Int) completed!: number;
  @Field(() => Int) overdue!: number;
}

@ObjectType()
export class RecentProjectActivity {
  @Field(() => ID) taskId!: string;
  @Field() type!: string;
  @Field(() => String, { nullable: true }) actorName!: string | null;
  @Field(() => Date) createdAt!: Date;
}

@ObjectType()
export class EmployeeAnalytics {
  @Field(() => ID) employeeId!: string;
  @Field(() => Int) assigned!: number;
  @Field(() => Int) completed!: number;
  @Field(() => Int) pending!: number;
  @Field(() => Int) inProgress!: number;
  @Field(() => Int) overdue!: number;
  @Field(() => Int) completionRate!: number;
  @Field(() => Int) onTimeCompleted!: number;
  @Field(() => Int) lateCompleted!: number;
  @Field(() => Int) timingUnknown!: number;
  @Field(() => [ProjectWorkloadItem]) workloadByProject!: ProjectWorkloadItem[];
}

@ObjectType()
export class ProjectAnalytics {
  @Field(() => ProjectProgress) progress!: ProjectProgress;
  @Field(() => [StatusCount]) statusDistribution!: StatusCount[];
  @Field(() => Int) overdueTasks!: number;
  @Field(() => [WorkloadItem]) memberWorkload!: WorkloadItem[];
  @Field(() => [RecentProjectActivity]) recentActivity!: RecentProjectActivity[];
  @Field({ description: 'EMPTY if no root tasks; AT_RISK if any work item is overdue; COMPLETE if every work item is DONE; otherwise ON_TRACK.' }) health!: string;
}

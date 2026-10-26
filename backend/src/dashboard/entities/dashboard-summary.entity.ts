import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class DashboardSummary {
  @Field(() => Int)
  totalProjects!: number;

  @Field(() => Int)
  totalTasks!: number;

  @Field(() => Int)
  pendingTasks!: number;

  @Field(() => Int)
  inProgressTasks!: number;

  @Field(() => Int)
  completedTasks!: number;

  @Field(() => Int)
  overdueTasks!: number;
}

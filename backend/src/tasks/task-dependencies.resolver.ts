import { UseGuards } from '@nestjs/common';
import { Args, Field, ID, Mutation, ObjectType, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { TaskDependenciesService } from './task-dependencies.service.js';

@ObjectType()
class TaskDependencyView {
  @Field(() => ID) taskId!: string;
  @Field(() => ID) blockingTaskId!: string;
  @Field() blockingTitle!: string;
  @Field() blockingStatus!: string;
}

@Resolver()
@UseGuards(JwtAuthGuard)
export class TaskDependenciesResolver {
  constructor(private readonly service: TaskDependenciesService) {}

  @Query(() => [TaskDependencyView])
  async taskDependencies(@CurrentUser() user: { id: string },
    @Args('organizationId', { type: () => ID }) organizationId: string,
    @Args('taskId', { type: () => ID }) taskId: string) {
    const rows = await this.service.list(user.id, organizationId, taskId);
    return rows.map((row) => ({ taskId: row.taskId, blockingTaskId: row.blockingTaskId,
      blockingTitle: row.blockingTask.title, blockingStatus: row.blockingTask.status }));
  }

  @Mutation(() => TaskDependencyView)
  async addTaskDependency(@CurrentUser() user: { id: string },
    @Args('organizationId', { type: () => ID }) organizationId: string,
    @Args('taskId', { type: () => ID }) taskId: string,
    @Args('blockingTaskId', { type: () => ID }) blockingTaskId: string) {
    await this.service.add(user.id, organizationId, taskId, blockingTaskId);
    const rows = await this.service.list(user.id, organizationId, taskId);
    const row = rows.find((item) => item.blockingTaskId === blockingTaskId)!;
    return { taskId, blockingTaskId, blockingTitle: row.blockingTask.title, blockingStatus: row.blockingTask.status };
  }

  @Mutation(() => Boolean)
  removeTaskDependency(@CurrentUser() user: { id: string },
    @Args('organizationId', { type: () => ID }) organizationId: string,
    @Args('taskId', { type: () => ID }) taskId: string,
    @Args('blockingTaskId', { type: () => ID }) blockingTaskId: string) {
    return this.service.remove(user.id, organizationId, taskId, blockingTaskId);
  }
}

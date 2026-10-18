import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CreateTaskInput } from './dto/create-task.input.js';
import { UpdateTaskInput } from './dto/update-task.input.js';
import { ChangeTaskStatusInput } from './dto/change-task-status.input.js';
import { Task } from './entities/task.entity.js';
import { TasksService } from './tasks.service.js';

@Resolver(() => Task)
@UseGuards(JwtAuthGuard)
export class TasksResolver {
  constructor(private readonly service: TasksService) {}

  @Mutation(() => Task)
  createTask(
    @CurrentUser() user: { id: string },
    @Args('input') input: CreateTaskInput,
  ) {
    return this.service.create(user.id, input);
  }

  @Mutation(() => Task)
  updateTask(
    @CurrentUser() user: { id: string },
    @Args('input') input: UpdateTaskInput,
  ) {
    return this.service.update(user.id, input);
  }

  @Mutation(() => Task)
  changeTaskStatus(
    @CurrentUser() user: { id: string },
    @Args('input') input: ChangeTaskStatusInput,
  ) {
    return this.service.changeStatus(user.id, input);
  }

  @Query(() => Task)
  task(
    @CurrentUser() user: { id: string },
    @Args('organizationId', { type: () => ID }) organizationId: string,
    @Args('taskId', { type: () => ID }) taskId: string,
  ) {
    return this.service.get(user.id, organizationId, taskId);
  }

  @Query(() => [Task])
  projectTasks(
    @CurrentUser() user: { id: string },
    @Args('organizationId', { type: () => ID }) organizationId: string,
    @Args('projectId', { type: () => ID }) projectId: string,
  ) {
    return this.service.listByProject(user.id, organizationId, projectId);
  }
}

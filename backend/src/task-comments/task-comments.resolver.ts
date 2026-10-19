import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CreateTaskCommentInput } from './dto/create-task-comment.input.js';
import { TaskComment } from './entities/task-comment.entity.js';
import { TaskCommentsService } from './task-comments.service.js';

@Resolver(() => TaskComment)
@UseGuards(JwtAuthGuard)
export class TaskCommentsResolver {
  constructor(private readonly service: TaskCommentsService) {}

  @Mutation(() => TaskComment)
  createTaskComment(
    @CurrentUser() user: { id: string },
    @Args('input') input: CreateTaskCommentInput,
  ) {
    return this.service.create(user.id, input);
  }

  @Query(() => [TaskComment])
  taskComments(
    @CurrentUser() user: { id: string },
    @Args('organizationId', { type: () => ID }) organizationId: string,
    @Args('taskId', { type: () => ID }) taskId: string,
  ) {
    return this.service.findByTask(user.id, organizationId, taskId);
  }
}

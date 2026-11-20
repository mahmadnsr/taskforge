import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CreateTaskInput } from './dto/create-task.input.js';
import { CreateSubtaskInput } from './dto/create-subtask.input.js';
import { UpdateTaskInput } from './dto/update-task.input.js';
import { ChangeTaskStatusInput } from './dto/change-task-status.input.js';
import { Task } from './entities/task.entity.js';
import { PaginatedTasks } from './entities/paginated-tasks.entity.js';
import { TasksService } from './tasks.service.js';
import { AssignTaskInput } from './dto/assign-task.input.js';
import { TaskQueryInput } from './dto/task-query.input.js';
import { AddChecklistItemInput, ChecklistItemInput, ChecklistTaskInput, ReorderChecklistItemsInput, SetChecklistItemCompletedInput, UpdateChecklistItemInput } from './dto/checklist.input.js';
import { TaskChecklist, TaskChecklistItem } from './entities/task-checklist.entity.js';
import { TaskActivityInput } from './dto/task-activity.input.js';
import { TaskActivityPage } from './entities/task-activity.entity.js';

@Resolver(() => Task)
@UseGuards(JwtAuthGuard)
export class TasksResolver {
  constructor(private readonly service: TasksService) {}

  @Query(() => TaskActivityPage)
  taskActivity(@CurrentUser() user: { id: string }, @Args('input') input: TaskActivityInput) {
    return this.service.activityHistory(user.id, input);
  }

  @Query(() => TaskChecklist)
  taskChecklist(@CurrentUser() user: { id: string }, @Args('input') input: ChecklistTaskInput) {
    return this.service.checklist(user.id, input);
  }

  @Mutation(() => TaskChecklistItem)
  addChecklistItem(@CurrentUser() user: { id: string }, @Args('input') input: AddChecklistItemInput) {
    return this.service.addChecklistItem(user.id, input);
  }

  @Mutation(() => TaskChecklistItem)
  updateChecklistItem(@CurrentUser() user: { id: string }, @Args('input') input: UpdateChecklistItemInput) {
    return this.service.updateChecklistItem(user.id, input);
  }

  @Mutation(() => TaskChecklistItem)
  setChecklistItemCompleted(@CurrentUser() user: { id: string }, @Args('input') input: SetChecklistItemCompletedInput) {
    return this.service.setChecklistItemCompleted(user.id, input);
  }

  @Mutation(() => Boolean)
  deleteChecklistItem(@CurrentUser() user: { id: string }, @Args('input') input: ChecklistItemInput) {
    return this.service.deleteChecklistItem(user.id, input);
  }

  @Mutation(() => [TaskChecklistItem])
  reorderChecklistItems(@CurrentUser() user: { id: string }, @Args('input') input: ReorderChecklistItemsInput) {
    return this.service.reorderChecklistItems(user.id, input);
  }

  @Mutation(() => Task)
  createTask(
    @CurrentUser() user: { id: string },
    @Args('input') input: CreateTaskInput,
  ) {
    return this.service.create(user.id, input);
  }

  @Mutation(() => Task)
  createSubtask(@CurrentUser() user: { id: string }, @Args('input') input: CreateSubtaskInput) {
    return this.service.createSubtask(user.id, input);
  }

  @Query(() => [Task])
  subtasks(
    @CurrentUser() user: { id: string },
    @Args('organizationId', { type: () => ID }) organizationId: string,
    @Args('parentId', { type: () => ID }) parentId: string,
  ) {
    return this.service.listSubtasks(user.id, organizationId, parentId);
  }

  @Mutation(() => Task)
  updateSubtask(@CurrentUser() user: { id: string }, @Args('input') input: UpdateTaskInput) {
    return this.service.updateSubtask(user.id, input);
  }

  @Mutation(() => Task)
  assignSubtask(@CurrentUser() user: { id: string }, @Args('input') input: AssignTaskInput) {
    return this.service.assignSubtask(user.id, input);
  }

  @Mutation(() => Task)
  changeSubtaskStatus(@CurrentUser() user: { id: string }, @Args('input') input: ChangeTaskStatusInput) {
    return this.service.changeSubtaskStatus(user.id, input);
  }

  @Mutation(() => Boolean)
  deleteSubtask(
    @CurrentUser() user: { id: string },
    @Args('organizationId', { type: () => ID }) organizationId: string,
    @Args('subtaskId', { type: () => ID }) subtaskId: string,
  ) {
    return this.service.deleteSubtask(user.id, organizationId, subtaskId);
  }

  @Mutation(() => Task)
  updateTask(
    @CurrentUser() user: { id: string },
    @Args('input') input: UpdateTaskInput,
  ) {
    return this.service.update(user.id, input);
  }

  @Mutation(() => Task)
  assignTask(
    @CurrentUser() user: { id: string },
    @Args('input') input: AssignTaskInput,
  ) {
    return this.service.assign(user.id, input);
  }

  @Mutation(() => Task)
  changeTaskStatus(
    @CurrentUser() user: { id: string },
    @Args('input') input: ChangeTaskStatusInput,
  ) {
    return this.service.changeStatus(user.id, input);
  }

  @Mutation(() => Boolean)
deleteTask(
  @CurrentUser() user: { id: string },
  @Args('organizationId', { type: () => ID }) organizationId: string,
  @Args('taskId', { type: () => ID }) taskId: string,
) {
  return this.service.deleteTask(user.id, organizationId, taskId);
}

  @Query(() => Task)
  task(
    @CurrentUser() user: { id: string },
    @Args('organizationId', { type: () => ID }) organizationId: string,
    @Args('taskId', { type: () => ID }) taskId: string,
  ) {
    return this.service.get(user.id, organizationId, taskId);
  }

  @Query(() => PaginatedTasks)
  searchProjectTasks(
    @CurrentUser() user: { id: string },
    @Args('organizationId', { type: () => ID }) organizationId: string,
    @Args('projectId', { type: () => ID }) projectId: string,
    @Args('filters', { type: () => TaskQueryInput, nullable: true })
    filters?: TaskQueryInput,
  ) {
    return this.service.searchProjectTasks(
      user.id,
      organizationId,
      projectId,
      filters ?? {},
    );
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

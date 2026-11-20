import { UseGuards } from '@nestjs/common';
import { Args, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AnalyticsService } from './analytics.service.js';
import { EmployeeAnalytics, ProjectAnalytics, ProjectProgress, TaskProgress } from './entities/analytics.entity.js';
import { EmployeeAnalyticsInput, ProjectAnalyticsInput, TaskProgressInput } from './dto/analytics.input.js';

@Resolver()
@UseGuards(JwtAuthGuard)
export class AnalyticsResolver {
  constructor(private readonly service: AnalyticsService) {}

  @Query(() => TaskProgress)
  taskProgress(@CurrentUser() user: { id: string }, @Args('input') input: TaskProgressInput) {
    return this.service.taskProgress(user.id, input.organizationId, input.taskId);
  }

  @Query(() => ProjectProgress)
  projectProgress(@CurrentUser() user: { id: string }, @Args('input') input: ProjectAnalyticsInput) {
    return this.service.projectProgress(user.id, input.organizationId, input.projectId);
  }

  @Query(() => EmployeeAnalytics)
  employeeAnalytics(@CurrentUser() user: { id: string }, @Args('input') input: EmployeeAnalyticsInput) {
    return this.service.employeeAnalytics(user.id, input.organizationId, input.employeeId, input.projectId);
  }

  @Query(() => ProjectAnalytics)
  projectAnalytics(@CurrentUser() user: { id: string }, @Args('input') input: ProjectAnalyticsInput) {
    return this.service.projectAnalytics(user.id, input.organizationId, input.projectId);
  }
}

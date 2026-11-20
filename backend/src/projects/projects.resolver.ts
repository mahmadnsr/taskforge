import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Project } from './entities/project.entity.js';
import { ProjectMember } from './entities/project-member.entity.js';
import { CreateProjectInput } from './dto/create-project.input.js';
import { UpdateProjectInput } from './dto/update-project.input.js';
import { ProjectsService } from './projects.service.js';

@Resolver(() => Project)
@UseGuards(JwtAuthGuard)
export class ProjectsResolver {
  constructor(private readonly service: ProjectsService) {}

  @Mutation(() => Project)
  createProject(
    @CurrentUser() user: { id: string },
    @Args('input') input: CreateProjectInput,
  ) {
    return this.service.create(user.id, input);
  }

  @Query(() => [Project])
  projects(
    @CurrentUser() user: { id: string },
    @Args('organizationId', { type: () => ID }) organizationId: string,
    @Args('includeArchived', { type: () => Boolean, defaultValue: false })
    includeArchived: boolean,
  ) {
    return this.service.list(user.id, organizationId, includeArchived);
  }

  @Query(() => Project)
  project(
    @CurrentUser() user: { id: string },
    @Args('organizationId', { type: () => ID }) organizationId: string,
    @Args('projectId', { type: () => ID }) projectId: string,
  ) {
    return this.service.get(user.id, organizationId, projectId);
  }

  @Mutation(() => Project)
  updateProject(
    @CurrentUser() user: { id: string },
    @Args('input') input: UpdateProjectInput,
  ) {
    return this.service.update(user.id, input);
  }

  @Mutation(() => Project)
  archiveProject(
    @CurrentUser() user: { id: string },
    @Args('organizationId', { type: () => ID }) organizationId: string,
    @Args('projectId', { type: () => ID }) projectId: string,
  ) {
    return this.service.archive(user.id, organizationId, projectId);
  }

  @Query(() => [ProjectMember])
  projectMembers(
    @CurrentUser() user: { id: string },
    @Args('organizationId', { type: () => ID }) organizationId: string,
    @Args('projectId', { type: () => ID }) projectId: string,
  ) {
    return this.service.listMembers(user.id, organizationId, projectId);
  }

  @Mutation(() => ProjectMember)
  addProjectMember(
    @CurrentUser() user: { id: string },
    @Args('organizationId', { type: () => ID }) organizationId: string,
    @Args('projectId', { type: () => ID }) projectId: string,
    @Args('userId', { type: () => ID }) userId: string,
  ) {
    return this.service.addMember(user.id, organizationId, projectId, userId);
  }

  @Mutation(() => Boolean)
  removeProjectMember(
    @CurrentUser() user: { id: string },
    @Args('organizationId', { type: () => ID }) organizationId: string,
    @Args('projectId', { type: () => ID }) projectId: string,
    @Args('userId', { type: () => ID }) userId: string,
  ) {
    return this.service.removeMember(user.id, organizationId, projectId, userId);
  }
}

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProjectStatus, Role } from '@prisma/client';
import { CacheService } from '../cache/cache.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateProjectInput } from './dto/create-project.input.js';
import { UpdateProjectInput } from './dto/update-project.input.js';

@Injectable()
export class ProjectsService {
  private readonly cacheTtlSeconds = 30;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  private async getRole(userId: string, organizationId: string): Promise<Role> {
    const member = await this.prisma.organizationMember.findFirst({
      where: { userId, organizationId },
      select: { role: true },
    });

    if (!member) {
      throw new ForbiddenException('You are not a member of this organization');
    }

    return member.role;
  }

  private async assertAdmin(userId: string, organizationId: string) {
    const role = await this.getRole(userId, organizationId);

    if (role !== Role.ADMIN) {
      throw new ForbiddenException('Only organization admins can manage projects');
    }
  }

  private async assertProjectAccess(
    userId: string,
    organizationId: string,
    projectId: string,
    role: Role,
  ): Promise<void> {
    if (role === Role.ADMIN) {
      return;
    }

    const membership = await this.prisma.projectMember.findFirst({
      where: {
        projectId,
        userId,
        organizationId,
      },
      select: { id: true },
    });

    if (!membership) {
      throw new ForbiddenException('You must be a project member to access this project');
    }
  }

  private async findScoped(organizationId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  private cleanName(name: string): string {
    const trimmed = name.trim();

    if (!trimmed) {
      throw new BadRequestException('Name cannot be empty');
    }

    return trimmed;
  }

  private async invalidateOrganizationProjects(
    organizationId: string,
  ): Promise<void> {
    await this.cache.incrementOrganizationVersion(organizationId);
  }

  async create(userId: string, input: CreateProjectInput) {
    await this.assertAdmin(userId, input.organizationId);

    const project = await this.prisma.project.create({
      data: {
        organizationId: input.organizationId,
        name: this.cleanName(input.name),
        description: input.description?.trim() || null,
        createdById: userId,
      },
    });

    await this.invalidateOrganizationProjects(input.organizationId);

    return project;
  }

  async list(userId: string, organizationId: string, includeArchived = false) {
    const role = await this.getRole(userId, organizationId);

    const statusFilter = includeArchived
      ? {}
      : { status: ProjectStatus.ACTIVE };

    // Restricted roles are always filtered by project membership in the DB.
    // Do not reuse the organization-wide Redis list for these callers.
    if (role !== Role.ADMIN) {
      return this.prisma.project.findMany({
        where: {
          organizationId,
          ...statusFilter,
          members: {
            some: {
              userId,
              organizationId,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    const version =
      await this.cache.getOrganizationVersion(organizationId);

    // Redis unavailable: safely fall back to the database.
    if (version === null) {
      return this.prisma.project.findMany({
        where: { organizationId, ...statusFilter },
        orderBy: { createdAt: 'desc' },
      });
    }

    const cacheKey =
      `taskforge:projects:v1:org:${organizationId}` +
      `:version:${version}:archived:${includeArchived}`;

    type ProjectList = Awaited<
      ReturnType<PrismaService['project']['findMany']>
    >;

    const cached = await this.cache.getJson<ProjectList>(cacheKey);

    if (cached !== null) {
      return cached;
    }

    const projects = await this.prisma.project.findMany({
      where: { organizationId, ...statusFilter },
      orderBy: { createdAt: 'desc' },
    });

    await this.cache.setJson(
      cacheKey,
      projects,
      this.cacheTtlSeconds,
    );

    return projects;
  }

  async get(userId: string, organizationId: string, projectId: string) {
    const role = await this.getRole(userId, organizationId);
    const project = await this.findScoped(organizationId, projectId);
    await this.assertProjectAccess(userId, organizationId, projectId, role);
    return project;
  }

  async update(userId: string, input: UpdateProjectInput) {
    const { organizationId, projectId } = input;
    const role = await this.getRole(userId, organizationId);

    if (role === Role.EMPLOYEE) {
      throw new ForbiddenException('Insufficient role');
    }

    const data: Prisma.ProjectUpdateInput = {};

    if (input.name !== undefined) {
      data.name = this.cleanName(input.name);
    }

    if (input.description !== undefined) {
      data.description = input.description.trim() || null;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Nothing to update');
    }

    const project = await this.findScoped(organizationId, projectId);
    await this.assertProjectAccess(userId, organizationId, projectId, role);

    if (project.status === ProjectStatus.ARCHIVED) {
      throw new BadRequestException('Archived projects cannot be updated');
    }

    const updatedProject = await this.prisma.project.update({
      where: { id_organizationId: { id: projectId, organizationId } },
      data,
    });

    await this.invalidateOrganizationProjects(organizationId);

    return updatedProject;
  }

  async archive(userId: string, organizationId: string, projectId: string) {
    const role = await this.getRole(userId, organizationId);

    if (role === Role.EMPLOYEE) {
      throw new ForbiddenException('Insufficient role');
    }

    const project = await this.findScoped(organizationId, projectId);
    await this.assertProjectAccess(userId, organizationId, projectId, role);

    if (project.status === ProjectStatus.ARCHIVED) {
      return project;
    }

    const archivedProject = await this.prisma.project.update({
      where: { id_organizationId: { id: projectId, organizationId } },
      data: { status: ProjectStatus.ARCHIVED },
    });

    await this.invalidateOrganizationProjects(organizationId);

    return archivedProject;
  }

  async listMembers(
    userId: string,
    organizationId: string,
    projectId: string,
  ) {
    const role = await this.getRole(userId, organizationId);
    await this.findScoped(organizationId, projectId);
    await this.assertProjectAccess(userId, organizationId, projectId, role);

    const members = await this.prisma.projectMember.findMany({
      where: { projectId, organizationId },
      include: {
        orgMember: {
          include: {
            user: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return members.map((m) => ({
      ...m,
      user: m.orgMember.user,
    }));
  }

  async addMember(
    callerId: string,
    organizationId: string,
    projectId: string,
    targetUserId: string,
  ) {
    const role = await this.getRole(callerId, organizationId);
    if (role === Role.EMPLOYEE) throw new ForbiddenException('Insufficient role');

    const project = await this.findScoped(organizationId, projectId);
    await this.assertProjectAccess(callerId, organizationId, projectId, role);
    if (project.status === ProjectStatus.ARCHIVED) {
      throw new BadRequestException('Archived projects cannot be updated');
    }

    const orgMember = await this.prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: targetUserId,
          organizationId,
        },
      },
      include: { user: true },
    });

    if (!orgMember) {
      throw new NotFoundException('Member not found');
    }
    if (role === Role.MANAGER && orgMember.role !== Role.EMPLOYEE) {
      throw new ForbiddenException('Managers can add or remove only employees from project teams');
    }

    const existing = await this.prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId: targetUserId,
        },
      },
    });

    if (existing) {
      throw new ConflictException('This user is already a member');
    }

    const created = await this.prisma.projectMember.create({
      data: {
        projectId,
        userId: targetUserId,
        organizationId,
      },
      include: {
        orgMember: {
          include: {
            user: true,
          },
        },
      },
    });

    return {
      ...created,
      user: created.orgMember.user,
    };
  }

  async removeMember(
    callerId: string,
    organizationId: string,
    projectId: string,
    targetUserId: string,
  ): Promise<boolean> {
    const role = await this.getRole(callerId, organizationId);
    if (role === Role.EMPLOYEE) throw new ForbiddenException('Insufficient role');

    const project = await this.findScoped(organizationId, projectId);
    await this.assertProjectAccess(callerId, organizationId, projectId, role);
    if (project.status === ProjectStatus.ARCHIVED) {
      throw new BadRequestException('Archived projects cannot be updated');
    }

    const existing = await this.prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId: targetUserId,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Member not found');
    }
    if (role === Role.MANAGER) {
      const target = await this.prisma.organizationMember.findUnique({
        where: { userId_organizationId: { userId: targetUserId, organizationId } },
        select: { role: true },
      });
      if (target?.role !== Role.EMPLOYEE) {
        throw new ForbiddenException('Managers can add or remove only employees from project teams');
      }
    }

    const assignedTasks = await this.prisma.task.count({
      where: { projectId, organizationId, assigneeId: targetUserId },
    });
    if (assignedTasks > 0) {
      throw new ConflictException('Reassign tasks before removing this project member');
    }

    await this.prisma.projectMember.delete({
      where: { projectId_userId: { projectId, userId: targetUserId } },
    });

    return true;
  }
}

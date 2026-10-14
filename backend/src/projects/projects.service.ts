import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProjectStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateProjectInput } from './dto/create-project.input.js';
import { UpdateProjectInput } from './dto/update-project.input.js';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

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

  private async assertCanManage(userId: string, organizationId: string) {
    const role = await this.getRole(userId, organizationId);
    if (role === Role.EMPLOYEE) {
      throw new ForbiddenException('Insufficient role');
    }
  }

  private async findScoped(organizationId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  private cleanName(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('Name cannot be empty');
    return trimmed;
  }

  async create(userId: string, input: CreateProjectInput) {
    await this.assertCanManage(userId, input.organizationId);
    return this.prisma.project.create({
      data: {
        organizationId: input.organizationId,
        name: this.cleanName(input.name),
        description: input.description?.trim() || null,
        createdById: userId,
      },
    });
  }

  async list(userId: string, organizationId: string, includeArchived = false) {
    await this.getRole(userId, organizationId);
    return this.prisma.project.findMany({
      where: {
        organizationId,
        ...(includeArchived ? {} : { status: ProjectStatus.ACTIVE }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(userId: string, organizationId: string, projectId: string) {
    await this.getRole(userId, organizationId);
    return this.findScoped(organizationId, projectId);
  }

  async update(userId: string, input: UpdateProjectInput) {
    const { organizationId, projectId } = input;
    await this.assertCanManage(userId, organizationId);

    const data: Prisma.ProjectUpdateInput = {};
    if (input.name !== undefined) data.name = this.cleanName(input.name);
    if (input.description !== undefined) {
      data.description = input.description.trim() || null;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Nothing to update');
    }

    const project = await this.findScoped(organizationId, projectId);
    if (project.status === ProjectStatus.ARCHIVED) {
      throw new BadRequestException('Archived projects cannot be updated');
    }

    return this.prisma.project.update({
      where: { id_organizationId: { id: projectId, organizationId } },
      data,
    });
  }

  async archive(userId: string, organizationId: string, projectId: string) {
    await this.assertCanManage(userId, organizationId);
    const project = await this.findScoped(organizationId, projectId);
    if (project.status === ProjectStatus.ARCHIVED) return project;

    return this.prisma.project.update({
      where: { id_organizationId: { id: projectId, organizationId } },
      data: { status: ProjectStatus.ARCHIVED },
    });
  }
}

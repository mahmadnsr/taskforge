import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ProjectsResolver } from './projects.resolver.js';
import { ProjectsService } from './projects.service.js';

@Module({
  imports: [PrismaModule],
  providers: [ProjectsService, ProjectsResolver],
})
export class ProjectsModule {}

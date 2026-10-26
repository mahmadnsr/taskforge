import { Module } from '@nestjs/common';
import { CacheModule } from '../cache/cache.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ProjectsResolver } from './projects.resolver.js';
import { ProjectsService } from './projects.service.js';

@Module({
  imports: [PrismaModule, CacheModule],
  providers: [ProjectsService, ProjectsResolver],
})
export class ProjectsModule {}

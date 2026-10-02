import { Query, Resolver, Int } from '@nestjs/graphql';
import { PrismaService } from '../prisma/prisma.service.js';

@Resolver()
export class AppResolver {
  constructor(private prisma: PrismaService) {}

  @Query(() => String)
  hello(): string {
    return 'Hello World';
  }

  @Query(() => Int)
  async testCount() {
    return this.prisma.test.count();
  }
}
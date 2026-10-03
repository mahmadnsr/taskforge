import { Query, Resolver} from '@nestjs/graphql';
import { PrismaService } from '../prisma/prisma.service.js';

@Resolver()
export class AppResolver {
  constructor(private prisma: PrismaService) {}

  @Query(() => String)
  hello(): string {
    return 'Hello World';
  }
}
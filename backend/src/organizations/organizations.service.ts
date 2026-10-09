import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { generateSlug } from '../common/utils/slug.util.js';

@Injectable()
export class OrganizationsService {
  createWithAdmin(
    tx: Prisma.TransactionClient,
    name: string,
    adminUserId: string,
  ) {
    return tx.organization.create({
      data: {
        name,
        slug: generateSlug(name),
        members: {
          create: { userId: adminUserId, role: Role.ADMIN },
        },
      },
    });
  }
}
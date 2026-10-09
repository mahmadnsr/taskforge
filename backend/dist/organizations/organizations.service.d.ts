import { Prisma } from '@prisma/client';
export declare class OrganizationsService {
    createWithAdmin(tx: Prisma.TransactionClient, name: string, adminUserId: string): Prisma.Prisma__OrganizationClient<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        slug: string;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, Prisma.PrismaClientOptions>;
}

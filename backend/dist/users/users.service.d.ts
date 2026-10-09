import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
export declare class UsersService {
    private prisma;
    constructor(prisma: PrismaService);
    findByEmail(email: string): Prisma.Prisma__UserClient<{
        id: string;
        email: string;
        name: string;
        passwordHash: string;
        createdAt: Date;
        updatedAt: Date;
    } | null, null, import("@prisma/client/runtime/library").DefaultArgs, Prisma.PrismaClientOptions>;
    findById(id: string): Prisma.Prisma__UserClient<{
        id: string;
        email: string;
        name: string;
        passwordHash: string;
        createdAt: Date;
        updatedAt: Date;
    } | null, null, import("@prisma/client/runtime/library").DefaultArgs, Prisma.PrismaClientOptions>;
    create(tx: Prisma.TransactionClient, data: {
        name: string;
        email: string;
        passwordHash: string;
    }): Prisma.Prisma__UserClient<{
        id: string;
        email: string;
        name: string;
        passwordHash: string;
        createdAt: Date;
        updatedAt: Date;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, Prisma.PrismaClientOptions>;
}

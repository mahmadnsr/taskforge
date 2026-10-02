import { PrismaService } from '../prisma/prisma.service.js';
export declare class AppResolver {
    private prisma;
    constructor(prisma: PrismaService);
    hello(): string;
    testCount(): Promise<number>;
}

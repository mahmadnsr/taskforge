import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
export declare class TokenService {
    private jwt;
    private config;
    private prisma;
    constructor(jwt: JwtService, config: ConfigService, prisma: PrismaService);
    signAccessToken(userId: string): Promise<string>;
    private hash;
    issueRefreshToken(userId: string): Promise<string>;
    consumeRefreshToken(token: string): Promise<string | null>;
    revokeRefreshToken(token: string): Promise<void>;
}

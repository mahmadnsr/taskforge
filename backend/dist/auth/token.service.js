var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service.js';
let TokenService = class TokenService {
    jwt;
    config;
    prisma;
    constructor(jwt, config, prisma) {
        this.jwt = jwt;
        this.config = config;
        this.prisma = prisma;
    }
    signAccessToken(userId) {
        return this.jwt.signAsync({ sub: userId });
    }
    hash(token) {
        return createHash('sha256').update(token).digest('hex');
    }
    async issueRefreshToken(userId) {
        const token = randomBytes(32).toString('hex');
        const days = Number(this.config.get('REFRESH_TOKEN_TTL_DAYS') ?? 7);
        await this.prisma.refreshToken.create({
            data: {
                userId,
                tokenHash: this.hash(token),
                expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
            },
        });
        return token;
    }
    async consumeRefreshToken(token) {
        const tokenHash = this.hash(token);
        const row = await this.prisma.refreshToken.findUnique({
            where: { tokenHash },
        });
        if (!row)
            return null;
        const { count } = await this.prisma.refreshToken.deleteMany({
            where: { tokenHash },
        });
        if (count === 0 || row.expiresAt < new Date())
            return null;
        return row.userId;
    }
    async revokeRefreshToken(token) {
        await this.prisma.refreshToken.deleteMany({
            where: { tokenHash: this.hash(token) },
        });
    }
};
TokenService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [JwtService,
        ConfigService,
        PrismaService])
], TokenService);
export { TokenService };
//# sourceMappingURL=token.service.js.map
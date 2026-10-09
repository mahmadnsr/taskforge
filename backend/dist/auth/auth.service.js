var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { ConflictException, Injectable, UnauthorizedException, } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { OrganizationsService } from '../organizations/organizations.service.js';
import { TokenService } from './token.service.js';
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);
let AuthService = class AuthService {
    prisma;
    usersService;
    organizationsService;
    tokenService;
    constructor(prisma, usersService, organizationsService, tokenService) {
        this.prisma = prisma;
        this.usersService = usersService;
        this.organizationsService = organizationsService;
        this.tokenService = tokenService;
    }
    async register(input) {
        const email = input.email.toLowerCase().trim();
        const existing = await this.usersService.findByEmail(email);
        if (existing) {
            throw new ConflictException('Email already registered');
        }
        const passwordHash = await bcrypt.hash(input.password, 12);
        try {
            return await this.prisma.$transaction(async (tx) => {
                const user = await this.usersService.create(tx, {
                    name: input.name,
                    email,
                    passwordHash,
                });
                await this.organizationsService.createWithAdmin(tx, input.organizationName, user.id);
                return user;
            });
        }
        catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
                throw new ConflictException('Email already registered');
            }
            throw e;
        }
    }
    async login(input) {
        const email = input.email.toLowerCase().trim();
        const user = await this.usersService.findByEmail(email);
        const valid = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
        if (!user || !valid) {
            throw new UnauthorizedException('Invalid email or password');
        }
        const accessToken = await this.tokenService.signAccessToken(user.id);
        const refreshToken = await this.tokenService.issueRefreshToken(user.id);
        return { accessToken, refreshToken, user };
    }
    async refresh(refreshToken) {
        const userId = await this.tokenService.consumeRefreshToken(refreshToken);
        if (!userId) {
            throw new UnauthorizedException('Invalid or expired refresh token');
        }
        const user = await this.usersService.findById(userId);
        if (!user) {
            throw new UnauthorizedException('Invalid or expired refresh token');
        }
        const accessToken = await this.tokenService.signAccessToken(user.id);
        const newRefreshToken = await this.tokenService.issueRefreshToken(user.id);
        return { accessToken, refreshToken: newRefreshToken, user };
    }
    async logout(refreshToken) {
        await this.tokenService.revokeRefreshToken(refreshToken);
        return true;
    }
};
AuthService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [PrismaService,
        UsersService,
        OrganizationsService,
        TokenService])
], AuthService);
export { AuthService };
//# sourceMappingURL=auth.service.js.map
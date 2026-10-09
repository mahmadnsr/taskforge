import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { OrganizationsService } from '../organizations/organizations.service.js';
import { RegisterInput } from './dto/register.input.js';
import { LoginInput } from './dto/login.input.js';
import { TokenService } from './token.service.js';
export declare class AuthService {
    private prisma;
    private usersService;
    private organizationsService;
    private tokenService;
    constructor(prisma: PrismaService, usersService: UsersService, organizationsService: OrganizationsService, tokenService: TokenService);
    register(input: RegisterInput): Promise<{
        id: string;
        email: string;
        name: string;
        passwordHash: string;
        createdAt: Date;
        updatedAt: Date;
    }>;
    login(input: LoginInput): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            id: string;
            email: string;
            name: string;
            passwordHash: string;
            createdAt: Date;
            updatedAt: Date;
        };
    }>;
    refresh(refreshToken: string): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            id: string;
            email: string;
            name: string;
            passwordHash: string;
            createdAt: Date;
            updatedAt: Date;
        };
    }>;
    logout(refreshToken: string): Promise<boolean>;
    me(userId: string): Promise<{
        id: string;
        email: string;
        name: string;
        passwordHash: string;
        createdAt: Date;
        updatedAt: Date;
    }>;
}

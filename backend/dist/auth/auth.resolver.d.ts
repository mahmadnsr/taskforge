import { AuthService } from './auth.service.js';
import { RegisterInput } from './dto/register.input.js';
import { LoginInput } from './dto/login.input.js';
import { RefreshTokenInput } from './dto/refresh-token.input.js';
export declare class AuthResolver {
    private authService;
    constructor(authService: AuthService);
    register(input: RegisterInput): Promise<{
        id: string;
        name: string;
        email: string;
        passwordHash: string;
        createdAt: Date;
        updatedAt: Date;
    }>;
    login(input: LoginInput): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            id: string;
            name: string;
            email: string;
            passwordHash: string;
            createdAt: Date;
            updatedAt: Date;
        };
    }>;
    refresh(input: RefreshTokenInput): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            id: string;
            name: string;
            email: string;
            passwordHash: string;
            createdAt: Date;
            updatedAt: Date;
        };
    }>;
    logout(input: RefreshTokenInput): Promise<boolean>;
    me(user: {
        id: string;
    }): Promise<{
        id: string;
        name: string;
        email: string;
        passwordHash: string;
        createdAt: Date;
        updatedAt: Date;
    }>;
    adminOnly(): string;
}

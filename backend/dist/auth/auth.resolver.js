var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { AuthService } from './auth.service.js';
import { RegisterInput } from './dto/register.input.js';
import { LoginInput } from './dto/login.input.js';
import { User } from '../users/entities/user.entity.js';
import { AuthPayload } from './entities/auth-payload.entity.js';
import { RefreshTokenInput } from './dto/refresh-token.input.js';
let AuthResolver = class AuthResolver {
    authService;
    constructor(authService) {
        this.authService = authService;
    }
    register(input) {
        return this.authService.register(input);
    }
    login(input) {
        return this.authService.login(input);
    }
    refresh(input) {
        return this.authService.refresh(input.refreshToken);
    }
    logout(input) {
        return this.authService.logout(input.refreshToken);
    }
};
__decorate([
    Mutation(() => User),
    __param(0, Args('input')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [RegisterInput]),
    __metadata("design:returntype", void 0)
], AuthResolver.prototype, "register", null);
__decorate([
    Mutation(() => AuthPayload),
    __param(0, Args('input')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [LoginInput]),
    __metadata("design:returntype", void 0)
], AuthResolver.prototype, "login", null);
__decorate([
    Mutation(() => AuthPayload),
    __param(0, Args('input')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [RefreshTokenInput]),
    __metadata("design:returntype", void 0)
], AuthResolver.prototype, "refresh", null);
__decorate([
    Mutation(() => Boolean),
    __param(0, Args('input')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [RefreshTokenInput]),
    __metadata("design:returntype", void 0)
], AuthResolver.prototype, "logout", null);
AuthResolver = __decorate([
    Resolver(),
    __metadata("design:paramtypes", [AuthService])
], AuthResolver);
export { AuthResolver };
//# sourceMappingURL=auth.resolver.js.map
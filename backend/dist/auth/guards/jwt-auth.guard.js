var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Injectable, UnauthorizedException, } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { JwtService } from '@nestjs/jwt';
let JwtAuthGuard = class JwtAuthGuard {
    jwt;
    constructor(jwt) {
        this.jwt = jwt;
    }
    async canActivate(context) {
        const req = GqlExecutionContext.create(context).getContext().req;
        const header = req.headers?.authorization;
        const [type, token] = header?.split(' ') ?? [];
        if (type !== 'Bearer' || !token) {
            throw new UnauthorizedException('Missing access token');
        }
        try {
            const payload = await this.jwt.verifyAsync(token);
            req.user = { id: payload.sub };
            return true;
        }
        catch {
            throw new UnauthorizedException('Invalid or expired access token');
        }
    }
};
JwtAuthGuard = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [JwtService])
], JwtAuthGuard);
export { JwtAuthGuard };
//# sourceMappingURL=jwt-auth.guard.js.map
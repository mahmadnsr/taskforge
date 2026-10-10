import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { AuthService } from './auth.service.js';
import { RegisterInput } from './dto/register.input.js';
import { LoginInput } from './dto/login.input.js';
import { RefreshTokenInput } from './dto/refresh-token.input.js';
import { User } from '../users/entities/user.entity.js';
import { AuthPayload } from './entities/auth-payload.entity.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Roles } from './decorators/roles.decorator.js';

@Resolver()
export class AuthResolver {
  constructor(private authService: AuthService) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Mutation(() => User)
  register(@Args('input') input: RegisterInput) {
    return this.authService.register(input);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Mutation(() => AuthPayload)
  login(@Args('input') input: LoginInput) {
    return this.authService.login(input);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Mutation(() => AuthPayload)
  refresh(@Args('input') input: RefreshTokenInput) {
    return this.authService.refresh(input.refreshToken);
  }

  @Mutation(() => Boolean)
  logout(@Args('input') input: RefreshTokenInput) {
    return this.authService.logout(input.refreshToken);
  }

  @Query(() => User)
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: { id: string }) {
    return this.authService.me(user.id);
  }

  @Query(() => String)
  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  adminOnly() {
    return 'You are an ADMIN of this organization';
  }
}
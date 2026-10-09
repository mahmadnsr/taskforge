import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UsersModule } from '../users/users.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { AuthService } from './auth.service.js';
import { AuthResolver } from './auth.resolver.js';
import { TokenService } from './token.service.js';

@Module({
  imports: [
    PrismaModule,
    UsersModule,
    OrganizationsModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: (config.get<string>('JWT_ACCESS_EXPIRES_IN') ??
            '15m') as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  providers: [AuthService, AuthResolver, TokenService],
  exports: [TokenService],
})
export class AuthModule {}
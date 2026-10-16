import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAccessStrategy } from './jwt-access.strategy.js';
import { JwtRefreshStrategy } from './jwt-refresh.strategy.js';
import { PasswordHasher } from './password-hasher.js';
import {
  RefreshSession,
  RefreshSessionSchema,
} from './refresh-session.schema.js';
import { RefreshSessionService } from './refresh-session.service.js';
import { TokenService } from './token.service.js';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    // Secrets are passed per call: access and refresh tokens use different ones.
    JwtModule.register({}),
    MongooseModule.forFeature([
      { name: RefreshSession.name, schema: RefreshSessionSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordHasher,
    TokenService,
    RefreshSessionService,
    JwtAccessStrategy,
    JwtRefreshStrategy,
  ],
})
export class AuthModule {}

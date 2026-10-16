import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
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

// Auth responses carry user data or session state: keep them out of every HTTP cache (including
// ETag revalidation). Middleware runs before the guards, so 401/403/429 responses get it too.
function noStore(_req: Request, res: Response, next: NextFunction) {
  res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' });
  next();
}

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
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(noStore).forRoutes(AuthController);
  }
}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Env } from '../config/env.schema.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from './auth.constants.js';

// Claims never carry user data beyond the id (specs/04 §4.2).
export type AccessPayload = { sub: string; token_use: 'access' };
export type RefreshPayload = {
  sub: string;
  token_use: 'refresh';
  jti: string;
  fid: string;
};

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  signAccess(userId: string): Promise<string> {
    const payload: AccessPayload = { sub: userId, token_use: 'access' };
    return this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      algorithm: 'HS256',
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });
  }

  signRefresh(userId: string, jti: string, familyId: string): Promise<string> {
    const payload: RefreshPayload = {
      sub: userId,
      token_use: 'refresh',
      jti,
      fid: familyId,
    };
    return this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
      algorithm: 'HS256',
      expiresIn: REFRESH_TOKEN_TTL_SECONDS,
    });
  }
}

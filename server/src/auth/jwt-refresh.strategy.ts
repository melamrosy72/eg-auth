import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard, PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { Strategy } from 'passport-jwt';
import type { Env } from '../config/env.schema.js';
import { REFRESH_COOKIE, SESSION_EXPIRED } from './auth.constants.js';
import { isRefreshPayload, type RefreshPayload } from './token.service.js';

/** Reads only the refresh cookie; body, query and Authorization are ignored (specs/03 §5). */
function fromRefreshCookie(req: Request): string | null {
  const token: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof token === 'string' && token !== '' ? token : null;
}

/**
 * Verifies signature, expiry and token_use only. Session state (rotated, revoked,
 * reused) is decided by AuthService.refresh (specs/02 §2).
 */
@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(config: ConfigService<Env, true>) {
    super({
      jwtFromRequest: fromRefreshCookie,
      secretOrKey: config.get('JWT_REFRESH_SECRET', { infer: true }),
      algorithms: ['HS256'],
    });
  }

  validate(payload: unknown): RefreshPayload {
    if (!isRefreshPayload(payload)) throw new UnauthorizedException();
    return {
      sub: payload.sub,
      token_use: 'refresh',
      jti: payload.jti,
      fid: payload.fid,
    };
  }
}

/** Every refresh 401 carries the same public message (specs/03 §5). */
@Injectable()
export class JwtRefreshGuard extends AuthGuard('jwt-refresh') {
  override handleRequest<T>(error: unknown, user: T | false): T {
    if (error || !user) throw new UnauthorizedException(SESSION_EXPIRED);
    return user;
  }
}

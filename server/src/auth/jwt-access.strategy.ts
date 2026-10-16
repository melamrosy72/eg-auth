import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { Strategy } from 'passport-jwt';
import type { Env } from '../config/env.schema.js';
import { type SafeUser, toSafeUser } from '../users/user.schema.js';
import { UsersService } from '../users/users.service.js';
import { ACCESS_COOKIE } from './auth.constants.js';
import type { AccessPayload } from './token.service.js';

/** Reads only the access cookie; Bearer headers are not an auth path (specs/04 §4.6). */
function fromAccessCookie(req: Request): string | null {
  const token: unknown = req.cookies?.[ACCESS_COOKIE];
  return typeof token === 'string' && token !== '' ? token : null;
}

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService<Env, true>,
    private readonly users: UsersService,
  ) {
    super({
      jwtFromRequest: fromAccessCookie,
      secretOrKey: config.get('JWT_ACCESS_SECRET', { infer: true }),
      algorithms: ['HS256'],
    });
  }

  /** Runs after signature and expiry checks. The result becomes req.user. */
  async validate(payload: Partial<AccessPayload>): Promise<SafeUser> {
    if (payload.token_use !== 'access' || typeof payload.sub !== 'string') {
      throw new UnauthorizedException();
    }
    const user = await this.users.findById(payload.sub);
    if (!user) throw new UnauthorizedException();
    return toSafeUser(user);
  }
}

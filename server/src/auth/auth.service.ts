import {
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { type SafeUser, toSafeUser } from '../users/user.schema.js';
import { UsersService } from '../users/users.service.js';
import {
  REFRESH_REUSE_GRACE_SECONDS,
  SESSION_EXPIRED,
} from './auth.constants.js';
import type { AuthTokens } from './cookies.js';
import type { SigninDto, SignupDto } from './dto/auth.dto.js';
import { PasswordHasher } from './password-hasher.js';
import { RefreshSessionService } from './refresh-session.service.js';
import {
  isRefreshPayload,
  type RefreshPayload,
  TokenService,
} from './token.service.js';

export type AuthResult = { user: SafeUser; tokens: AuthTokens };

/** `grace` sets no cookies; `reuse` means the family was revoked and cookies must be cleared. */
export type RefreshResult =
  | { kind: 'rotated'; tokens: AuthTokens }
  | { kind: 'grace' }
  | { kind: 'reuse' };

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private dummyHash = '';

  constructor(
    private readonly users: UsersService,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly sessions: RefreshSessionService,
  ) {}

  /** Verified against for unknown emails, so both signin failures cost the same (specs/04 §3). */
  async onModuleInit(): Promise<void> {
    this.dummyHash = await this.hasher.hash(randomUUID());
  }

  async signup(dto: SignupDto): Promise<AuthResult> {
    const passwordHash = await this.hasher.hash(dto.password);
    const user = toSafeUser(
      await this.users.create({
        name: dto.name,
        email: dto.email,
        passwordHash,
      }),
    );
    const { tokens, familyId } = await this.startSession(user.id);
    this.logger.log({ event: 'user_signed_up', userId: user.id, familyId });
    return { user, tokens };
  }

  async signin(dto: SigninDto): Promise<AuthResult> {
    const found = await this.users.findByEmailWithPassword(dto.email);
    const valid = await this.hasher.verify(
      found?.passwordHash ?? this.dummyHash,
      dto.password,
    );
    if (!found || !valid) {
      this.logger.warn({ event: 'signin_failed' });
      throw new UnauthorizedException('Invalid email or password');
    }
    const user = toSafeUser(found);
    const { tokens, familyId } = await this.startSession(user.id);
    this.logger.log({ event: 'user_signed_in', userId: user.id, familyId });
    return { user, tokens };
  }

  /** specs/04 §4.4. One `now` for every comparison and write in this request. */
  async refresh(claims: RefreshPayload): Promise<RefreshResult> {
    const { sub: userId, jti, fid: familyId } = claims;
    const now = new Date();
    const newJti = randomUUID();

    if (await this.sessions.claim(jti, newJti, now)) {
      if (!(await this.users.findById(userId))) {
        await this.sessions.revokeFamily(familyId, now);
        throw new UnauthorizedException(SESSION_EXPIRED);
      }
      await this.sessions.insert(newJti, familyId, userId, now);
      this.logger.log({ event: 'session_rotated', userId, familyId });
      return {
        kind: 'rotated',
        tokens: await this.issueTokens(userId, newJti, familyId),
      };
    }

    const session = await this.sessions.findByJti(jti);
    if (
      !session ||
      session.expiresAt <= now ||
      session.revokedAt ||
      !session.rotatedAt
    ) {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }
    if (
      now.getTime() - session.rotatedAt.getTime() <=
      REFRESH_REUSE_GRACE_SECONDS * 1000
    ) {
      // Benign race: another tab just rotated this token. Issue nothing.
      return { kind: 'grace' };
    }
    await this.sessions.revokeFamily(familyId, now);
    this.logger.warn({
      event: 'refresh_token_reuse_detected',
      userId,
      familyId,
    });
    return { kind: 'reuse' };
  }

  /**
   * Revokes the family of a validly signed refresh token. Any verification failure is
   * ignored: logout always succeeds (specs/04 §4.5).
   */
  async logout(refreshToken: unknown): Promise<void> {
    if (typeof refreshToken !== 'string' || refreshToken === '') return;
    const claims = await this.tokens
      .verifyRefresh(refreshToken)
      .catch(() => null);
    if (!isRefreshPayload(claims)) return;
    await this.sessions.revokeFamily(claims.fid, new Date());
    this.logger.log({
      event: 'user_logged_out',
      userId: claims.sub,
      familyId: claims.fid,
    });
  }

  private async startSession(
    userId: string,
  ): Promise<{ tokens: AuthTokens; familyId: string }> {
    const { jti, familyId } = await this.sessions.createFamily(userId);
    return { tokens: await this.issueTokens(userId, jti, familyId), familyId };
  }

  private async issueTokens(
    userId: string,
    jti: string,
    familyId: string,
  ): Promise<AuthTokens> {
    const [accessToken, refreshToken] = await Promise.all([
      this.tokens.signAccess(userId),
      this.tokens.signRefresh(userId, jti, familyId),
    ]);
    return { accessToken, refreshToken };
  }
}

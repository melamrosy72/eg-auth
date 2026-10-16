import {
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { type SafeUser, toSafeUser } from '../users/user.schema.js';
import { UsersService } from '../users/users.service.js';
import type { AuthTokens } from './cookies.js';
import type { SigninDto, SignupDto } from './dto/auth.dto.js';
import { PasswordHasher } from './password-hasher.js';
import { RefreshSessionService } from './refresh-session.service.js';
import { TokenService } from './token.service.js';

export type AuthResult = { user: SafeUser; tokens: AuthTokens };

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

  private async startSession(
    userId: string,
  ): Promise<{ tokens: AuthTokens; familyId: string }> {
    const { jti, familyId } = await this.sessions.createFamily(userId);
    const [accessToken, refreshToken] = await Promise.all([
      this.tokens.signAccess(userId),
      this.tokens.signRefresh(userId, jti, familyId),
    ]);
    return { tokens: { accessToken, refreshToken }, familyId };
  }
}

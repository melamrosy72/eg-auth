import {
  applyDecorators,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser, Public } from '../common/decorators/auth.decorators.js';
import { ErrorResponse } from '../common/filters/all-exceptions.filter.js';
import type { Env } from '../config/env.schema.js';
import type { SafeUser } from '../users/user.schema.js';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
  REFRESH_THROTTLE,
  SESSION_EXPIRED,
  SIGNIN_THROTTLE,
  SIGNUP_THROTTLE,
} from './auth.constants.js';
import { AuthService } from './auth.service.js';
import { clearAuthCookies, setAuthCookies } from './cookies.js';
import {
  MessageResponseDto,
  SigninDto,
  SignupDto,
  UserResponseDto,
} from './dto/auth.dto.js';
import { JwtRefreshGuard } from './jwt-refresh.strategy.js';
import type { RefreshPayload } from './token.service.js';

const SETS_BOTH_COOKIES = {
  'Set-Cookie': {
    description: `access_token (HttpOnly; SameSite=Lax; Path=/; Max-Age=900) and refresh_token (HttpOnly; SameSite=Strict; Path=${REFRESH_COOKIE_PATH}; Max-Age=604800). Secure when COOKIE_SECURE=true. A new session family.`,
    schema: { type: 'string' },
  },
};

const CLEARS_BOTH_COOKIES = {
  'Set-Cookie': {
    description: `Clears access_token (Path=/) and refresh_token (Path=${REFRESH_COOKIE_PATH}) with the attributes they were set with and an expiry in the past.`,
    schema: { type: 'string' },
  },
};

const ApiError = (status: number, description: string) =>
  ApiResponse({ status, description, type: ErrorResponse });

/** specs/03 §1 common errors for unsafe (origin-checked) endpoints. */
const ApiUnsafeMethodErrors = () =>
  applyDecorators(
    ApiError(
      400,
      'Validation failed or unknown body property; message is a string[]',
    ),
    ApiError(403, 'Invalid request origin'),
    ApiError(429, 'Too many requests, please try again later'),
    ApiError(500, 'Internal server error'),
  );

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly secureCookies: boolean;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService<Env, true>,
  ) {
    this.secureCookies = config.get('COOKIE_SECURE', { infer: true });
  }

  @Public()
  @Throttle(SIGNUP_THROTTLE)
  @Post('signup')
  @ApiOperation({
    summary: 'Create an account and sign in (5 requests / 60 s)',
  })
  @ApiResponse({
    status: 201,
    type: UserResponseDto,
    headers: SETS_BOTH_COOKIES,
  })
  @ApiError(409, 'Email is already registered')
  @ApiUnsafeMethodErrors()
  async signup(
    @Body() dto: SignupDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserResponseDto> {
    const { user, tokens } = await this.auth.signup(dto);
    setAuthCookies(res, tokens, this.secureCookies);
    return { user };
  }

  @Public()
  @Throttle(SIGNIN_THROTTLE)
  @Post('signin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in (10 requests / 60 s)' })
  @ApiResponse({
    status: 200,
    type: UserResponseDto,
    headers: SETS_BOTH_COOKIES,
  })
  @ApiError(
    401,
    'Invalid email or password (same for unknown email and wrong password)',
  )
  @ApiUnsafeMethodErrors()
  async signin(
    @Body() dto: SigninDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserResponseDto> {
    const { user, tokens } = await this.auth.signin(dto);
    setAuthCookies(res, tokens, this.secureCookies);
    return { user };
  }

  @Get('me')
  @ApiCookieAuth(ACCESS_COOKIE)
  @ApiOperation({
    summary: 'The signed-in user; identity comes only from the access cookie',
  })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiError(
    401,
    'Access cookie missing, invalid, expired, wrong token_use, or user no longer exists',
  )
  @ApiError(429, 'Too many requests, please try again later')
  @ApiError(500, 'Internal server error')
  me(@CurrentUser() user: SafeUser): UserResponseDto {
    return { user };
  }

  @Public() // uses the refresh guard instead of the access guard
  @UseGuards(JwtRefreshGuard)
  @Throttle(REFRESH_THROTTLE)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOperation({
    summary: 'Rotate the refresh token (30 requests / 60 s)',
    description:
      'Uses only the refresh_token cookie. Normal rotation sets new access_token and refresh_token cookies (same family). A duplicate of a token rotated in the last 10 s (another tab) returns 200 with no Set-Cookie.',
  })
  @ApiResponse({
    status: 200,
    type: MessageResponseDto,
    description:
      'Rotated (both cookies set) or grace-window duplicate (no cookies)',
    headers: {
      'Set-Cookie': {
        description:
          'On normal rotation only: new access_token and refresh_token (same family, new jti), same attributes as signin.',
        schema: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    type: ErrorResponse,
    description: `${SESSION_EXPIRED}. Cookie missing/invalid/expired, wrong token_use, unknown jti, or session revoked/expired: no side effects. User no longer exists: the family is revoked. Reuse detected (a rotated token presented after the 10 s grace window): the family is revoked and both cookies are cleared.`,
    headers: CLEARS_BOTH_COOKIES,
  })
  @ApiError(403, 'Invalid request origin')
  @ApiError(429, 'Too many requests, please try again later')
  @ApiError(500, 'Internal server error')
  async refresh(
    @CurrentUser() claims: RefreshPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MessageResponseDto> {
    const result = await this.auth.refresh(claims);
    if (result.kind === 'reuse') {
      clearAuthCookies(res, this.secureCookies);
      throw new UnauthorizedException(SESSION_EXPIRED);
    }
    if (result.kind === 'rotated') {
      setAuthCookies(res, result.tokens, this.secureCookies);
    }
    return { message: 'Access token refreshed.' };
  }

  @Public() // no guard: logout must succeed even with a bad cookie (specs/04 §4.5)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log out this device (idempotent)',
    description:
      'Revokes the session family of a validly signed refresh_token cookie; verification failures are ignored. Other devices are not affected.',
  })
  @ApiResponse({
    status: 200,
    type: MessageResponseDto,
    headers: CLEARS_BOTH_COOKIES,
  })
  @ApiError(403, 'Invalid request origin')
  @ApiError(429, 'Too many requests, please try again later')
  @ApiError(500, 'Internal server error')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MessageResponseDto> {
    // Cleared first, so the cookies go even if revocation fails with a 500.
    clearAuthCookies(res, this.secureCookies);
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    return { message: 'Logged out successfully.' };
  }
}

import {
  applyDecorators,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser, Public } from '../common/decorators/auth.decorators.js';
import { ErrorResponse } from '../common/filters/all-exceptions.filter.js';
import type { Env } from '../config/env.schema.js';
import type { SafeUser } from '../users/user.schema.js';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE_PATH,
  SIGNIN_THROTTLE,
  SIGNUP_THROTTLE,
} from './auth.constants.js';
import { AuthService } from './auth.service.js';
import { setAuthCookies } from './cookies.js';
import { SigninDto, SignupDto, UserResponseDto } from './dto/auth.dto.js';

const SETS_BOTH_COOKIES = {
  'Set-Cookie': {
    description: `access_token (HttpOnly; SameSite=Lax; Path=/; Max-Age=900) and refresh_token (HttpOnly; SameSite=Strict; Path=${REFRESH_COOKIE_PATH}; Max-Age=604800). Secure when COOKIE_SECURE=true. A new session family.`,
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
}

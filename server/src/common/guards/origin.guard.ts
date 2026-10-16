import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { Env } from '../../config/env.schema.js';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** CSRF defence (specs/04 §5): unsafe methods need an Origin that exactly matches FRONTEND_ORIGINS. */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowedOrigins: ReadonlySet<string>;

  constructor(config: ConfigService<Env, true>) {
    this.allowedOrigins = new Set(
      config.get('FRONTEND_ORIGINS', { infer: true }),
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!UNSAFE_METHODS.has(request.method)) return true;

    const origin = request.headers.origin;
    if (origin !== undefined && this.allowedOrigins.has(origin)) return true;

    throw new ForbiddenException('Invalid request origin');
  }
}

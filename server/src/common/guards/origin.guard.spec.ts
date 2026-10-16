import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { OriginGuard } from './origin.guard.js';

const ALLOWED = 'http://localhost:5173';

const guard = new OriginGuard({
  get: () => [ALLOWED, 'https://app.example.com'],
} as unknown as ConfigService<Env, true>);

function contextFor(method: string, origin?: string): ExecutionContext {
  const headers: Record<string, string> = {};
  if (origin !== undefined) headers.origin = origin;
  return {
    switchToHttp: () => ({ getRequest: () => ({ method, headers }) }),
  } as unknown as ExecutionContext;
}

describe('OriginGuard', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'allows %s with an exactly matching Origin',
    (method) => {
      expect(guard.canActivate(contextFor(method, ALLOWED))).toBe(true);
    },
  );

  it('allows any configured origin', () => {
    expect(
      guard.canActivate(contextFor('POST', 'https://app.example.com')),
    ).toBe(true);
  });

  it.each([
    ['missing', undefined],
    ['null', 'null'],
    ['a mismatched host', 'http://evil.example.com'],
    ['a different port', 'http://localhost:5174'],
    ['a different scheme', 'https://localhost:5173'],
    ['a trailing slash', 'http://localhost:5173/'],
    ['different casing', 'HTTP://LOCALHOST:5173'],
    ['malformed', 'not a url'],
    ['empty', ''],
  ])('rejects POST with a %s Origin with 403', (_label, origin) => {
    const act = () => guard.canActivate(contextFor('POST', origin));
    expect(act).toThrow(ForbiddenException);
    expect(act).toThrow('Invalid request origin');
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])(
    'does not check %s requests',
    (method) => {
      expect(guard.canActivate(contextFor(method))).toBe(true);
      expect(
        guard.canActivate(contextFor(method, 'http://evil.example.com')),
      ).toBe(true);
    },
  );
});

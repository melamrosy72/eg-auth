import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getConnectionToken } from '@nestjs/mongoose';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import type { Connection } from 'mongoose';
import type { Server } from 'node:http';
import request, { type Response } from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { assertTestDatabase } from './test-env.js';

export const ORIGIN = 'http://localhost:5173';
/** The versioned auth base path; every auth request in the e2e tests goes through it. */
export const AUTH = '/api/v1/auth';
export const PASSWORD = 'Example!123';

/**
 * Boots the real AppModule with the same HTTP setup as main.ts. Call once per
 * describe block so throttler state stays isolated (specs/06 §1.1).
 */
export async function createTestApp(
  override: (builder: TestingModuleBuilder) => TestingModuleBuilder = (b) => b,
) {
  const moduleRef = await override(
    Test.createTestingModule({ imports: [AppModule] }),
  ).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bufferLogs: true,
  });
  configureApp(app);
  await app.init();

  const connection = app.get<Connection>(getConnectionToken());
  assertTestDatabase(connection.name);
  // Indexes must exist before the duplicate-email tests run.
  await connection.syncIndexes();

  return { app, connection, server: app.getHttpServer() };
}

export type TestContext = {
  app: NestExpressApplication;
  connection: Connection;
  server: Server;
};

/** One app per describe block, closed afterwards. */
export function useApp(
  override?: Parameters<typeof createTestApp>[0],
): TestContext {
  const ctx = {} as TestContext;
  beforeAll(async () => Object.assign(ctx, await createTestApp(override)));
  afterAll(async () => ctx.app.close());
  return ctx;
}

let counter = 0;
export const uniqueEmail = (prefix: string) =>
  `${prefix}-${Date.now()}-${++counter}@example.com`;

/** The full Set-Cookie line for `name`, if the response set it. */
export function setCookie(res: Response, name: string): string | undefined {
  const lines = (res.get('Set-Cookie') ?? []) as string[];
  return lines.find((line) => line.startsWith(`${name}=`));
}

/** The cookie value from a Set-Cookie line. */
export function cookieValue(res: Response, name: string): string {
  const line = setCookie(res, name);
  if (!line) throw new Error(`Response did not set ${name}`);
  return line.slice(name.length + 1, line.indexOf(';'));
}

const JWT_PATTERN = /eyJ[\w-]+\.[\w-]+\.[\w-]+/;

/** No password hash or JWT may ever appear in a response body (test 23). */
export function expectNoSecrets(res: Response): void {
  const body = JSON.stringify(res.body);
  expect(body).not.toContain('passwordHash');
  expect(body).not.toContain('$argon2');
  expect(body).not.toMatch(JWT_PATTERN);
}

export function expectErrorResponse(res: Response, statusCode: number) {
  expect(res.status).toBe(statusCode);
  expect(res.body).toEqual({
    statusCode,
    error: expect.any(String),
    message: expect.anything(),
    path: expect.any(String),
    timestamp: expect.any(String),
    requestId: expect.any(String),
  });
}

/** POST with the allowed Origin; every body is checked for secrets (test 23). */
export async function post(
  server: Server,
  path: string,
  options: { body?: object; cookie?: string } = {},
): Promise<Response> {
  let req = request(server).post(`${AUTH}${path}`).set('Origin', ORIGIN);
  if (options.cookie !== undefined) req = req.set('Cookie', options.cookie);
  const res = await req.send(options.body);
  expectNoSecrets(res);
  return res;
}

export const signup = (server: Server, body: object) =>
  post(server, '/signup', { body });
export const signin = (server: Server, body: object) =>
  post(server, '/signin', { body });
export const refresh = (server: Server, refreshToken?: string) =>
  post(server, '/refresh', {
    cookie:
      refreshToken === undefined ? undefined : `refresh_token=${refreshToken}`,
  });
export const logout = (server: Server, refreshToken?: string) =>
  post(server, '/logout', {
    cookie:
      refreshToken === undefined ? undefined : `refresh_token=${refreshToken}`,
  });

/** Signs a JWT with the app's own secrets, for expired or wrong-purpose tokens. */
export function signJwt(
  ctx: TestContext,
  payload: object,
  options: { secret: 'access' | 'refresh' | string; expiresIn?: number },
): Promise<string> {
  const config = ctx.app.get(ConfigService);
  const secret =
    options.secret === 'access'
      ? config.getOrThrow<string>('JWT_ACCESS_SECRET')
      : options.secret === 'refresh'
        ? config.getOrThrow<string>('JWT_REFRESH_SECRET')
        : options.secret;
  return ctx.app.get(JwtService).signAsync(payload, {
    secret,
    algorithm: 'HS256',
    expiresIn: options.expiresIn ?? 900,
  });
}

/** Decodes a JWT payload without verifying it (test assertions only). */
export function jwtPayload(token: string): Record<string, unknown> {
  return JSON.parse(
    Buffer.from(token.split('.')[1] as string, 'base64url').toString(),
  ) as Record<string, unknown>;
}

/** Signs up a fresh user and returns its id and both tokens. */
export async function newSession(ctx: TestContext, prefix = 'user') {
  const res = await signup(ctx.server, {
    name: 'Session User',
    email: uniqueEmail(prefix),
    password: PASSWORD,
  });
  expect(res.status).toBe(201);
  return {
    userId: res.body.user.id as string,
    email: res.body.user.email as string,
    access: cookieValue(res, 'access_token'),
    refresh: cookieValue(res, 'refresh_token'),
  };
}

import { getConnectionToken } from '@nestjs/mongoose';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Connection } from 'mongoose';
import type { Response } from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { assertTestDatabase } from './test-env.js';

export const ORIGIN = 'http://localhost:5173';
/** The versioned auth base path; every auth request in the e2e tests goes through it. */
export const AUTH = '/api/v1/auth';

/**
 * Boots the real AppModule with the same HTTP setup as main.ts. Call once per
 * describe block so throttler state stays isolated (specs/06 §1.1).
 */
export async function createTestApp() {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
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

/** No password hash or JWT may ever appear in a response body. */
export function expectNoSecrets(res: Response): void {
  const body = JSON.stringify(res.body);
  expect(body).not.toContain('passwordHash');
  expect(body).not.toContain('$argon2');
  expect(body).not.toMatch(JWT_PATTERN);
}

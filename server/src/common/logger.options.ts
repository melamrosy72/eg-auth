import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Options } from 'pino-http';
import type { Env } from '../config/env.schema.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Never log passwords, hashes, cookies, Set-Cookie, JWTs or authorization headers (specs/04 §7). */
export const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.access_token',
  '*.refresh_token',
  '*.accessToken',
  '*.refreshToken',
];

/** Reuses an incoming `x-request-id` only if it is a UUID, and echoes the id back. */
export function requestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers['x-request-id'];
  const id =
    typeof incoming === 'string' && UUID_PATTERN.test(incoming)
      ? incoming
      : randomUUID();
  res.setHeader('x-request-id', id);
  return id;
}

export function pinoHttpOptions(
  env: Pick<Env, 'NODE_ENV' | 'LOG_LEVEL'>,
): Options {
  return {
    level: env.LOG_LEVEL,
    genReqId: requestId,
    redact: { paths: REDACT_PATHS, censor: '[Redacted]' },
    transport:
      env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
  };
}

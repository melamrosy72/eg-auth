import type { IncomingMessage, ServerResponse } from 'node:http';
import { Writable } from 'node:stream';
import { pinoHttp } from 'pino-http';
import request from 'supertest';
import { pinoHttpOptions } from './logger.options.js';

const ACCESS_JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.access-signature';
const REFRESH_JWT =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.refresh-signature';
const PASSWORD = 'Sup3r$ecret-password';

function captureLogs() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(chunk.toString());
      done();
    },
  });
  const middleware = pinoHttp(
    pinoHttpOptions({ NODE_ENV: 'test', LOG_LEVEL: 'info' }),
    stream,
  );
  return { lines, middleware };
}

describe('pinoHttpOptions', () => {
  it('redacts cookies, Set-Cookie, authorization, passwords and tokens', async () => {
    const { lines, middleware } = captureLogs();
    const handler = (
      req: Parameters<typeof middleware>[0],
      res: Parameters<typeof middleware>[1],
    ) => {
      middleware(req, res);
      req.log.info(
        {
          user: { password: PASSWORD, passwordHash: '$argon2id$hash' },
          tokens: { access_token: ACCESS_JWT, refreshToken: REFRESH_JWT },
        },
        'test event',
      );
      res.setHeader('set-cookie', [
        `access_token=${ACCESS_JWT}; HttpOnly`,
        `refresh_token=${REFRESH_JWT}; HttpOnly`,
      ]);
      res.end('ok');
    };

    await request(handler)
      .post('/api/auth/signin')
      .set('Cookie', `access_token=${ACCESS_JWT}; refresh_token=${REFRESH_JWT}`)
      .set('Authorization', `Bearer ${ACCESS_JWT}`)
      .send({ email: 'a@x.com', password: PASSWORD })
      .expect(200);

    const output = lines.join('');
    expect(lines.length).toBeGreaterThanOrEqual(2); // the event and "request completed"
    expect(output).toContain('[Redacted]');
    expect(output).not.toContain(ACCESS_JWT);
    expect(output).not.toContain(REFRESH_JWT);
    expect(output).not.toContain('eyJ');
    expect(output).not.toContain(PASSWORD);
    expect(output).not.toContain('$argon2id$');
  });

  it('reuses a valid incoming x-request-id and echoes it', async () => {
    const { middleware } = captureLogs();
    const id = '3f0c1f0e-6a3b-4b8e-9c1d-2f4a5b6c7d8e';
    const response = await request(
      (req: IncomingMessage, res: ServerResponse) => {
        middleware(req, res);
        res.end(String(req.id));
      },
    )
      .get('/')
      .set('x-request-id', id);

    expect(response.headers['x-request-id']).toBe(id);
    expect(response.text).toBe(id);
  });

  it('replaces a non-UUID x-request-id with a generated UUID', async () => {
    const { middleware } = captureLogs();
    const response = await request(
      (req: IncomingMessage, res: ServerResponse) => {
        middleware(req, res);
        res.end(String(req.id));
      },
    )
      .get('/')
      .set('x-request-id', 'attacker-chosen-id');

    expect(response.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(response.text).toBe(response.headers['x-request-id']);
  });
});

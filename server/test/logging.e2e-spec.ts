import { Writable } from 'node:stream';
import { PARAMS_PROVIDER_TOKEN } from 'nestjs-pino';
import { pinoHttpOptions } from '../src/common/logger.options.js';
import {
  cookieValue,
  jwtPayload,
  logout,
  newSession,
  PASSWORD,
  refresh,
  signin,
  useApp,
} from './helpers.js';

// specs/06 §1.3 test 22. Its own file because nestjs-pino caches one pino-http
// instance per module graph: the first app booted builds it, so the capture-stream
// app must be the only app in this file (Vitest isolates modules per file).

describe('log redaction (test 22)', () => {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(chunk.toString());
      done();
    },
  });
  // Same options as production, at info level, written to a capture stream.
  const ctx = useApp((builder) =>
    builder.overrideProvider(PARAMS_PROVIDER_TOKEN).useValue({
      pinoHttp: [
        pinoHttpOptions({ NODE_ENV: 'test', LOG_LEVEL: 'info' }),
        stream,
      ],
    }),
  );

  it('22. signin, refresh, reuse and logout logs contain no password, cookie value or JWT', async () => {
    const { email } = await newSession(ctx, 'logs');
    lines.length = 0;

    const signedIn = await signin(ctx.server, { email, password: PASSWORD });
    expect(signedIn.status).toBe(200);
    const tokenA = cookieValue(signedIn, 'refresh_token');
    const access = cookieValue(signedIn, 'access_token');
    const tokenB = cookieValue(
      await refresh(ctx.server, tokenA),
      'refresh_token',
    );
    await ctx.connection
      .collection('refreshsessions')
      .updateOne(
        { jti: jwtPayload(tokenA).jti },
        { $set: { rotatedAt: new Date(Date.now() - 60_000) } },
      );
    expect((await refresh(ctx.server, tokenA)).status).toBe(401);
    expect((await logout(ctx.server, tokenB)).status).toBe(200);

    const output = lines.join('');
    expect(output).toContain('"event":"user_signed_in"');
    expect(output).toContain('"event":"session_rotated"');
    expect(output).toContain('"event":"user_logged_out"');
    expect(output).toContain('[Redacted]');
    for (const secret of [PASSWORD, tokenA, tokenB, access]) {
      expect(output).not.toContain(secret);
    }
    expect(output).not.toMatch(/eyJ[\w-]+\.[\w-]+\.[\w-]+/);
    expect(output).not.toContain('$argon2');

    // The reuse event is a warn (pino level 40) with userId and familyId.
    const reuse = lines
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .find((entry) => entry.event === 'refresh_token_reuse_detected');
    expect(reuse).toMatchObject({
      level: 40,
      userId: jwtPayload(tokenA).sub,
      familyId: jwtPayload(tokenA).fid,
    });
  });
});

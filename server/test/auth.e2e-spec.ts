import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Connection } from 'mongoose';
import type { Server } from 'node:http';
import request from 'supertest';
import { MESSAGES } from '../src/auth/dto/auth.dto.js';
import {
  AUTH,
  cookieValue,
  createTestApp,
  expectNoSecrets,
  ORIGIN,
  setCookie,
} from './helpers.js';

// specs/06 §1.3 tests 1–9. Each describe gets its own app (fresh throttler) and stays
// under the per-route limits: signup 5 / 60 s, signin 10 / 60 s.

const PASSWORD = 'Example!123';
let counter = 0;
const uniqueEmail = (prefix: string) =>
  `${prefix}-${Date.now()}-${++counter}@example.com`;

function useApp() {
  const ctx = {} as {
    app: NestExpressApplication;
    connection: Connection;
    server: Server;
  };
  beforeAll(async () => Object.assign(ctx, await createTestApp()));
  afterAll(async () => ctx.app.close());
  return ctx;
}

function signup(server: Server, body: object) {
  return request(server)
    .post(`${AUTH}/signup`)
    .set('Origin', ORIGIN)
    .send(body);
}

function signin(server: Server, body: object) {
  return request(server)
    .post(`${AUTH}/signin`)
    .set('Origin', ORIGIN)
    .send(body);
}

function expectAuthCookies(res: request.Response) {
  const access = setCookie(res, 'access_token');
  const refresh = setCookie(res, 'refresh_token');
  expect(access).toBeDefined();
  expect(refresh).toBeDefined();
  for (const attribute of [
    'HttpOnly',
    'SameSite=Lax',
    'Path=/;',
    'Max-Age=900',
  ]) {
    expect(`${access};`).toContain(attribute);
  }
  for (const attribute of [
    'HttpOnly',
    'SameSite=Strict',
    `Path=${AUTH}`,
    'Max-Age=604800',
  ]) {
    expect(refresh).toContain(attribute);
  }
  // COOKIE_SECURE=false in tests
  expect(access).not.toContain('Secure');
  expect(refresh).not.toContain('Secure');
}

function expectErrorResponse(res: request.Response, statusCode: number) {
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

describe('signup (tests 1, 4)', () => {
  const ctx = useApp();
  const email = uniqueEmail('mahmoud');

  it('1. valid signup → 201 { user } with both cookies and no secrets', async () => {
    const res = await signup(ctx.server, {
      name: '  Mahmoud ',
      email: `  ${email.toUpperCase()} `,
      password: PASSWORD,
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      user: { id: expect.any(String), name: 'Mahmoud', email },
    });
    expectAuthCookies(res);
    expectNoSecrets(res);
    expect(JSON.stringify(res.body)).not.toContain(PASSWORD);

    const stored = await ctx.connection.collection('users').findOne({ email });
    expect(stored?.passwordHash).toMatch(/^\$argon2id\$/);
    const sessions = await ctx.connection
      .collection('refreshsessions')
      .countDocuments({ userId: stored?._id });
    expect(sessions).toBe(1);
  });

  it('4. duplicate email → 409, including a case variant', async () => {
    for (const variant of [email, email.toUpperCase()]) {
      const res = await signup(ctx.server, {
        name: 'Other',
        email: variant,
        password: PASSWORD,
      });
      expectErrorResponse(res, 409);
      expect(res.body.message).toBe('Email is already registered');
      expect(setCookie(res, 'access_token')).toBeUndefined();
    }
  });
});

describe('signup concurrency (test 5)', () => {
  const ctx = useApp();

  it('5. two concurrent duplicate signups → exactly one 201 and one 409', async () => {
    const body = {
      name: 'Racer',
      email: uniqueEmail('race'),
      password: PASSWORD,
    };
    const responses = await Promise.all([
      signup(ctx.server, body),
      signup(ctx.server, body),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
  });
});

describe('signup validation (tests 2, 3)', () => {
  const ctx = useApp();
  const valid = () => ({
    name: 'Mahmoud',
    email: uniqueEmail('valid'),
    password: PASSWORD,
  });

  it('2. invalid email and short trimmed name and short password → 400 with exact messages', async () => {
    const res = await signup(ctx.server, {
      name: '  ab  ',
      email: 'not-an-email',
      password: 'a1!',
    });
    expectErrorResponse(res, 400);
    expect([...res.body.message].sort()).toEqual(
      [MESSAGES.email, MESSAGES.nameMin, MESSAGES.passwordMin].sort(),
    );
  });

  it.each([
    ['12345678!', MESSAGES.passwordLetter],
    ['abcdefgh!', MESSAGES.passwordNumber],
    ['abcdefg1', MESSAGES.passwordSpecial],
  ])('2. password %j → 400 %j', async (password, message) => {
    const res = await signup(ctx.server, { ...valid(), password });
    expectErrorResponse(res, 400);
    expect(res.body.message).toEqual([message]);
  });

  it('3. unknown body property → 400', async () => {
    const res = await signup(ctx.server, { ...valid(), role: 'admin' });
    expectErrorResponse(res, 400);
    expect(res.body.message).toEqual(['property role should not exist']);
  });
});

describe('signin (tests 6, 7)', () => {
  const ctx = useApp();
  const email = uniqueEmail('signin');

  beforeAll(async () => {
    expect(
      (await signup(ctx.server, { name: 'Signer', email, password: PASSWORD }))
        .status,
    ).toBe(201);
  });

  it('6. valid signin → 200 { user } with both cookies (new family)', async () => {
    const res = await signin(ctx.server, {
      email: email.toUpperCase(),
      password: PASSWORD,
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      user: { id: expect.any(String), name: 'Signer', email },
    });
    expectAuthCookies(res);
    expectNoSecrets(res);

    const families = await ctx.connection
      .collection('refreshsessions')
      .distinct('familyId', {
        userId: (await ctx.connection.collection('users').findOne({ email }))
          ?._id,
      });
    expect(families).toHaveLength(2); // one from signup, one from signin
  });

  it('7. wrong password and unknown email → identical 401 body message', async () => {
    const wrong = await signin(ctx.server, { email, password: 'Wrong!123' });
    const unknown = await signin(ctx.server, {
      email: uniqueEmail('nobody'),
      password: PASSWORD,
    });

    for (const res of [wrong, unknown]) {
      expectErrorResponse(res, 401);
      expect(res.body.message).toBe('Invalid email or password');
      expect(setCookie(res, 'access_token')).toBeUndefined();
    }
    expect(wrong.body.message).toBe(unknown.body.message);
    expect(wrong.body.error).toBe(unknown.body.error);
  });
});

describe(`GET ${AUTH}/me (tests 8, 9)`, () => {
  const ctx = useApp();
  let accessToken: string;
  let refreshToken: string;
  let userId: string;
  const email = uniqueEmail('me');

  const me = (cookie?: string) => {
    const req = request(ctx.server).get(`${AUTH}/me`);
    return cookie === undefined ? req : req.set('Cookie', cookie);
  };
  const signAccess = (
    payload: object,
    options: { secret?: string; expiresIn?: number } = {},
  ) => {
    const config = ctx.app.get(ConfigService);
    return ctx.app.get(JwtService).signAsync(payload, {
      secret: options.secret ?? config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      algorithm: 'HS256',
      expiresIn: options.expiresIn ?? 900,
    });
  };

  beforeAll(async () => {
    const res = await signup(ctx.server, {
      name: 'Me User',
      email,
      password: PASSWORD,
    });
    expect(res.status).toBe(201);
    accessToken = cookieValue(res, 'access_token');
    refreshToken = cookieValue(res, 'refresh_token');
    userId = res.body.user.id;
  });

  it('8. valid access cookie → 200 { user } for that user', async () => {
    const res = await me(`access_token=${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: { id: userId, name: 'Me User', email } });
    expectNoSecrets(res);
  });

  it('8. no cookie → 401', async () => {
    expectErrorResponse(await me(), 401);
  });

  it('8. tampered token → 401', async () => {
    const [header, , signature] = accessToken.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ sub: '000000000000000000000000', token_use: 'access' }),
    ).toString('base64url');
    expectErrorResponse(
      await me(`access_token=${header}.${forgedPayload}.${signature}`),
      401,
    );
    const flipped =
      accessToken.slice(0, -2) + (accessToken.endsWith('AA') ? 'BB' : 'AA');
    expectErrorResponse(await me(`access_token=${flipped}`), 401);
  });

  it('8. expired token → 401', async () => {
    const expired = await signAccess(
      { sub: userId, token_use: 'access' },
      { expiresIn: -10 },
    );
    expectErrorResponse(await me(`access_token=${expired}`), 401);
  });

  it('8. refresh token in the access_token cookie → 401', async () => {
    expectErrorResponse(await me(`access_token=${refreshToken}`), 401);
  });

  it('8. access-secret token with token_use "refresh" → 401', async () => {
    const wrongUse = await signAccess({ sub: userId, token_use: 'refresh' });
    expectErrorResponse(await me(`access_token=${wrongUse}`), 401);
  });

  it('8. valid cookie for a deleted user → 401', async () => {
    const res = await signup(ctx.server, {
      name: 'Gone User',
      email: uniqueEmail('gone'),
      password: PASSWORD,
    });
    const token = cookieValue(res, 'access_token');
    expect((await me(`access_token=${token}`)).status).toBe(200);

    await ctx.connection
      .collection('users')
      .deleteOne({ email: res.body.user.email });
    expectErrorResponse(await me(`access_token=${token}`), 401);
  });

  it('9. Bearer header with a valid access token and no cookie → 401', async () => {
    const res = await request(ctx.server)
      .get(`${AUTH}/me`)
      .set('Authorization', `Bearer ${accessToken}`);
    expectErrorResponse(res, 401);
  });
});

describe('URI versioning (early part of test 25)', () => {
  const ctx = useApp();

  it(`${AUTH}/me without a cookie → 401`, async () => {
    expectErrorResponse(await request(ctx.server).get(`${AUTH}/me`), 401);
  });

  it('unversioned /api/auth/me → 404', async () => {
    expectErrorResponse(await request(ctx.server).get('/api/auth/me'), 404);
  });

  it('version-neutral /api/health → 200', async () => {
    const res = await request(ctx.server).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.info.mongodb.status).toBe('up');
  });
});

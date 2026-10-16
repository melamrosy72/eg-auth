import { Types } from 'mongoose';
import request, { type Response } from 'supertest';
import { SESSION_EXPIRED } from '../src/auth/auth.constants.js';
import {
  AUTH,
  cookieValue,
  expectErrorResponse,
  jwtPayload,
  logout,
  newSession,
  ORIGIN,
  PASSWORD,
  refresh,
  setCookie,
  signin,
  signJwt,
  type TestContext,
  useApp,
} from './helpers.js';

// specs/06 §1.3 tests 10–18 (refresh, rotation, logout). Time is simulated by moving
// rotatedAt in the database, never by sleeping (specs/06 §1.1).

const sessions = (ctx: TestContext) =>
  ctx.connection.collection('refreshsessions');

const sessionOf = (ctx: TestContext, token: string) =>
  sessions(ctx).findOne({ jti: jwtPayload(token).jti });

/** Pretends `token` was rotated `seconds` ago. */
async function rotatedSecondsAgo(
  ctx: TestContext,
  token: string,
  seconds: number,
) {
  await sessions(ctx).updateOne(
    { jti: jwtPayload(token).jti },
    { $set: { rotatedAt: new Date(Date.now() - seconds * 1000) } },
  );
}

const activeInFamily = (ctx: TestContext, familyId: unknown) =>
  sessions(ctx).countDocuments({ familyId, revokedAt: null });

function expectRotated(res: Response) {
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ message: 'Access token refreshed.' });
  expect(setCookie(res, 'access_token')).toBeDefined();
  expect(setCookie(res, 'refresh_token')).toBeDefined();
}

function expectNoCookies(res: Response) {
  expect(res.get('Set-Cookie')).toBeUndefined();
}

function expectSessionExpired(res: Response) {
  expectErrorResponse(res, 401);
  expect(res.body.message).toBe(SESSION_EXPIRED);
}

/** Express clears with an empty value and an expiry in the past. */
function expectCleared(res: Response) {
  const access = setCookie(res, 'access_token');
  const refreshCookie = setCookie(res, 'refresh_token');
  for (const [line, attributes] of [
    [access, ['access_token=;', 'Path=/;', 'HttpOnly', 'SameSite=Lax']],
    [
      refreshCookie,
      ['refresh_token=;', `Path=${AUTH};`, 'HttpOnly', 'SameSite=Strict'],
    ],
  ] as const) {
    expect(line).toBeDefined();
    for (const attribute of attributes) expect(line).toContain(attribute);
    const expires = /Expires=([^;]+)/.exec(line as string)?.[1];
    expect(new Date(expires as string).getTime()).toBeLessThan(Date.now());
  }
}

describe('refresh rotation (tests 10, 11)', () => {
  const ctx = useApp();

  it('10. valid refresh → 200, both new cookies, new jti, same fid; old session rotated', async () => {
    const { refresh: tokenA } = await newSession(ctx);
    const res = await refresh(ctx.server, tokenA);

    expectRotated(res);
    expect(setCookie(res, 'refresh_token')).toContain(`Path=${AUTH}`);
    const tokenB = cookieValue(res, 'refresh_token');
    const a = jwtPayload(tokenA);
    const b = jwtPayload(tokenB);
    expect(b.jti).not.toBe(a.jti);
    expect(b.fid).toBe(a.fid);
    expect(b.sub).toBe(a.sub);
    expect(jwtPayload(cookieValue(res, 'access_token')).token_use).toBe(
      'access',
    );

    const old = await sessionOf(ctx, tokenA);
    expect(old?.rotatedAt).toBeInstanceOf(Date);
    expect(old?.replacedByJti).toBe(b.jti);
    expect(old?.revokedAt ?? null).toBeNull();
    const next = await sessionOf(ctx, tokenB);
    expect(next?.familyId).toBe(a.fid);
    expect(next?.expiresAt.getTime()).toBeGreaterThan(
      Date.now() + 6 * 24 * 3600 * 1000,
    );
  });

  it('11. the new refresh token works on a second refresh (the chain continues)', async () => {
    const { refresh: tokenA } = await newSession(ctx);
    const tokenB = cookieValue(
      await refresh(ctx.server, tokenA),
      'refresh_token',
    );
    const res = await refresh(ctx.server, tokenB);
    expectRotated(res);
    expect(jwtPayload(cookieValue(res, 'refresh_token')).fid).toBe(
      jwtPayload(tokenA).fid,
    );
  });
});

describe('refresh rejection (test 12)', () => {
  const ctx = useApp();
  let session: Awaited<ReturnType<typeof newSession>>;
  const claims = () => {
    const { sub, jti, fid } = jwtPayload(session.refresh);
    return { sub, token_use: 'refresh', jti, fid };
  };

  beforeAll(async () => {
    session = await newSession(ctx);
  });

  const cases: [string, () => Promise<string | undefined>][] = [
    ['missing cookie', async () => undefined],
    ['malformed', async () => 'not-a-jwt'],
    [
      'wrong secret',
      () =>
        signJwt(ctx, claims(), {
          secret: 'some-other-secret-0123456789-abcdefghij',
        }),
    ],
    [
      'expired',
      () => signJwt(ctx, claims(), { secret: 'refresh', expiresIn: -10 }),
    ],
    ['an access token', async () => session.access],
    [
      'refresh secret with token_use "access"',
      () =>
        signJwt(
          ctx,
          { ...claims(), token_use: 'access' },
          { secret: 'refresh' },
        ),
    ],
    [
      'an unknown jti',
      () =>
        signJwt(
          ctx,
          { ...claims(), jti: new Types.ObjectId().toHexString() },
          { secret: 'refresh' },
        ),
    ],
  ];

  it.each(cases)('12. %s → 401, no cookies set', async (_name, token) => {
    const res = await refresh(ctx.server, await token());
    expectSessionExpired(res);
    expectNoCookies(res);
  });

  it('12. a refresh token in the body, query or Authorization header is ignored', async () => {
    const res = await request(ctx.server)
      .post(`${AUTH}/refresh?refresh_token=${session.refresh}`)
      .set('Origin', ORIGIN)
      .set('Authorization', `Bearer ${session.refresh}`)
      .send({ refresh_token: session.refresh });
    expectSessionExpired(res);
    expectNoCookies(res);
  });

  it('12. the untouched session still works afterwards (no side effects)', async () => {
    expectRotated(await refresh(ctx.server, session.refresh));
  });
});

describe('reuse detection and grace window (tests 13, 14, 15)', () => {
  const ctx = useApp();

  it('13. rotated token presented after the grace window → 401, cookies cleared, family revoked', async () => {
    const { refresh: tokenA } = await newSession(ctx);
    const tokenB = cookieValue(
      await refresh(ctx.server, tokenA),
      'refresh_token',
    );
    await rotatedSecondsAgo(ctx, tokenA, 60);

    const res = await refresh(ctx.server, tokenA);
    expectSessionExpired(res);
    expectCleared(res);

    const { fid } = jwtPayload(tokenA);
    expect(await activeInFamily(ctx, fid)).toBe(0);
    const revoked = await sessionOf(ctx, tokenB);
    expect(revoked?.revokedAt).toBeInstanceOf(Date);

    const withB = await refresh(ctx.server, tokenB);
    expectSessionExpired(withB);
    expectNoCookies(withB);
  });

  it('14. rotated token presented again immediately → 200, no Set-Cookie, family intact', async () => {
    const { refresh: tokenA } = await newSession(ctx);
    const tokenB = cookieValue(
      await refresh(ctx.server, tokenA),
      'refresh_token',
    );

    const res = await refresh(ctx.server, tokenA);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Access token refreshed.' });
    expectNoCookies(res);

    const { fid } = jwtPayload(tokenA);
    expect(await activeInFamily(ctx, fid)).toBe(2);
    expect(await sessions(ctx).countDocuments({ familyId: fid })).toBe(2);
    expectRotated(await refresh(ctx.server, tokenB));
  });

  it('14. window edges: rotated 9 s ago → grace (200, no cookies); 11 s ago → reuse (401)', async () => {
    const { refresh: tokenA } = await newSession(ctx);
    await refresh(ctx.server, tokenA);
    const { fid } = jwtPayload(tokenA);

    await rotatedSecondsAgo(ctx, tokenA, 9);
    const grace = await refresh(ctx.server, tokenA);
    expect(grace.status).toBe(200);
    expectNoCookies(grace);
    expect(await activeInFamily(ctx, fid)).toBe(2);

    await rotatedSecondsAgo(ctx, tokenA, 11);
    const reuse = await refresh(ctx.server, tokenA);
    expectSessionExpired(reuse);
    expectCleared(reuse);
    expect(await activeInFamily(ctx, fid)).toBe(0);
  });

  it('15. two concurrent refreshes with the same token → one rotates, one is a grace duplicate', async () => {
    const { refresh: tokenA } = await newSession(ctx);
    const responses = await Promise.all([
      refresh(ctx.server, tokenA),
      refresh(ctx.server, tokenA),
    ]);

    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    const withCookies = responses.filter((r) => r.get('Set-Cookie'));
    expect(withCookies).toHaveLength(1);
    expectRotated(withCookies[0] as Response);

    const { fid } = jwtPayload(tokenA);
    expect(await sessions(ctx).countDocuments({ familyId: fid })).toBe(2);
    expect(await activeInFamily(ctx, fid)).toBe(2);
  });
});

describe('refresh for a deleted user (specs/04 §4.4 step 3)', () => {
  const ctx = useApp();

  it('user removed after the token was issued → 401 and the family is revoked', async () => {
    const { refresh: token, email } = await newSession(ctx, 'deleted');
    await ctx.connection.collection('users').deleteOne({ email });

    const res = await refresh(ctx.server, token);
    expectSessionExpired(res);
    expectNoCookies(res);
    expect(await activeInFamily(ctx, jwtPayload(token).fid)).toBe(0);
  });
});

describe('logout device isolation (test 16)', () => {
  const ctx = useApp();

  it('16. device isolation: logging out F1 leaves F2 working', async () => {
    const { email, refresh: fromSignup } = await newSession(ctx, 'devices');
    const f1 = await signin(ctx.server, { email, password: PASSWORD });
    const f2 = await signin(ctx.server, { email, password: PASSWORD });
    const f1Token = cookieValue(f1, 'refresh_token');
    const f2Token = cookieValue(f2, 'refresh_token');
    expect(jwtPayload(f1Token).fid).not.toBe(jwtPayload(f2Token).fid);

    expect((await logout(ctx.server, f1Token)).status).toBe(200);

    expectSessionExpired(await refresh(ctx.server, f1Token));
    expectRotated(await refresh(ctx.server, f2Token));
    expectRotated(await refresh(ctx.server, fromSignup));
  });

  it('18. logging out twice with the same cookie → 200 both times', async () => {
    const { refresh: token } = await newSession(ctx);
    expect((await logout(ctx.server, token)).status).toBe(200);
    const again = await logout(ctx.server, token);
    expect(again.status).toBe(200);
    expectCleared(again);
  });
});

describe('logout (tests 17, 18)', () => {
  const ctx = useApp();

  it('17. logout → 200, both cookies cleared with matching attributes, family revoked', async () => {
    const { refresh: tokenA } = await newSession(ctx);
    // Revoke a family with more than one session in it.
    const tokenB = cookieValue(
      await refresh(ctx.server, tokenA),
      'refresh_token',
    );

    const res = await logout(ctx.server, tokenB);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Logged out successfully.' });
    expectCleared(res);

    const { fid } = jwtPayload(tokenB);
    expect(await sessions(ctx).countDocuments({ familyId: fid })).toBe(2);
    expect(await activeInFamily(ctx, fid)).toBe(0);
    expectSessionExpired(await refresh(ctx.server, tokenB));
  });

  it.each([
    ['no cookie', undefined],
    ['a garbage cookie', 'garbage'],
    ['an access token', 'ACCESS'],
  ])(
    '18. logout with %s → 200 and cookies cleared (idempotent)',
    async (_name, token) => {
      const session = await newSession(ctx);
      const res = await logout(
        ctx.server,
        token === 'ACCESS' ? session.access : token,
      );
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'Logged out successfully.' });
      expectCleared(res);
      // Nothing was revoked.
      expect(await activeInFamily(ctx, jwtPayload(session.refresh).fid)).toBe(
        1,
      );
    },
  );
});

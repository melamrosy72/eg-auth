import request from 'supertest';
import {
  AUTH,
  expectErrorResponse,
  ORIGIN,
  PASSWORD,
  uniqueEmail,
  useApp,
} from './helpers.js';

// specs/06 §1.3 tests 19–21 and 23–25 (22 is in logging.e2e-spec.ts). Test 23 (no
// passwordHash or JWT in any body) runs inside the shared post() helper, so every
// signup/signin/refresh/logout response in every e2e file is checked.

const UNSAFE_ROUTES = ['/signup', '/signin', '/refresh', '/logout'];

describe('origin check (test 19)', () => {
  const ctx = useApp();

  it.each(
    UNSAFE_ROUTES.flatMap((path) => [
      [path, 'http://evil.example'],
      [path, 'http://localhost:5174'],
      [path, undefined],
    ]),
  )('19. POST %s with Origin %s → 403', async (path, origin) => {
    let req = request(ctx.server).post(`${AUTH}${path}`);
    if (origin !== undefined) req = req.set('Origin', origin);
    const res = await req.send({});
    expectErrorResponse(res, 403);
    expect(res.body.message).toBe('Invalid request origin');
    expect(res.get('Set-Cookie')).toBeUndefined();
  });
});

describe('rate limits (test 20)', () => {
  const ctx = useApp();
  const hit = (path: string) =>
    request(ctx.server).post(`${AUTH}${path}`).set('Origin', ORIGIN).send({});

  it.each([
    ['/signup', 5],
    ['/signin', 10],
    ['/refresh', 30],
  ])('20. POST %s allows %i requests, then 429', async (path, limit) => {
    for (let i = 0; i < limit; i++) {
      // Invalid bodies (400) / no cookie (401) still count: the throttler runs first.
      expect((await hit(path)).status).not.toBe(429);
    }
    const res = await hit(path);
    expectErrorResponse(res, 429);
    expect(res.body.message).toBe('Too many requests, please try again later');
  });
});

describe('throttler client IP (test 21)', () => {
  const ctx = useApp();

  it('21. TRUST_PROXY_HOPS=0: spoofed X-Forwarded-For values share one signin limit', async () => {
    const body = { email: uniqueEmail('spoof'), password: PASSWORD };
    for (let i = 1; i <= 10; i++) {
      const res = await request(ctx.server)
        .post(`${AUTH}/signin`)
        .set('Origin', ORIGIN)
        .set('X-Forwarded-For', `203.0.113.${i}`)
        .send(body);
      expect(res.status).toBe(401);
    }
    const res = await request(ctx.server)
      .post(`${AUTH}/signin`)
      .set('Origin', ORIGIN)
      .set('X-Forwarded-For', '198.51.100.77')
      .send(body);
    expectErrorResponse(res, 429);
  });
});

describe('health and versioning (tests 24, 25)', () => {
  const ctx = useApp();

  it('24. /api/health → 200 with mongodb up', async () => {
    const res = await request(ctx.server).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.info.mongodb.status).toBe('up');
  });

  it(`25. ${AUTH}/me without a cookie → 401`, async () => {
    expectErrorResponse(await request(ctx.server).get(`${AUTH}/me`), 401);
  });

  it('25. unversioned /api/auth/me → 404', async () => {
    expectErrorResponse(await request(ctx.server).get('/api/auth/me'), 404);
  });

  it('25. /api/v1/health → 404 (health is version-neutral)', async () => {
    expectErrorResponse(await request(ctx.server).get('/api/v1/health'), 404);
  });
});

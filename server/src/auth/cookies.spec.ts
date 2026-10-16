import type { CookieOptions, Response } from 'express';
import { clearAuthCookies, setAuthCookies } from './cookies.js';

type Call = { name: string; options: CookieOptions };

function fakeResponse() {
  const set: Call[] = [];
  const cleared: Call[] = [];
  const res = {
    cookie: (name: string, _value: string, options: CookieOptions) =>
      set.push({ name, options }),
    clearCookie: (name: string, options: CookieOptions) =>
      cleared.push({ name, options }),
  } as unknown as Response;
  return { res, set, cleared };
}

const withoutExpiry = ({ maxAge: _m, expires: _e, ...rest }: CookieOptions) =>
  rest;

describe('auth cookies', () => {
  it.each([true, false])(
    'set and clear use identical options apart from expiry (secure=%s)',
    (secure) => {
      const { res, set, cleared } = fakeResponse();
      setAuthCookies(res, { accessToken: 'a', refreshToken: 'r' }, secure);
      clearAuthCookies(res, secure);

      expect(set.map((c) => c.name)).toEqual(['access_token', 'refresh_token']);
      expect(cleared.map((c) => c.name)).toEqual([
        'access_token',
        'refresh_token',
      ]);
      set.forEach((call, i) => {
        expect(withoutExpiry(cleared[i].options)).toEqual(
          withoutExpiry(call.options),
        );
        expect(call.options.secure).toBe(secure);
      });
    },
  );

  it('uses the attributes from specs/04 §4.6', () => {
    const { res, set } = fakeResponse();
    setAuthCookies(res, { accessToken: 'a', refreshToken: 'r' }, false);
    expect(set[0].options).toEqual({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: false,
      maxAge: 900_000,
    });
    expect(set[1].options).toEqual({
      httpOnly: true,
      sameSite: 'strict',
      path: '/api/v1/auth',
      secure: false,
      maxAge: 604_800_000,
    });
  });
});

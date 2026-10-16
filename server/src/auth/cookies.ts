import type { CookieOptions, Response } from 'express';
import {
  ACCESS_COOKIE,
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
  REFRESH_TOKEN_TTL_SECONDS,
} from './auth.constants.js';

export type AuthCookie = typeof ACCESS_COOKIE | typeof REFRESH_COOKIE;

/**
 * The one place cookie options are built (specs/04 §4.6). Setting and clearing both use it,
 * because a cookie only clears when path, sameSite, secure and httpOnly match.
 */
export function cookieOptions(
  name: AuthCookie,
  secure: boolean,
): CookieOptions {
  return name === ACCESS_COOKIE
    ? { httpOnly: true, sameSite: 'lax', path: '/', secure }
    : { httpOnly: true, sameSite: 'strict', path: REFRESH_COOKIE_PATH, secure };
}

export type AuthTokens = { accessToken: string; refreshToken: string };

export function setAuthCookies(
  res: Response,
  tokens: AuthTokens,
  secure: boolean,
): void {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...cookieOptions(ACCESS_COOKIE, secure),
    maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...cookieOptions(REFRESH_COOKIE, secure),
    maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
}

/** Express sets an expiry in the past; used by logout and reuse detection (Phase 3). */
export function clearAuthCookies(res: Response, secure: boolean): void {
  res.clearCookie(ACCESS_COOKIE, cookieOptions(ACCESS_COOKIE, secure));
  res.clearCookie(REFRESH_COOKIE, cookieOptions(REFRESH_COOKIE, secure));
}

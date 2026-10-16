// specs/04 §4.1: constants in code, not env.
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 3600;
export const REFRESH_REUSE_GRACE_SECONDS = 10;

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';
// Tied to v1 on purpose (specs/04 §4.6): a future v2 re-scopes it and needs one re-sign-in.
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

// specs/04 §6: per-route limits on top of the global default.
export const SIGNUP_THROTTLE = { default: { limit: 5, ttl: 60_000 } };
export const SIGNIN_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

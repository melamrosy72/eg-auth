import { validateEnv } from './env.schema.js';

const ACCESS_SECRET = 'access-secret-access-secret-access-secret-1';
const REFRESH_SECRET = 'refresh-secret-refresh-secret-refresh-secret-2';

const validEnv = (): Record<string, unknown> => ({
  MONGODB_URI: 'mongodb://127.0.0.1:27017/easygen_auth',
  JWT_ACCESS_SECRET: ACCESS_SECRET,
  JWT_REFRESH_SECRET: REFRESH_SECRET,
  FRONTEND_ORIGINS: 'http://localhost:5173',
  COOKIE_SECURE: 'false',
});

function errorOf(config: Record<string, unknown>): string {
  try {
    validateEnv(config);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('expected validateEnv to throw');
}

describe('validateEnv', () => {
  it('parses a valid environment and applies defaults', () => {
    expect(validateEnv(validEnv())).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      MONGODB_URI: 'mongodb://127.0.0.1:27017/easygen_auth',
      JWT_ACCESS_SECRET: ACCESS_SECRET,
      JWT_REFRESH_SECRET: REFRESH_SECRET,
      FRONTEND_ORIGINS: ['http://localhost:5173'],
      COOKIE_SECURE: false,
      TRUST_PROXY_HOPS: 0,
      LOG_LEVEL: 'info',
      SWAGGER_ENABLED: true,
    });
  });

  it('parses COOKIE_SECURE=false to boolean false and "true" to true', () => {
    expect(validateEnv(validEnv()).COOKIE_SECURE).toBe(false);
    expect(
      validateEnv({ ...validEnv(), COOKIE_SECURE: 'true' }).COOKIE_SECURE,
    ).toBe(true);
    expect(
      validateEnv({ ...validEnv(), SWAGGER_ENABLED: 'false' }).SWAGGER_ENABLED,
    ).toBe(false);
  });

  it('splits and trims a comma-separated origin list', () => {
    const env = validateEnv({
      ...validEnv(),
      FRONTEND_ORIGINS: 'http://localhost:5173 , https://app.example.com',
    });
    expect(env.FRONTEND_ORIGINS).toEqual([
      'http://localhost:5173',
      'https://app.example.com',
    ]);
  });

  it.each(['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'MONGODB_URI'])(
    'fails when %s is missing',
    (key) => {
      const config = validEnv();
      delete config[key];
      expect(errorOf(config)).toContain(key);
    },
  );

  it.each(['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'])(
    'fails when %s is shorter than 32 characters',
    (key) => {
      expect(errorOf({ ...validEnv(), [key]: 'x'.repeat(31) })).toContain(
        `${key}: must be at least 32 characters`,
      );
    },
  );

  it('fails when the two secrets are equal', () => {
    expect(
      errorOf({ ...validEnv(), JWT_REFRESH_SECRET: ACCESS_SECRET }),
    ).toContain('JWT_REFRESH_SECRET: must differ from JWT_ACCESS_SECRET');
  });

  it('fails when COOKIE_SECURE is missing (no default)', () => {
    const config = validEnv();
    delete config.COOKIE_SECURE;
    expect(errorOf(config)).toContain('COOKIE_SECURE');
  });

  it.each(['yes', '1', 'TRUE', ''])(
    'fails when COOKIE_SECURE is %j',
    (value) => {
      expect(errorOf({ ...validEnv(), COOKIE_SECURE: value })).toContain(
        'COOKIE_SECURE',
      );
    },
  );

  it.each([
    '*',
    'http://localhost:5173/',
    'http://localhost:5173/app',
    'localhost:5173',
    'http://localhost:5173,*',
    '',
  ])('fails when FRONTEND_ORIGINS is %j', (value) => {
    expect(errorOf({ ...validEnv(), FRONTEND_ORIGINS: value })).toContain(
      'FRONTEND_ORIGINS',
    );
  });

  it.each([
    ['TRUST_PROXY_HOPS', '3'],
    ['TRUST_PROXY_HOPS', '-1'],
    ['PORT', 'abc'],
    ['NODE_ENV', 'staging'],
    ['LOG_LEVEL', 'verbose'],
    ['MONGODB_URI', 'postgres://localhost/db'],
  ])('fails when %s is %j', (key, value) => {
    expect(errorOf({ ...validEnv(), [key]: value })).toContain(key);
  });

  it('never includes a received value in the error message', () => {
    const shortSecret = 'short-secret-value-123';
    const message = errorOf({
      ...validEnv(),
      JWT_ACCESS_SECRET: shortSecret,
      JWT_REFRESH_SECRET: shortSecret,
      MONGODB_URI: 'not-a-uri-with-password-hunter2',
      COOKIE_SECURE: 'maybe-secret',
    });
    expect(message).toContain('JWT_ACCESS_SECRET');
    expect(message).not.toContain(shortSecret);
    expect(message).not.toContain('hunter2');
    expect(message).not.toContain('maybe-secret');
  });

  it('does not leak equal valid secrets in the error message', () => {
    const message = errorOf({
      ...validEnv(),
      JWT_REFRESH_SECRET: ACCESS_SECRET,
    });
    expect(message).not.toContain(ACCESS_SECRET);
  });
});

// Runs before every e2e file (setupFiles) and in globalSetup, before AppModule is
// imported: ConfigModule.forRoot validates the environment at import time.
// process.env wins over server/.env, so the dev database is never used here.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/easygen_auth_test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-0123456789-abcdefghij';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-0123456789-abcdefghij';
process.env.FRONTEND_ORIGINS = 'http://localhost:5173';
process.env.COOKIE_SECURE = 'false';
process.env.TRUST_PROXY_HOPS = '0';
process.env.LOG_LEVEL ??= 'silent';

/** Safety guard: integration tests only ever touch a database named *_test. */
export function assertTestDatabase(name: string): void {
  if (!name.endsWith('_test')) {
    throw new Error(
      `Refusing to run integration tests against database "${name}": its name must end in _test`,
    );
  }
}

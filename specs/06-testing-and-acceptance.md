# 06 — Testing and Acceptance

## 1. Backend (Jest and Supertest)

### 1.1 Test infrastructure
- Integration tests run against a **real** MongoDB at `MONGODB_URI`.
- **Safety guard:** the test setup aborts unless the database name ends in `_test` (for example `mongodb://127.0.0.1:27017/easygen_auth_test`). It drops that database before the suite runs and never touches any other.
- After the app boots, call `await connection.syncIndexes()` (or `Model.init()` for `User` and `RefreshSession`) **before any test runs**. Otherwise the duplicate-email test races index creation and becomes flaky.
- Provide a `createTestApp()` helper that boots the real `AppModule` with test environment variables (`FRONTEND_ORIGINS=http://localhost:5173`, `COOKIE_SECURE=false`, `TRUST_PROXY_HOPS=0`).
  - Each `describe` block gets its own app instance, so throttler state is isolated.
  - Keep each block under the rate limits. A dedicated block tests the 429 behaviour.
- Every unsafe-method request sends `Origin: http://localhost:5173` unless the test is checking the origin check itself.
- To create expired or wrong-purpose tokens, sign them in the test with `JwtService` (for example `expiresIn: -10`, or the wrong secret or `token_use`).
- To simulate time passing for the grace window, update `rotatedAt` directly in the database instead of sleeping.

### 1.2 Unit tests (mocked dependencies)
- `AuthService.signup`:
  - hashes with argon2id;
  - returns a safe user without `passwordHash`;
  - Mongo error `11000` → `ConflictException`.
- `AuthService.signin`:
  - unknown email → 401, **and `argon2.verify` was still called** (dummy hash);
  - wrong password → the same 401 message;
  - success returns the user.
- DTO validation, table-driven with `class-validator`'s `validate()` after `plainToInstance`:
  - Password **accepts**: `abc12345!`, `مرحبا123!`, `abc 1234` (space as the special character).
  - Password **rejects**: `abcdefgh`, `12345678!`, `abcdefg1`, `a1!`, and a 129-character string. Each failure has the correct message.
  - Emoji length is counted in code points: `'a1' + '😀'.repeat(6)` (8 code points, 14 code units) is accepted; `'a1' + '😀'.repeat(126)` (128 code points) is accepted; `'a1' + '😀'.repeat(127)` (129 code points) is rejected with `Password must be at most 128 characters`.
  - A password containing a newline, `"abc1234\n"`, is accepted (the newline counts as special).
  - Name: `"  ab  "` fails; `"  abc "` passes and is trimmed to `abc`.
  - Email `"  A@X.com "` becomes `a@x.com`.
  - Signin accepts `short` as a password (no policy check) and rejects an empty password.
- `OriginGuard`: exact match passes; mismatch, missing, `null`, or a different port → 403; `GET` requests are not checked.
- Cookie helper: the options for set and clear are identical apart from `maxAge`/`expires`, and `secure` follows `COOKIE_SECURE`.
- Env schema:
  - fails when a secret is missing;
  - fails when a secret is shorter than 32 characters;
  - fails when the two secrets are equal;
  - fails when `COOKIE_SECURE` is missing;
  - fails when `FRONTEND_ORIGINS` contains `*`, a path, or a trailing slash;
  - `COOKIE_SECURE=false` parses to boolean `false` (guards against the `z.coerce.boolean()` bug);
  - the thrown error message never contains a secret value.

### 1.3 Integration tests
**Signup / signin / me:**
1. Valid signup → 201 `{ user }`.
   - `Set-Cookie` contains `access_token` (`HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=900`) and `refresh_token` (`HttpOnly`, `SameSite=Strict`, `Path=/api/auth`, `Max-Age=604800`).
   - The body contains no `password`, `passwordHash`, or JWT.
2. Invalid email / short trimmed name / each missing password category → 400 with the `ErrorResponse` shape and the exact message.
3. Unknown body property → 400.
4. Duplicate signup → 409. A case variant (`MAHMOUD@Example.com`) → 409.
5. Concurrent duplicate signups (`Promise.all` of 2) → exactly one 201 and one 409.
6. Valid signin → 200 `{ user }` with both cookies.
7. Wrong password and unknown email → 401 with an identical body `message`.
8. `/api/auth/me`:
   - no cookie → 401;
   - tampered token → 401;
   - expired token → 401;
   - a **refresh** token placed in the `access_token` cookie → 401;
   - a valid cookie → 200 `{ user }` with the correct user;
   - a valid cookie for a user deleted from the database → 401.
9. A `Bearer` header with a valid access token and no cookie → 401 (Bearer is not an auth path).

**Refresh and rotation:**

10. Valid refresh → 200.
    - New `access_token` **and** new `refresh_token` cookies; the new refresh JWT has a different `jti` and the same `fid`.
    - The old session has `rotatedAt` and `replacedByJti` set.
11. The new refresh token works on a second refresh (the chain continues).
12. Refresh with: missing cookie / malformed / wrong secret / expired / an **access** token in the `refresh_token` cookie → 401, with no `access_token` set.
13. **Reuse detection:** rotate A → B; push A's `rotatedAt` back by 60 s in the database; present A.
    - The response is 401 with both cookies cleared.
    - Every session in the family is revoked, so presenting B now → 401.
14. **Grace window:** rotate A → B, then immediately present A → 200 with **no** `Set-Cookie`; the family is not revoked and B still works.
15. **Concurrent refresh:** `Promise.all` of 2 refreshes using the same token.
    - Exactly one response sets new cookies; the other is 200 without cookies.
    - Exactly one new session document is created, and the family stays active.
16. **Device isolation:** sign in twice (families F1 and F2), log out using F1's cookie. F1's refresh → 401; F2's refresh → 200.

**Logout:**

17. Logout → 200.
    - Both cookies are cleared with matching `Path`/`SameSite` and `Max-Age=0` (or an expiry date in the past).
    - The family is revoked in the database.
18. Logout with no cookies or a garbage cookie → 200 (idempotent).

**Origin, rate limiting, logging, health:**

19. A `POST` to signup, signin, refresh, and logout with a mismatched or missing `Origin` → 403 `Invalid request origin`.
20. Signup returns 429 on its 6th request in a window. Signin returns 429 on its 11th. Refresh returns 429 on its 31st.
21. With `TRUST_PROXY_HOPS=0`, signin requests with different spoofed `X-Forwarded-For` values still share one limit.
22. **Log redaction:** capture Pino output (inject a test destination stream) during a signin. The captured output contains no password, no cookie value, and no JWT.
23. Responses never contain `passwordHash` or a JWT. Assert this across the bodies from the tests above.
24. `/api/health` → 200 with `mongodb: up`.

## 2. Frontend (Vitest, React Testing Library, jsdom)

**HTTP mocking:** don't use MSW or `axios-mock-adapter`. Tests replace the Axios instance's `adapter` with a scripted fake function, so the real interceptors run. API-module-level `vi.mock` is allowed for form tests.

1. Signup validation shows the exact messages from `04` §1, and the checklist rows update as the user types (including the `مرحبا123!` case).
2. Signin validates email format and a non-empty password only. A short password is not rejected.
3. While pending, the submit button is disabled and a double click sends only one request.
4. Successful signup and successful signin each navigate to `/app` and render `Welcome to the application.`
5. Signin 401 → a generic alert, the email is kept, the password is cleared. **No refresh call is made.**
6. Signup 409 → the error appears under the email field.
7. Direct `/app` with `/me` 401 and refresh 401 → redirect to `/signin`.
8. `/me` 500 or a network error → a retry panel, not a redirect. Clicking retry calls `/me` again.
9. **Interceptor:**
   - 401 → refresh → retry once → success.
   - Three concurrent 401s → exactly **one** refresh call, then three retries.
   - Refresh 401 → auth cleared, no loop.
   - Refresh 503 → auth **not** cleared.
   - A retried request that returns 401 again → no second refresh.
10. Logout clears auth state and navigates to `/signin`, even when the logout request fails.
11. After any flow, `localStorage` and `sessionStorage` are empty and no token appears in context state.

## 3. Required scripts

Both apps provide `lint`, `typecheck` (`tsc --noEmit` / `tsc -b`), `test`, and `build`. The server also provides `test:e2e` and `test:cov`. The client also provides `dev` and `preview`.

## 4. Acceptance checklist

- [ ] Node 22 / npm documented; separate committed lockfiles; strict TS in both apps.
- [ ] Every field rule in `04` §1 enforced identically on server and client, with identical messages.
- [ ] Signup stores an Argon2id hash. No hash, password, or JWT appears in any response, log line, or Swagger example.
- [ ] Unknown email and wrong password are indistinguishable by message and by code path (dummy hash).
- [ ] Duplicate emails → 409, including case variants and concurrent requests.
- [ ] Access cookie 15 minutes and refresh cookie 7 days, with exactly the attributes in `04` §4.6.
- [ ] Refresh rotates on every use; reuse after the grace window revokes the family; the grace window issues no cookies.
- [ ] Logout revokes the family and clears both cookies; other devices are unaffected.
- [ ] Routes protected by default; `/api/auth/me` returns 401 without a valid access cookie; Bearer is not accepted.
- [ ] `OriginGuard`, exact-origin CORS, Helmet, throttling with the correct client IP behind Nginx, and redacted Pino logs are all in place.
- [ ] Every error uses `ErrorResponse` with a `requestId`.
- [ ] Frontend: no flash of protected content; single-flight refresh; no refresh on a signin 401; no tokens in JS.
- [ ] All tests, lint, typecheck, and build pass locally and in CI, with counts reported.
- [ ] `docker compose up --build` works from a clean clone at `http://localhost:8080`.
- [ ] README complete; AI.md headings present; `docs/ai-log.md` contains an entry for every phase.
- [ ] No `.env`, secrets, `node_modules`, `dist`, coverage, or DB data committed.

## 5. Manual browser checks (report honestly whether each one was performed)

- [ ] The full flow works in Compose at `:8080`.
- [ ] DevTools shows both cookies `HttpOnly`, with the expected Path, SameSite, and Max-Age.
- [ ] Deleting the `access_token` cookie in DevTools and reloading `/app` still works (a refresh happens).
- [ ] Reloading `/app` while signed in shows no flash of the signin page.
- [ ] Swagger at `/api/docs` and health at `/api/health` are both reachable through Nginx.

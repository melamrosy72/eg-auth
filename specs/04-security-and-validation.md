# 04 — Security and Validation

This file is the single source for every security mechanism. Other files reference sections here.

## 1. Field validation (identical on server DTOs and client Zod schemas)

| Field | Signup | Signin |
|---|---|---|
| `email` | trim → lowercase → valid email → max 254 | trim → lowercase → valid email → max 254 |
| `name` | trim → min 3 → max 50 | — |
| `password` | min 8, max 128, passes every `PASSWORD_RULES` check | min 1, max 128. **No policy check.** |

```ts
// The only password-policy implementation, on server and client. Unicode-aware; requires the `u` flag.
// Length is counted in code points ([...v].length), not UTF-16 code units.
export const PASSWORD_RULES = {
  length:  (v: string) => { const n = [...v].length; return n >= 8 && n <= 128; },
  letter:  (v: string) => /\p{L}/u.test(v),
  number:  (v: string) => /\p{N}/u.test(v),
  special: (v: string) => /[^\p{L}\p{N}]/u.test(v),
};
```

Semantics:
- "Letter" means any Unicode letter, so Arabic and accented letters count.
- "Special" means anything that is neither a letter nor a number, **including whitespace and newlines**. This is a deliberate choice and must be documented in the README.
- Every password length (signup min/max, signin min/max) is counted in code points on both server and client, so an emoji counts as one character.

Rules:
- **Never trim or normalise passwords.**
- **Signin skips the policy check.** If the policy changes later, existing users can still sign in, and the error response doesn't reveal the policy.
- The 128-character password cap and the 10kb body limit (`02` §2) bound Argon2 CPU cost for each request.
- **Do not use `@IsStrongPassword()`.** Its defaults require both upper and lower case, which is stricter than this spec.
- On the server, use the per-rule checks with exactly these messages, so the client and server show the same text:
  - `Please enter a valid email address`
  - `Name must be at least 3 characters`
  - `Name must be at most 50 characters`
  - `Password must be at least 8 characters`
  - `Password must be at most 128 characters`
  - `Password must contain at least one letter`
  - `Password must contain at least one number`
  - `Password must contain at least one special character`
  - `Password is required` (signin)
- Cases without a dedicated message:
  - An email longer than 254 characters → `Please enter a valid email address`.
  - A missing or non-string field → that field's first rule message: email → `Please enter a valid email address`, name → `Name must be at least 3 characters`, signup password → `Password must be at least 8 characters`, signin password → `Password is required`.
- Apply `@Transform` trimming and lowercasing **before** the length checks, so `"   ab  "` fails on name.

## 2. Passwords and users

- Hash with Argon2id (`argon2.hash(pw, { type: argon2.argon2id })`, library defaults otherwise).
- `passwordHash` uses `select: false`. Load it explicitly only for signin (`.select('+passwordHash')`).
- **Duplicate emails:**
  - Insert directly and map Mongo error `11000` to `ConflictException('Email is already registered')`.
  - A `findOne` pre-check is optional and for UX only; the unique index is what enforces uniqueness, including under concurrent requests.
- The unique index on `email` must exist before integration tests run (see `06` §1.1). Note in the README that production would manage indexes through migrations, not Mongoose `autoIndex`.

## 3. Signin enumeration and timing

- Unknown email and wrong password return the same 401 with the same message.
- **If the email is unknown, still run `argon2.verify` against a dummy hash** created once in `onModuleInit` (the hash of a random string). This keeps both paths at the same cost.
- Known trade-off, documented in the README: signup returning 409 does reveal that an email is registered. This is accepted for UX and mitigated by rate limiting.

## 4. Tokens, refresh sessions and rotation

### 4.1 Constants (in code, not env)

```ts
ACCESS_TOKEN_TTL_SECONDS  = 15 * 60;        // 15 minutes
REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 3600;  // 7 days, sliding: each rotation issues a fresh 7-day token
REFRESH_REUSE_GRACE_SECONDS = 10;
```

### 4.2 JWTs

- Algorithm HS256. Every verification passes `algorithms: ['HS256']`.
- **Access JWT:**
  - Signed with `JWT_ACCESS_SECRET`.
  - Claims: `{ sub: userId, token_use: 'access' }`, `exp` = 15 minutes.
- **Refresh JWT:**
  - Signed with `JWT_REFRESH_SECRET`.
  - Claims: `{ sub: userId, token_use: 'refresh', jti: <uuid v4>, fid: <family uuid v4> }`, `exp` = 7 days.
- Each strategy rejects any token whose `token_use` doesn't match. Because the secrets are separate, a cross-use token fails at both the signature check and the claim check.
- Claims never include the email, name, password hash, or any other user data.

### 4.3 `RefreshSession` collection (one document per issued refresh token)

```ts
RefreshSession {
  jti: string;            // unique index
  familyId: string;       // index; one family per signin/signup ("device session")
  userId: ObjectId;       // index
  expiresAt: Date;        // TTL index (expireAfterSeconds: 0) → Mongo deletes expired docs
  rotatedAt?: Date;       // set when this token was exchanged for a new one
  replacedByJti?: string;
  revokedAt?: Date;       // set on logout or reuse detection
  createdAt: Date;
}
```

- Store only the `jti`, never the token itself. Without the refresh secret, a `jti` is useless.
- **Signup and signin** create a new `familyId` and the first session document, then set both cookies.

### 4.4 `POST /api/v1/auth/refresh` algorithm (atomic, no transactions)

1. `JwtRefreshStrategy` verifies the signature, expiry, and `token_use === 'refresh'`, and extracts `{ sub, jti, fid }`. Any failure → 401.
2. Claim the token atomically:
   ```ts
   const claimed = await RefreshSession.findOneAndUpdate(
     { jti, revokedAt: null, rotatedAt: null, expiresAt: { $gt: now } },
     { $set: { rotatedAt: now, replacedByJti: newJti } },
     { new: true },
   );
   ```
3. **If `claimed` is set:**
   - Confirm the user still exists; if not, revoke the family and return 401.
   - Insert a new session document `{ jti: newJti, familyId: fid, userId, expiresAt: now + 7d }`.
   - Set the new `access_token` and `refresh_token` cookies and return 200.
4. **If `claimed` is null**, load the session by `jti` and decide:

   | Session state | Meaning | Action |
   |---|---|---|
   | not found, or `expiresAt <= now` | unknown or expired | 401, no side effects |
   | `revokedAt` set | already revoked | 401, no side effects |
   | `rotatedAt` set and `now - rotatedAt <= REFRESH_REUSE_GRACE_SECONDS` | **benign race**: another tab or request just rotated this token, and the browser already has (or is receiving) the new cookies | **200, no `Set-Cookie`**, no revocation |
   | `rotatedAt` set and older than the grace window | **reuse detected**: probable token theft | `updateMany({ familyId: fid, revokedAt: null }, { $set: { revokedAt: now } })`, clear both cookies, 401, and log a `warn` event `refresh_token_reuse_detected` with `userId` and `familyId` |

   The grace path gives an attacker nothing: no cookies are issued.
5. Why this order is safe without transactions:
   - The claim in step 2 is a single-document atomic update, so only one concurrent request can rotate a given `jti`.
   - If inserting the new session fails after the claim succeeds, the request returns 500 and the user has to sign in again. This is an acceptable failure mode; record it in the README limitations.

### 4.5 Logout and revocation

- Logout verifies the refresh cookie with `JwtService.verifyAsync`. **No guard**, because logout must succeed even with a bad cookie.
- If verification succeeds: `updateMany({ familyId: fid, revokedAt: null }, { $set: { revokedAt: now } })`.
- Always clear both cookies and return 200.
- Access tokens stay stateless. A copied access token remains valid for at most 15 minutes after logout. Document this; do not claim otherwise.
- Other devices (other families) are not affected by logout.

### 4.6 Cookies (one helper builds these options for both set and clear)

| Cookie | HttpOnly | SameSite | Path | Max-Age | Secure |
|---|---|---|---|---|---|
| `access_token` | yes | `Lax` | `/` | 900 s | `COOKIE_SECURE` |
| `refresh_token` | yes | `Strict` | `/api/v1/auth` | 604800 s | `COOKIE_SECURE` |

- The refresh cookie is only ever sent by same-origin XHR, so `Strict` costs nothing and also blocks cross-site top-level navigation.
- `Path=/api/v1/auth` keeps the refresh cookie off every other request. It still reaches `/refresh` and `/logout`.
- The refresh cookie path is tied to `v1` on purpose, to keep its exposure minimal. A future `v2` would re-scope it (e.g. `/api/v2/auth`); existing refresh cookies would not reach the new path, so each user would sign in once again.
- Clearing a cookie must use the same `path`, `sameSite`, `secure`, and `httpOnly` values it was set with. Otherwise the browser keeps it.
- Frontend JavaScript never reads, writes, or holds either token.

## 5. CSRF and origin protection

Defences are layered:
1. `SameSite` cookies (§4.6).
2. A same-origin deployment (Vite proxy in dev, Nginx in Compose).
3. `OriginGuard`.

`OriginGuard`, a global guard:
- Applies to `POST`, `PUT`, `PATCH`, and `DELETE`.
- Allows the request only if the `Origin` header **exactly** matches an entry in `FRONTEND_ORIGINS`.
- A missing, `null`, malformed, or mismatched Origin → 403 `Invalid request origin`.
- There is no bypass for a missing Origin. Non-browser clients must send `Origin` explicitly. Document this in the README, e.g. `curl -H "Origin: http://localhost:5173" ...`.

CORS:
- `origin` is the exact `FRONTEND_ORIGINS` list, with `credentials: true`. Never use a wildcard.
- CORS is not a CSRF defence on its own.

## 6. Rate limiting

- `@nestjs/throttler` with in-memory storage (single instance; this is not distributed, so say so in the README).
- Limits:

  | Scope | Limit |
  |---|---|
  | Global default | 100 / 60 s per IP |
  | `POST /auth/signup` | 5 / 60 s |
  | `POST /auth/signin` | 10 / 60 s |
  | `POST /auth/refresh` | 30 / 60 s |
  | Health | `@SkipThrottle()` |

- **Client IP behind Nginx:**
  - Set `app.set('trust proxy', TRUST_PROXY_HOPS)`. Compose uses `1`; local dev uses `0`.
  - The throttler tracker must be `req.ip`. Check the installed `ThrottlerGuard.getTracker`. If it uses `req.ips[0]` or reads `X-Forwarded-For` directly, override it to return `req.ip`. Otherwise a spoofed `X-Forwarded-For` bypasses the limit.
  - Without `trust proxy`, every request appears to come from Nginx's IP, so one attacker locks out every user.

## 7. Errors and logging

**Global exception filter:**
- Produces `ErrorResponse` (`03` §1) for every error, including validation, 404, 429, and 500.
- Unknown errors return `Internal server error` with no stack trace or database detail. The stack is logged server-side only.

**`nestjs-pino`:**
- Request ID comes from an incoming `x-request-id` header if it is a valid UUID; otherwise generate one with `randomUUID()`.
- Echo the request ID as an `x-request-id` response header and include it in `ErrorResponse`.
- Redact at least:
  - `req.headers.cookie`
  - `req.headers.authorization`
  - `res.headers["set-cookie"]`
  - `*.password`, `*.passwordHash`
  - `*.access_token`, `*.refresh_token`, `*.accessToken`, `*.refreshToken`
- Never log request bodies on auth routes.
- `pino-pretty` in development only.

**Auth events:**
- `info`: `user_signed_up`, `user_signed_in`, `session_rotated`, `user_logged_out`, each with `userId` / `familyId`.
- `warn`: `signin_failed` (no email, no password) and `refresh_token_reuse_detected`.

## 8. Configuration and headers

- Zod env validation as described in `02` §5. Boot fails fast on invalid configuration.
- Helmet uses deliberate settings, adjusting only what Swagger UI needs.
- Secrets live only in environment files. Example files contain placeholders only.

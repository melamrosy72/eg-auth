# 03 — API Contracts

These contracts are the boundary between frontend and backend. All paths use the `/api` prefix. Bodies are JSON, and authentication travels only in cookies (`04` §4.6). Every endpoint, DTO, and error response is documented in Swagger.

## 1. Shared shapes

```ts
type SafeUser = { id: string; name: string; email: string };
type UserResponse = { user: SafeUser };        // used by signup, signin AND me
type MessageResponse = { message: string };
type ErrorResponse = {
  statusCode: number;
  error: string;                // e.g. "Bad Request"
  message: string | string[];   // string[] only for validation errors
  path: string;
  timestamp: string;            // ISO 8601
  requestId: string;
};
```

### Common errors

These apply to every endpoint where relevant and are not repeated per endpoint:

| Status | When | `message` |
|---|---|---|
| 400 | DTO validation failed or body has unknown properties | array of field messages (`04` §1) |
| 403 | `OriginGuard` rejected an unsafe-method request (`04` §5) | `Invalid request origin` |
| 429 | rate limit exceeded | `Too many requests, please try again later` |
| 500 | unexpected | `Internal server error` |

## 2. `POST /api/auth/signup` (public; origin-checked; throttled)

Request:
```json
{ "name": "Mahmoud", "email": "mahmoud@example.com", "password": "Example!123" }
```

**201** → `UserResponse`. Sets `access_token` and `refresh_token` (new session family).

Errors (in addition to the common ones):

| Status | `message` |
|---|---|
| 409 | `Email is already registered` |

## 3. `POST /api/auth/signin` (public; origin-checked; throttled)

Request:
```json
{ "email": "mahmoud@example.com", "password": "Example!123" }
```

**200** → `UserResponse`. Sets both cookies (new session family).

Errors (in addition to the common ones):

| Status | `message` |
|---|---|
| 401 | `Invalid email or password` (identical for unknown email and wrong password) |

## 4. `GET /api/auth/me` (protected by the access cookie)

**200** → `UserResponse` (the same `{ user }` envelope as signup and signin).

Errors (in addition to the common ones):

| Status | When |
|---|---|
| 401 | access cookie missing, malformed, bad signature, expired, wrong `token_use`, or user no longer exists |

Identity comes **only** from the verified JWT `sub`.

## 5. `POST /api/auth/refresh` (public route, guarded by `jwt-refresh`; origin-checked; throttled)

No request body. Uses only the `refresh_token` cookie. A refresh token sent in the body, query, or `Authorization` header is ignored.

**200** → `{ "message": "Access token refreshed." }`, in one of two cases:
- **Normal rotation:** sets a new `access_token` **and** a new `refresh_token` (same family, new `jti`).
- **Grace-window duplicate** (`04` §4.4): sets **no** cookies.

Errors (in addition to the common ones):

| Status | When | Side effects |
|---|---|---|
| 401 | refresh cookie missing, malformed, bad signature, expired, wrong `token_use`, unknown `jti`, or session revoked or expired | none |
| 401 | user no longer exists (after the token was claimed) | revoke the whole family (`04` §4.4 step 3) |
| 401 | **reuse detected** (a rotated token presented after the grace window) | revoke the whole family **and** clear both cookies |

The public message for every 401 here is `Session expired, please sign in again`.

## 6. `POST /api/auth/logout` (public; origin-checked)

No body. **200** → `{ "message": "Logged out successfully." }`. The endpoint is idempotent.
- If the refresh cookie is present and validly signed, revoke its family. Verification failures are ignored.
- Always clear both cookies, using the same options they were set with (`04` §4.6).

## 7. `GET /api/health` (public; not throttled)

**200** → Terminus result, e.g. `{ "status": "ok", "info": { "mongodb": { "status": "up" } }, "error": {}, "details": { ... } }`.

**503** when MongoDB is down. Never expose connection strings.

## 8. Swagger

- Available at `/api/docs` when `SWAGGER_ENABLED=true`.
- Cookie `apiKey` security schemes for `access_token` (on `/me`) and `refresh_token` (on `/refresh`). No Bearer scheme.
- Document the common errors, the 429 behaviour, both 401 cases on refresh, and the cookies that each endpoint sets or clears.
- Examples must never show real tokens or hashes.

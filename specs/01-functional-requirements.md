# 01 — Functional Requirements and User Flows

This file describes *what happens*. Field rules are in `04` §1, token and cookie mechanics in `04` §4–§5, HTTP shapes in `03`, and client behaviour in `05`.

## 1. Actors

There is one role: an unauthenticated visitor, who becomes an authenticated user.

## 2. Signup

1. The visitor opens `/signup` and enters name, email, and password.
2. The client validates the fields (`04` §1) and shows accessible field-level errors and a live password checklist.
3. The client sends `POST /api/v1/auth/signup`.
4. The server:
   - validates and normalises the input;
   - hashes the password with Argon2id;
   - inserts the user;
   - creates a new refresh-session family;
   - sets the `access_token` and `refresh_token` cookies.
5. The server returns `{ user }` (`03` §2). No token appears in JSON.
6. The client stores the user in memory and navigates to `/app`.

Failures:
- Invalid input → 400.
- Email already registered (after normalisation) → 409, shown on the email field.
- Rate limited → 429.
- Bad origin → 403.
- Unexpected error → 500 with a generic message.

The submit button stays disabled while the request is pending. Entered values are kept after recoverable errors.

## 3. Signin

1. The visitor opens `/signin` and enters email and password.
2. The client validates that the email is valid and the password is non-empty. **The password policy is not checked at signin** (`04` §1).
3. The client sends `POST /api/v1/auth/signin`.
4. The server normalises the email, verifies the password, creates a **new** refresh-session family (one per signin, so each device has its own), and sets both cookies.
5. The server returns `{ user }`. The client navigates to `state.from ?? '/app'`.

An unknown email and a wrong password produce the same 401 response and the same code path for timing (`04` §3).

## 4. Staying signed in (refresh and rotation)

1. The access cookie expires after 15 minutes. The next API call returns 401.
2. The Axios interceptor calls `POST /api/v1/auth/refresh` once (single-flight; see `05` §5).
3. The server validates the refresh token, **rotates** it (marks the old one used and issues a new refresh token plus a new access token), and returns 200.
4. The interceptor retries the original request once.
5. If refresh returns 401, the client clears its auth state and redirects to `/signin`.
6. If a refresh token that was already rotated is presented again after the grace window, the server treats it as theft. It revokes the **whole family**, clears the cookies, and returns 401 (`04` §4.4).

## 5. Protected page

- Route: `/app`. Displays exactly `Welcome to the application.`, plus `Signed in as {name}` and a Logout button.
- On entry the client calls `GET /api/v1/auth/me` and shows a loading state until it resolves. Protected content must never flash before the check completes.
- 401 (after the refresh attempt fails) → redirect to `/signin`.
- Network errors, 5xx, and 429 → show a retryable error. Do not log the user out.
- Client-side route protection is UX only. The backend guard protects the data.

## 6. Logout

1. The client sends `POST /api/v1/auth/logout`.
2. The server:
   - revokes the refresh-session family identified by the refresh cookie, if that cookie is present and validly signed;
   - clears both cookies;
   - returns 200.

   This endpoint is idempotent: missing or invalid cookies still get 200 and the cookies are cleared.
3. The client clears in-memory auth state, even if the request failed, and navigates to `/signin`.

After logout, that device's refresh token cannot be used. A copied **access** token remains valid until it expires (at most 15 minutes). Document this.

## 7. Navigation and usability

- `/signup` and `/signin` link to each other.
- Signed-in users who visit `/signin` or `/signup` are redirected to `/app` once the auth state is known.
- Navigating directly to `/app` works. Auth is determined by `/api/v1/auth/me`.
- Keyboard and screen-reader support, and usable layouts on mobile (360px) and desktop.

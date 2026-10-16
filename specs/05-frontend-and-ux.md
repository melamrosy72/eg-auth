# 05 — Frontend and UX

## 1. Visual direction

- Polished, restrained SaaS style: Tailwind v4 with shadcn/ui on the default theme, and a centred card layout.
- Visible focus, error, and loading states. No elaborate animation.
- shadcn components: `button input label card form` (or `field` if that is what the current CLI provides), `alert`, `sonner`. Generate them with the CLI only; never hand-write them.
- Setup gotchas:
  - Define the `@/*` alias in `tsconfig.json`, `tsconfig.app.json`, **and** `vite.config.ts`.
  - Tailwind v4 uses `@import "tailwindcss"` in CSS. There is no `tailwind.config.js` and no PostCSS config.

## 2. Routes

| Path | Guard | Page |
|---|---|---|
| `/` | — | redirect to `/app` (the guard then decides) |
| `/signup` | `PublicOnlyRoute` | SignUpPage |
| `/signin` | `PublicOnlyRoute` | SignInPage |
| `/app` | `ProtectedRoute` | AppPage |
| `*` | — | NotFoundPage, with a link home |

## 3. Forms

Both forms share these behaviours:
- React Hook Form + `zodResolver`, `mode: 'onTouched'`.
- Zod schemas mirror `04` §1 exactly, with the same messages. Share `PASSWORD_RULES` between the schema and the checklist; don't duplicate the rule logic.
- Visible labels tied to their inputs. Invalid inputs get `aria-invalid`, and the error text is linked with `aria-describedby`.
- On a failed submit, focus moves to the first invalid field.
- `PasswordInput` has a show/hide toggle with an accessible label (`Show password` / `Hide password`).
- The submit button is disabled and shows a spinner while pending, which prevents double submission. Fields keep their values after errors.

**Signup** (name, email, password; `autoComplete`: `name`, `email`, `new-password`):
- A live `PasswordChecklist` with four rows (length, letter, number, special), each marked ✓ or ✗, announced politely (`aria-live="polite"`).
- 409 → `setError('email', { message: 'Email is already registered' })`.
- Links to signin.

**Signin** (email, password; `autoComplete`: `email`, `current-password`):
- Validates email format and that the password is non-empty only.
- 401 → a form-level `Alert` with `Invalid email or password`. The email is kept and the password field is cleared.
- Links to signup.

**Server error mapping (both forms):**

| Response | UI |
|---|---|
| 400 | form-level alert listing the messages |
| 403 | toast `Request blocked, please reload the page` |
| 429 | form-level alert `Too many attempts, please wait a minute` |
| 5xx / network error | toast `Something went wrong, please try again` |

## 4. AppPage

- `<h1>` with exactly `Welcome to the application.`
- `Signed in as {name}` underneath.
- A Logout button with a pending state.

## 5. Auth state and the Axios instance

### `lib/http.ts`: one Axios instance
- `baseURL: import.meta.env.VITE_API_URL ?? '/api'`, `withCredentials: true`, JSON.
- Normalise errors into `ApiError { status: number; message: string | string[]; requestId?: string }`. Network failures get `status: 0`.

### Refresh interceptor (response, 401 only)
1. **Eligibility.** The request URL is **not** one of these:
   - `/auth/signin` (a 401 here means wrong credentials, never a refresh);
   - `/auth/signup`;
   - `/auth/refresh`;
   - `/auth/logout`.

   And the request has not been retried yet (`config._retry !== true`).
2. **Single-flight.** If a refresh is already in flight, await the same shared promise. Never start a second refresh concurrently. Reset the shared promise once it settles.
3. If refresh succeeds (200, with or without new cookies), set `_retry = true` and retry the original request **once**.
4. If refresh returns **401**, call `onSessionExpired()`: set the auth state to `unauthenticated` and let the guards redirect. Reject the original request.
5. If refresh fails with **429, 5xx, or a network error**, do **not** clear the auth state. Reject with that error so the UI shows a retryable state.
6. Never refresh in response to a refresh request, and never retry a request that has already been retried.

### `AuthProvider` (React context; in memory only)
- State: `{ status: 'loading' | 'authenticated' | 'unauthenticated' | 'error', user: SafeUser | null }`.
- On mount, call `GET /auth/me`. This goes through the interceptor, so an expired access token is refreshed transparently.
  - 200 → `authenticated`.
  - 401 → `unauthenticated`.
  - Anything else → `error`, with a `retry()` function.
- `signIn` / `signUp` set `authenticated` and the user from the response.
- `logout()` calls the API, then always clears the state.
- **Stale responses after logout.** Keep a `sessionEpoch` counter and increment it on logout. Ignore any `/me` response that started under an older epoch, so a stale response can't restore auth after logout.
- React StrictMode double-mounts in dev. The single-flight refresh and the epoch guard must make this harmless.

### Route guards
- `ProtectedRoute`:
  - `loading` → full-screen spinner (`role="status"`). Never render protected content before the check completes.
  - `unauthenticated` → `<Navigate to="/signin" replace state={{ from: location }} />`.
  - `error` → a retry panel.
- `PublicOnlyRoute`: the inverse. `authenticated` → `<Navigate to="/app" replace />`. Same loading behaviour.

## 6. Accessibility and usability

- Semantic forms, so the Enter key submits.
- Visible focus rings and reasonable contrast (shadcn defaults).
- Works at 360px width.
- No `alert()` dialogs.

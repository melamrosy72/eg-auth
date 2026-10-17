# 00 — Project Overview

## 1. Purpose

Implement a focused, production-minded authentication feature for the Easygenerator Full Stack Test Task. Users can sign up, sign in, stay signed in through rotating refresh tokens, and access a protected application page.

Optimize for correct behaviour, security, maintainability, testability, and fast delivery. Do not build a general-purpose identity platform.

## 2. Source of truth

Priority order:
1. This specification package.
2. The original Easygenerator assignment, summarised in §4.
3. Existing repository conventions, where they don't conflict with 1 or 2.

## 3. Required technology (final; ask before deviating)

### Runtime and package management
- Node.js 22 (`.nvmrc`), npm.
- Both `package.json` files pin npm exactly with `"packageManager": "npm@11.21.1"`. The Dockerfiles and CI install that version before `npm ci`. npm 11 is needed to change dependencies: npm 10.9.2 crashes on Vite's optional peers and drops the lockfile's `libc` fields.
- Two independent apps with separate `server/package-lock.json` and `client/package-lock.json`. No workspaces and no root lockfile.
- Current stable package versions, **at least 14 days old** (minimum-age policy). A version newer than that is pinned exactly to the newest older release, and the README lists the pins. A major that needs a newer Node 22 release than the local one is skipped (React Router 7 and jsdom 29 instead of 8 and 30). Commit both lockfiles. Use `npm ci` in CI and in documented clean installs.
- TypeScript `strict: true` in both apps.

### Frontend (`client/`)
- React, Vite, TypeScript.
- React Router.
- React Hook Form, Zod, `@hookform/resolvers`.
- Axios: one configured instance (see `05` §5).
- Tailwind CSS v4 via `@tailwindcss/vite` (no `tailwind.config.js`), and shadcn/ui components generated with the shadcn CLI. Default theme.
- `sonner` for toasts and `lucide-react` for icons. Both are installed by shadcn.
- Tests: Vitest, React Testing Library, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom`.

### Backend (`server/`)
- NestJS, TypeScript.
- MongoDB with `mongoose` and `@nestjs/mongoose`.
- DTO validation: `class-validator` and `class-transformer`, applied through a global `ValidationPipe`.
- Password hashing: Argon2id via the `argon2` package.
- Auth: `@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt`.
- Required packages: `@nestjs/config` + `zod` (env validation through `ConfigModule.forRoot({ validate })`; no `joi`), `nestjs-pino` + `pino-http` (`pino-pretty` as a dev dependency), `helmet`, `cookie-parser`, `@nestjs/throttler`, `@nestjs/terminus`, `@nestjs/swagger`.
- Tests: Vitest and Supertest against a real, isolated MongoDB instance. (NestJS 12 is ESM-only and `nest new` scaffolds Vitest; Jest would need experimental ESM mode.)
- Lint: the `nest new` scaffold default (oxlint).

### Runtime, proxy, CI
- Docker Compose services: `mongo`, `server`, `client` (Nginx serves the Vite build and proxies `/api/`).
- GitHub Actions: lint, typecheck, test, and build for both apps, plus a Compose build.

## 4. Required scope

- Signup and signin pages and endpoints, with the field rules in `04` §1.
- Protected page `/app` showing exactly `Welcome to the application.`
- Protected `GET /api/v1/auth/me`.
- Cookie-only JWT auth: 15-minute access token and 7-day **rotating** refresh token, with reuse detection and server-side revocation (`04` §4).
- Logout that revokes the refresh-session family.
- Rate limiting, origin/CSRF checks, Helmet, structured logs with redaction, and environment validation.
- Health endpoint, Swagger, tests, Docker Compose, CI, README, and `AI.md`.

## 5. Out of scope

- OAuth/social login, email verification, password reset, MFA.
- "Log out all devices" UI, session management UI, roles/permissions.
- Revoking access tokens before they expire (they are stateless; at most 15 minutes of exposure, documented).
- Redis, RabbitMQ, microservices, Kubernetes, cloud provisioning.
- MongoDB transactions. The Compose Mongo is a standalone node, so the design must stay correct using only atomic single-document operations.

## 6. Engineering principles

- Choose the simplest solution that meets these requirements securely.
- The backend validates all input. Frontend validation is for UX only.
- Never store plaintext passwords, log secrets, or commit credentials.
- Never claim a check passed unless it was run.
- Inspect existing files before changing them.

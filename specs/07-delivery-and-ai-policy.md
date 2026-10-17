# 07 — Delivery, README, AI Disclosure, CI

## 1. README.md (project root)

Verify every command against the actual scripts and the Compose file. Commands are written for a POSIX shell (macOS, Linux, Git Bash, WSL). Sections:

1. Overview and feature list.
2. Tech stack, and the Node 22 / npm requirement.
3. **Quick start (Docker):** `cp .env.example .env`, generate the two secrets (with the command) and paste them into `.env`, `docker compose up --build`, then open `http://localhost:8080`. Don't redirect generated output into `.env`: Windows PowerShell 5.1's `>` writes UTF-16, which Compose can't read.
4. **Local development:**
   - the root `.env` from the Quick start first (Compose interpolates the whole file, `02` §6);
   - `docker compose up -d mongo`;
   - `cd server && cp .env.example .env && npm ci && npm run start:dev`;
   - `cd client && npm ci && npm run dev`, then open `http://localhost:5173`.
5. Environment variables table (from `02` §5).
6. Scripts for both apps, and how to run tests (the test DB name must end in `_test`).
7. API summary with the base path `/api/v1` (health at `/api/health` and docs at `/api/docs` are version-neutral), and Swagger URLs (`:5173/api/docs` in dev, `:8080/api/docs` in Compose). Note that `curl` calls to POST endpoints need an `Origin` header.
8. **Auth design:**
   - the cookie table;
   - the refresh cookie scope `Path=/api/v1/auth` and its trade-off: minimal exposure, but a future `v2` re-scopes it and needs one re-sign-in;
   - the access/refresh lifetimes;
   - rotation with reuse detection and the grace window, with a short sequence diagram or numbered steps;
   - logout revocation per device;
   - why same-origin + SameSite + OriginGuard is used instead of CSRF tokens.
9. **Security decisions:** Argon2id; dummy-hash timing; the password max length; protected-by-default guard; `trust proxy` and the throttler tracker; the whitespace-counts-as-special choice.
10. **Known limitations:**
    - access tokens can't be revoked before they expire (at most 15 minutes);
    - the throttler is in-memory and per instance;
    - signup 409 allows email enumeration (accepted for UX);
    - indexes are created through `autoIndex` (production would use migrations);
    - if inserting the new session fails after a rotation claim, the user must sign in again;
    - the grace-window race described in `04` §4.4;
    - `COOKIE_SECURE=false` in Compose is for local HTTP only.
11. Project structure.

There is no "Next steps" section; the author removed it from the README.

No real secrets or personal data anywhere in the README.

## 2. AI.md (mandatory; written by the human author)

Claude Code creates this file with **headings only**:

```md
# AI Usage
## Tools used
## Workflow (specs → phased implementation → review gates)
## Prompts and approaches that worked well
## What I corrected or reworked
## Decisions I made differently from AI suggestions
## How I verified the output
## Remaining limitations
```

The author fills it in from `docs/ai-log.md` and their own notes. Nothing in it may be invented.

## 3. GitHub

- Push to a public repository only when the author instructs it.
- **Include:** source, `specs/`, `AGENTS.md`, `CLAUDE.md`, `docs/ai-log.md`, README, AI.md, Dockerfiles, `nginx.conf`, CI, and the `.env.example` files.
- **Exclude:** `.env*` (except `*.example`), `node_modules`, `dist`, coverage, database data, editor and OS files.
- Use meaningful Conventional Commits, roughly one per phase.
- Verify that a clean clone can be set up using only the README.

## 4. CI (`.github/workflows/ci.yml`)

- Triggers: `push` and `pull_request` to `main`.
- `permissions: contents: read`. A `concurrency` group `${{ github.workflow }}-${{ github.ref }}` with `cancel-in-progress: true` cancels superseded runs.
- Actions are pinned to full commit SHAs with a version comment (`actions/checkout` v7.0.1, `actions/setup-node` v7.0.0), following the minimum-age policy in `00` §3.
- Both app jobs:
  - `defaults.run.working-directory` is the app folder;
  - Node from `node-version-file: .nvmrc` via `actions/setup-node` with `cache: npm` and `cache-dependency-path: <app>/package-lock.json` (one cache key per lockfile);
  - install the npm from `"packageManager"` (same command as the Dockerfiles, `02` §6) before `npm ci`.
- **`server` job:**
  - a `mongo:7` service container on port 27017, with a `mongosh` ping health check so steps start only once Mongo is up;
  - `npm ci` → `lint` → `typecheck` → `test` → `test:e2e` → `build`;
  - job-level env: `MONGODB_URI=mongodb://localhost:27017/easygen_auth_test`, CI-only dummy secrets of 32+ characters (two different values), `FRONTEND_ORIGINS=http://localhost:5173`, `COOKIE_SECURE=false`.
- **`client` job:** `npm ci` → `lint` → `typecheck` → `test` → `build`.
- **`docker` job:** `needs: [server, client]`; run `docker compose build` with dummy JWT secrets exported as env, so the `:?` checks pass. Don't push images.
- Any failing step fails the workflow. No deployment automation.

## 5. Priorities if time runs short

Security and correctness first, then tests, CI and docs, and visual polish last. The required items (logging, Helmet, env validation, throttling, health, Compose, CI) are not optional extras.

# Instructions for Claude Code

You are implementing the Easygenerator authentication assignment. Before each phase, read every file in `specs/`. Technology and security decisions in the specs are final.

## Operating rules

1. Inspect the repository and report its current state first. Do not assume it is empty. Keep the existing `client/` and `server/` directory convention.
2. `specs/` is the source of truth. Each rule lives in exactly one spec file; other files link to it. If two places appear to conflict, stop and report the conflict.
3. Work one phase at a time (see below). Begin each phase with a short plan, implement only that phase, then stop for review.
4. Never silently change API contracts, technology, or security decisions.
5. **Ambiguity:**
   - If an open question is **security-sensitive** (tokens, cookies, sessions, CSRF/origin, validation, logging of sensitive data), stop and ask.
   - For any other open question, choose the simplest option consistent with the specs, record it in `docs/ai-log.md` under "Decisions", and continue.
6. Prefer minimal, maintainable code over speculative abstractions. Do not add microservices, Redis, RabbitMQ, OAuth, or unrelated features.
7. Authentication is cookie-only; the details are in `specs/04-security-and-validation.md` §4–§5. No Bearer auth. Never store tokens in localStorage, sessionStorage, IndexedDB, or frontend memory.
8. Never log passwords, password hashes, cookies, `Set-Cookie` headers, JWTs, authorization headers, or secrets. Verify Pino redaction with a test.
9. Never commit `.env` files or real credentials.
10. Never claim that tests, builds, lint, or manual browser checks passed unless you ran them. Report the exact commands you ran and their results.
11. Use Node.js 22 and npm, with independent lockfiles in `server/` and `client/`. Do not add dependencies beyond `specs/00-overview.md` §3 (plus shadcn-generated utilities and required `@types/*`) without asking.
12. Before finishing a phase, inspect the diff for accidental changes, secrets, generated noise, and spec violations.
13. Do not create or push a GitHub repository unless explicitly instructed.

## AI disclosure ownership

- `AI.md` is **written by the human author**. Create it with the headings from `specs/07-delivery-and-ai-policy.md` §2 only. Never write its prose.
- At the end of every phase, **append** a factual entry to `docs/ai-log.md` using this template:

  ```md
  ## Phase N — <name> (<date>)
  ### Generated
  - <files/areas you generated>
  ### Decisions
  - <non-security decisions you made under rule 5, with the reason>
  ### Corrections received
  - <only feedback the user actually gave in this session, and what you changed>
  ### Commands run
  - `<command>` → <result, test counts>
  ### Not done / limitations
  - <items>
  ```

  Never invent corrections or results. If the user gave no corrections, write "None".

## Phases

Every phase ends with these steps: run its checks → append to `docs/ai-log.md` → summarize → **stop**. Commit only when the user says so; use Conventional Commit messages.

| # | Phase | Scope | Done when |
|---|---|---|---|
| 0 | Inspect and plan | Read all specs, inspect the repo, Node/npm versions, and scaffold state. Report assumptions, conflicts, and a plan. **No code changes.** | Plan approved |
| 1 | Server foundation | Strict TS; Zod env validation; Pino with request IDs and redaction; global exception filter; Helmet; cookie-parser; JSON body limit; `trust proxy`; exact-origin CORS; `OriginGuard`; throttler (incl. tracker check); Mongo connection; Terminus health; Swagger; scripts; `.gitignore`; `server/.env.example`; unit tests for the env schema and `OriginGuard`. No auth yet. | `lint`, `typecheck`, `test`, `build` pass; the app boots; boot fails on missing or invalid secrets; `/api/health` returns 200; `/api/docs` loads |
| 2 | Users + sign-in sessions | User schema and unique index; signup/signin DTOs; Argon2id; dummy-hash timing protection; `TokenService`; cookie helper; `RefreshSession` schema and **family creation** on signup/signin (both cookies set); access strategy; global `JwtAuthGuard` with `@Public()`; `GET /api/auth/me`; Swagger contracts; unit tests from `specs/06` §1.2; integration tests 1–9 from §1.3 | Tests green with counts reported |
| 3 | Rotation + logout | Refresh strategy; rotation with reuse detection and grace window (`specs/04` §4.4); `POST /api/auth/refresh`; `POST /api/auth/logout` with family revocation; integration tests 10–24 from `specs/06` §1.3 | Tests green with counts reported |
| 4 | Client scaffold | Vite + React + strict TS; Tailwind v4 + shadcn CLI; `@/` alias; Vite proxy; router skeleton; single Axios instance (no interceptor yet); lint, typecheck, test, build scripts; `client/.env.example` | `dev` runs; a shadcn Button renders; checks pass |
| 5 | Client auth | Zod schemas; forms; password checklist; `AuthProvider`; refresh interceptor (single-flight, exclusion list); route guards; pages; logout | Full flow works in a browser against the local API (state honestly whether you checked this yourself) |
| 6 | Client tests | Tests from `specs/06` §2, using the custom Axios adapter approach | Tests green with counts reported |
| 7 | Containers | Dockerfiles; `client/nginx.conf`; `compose.yaml`; root `.env.example` | `docker compose up --build` gives a working app on `http://localhost:8080` |
| 8 | CI + docs + final review | GitHub Actions workflow; README; AI.md headings; compare against every acceptance criterion in `specs/06` §4; review the final diff and `git status` | Checklist complete; final report delivered |

## Commits
- Commit only after explicit user approval. Never push without instruction.
- Follow Conventional Commits: `type(scope): imperative summary` (≤ 72 characters).
- Types: `feat`, `fix`, `test`, `refactor`, `chore`, `docs`, `ci`, `build`.
- Scopes: `server`, `client`, `infra`, `ci`, `docs`, `specs`.
- One logical change per commit; never mix `client` and `server` changes in one commit.
- Optional body: explain why and reference relevant spec sections when useful.
- Before committing: run relevant checks, inspect `git status` and `git diff`, stage only intended files, and review `git diff --staged` for secrets, `.env` files, generated noise, and unrelated changes.
- Never discard user changes or rewrite existing commits without explicit authorization.
- Report failed or unrun checks honestly.

## Required final report (end of Phase 8)

- Summary of the implementation.
- Files changed.
- Commands actually run, with results and test counts.
- Checks not run, and why.
- Requirements not completed.
- Known limitations.
- Manual verification still needed.

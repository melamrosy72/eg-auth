# AI Usage

**TL;DR:** Spec-first, then 9 gated phases. Claude Code wrote almost all of the
code; I owned the decisions, reviewed every phase, and verified each one
manually before committing. The best catches came from the review gates,
not from the generation.

## Tools used
- ChatGPT: first draft of the spec package from my PRD/SRS and my preferred practices.
- Claude (chat): reviewed the initial spec and the output of each implementation phase, identifying gaps and inconsistencies for me to evaluate.
- Claude Code: implementation, guided by `AGENTS.md` and `specs/`.
- My own Claude Code skill manual_test: tests endpoints the way a human would, using curl instead of Postman or Swagger.

## Workflow
Spec → AI review of the spec → Phase 0 (plan only, no code) → 8 build phases.
Every phase ended with: checks run → report of the exact commands → my review
→ manual test → fixes → commit. Claude Code kept a factual log in
`docs/ai-log.md`. This file is my summary of that log.

## What was AI-generated vs. hand-written
- Generated: nearly all of the code, tests, Dockerfiles, CI workflow and the README draft.
- Mine: the stack and security decisions, the review notes at every gate, the manual test plans, and this file.

## Prompts and approaches that worked well
Most of the prompt engineering lives in `specs/` and `AGENTS.md`, not in chat
messages. A spec the agent re-reads every session beat re-explaining context
in every prompt. Techniques I used deliberately:
- **Persistent context:** `CLAUDE.md` imports `AGENTS.md`, so the rules survive `/clear` between phases.
- **Explicit stop conditions:** every phase ends with "run checks → report → stop"; no unreviewed work piles up.
- **Ask vs. decide:** security-sensitive ambiguity → stop and ask; anything else →
choose the simplest option and log it. This kept the agent moving without letting it guess on auth.
- **Anti-hallucination rule:** "never claim a check passed unless you ran it" + exact
commands in every report. That's how the silently-unapplied mutation check got caught.
- **Structured output:** a fixed ai-log template (Generated / Decisions / Corrections / Commands)
made every phase reviewable in minutes.
- **Short per-phase prompts on top:** because the spec carried the context, phase
prompts only needed scope + watch points.
- `Execute Phase N only, then stop.` Small diffs that I could actually review.
- Watch points: before each phase I listed exactly what I would check
  (for example "SignInDto must NOT reuse the signup password rules"). Claude Code checked those points itself before reporting.
- Mutation checks: "Remove /auth/signin from the refresh exclusion list and confirm a test fails."
  These prove that the tests test something. One run reported "61 passed" but had never
  applied the mutation; it was caught and rerun.
- A rule in `AGENTS.md`: never claim a check passed without running it. Every report listed real commands and real counts.

## What I corrected or reworked
**Caught by me during manual testing:**
- Routes were under `/api`, not `/api/v1`. I found this with Swagger. It was a gap in my own spec; I fixed the spec first, then the code.
- `/me` returned `304`, which meant auth responses were cacheable in the browser. Added `Cache-Control: no-store` with tests.

**Caught at the review gates:**
- The first spec had no `trust proxy`, so behind Nginx every user would have shared one rate-limit bucket. Verified fixed: 11 signins with a spoofed `X-Forwarded-For` still return 429.
- The first spec had no list of routes excluded from refresh, so a wrong-password 401 would have triggered a refresh.
- Nest echoed malformed JSON, including a password-like value, back in the 400 response. Replaced with a fixed message.
- Every Mongo `11000` error mapped to "Email is already registered". Narrowed to `keyPattern.email`, with a test.
- Claude Code added `pino` as a dependency without approval, breaking its own rule. Removed.
- The logout-failure toast was misleading. If the logout request fails before the browser receives a successful response, its HttpOnly cookies may remain. I changed the message to warn that the session may still be active.

## Decisions I made differently from AI suggestions
- **Refresh tokens:** the AI suggested dropping them for speed. I kept them, with rotation, jti session families, a 10 s grace window and reuse detection that revokes the whole family.
- **API versioning:** the AI suggested skipping it. I added `/api/v1`and centralized the path so a v2 is cheap.
- **Env validation:** Zod instead of Joi, so one validation library is used across the stack.
- **`stopAtFirstError`:** the AI review suggested it. Tested against every DTO case, it changed the messages in 5 cases, so I rejected it.
- **Supply chain:** the shadcn CLI generated an import of `cn@0.5.0`, published one day earlier. I rejected it and pinned `0.4.0`. The same minimum-age rule applies to react-hook-form and to the GitHub Actions versions (pinned to commit SHAs).

## How I verified the output
- Tests: 85 server unit, 63 integration against a real Mongo, 56 client. CI green. 
- Mutation checks in phases 2, 3, 5 and 6.
- Browser checks with DevTools:
  - Deleted the access cookie and saw exactly one refresh.
  - Replayed an old refresh token after 10 s and watched the whole session family get revoked.
  - Killed the server during logout.
  - 360px width and keyboard-only use.
- Investigated a double `/me` call in dev: it's React StrictMode, and single-flight still produced only one refresh. Production shows `me 401 → refresh 200 → me 200`.
- A clean clone, set up using only the README quick start, works at `:8080`.

## Scope choices
- **Design kept deliberately plain:** the default shadcn theme, no custom design system.
The task left design open, so I spent the time on the auth flow instead:
rotating refresh tokens with reuse detection, httpOnly cookies + an Origin check,
correct client IPs behind Nginx for rate limiting, `no-store` on auth responses,
a CSP hash instead of `unsafe-inline`
The details are in the README's Security decisions section.

## Remaining limitations
- Access tokens can't be revoked before they expire (15 minutes at most).
- The rate limiter is in-memory and per instance.
- Signup's 409 reveals that an email is registered (accepted for UX).
- A failed logout request leaves the cookies in place.
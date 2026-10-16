# 02 — Architecture and Repository Conventions

## 1. Repository layout

```text
/
├── specs/
├── docs/ai-log.md                 # appended by Claude Code each phase (see AGENTS.md)
├── server/
│   ├── src/
│   │   ├── auth/                  # controller, service, DTOs, strategies, cookies, refresh sessions
│   │   ├── users/                 # schema, service, safe mapping
│   │   ├── health/
│   │   ├── common/                # filters, guards (origin), decorators (@Public, @CurrentUser)
│   │   ├── config/                # Zod env schema, inferred Env type
│   │   ├── app.module.ts
│   │   └── main.ts
│   ├── test/                      # integration tests + helpers
│   ├── Dockerfile  .dockerignore  .env.example
│   ├── package.json  package-lock.json
├── client/
│   ├── src/
│   │   ├── app/                   # router, providers
│   │   ├── components/ui/         # shadcn-generated
│   │   ├── features/auth/         # api, schemas, AuthProvider, interceptor, forms, route guards
│   │   ├── pages/
│   │   └── lib/                   # axios instance, utils
│   ├── nginx.conf  Dockerfile  .dockerignore  .env.example
│   ├── package.json  package-lock.json
├── compose.yaml
├── .env.example                   # Compose secrets only
├── .github/workflows/ci.yml
├── .nvmrc  .editorconfig  .gitignore
├── AGENTS.md  CLAUDE.md  AI.md  README.md
```

## 2. Backend modules

### UsersModule
- `User` schema with these fields:
  - `email`: unique index, `lowercase`, `trim`.
  - `name`: `trim`.
  - `passwordHash`: `select: false`.
  - timestamps.
- `toSafeUser(doc) → { id, name, email }`, mapped explicitly. Never return documents and never rely on `toJSON` transforms.

### AuthModule
- `AuthController`: signup, signin, refresh, logout, me.
- `AuthService`: hashing, credential checks, and a dummy hash created once in `onModuleInit`.
- `TokenService`: signs and verifies access and refresh JWTs (`04` §4.2).
- `RefreshSessionService` + `RefreshSession` schema: create a family, rotate, detect reuse, revoke (`04` §4.3–§4.5).
- `JwtAccessStrategy` (`'jwt'`): reads only `req.cookies.access_token`.
- `JwtRefreshStrategy` (`'jwt-refresh'`): reads only `req.cookies.refresh_token` and verifies signature, expiry, and `token_use`. Session state is checked by the service, not the strategy.
- `cookies.ts`: **one** helper that builds the cookie options, used both when setting and when clearing cookies.

### Global guards (registered as `APP_GUARD`, in this order)
1. `ThrottlerGuard`. Its tracker must be `req.ip`; see `04` §6.
2. `OriginGuard`: unsafe methods only; see `04` §5.
3. `JwtAuthGuard`: **protected by default**. Opt out with `@Public()`. The public routes are signup, signin, refresh (it uses the refresh guard instead), logout, and health.

### HealthModule
`GET /api/health` uses Terminus to ping Mongoose. It is excluded from throttling with `@SkipThrottle()`. It must not expose connection strings.

### Bootstrap (`main.ts`)
- Global prefix: `api`.
- Pino logger: `bufferLogs: true`, `app.useLogger(app.get(Logger))`.
- `helmet()`, configured so that Swagger UI works without disabling protections wholesale.
- `cookie-parser`.
- JSON body limit of `10kb` (`app.useBodyParser('json', { limit: '10kb' })`).
- `app.set('trust proxy', TRUST_PROXY_HOPS)`.
- CORS: `origin` is the exact `FRONTEND_ORIGINS` list, with `credentials: true`. Never use `*`.
- Global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`.
- Global exception filter (`04` §7).
- Swagger at `/api/docs` when `SWAGGER_ENABLED=true`.
- `enableShutdownHooks()`.

## 3. Frontend responsibilities

See `05`. Key points:
- one Axios instance;
- an in-memory `AuthProvider`;
- a single-flight refresh interceptor;
- route guards backed by `/api/auth/me`.

## 4. URL conventions

- All API routes are under `/api`. The browser always calls relative `/api/...` URLs.
- Dev: the Vite dev server (`:5173`) proxies `/api` to `http://localhost:3000`.
- Compose: Nginx (`:8080`) serves the SPA and proxies `/api/` to `server:3000`, keeping the `/api` prefix.
- Swagger in dev is at `http://localhost:5173/api/docs` (through the Vite proxy, so "Try it out" sends an allowed Origin). In Compose it is at `http://localhost:8080/api/docs`.

## 5. Environment

### Server (validated with Zod; boot fails with a clear message that never prints secret values)

Implementation:
- `config/env.schema.ts` exports `envSchema` (a `z.object`) and `type Env = z.infer<typeof envSchema>`.
- `ConfigModule.forRoot({ isGlobal: true, validate: validateEnv })`. `validateEnv(config)` calls `envSchema.safeParse(config)` on the **`config` argument**, not on `process.env`: `@nestjs/config` calls `validate` with the `.env` file values merged under `process.env` *before* it copies them into `process.env`. On failure it throws an error listing **only variable names and issue messages**, never the received values.
- Inject config as `ConfigService<Env, true>` so `get()` is typed.
- **No application code outside `server/src/config/` reads `process.env`.** Typed values come only from `ConfigService<Env, true>`; after validation, `process.env` holds only raw or stringified values (e.g. `"false"`), and non-primitive values such as the parsed origin list are not copied into it at all. Test helpers may *set* environment variables before booting the app.
- **Booleans:** never use `z.coerce.boolean()`, because it turns the string `"false"` into `true`. Use `z.enum(['true','false']).transform(v => v === 'true')` (or `z.stringbool()` if the installed Zod is v4).
- **Numbers:** `z.coerce.number().int()` with range checks.
- **`FRONTEND_ORIGINS`:** `.transform()` splits on commas and trims each entry. Every entry is checked with `new URL(o).origin === o`, so paths, trailing slashes, and `*` are rejected.
- **Distinct secrets:** a `.superRefine()` on the object adds an issue on `JWT_REFRESH_SECRET` when the two secrets are equal.

| Var | Rule | Default |
|---|---|---|
| `NODE_ENV` | `development` \| `test` \| `production` | `development` |
| `PORT` | port | `3000` |
| `MONGODB_URI` | required URI | — |
| `JWT_ACCESS_SECRET` | required, min 32 chars | — |
| `JWT_REFRESH_SECRET` | required, min 32 chars, **must differ** from the access secret (object-level `.superRefine()`) | — |
| `FRONTEND_ORIGINS` | required, comma-separated list of exact origins (scheme://host:port, no path, no `*`) | — |
| `COOKIE_SECURE` | **required** boolean; no default | — |
| `TRUST_PROXY_HOPS` | integer 0–2 | `0` |
| `LOG_LEVEL` | Pino level | `info` |
| `SWAGGER_ENABLED` | boolean | `true` |

- When `NODE_ENV=production` and `COOKIE_SECURE=false`, boot succeeds but logs a **warning**: `COOKIE_SECURE=false in production — only acceptable for local HTTP (Compose)`. The setting is explicit, never inferred.
- Token lifetimes and rate limits are constants in code (`04` §4.1 and §6). They are not environment variables.

`server/.env.example` (local dev): `MONGODB_URI=mongodb://127.0.0.1:27017/easygen_auth`, `FRONTEND_ORIGINS=http://localhost:5173`, `COOKIE_SECURE=false`, `TRUST_PROXY_HOPS=0`, and placeholder secrets with a generation command in a comment (`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`).

### Client
- No environment variables are required. The Axios base URL is `/api`.
- `VITE_API_URL` is optional and only for non-default setups. Never put secrets in `VITE_*`.

## 6. Docker Compose and Nginx

### `compose.yaml`
- `mongo`:
  - `mongo:7`, named volume;
  - healthcheck `mongosh --quiet --eval "db.adminCommand('ping')"`;
  - port `127.0.0.1:27017:27017`, for local dev and tests only.
- `server`:
  - build from `./server`;
  - `depends_on: mongo: condition: service_healthy`;
  - no published port.
  - Environment set in the compose file:
    - `NODE_ENV=production`
    - `MONGODB_URI=mongodb://mongo:27017/easygen_auth`
    - `FRONTEND_ORIGINS=http://localhost:8080`
    - `COOKIE_SECURE=false` (comment: local HTTP only)
    - `TRUST_PROXY_HOPS=1`
    - `JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET:?set in .env}`
    - `JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET:?set in .env}`
- `client`: build from `./client`, port `8080:80`, `depends_on: server`.
- Root `.env.example` contains only the two JWT secrets as placeholders.

### Dockerfiles
- **Server:**
  - multi-stage `node:22-alpine`: `npm ci` → build → `npm prune --omit=dev`;
  - run as the `node` user, `CMD ["node","dist/main.js"]`.
  - If `argon2` fails to install or load on Alpine (musl), switch both stages to `node:22-slim` and note this in the README.
- **Client:** build with `node:22-alpine`, then serve from `nginx:alpine`.

### `client/nginx.conf`
- `location / { try_files $uri /index.html; }`.
- `location /api/ { proxy_pass http://server:3000; }` (no trailing path, so the prefix is kept), with these headers:
  - `Host $host`
  - `X-Real-IP $remote_addr`
  - `X-Forwarded-For $proxy_add_x_forwarded_for`
  - `X-Forwarded-Proto $scheme`
- `Set-Cookie` passes through. Do not use `proxy_cookie_*` rewrites.
- Long cache for `/assets/`, `no-cache` for `index.html`, gzip on.

## 7. Maintainability

- Strict TS. Use `any` only when justified in a comment.
- No broad catch blocks that swallow errors.
- No repository or generic-wrapper layers without a concrete benefit.

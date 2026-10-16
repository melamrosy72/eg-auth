# Easygenerator Auth

> Draft. The full README is written in Phase 8 (`specs/07` §1).

## Draft notes (fold into the final README)

- Until `compose.yaml` exists (Phase 7), local MongoDB runs as a standalone container:
  `docker run -d --name easygen-mongo -p 127.0.0.1:27017:27017 mongo:7`.
  **Stop and remove it before Phase 7** (`docker rm -f easygen-mongo`), or the Compose `mongo` service cannot bind port 27017.
- `npm ci` works with the npm bundled with Node 22 (10.9.2). Adding or updating server dependencies needs npm 11 (`npx npm@11 install <pkg>`): npm 10.9.2 crashes with `Cannot read properties of null (reading 'edgesOut')` while resolving Vite's optional peers.
- POST requests need an `Origin` header that exactly matches `FRONTEND_ORIGINS`, e.g. `curl -H "Origin: http://localhost:5173" ...`.

## Security decisions

- **Dependency minimum age (client).** shadcn's registry generates `src/lib/utils.ts` as `export { cn } from "cn"` for every style, whatever the CLI version, and its components import `cn` from `"cn"`. So pinning the CLI alone does not control which `cn` you get. `cn` is pinned exactly to `0.4.0` (published 2026-09-22), and `shadcn` (a dev dependency, used only for `shadcn/tailwind.css` at build time) to `4.21.5`. Reason: `cn@0.5.0` and `shadcn@4.22.0` were one day old when the client was scaffolded. `src/lib/utils.test.ts` checks the class-merging behaviour the components rely on.

# Easygenerator Auth

> Draft. The full README is written in Phase 8 (`specs/07` §1).

## Draft notes (fold into the final README)

- Until `compose.yaml` exists (Phase 7), local MongoDB runs as a standalone container:
  `docker run -d --name easygen-mongo -p 127.0.0.1:27017:27017 mongo:7`.
  **Stop and remove it before Phase 7** (`docker rm -f easygen-mongo`), or the Compose `mongo` service cannot bind port 27017.
- `npm ci` works with the npm bundled with Node 22 (10.9.2). Adding or updating server dependencies needs npm 11 (`npx npm@11 install <pkg>`): npm 10.9.2 crashes with `Cannot read properties of null (reading 'edgesOut')` while resolving Vite's optional peers.
- POST requests need an `Origin` header that exactly matches `FRONTEND_ORIGINS`, e.g. `curl -H "Origin: http://localhost:5173" ...`.

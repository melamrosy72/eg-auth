FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Install the npm version pinned in package.json "packageManager" (npm 11 keeps the lockfile's libc fields).
RUN npm install -g "$(node -p "require('./package.json').packageManager")" && npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
# package.json is needed at runtime for "type": "module". Files stay root-owned, so the app can't modify itself.
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]

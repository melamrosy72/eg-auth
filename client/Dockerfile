FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Install the npm version pinned in package.json "packageManager" (npm 11 keeps the lockfile's libc fields).
RUN npm install -g "$(node -p "require('./package.json').packageManager")" && npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

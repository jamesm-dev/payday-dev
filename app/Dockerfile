# syntax=docker/dockerfile:1
# Payday: the SvelteKit server with Litestream beside it, in one image. Build context: app/.
# Fly.io builds this remotely on deploy; it was not built locally during /setup (no Docker).

FROM node:26.13.0-trixie-slim AS base
RUN npm install -g pnpm@12.16.1
WORKDIR /app

# Everything, to build with.
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# Runtime dependencies only. Scripts are skipped: `prepare` needs the dev tooling, and
# better-sqlite3 ships a prebuilt linux-x64 binary, so nothing needs compiling.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

FROM node:26.13.0-trixie-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=litestream/litestream:0.5.17 /usr/local/bin/litestream /usr/local/bin/litestream
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY package.json litestream.yml ./
COPY drizzle ./drizzle
COPY --chmod=755 scripts/start.sh ./start.sh
EXPOSE 3000
CMD ["./start.sh"]

# syntax=docker/dockerfile:1
#
# One image serves the API and the built web app from the same origin, so the
# session cookie stays first-party and no CORS setup is needed.
#
#   docker build -t tablewise .
#   docker compose up --build      (PostgreSQL + this image on http://localhost:8080)
#
# Stages:
#   base   Node + pnpm (via Corepack, pinned by "packageManager" in package.json)
#   build  full install, then production builds of the API bundle and the web app
#   prod   production-only dependencies of the API
#   final  slim runtime: bundle + migrations + web assets + prod node_modules, non-root

ARG NODE_VERSION=24.18.1

FROM node:${NODE_VERSION}-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    HUSKY=0 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# ---- build ----
FROM base AS build
# Manifests first: the dependency layer is cached until the lockfile changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages packages
COPY apps apps
RUN pnpm --filter @tablewise/api build && pnpm --filter @tablewise/web build

# ---- prod dependencies ----
FROM base AS prod
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/
# The API bundle inlines @tablewise/contracts, so only third-party runtime packages are needed.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter "@tablewise/api..." install --frozen-lockfile --prod --ignore-scripts

# ---- runtime ----
FROM node:${NODE_VERSION}-slim AS final
ENV NODE_ENV=production \
    PORT=4000 \
    MIGRATIONS_DIR=/app/apps/api/migrations \
    WEB_DIST_DIR=/app/apps/web/dist \
    NODE_OPTIONS=--enable-source-maps
WORKDIR /app
COPY --from=prod --chown=node:node /app/node_modules node_modules
COPY --from=prod --chown=node:node /app/apps/api/node_modules apps/api/node_modules
COPY --from=build --chown=node:node /app/apps/api/package.json apps/api/package.json
COPY --from=build --chown=node:node /app/apps/api/dist apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/migrations apps/api/migrations
COPY --from=build --chown=node:node /app/apps/web/dist apps/web/dist
USER node
WORKDIR /app/apps/api
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Pending migrations run on boot (advisory-locked, so safe with several instances).
CMD ["node", "dist/main.js"]

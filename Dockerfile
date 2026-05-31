# syntax=docker/dockerfile:1.7
#
# Multi-stage build for Galleria Principii.
#
# Stage layout
#   deps    install ALL workspace dependencies (dev + prod) for building
#   build   compile TypeScript and bundle the web client
#   prod    install production-only dependencies for the API workspace
#   runtime minimal image with prisma, compiled API, web/dist, prod node_modules
#
# Notes
#   - Built artifacts (`apps/api/dist`, `apps/web/dist`) are .gitignored, so we
#     build them inside the image instead of relying on host state.
#   - Prisma needs the `prisma` package and `schema.prisma` at runtime to run
#     `prisma migrate deploy`, so they ship in the runtime image.
#   - The default `DATABASE_URL=file:/data/prod.db` resolves to the persistent
#     volume mounted by docker-compose.
#   - HOST is forced to 0.0.0.0 so the API is reachable from the nginx
#     container; the host-level firewall stays in front.

ARG NODE_VERSION=22.12.0

############################
# Stage: deps (full install)
############################
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app

# Install everything the build needs (devDependencies included).
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN --mount=type=cache,target=/root/.npm \
    npm ci --include=dev

############################
# Stage: build (compile TS + Vite + generate Prisma client)
############################
FROM deps AS build
WORKDIR /app

COPY tsconfig.base.json ./
COPY apps ./apps

# Generate the Prisma client first so the API build can resolve `@prisma/client`
# against the right schema.
RUN npm run prisma:generate --workspace @galleria-principii/api
RUN npm run build

############################
# Stage: prod-deps (runtime-only npm install)
############################
FROM node:${NODE_VERSION}-bookworm-slim AS prod-deps
WORKDIR /app

# Install only production dependencies for the API workspace. The web workspace
# is static after build, so it does not need runtime deps.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

ENV PRISMA_SKIP_POSTINSTALL_GENERATE=1
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --workspace @galleria-principii/api --include-workspace-root

############################
# Stage: runtime
############################
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
WORKDIR /app

# tini for proper PID 1 signal handling; openssl is required by Prisma.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATABASE_URL=file:/data/prod.db \
    LOG_LEVEL=info

# Copy runtime npm tree and workspace manifests.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

# Re-generate the Prisma client for the runtime image so the engine binary
# matches the runtime libc/openssl.
COPY apps/api/prisma ./apps/api/prisma
RUN npx prisma generate --schema apps/api/prisma/schema.prisma

# Compiled artifacts.
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist

# Entrypoint runs `prisma migrate deploy` and then execs the API.
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# /data is the persistent volume mount-point for the SQLite database.
RUN mkdir -p /data && chown -R node:node /data /app
VOLUME ["/data"]

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["node", "apps/api/dist/server.js"]

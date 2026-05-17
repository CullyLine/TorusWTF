# Multi-stage Dockerfile for the Next.js web app.
# Built and pushed to ghcr.io/<owner>/torus-web:latest on tag from CI.

# ---- Stage 1: build ----
FROM node:22-alpine AS builder

RUN apk add --no-cache python3 make g++ libc6-compat
RUN corepack enable && corepack prepare pnpm@10.31.0 --activate

WORKDIR /repo

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json turbo.json ./
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/storage/package.json packages/storage/
COPY packages/ui/package.json packages/ui/
COPY packages/visualizers/package.json packages/visualizers/

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .

RUN pnpm --filter @torus/web build

# ---- Stage 2: runtime ----
FROM node:22-alpine AS runtime

RUN apk add --no-cache ffmpeg

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

# Standalone Next.js output drags in only what it needs
COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /repo/apps/web/public ./apps/web/public 2>/dev/null || true

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

USER node

CMD ["node", "apps/web/server.js"]

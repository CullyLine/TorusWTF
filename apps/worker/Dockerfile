# Multi-stage Dockerfile for the BullMQ worker.
# Built and pushed to ghcr.io/<owner>/torus-worker:latest on tag from CI.

# ---- Stage 1: build ----
FROM node:22-alpine AS builder

RUN apk add --no-cache python3 make g++ libc6-compat
RUN corepack enable && corepack prepare pnpm@10.31.0 --activate

WORKDIR /repo

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json turbo.json ./
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/storage/package.json packages/storage/

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .

RUN pnpm --filter @torus/worker build

# ---- Stage 2: runtime ----
FROM node:22-alpine AS runtime

# ffmpeg + audiowaveform (BBC) for audio processing
RUN apk add --no-cache ffmpeg curl ca-certificates
RUN curl -L https://github.com/bbc/audiowaveform/releases/download/1.10.1/audiowaveform-1.10.1-linux-x86_64.tar.gz \
    | tar xz -C /usr/local/bin --strip-components=1 audiowaveform-1.10.1-linux-x86_64/audiowaveform 2>/dev/null \
    || echo "WARNING: audiowaveform not installed (architecture mismatch?). Falling back to ffmpeg peaks."

ENV NODE_ENV=production

WORKDIR /app

COPY --from=builder /repo/apps/worker/dist ./dist
COPY --from=builder /repo/apps/worker/package.json ./
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/packages ./packages

USER node

CMD ["node", "dist/index.js"]

# torus.fm

> **Share the loop.** Drop any audio, get an instant link.

A modern, open-source spiritual successor to [Clyp.it](https://clyp.it) — built for EDM producers, musicians, and anyone who wants a no-bullshit way to share short audio clips.

## What it is

- **One-click upload** — drag-and-drop or click-to-browse, anywhere in the app
- **Instant share code** — `torus.fm/kT9mFq2x` copied to clipboard the moment the upload finishes
- **Beautiful waveforms** — frequency-band-colored 2D waveform fingerprint on every clip
- **Optional 3D visualizers** — four GPU-accelerated presets (Torus Field, Particle Storm, Spectral Tunnel, Volumetric Waveform)
- **Community front page** — weekly-voted top clips, anonymous-friendly uploads
- **Self-hostable** — single `docker compose up -d` runs the entire stack

## What it is not

See [`PRINCIPLES.md`](./PRINCIPLES.md) for the no-bullshit charter.

No ads. No algorithmic feeds. No engagement metrics shoved in your face. No tracking cookies. No proprietary telemetry by default. No premium-only core features. No VC funding.

## Quick start (dev)

```bash
# 1. Prereqs: Node 22+, pnpm 10+, Docker (for Redis + MinIO)
# 2. Clone + install
git clone https://github.com/YOUR_ORG/torus.git
cd torus
pnpm install

# 3. Bring up local infrastructure (Redis, MinIO, mailhog)
cd infra && docker compose up -d && cd ..

# 4. Copy env and migrate the DB
cp .env.example .env
pnpm db:migrate

# 5. Run everything in dev mode
pnpm dev
```

Open <http://localhost:3000>.

## Repo layout

```
apps/
  web/         Next.js 15 app (UI + API via Route Handlers)
  worker/      BullMQ worker for audio processing
packages/
  db/          Drizzle SQLite schema + migrations
  storage/     S3-compatible Storage interface + drivers (minio, s3, azure, gcs)
  shared/      Zod schemas, share-code generator, types
  ui/          Tailwind components (Waveform, UploadDropzone, etc.)
  visualizers/ R3F 3D visualizer presets
infra/
  docker-compose.yml       local dev stack
  docker-compose.prod.yml  prod stack with 8TB drive bind mounts + Litestream
  Caddyfile                reverse proxy with auto-HTTPS
```

## Tech stack

- **Next.js 15** + React 19 + TypeScript + Tailwind v4
- **SQLite** (WAL mode) + **Drizzle** ORM + **Litestream** continuous backup
- **Redis** + **BullMQ** for worker queue + rate limiting
- **MinIO** (S3-compatible) for object storage — swappable to AWS / Cloudflare R2 / Backblaze B2 / Azure / GCS via one env var
- **ffmpeg** + **audiowaveform** (BBC) for audio processing
- **wavesurfer.js** + custom Canvas overlay for 2D waveforms
- **react-three-fiber** + **drei** + **postprocessing** for 3D visualizers
- **Caddy** reverse proxy for auto-HTTPS in prod

## License

[AGPL-3.0-or-later](./LICENSE) — anyone running a modified public instance must share their changes. This protects the hub model and keeps forks open.

## Contributing

We love contributors. See [`CONTRIBUTING.md`](./CONTRIBUTING.md). The 3D visualizer system in particular is a great place to start — each preset is a single self-contained R3F file.

## Sustainability

torus.fm is run as a passion project, not a startup. We accept donations via [GitHub Sponsors](#) and [Open Collective](#), and a tiny optional [Supporter tier](#) ($3/mo) gets you a custom subdomain. No ads, no data sales, no VC funding — see [`PRINCIPLES.md`](./PRINCIPLES.md).

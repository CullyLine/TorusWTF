# torus.wtf

> **Share the loop. Visualize anything.**

An open-source audio toolkit built for producers, musicians, and the terminally online — split across two sibling web apps:

- **[torus.wtf](apps/web)** — drop any audio, get an instant share link with a beautiful waveform
- **[visualizer.torus.wtf](apps/visualizer)** — turn any audio (Spotify, Ableton, Splice, mic, your own files, or a random track from our SoundCloud) into 3D visuals you can export

No ads. No algorithmic feeds. No engagement metrics shoved in your face. No tracking cookies. No proprietary telemetry by default. No premium-only core features. No VC funding. See [`PRINCIPLES.md`](./PRINCIPLES.md).

## What it does

### Clip sharing (`apps/web`)
- **One-click upload** — drag-and-drop or click-to-browse, anywhere in the app
- **Instant share code** — `torus.wtf/kT9mFq2x` copied to clipboard the moment the upload finishes
- **Beautiful waveforms** — frequency-band-colored 2D waveform fingerprint on every clip
- **Optional 3D visualizers** in the clip player
- **Community front page** — weekly-voted top clips, anonymous-friendly uploads
- **Self-hostable** — single `docker compose up -d` runs the entire stack

### Visualizer (`apps/visualizer`)
- **10 GPU-accelerated presets** — Torus Field, Particle Storm, Spectral Tunnel (warp), Volumetric Waveform, Cosmic Mandala, Star Field (face-on galaxy), Outrun Grid (3D synthwave terrain), Liquid Chrome (GPU shader), Liquid Blob (raymarched metaballs), Mandelbrot Zoom (infinite fractal)
- **4 audio sources** — local file, microphone, desktop tab capture (Chrome/Edge), or **WTF** for a random track auto-pulled from our SoundCloud at build time
- **Full-bleed viewport** — visuals take the whole screen, controls float on top as a glass panel that fades out when idle
- **Export** — WebM (VP9 + Opus) or MP4 where supported, up to 4K / 240fps with the $10 one-time unlock
- **Mad-scientist controls** — Gain, Bass/Mid/High mix, Bloom, Speed, and Smoothness sliders with 5x headroom; double-click any value to type any number with no clamp
- **Custom palettes, saved presets, snapshot, BPM detection, keyboard shortcuts**

## Quick start

**Prereqs:** Node 22+, pnpm 10+, Docker Desktop (must be running).

### Windows

Just double-click **`start.bat`**.

It checks your tools, copies `.env` if needed, installs dependencies (first run only), spins up Redis + MinIO + Mailhog in Docker, runs DB migrations, opens your browser, and starts dev servers.

| Script        | What it does                                                        |
| ------------- | ------------------------------------------------------------------- |
| `start.bat`   | Full happy-path startup. Idempotent — safe to run again.             |
| `stop.bat`    | Stop Docker services (your data is preserved).                       |
| `reset.bat`   | Nuke local DB + MinIO volume. Asks for confirmation first.           |
| `update.bat`  | `git pull` + `pnpm install` + run new migrations.                    |

### macOS / Linux

```bash
chmod +x start.sh stop.sh reset.sh update.sh   # once, after clone
./start.sh
```

Same four scripts (`start.sh`, `stop.sh`, `reset.sh`, `update.sh`).

### Manual (if you prefer)

```bash
pnpm install
docker compose -f infra/docker-compose.yml up -d
cp .env.example .env
pnpm db:migrate
pnpm dev
```

Open <http://localhost:3000> for the clip-sharing site and <http://localhost:3001> for the visualizer. Dev starts the web app, the visualizer, and the audio worker (required for waveforms). Caught magic-link emails appear at <http://localhost:8025> (Mailhog). MinIO console at <http://localhost:9001> (`minioadmin` / `minioadmin`).

## Repo layout

```
apps/
  web/         Next.js 15 app for clip sharing (torus.wtf)
  visualizer/  Next.js 15 standalone visualizer app (visualizer.torus.wtf)
  worker/      BullMQ worker for audio processing
packages/
  db/          Drizzle SQLite schema + migrations
  storage/     S3-compatible Storage interface + drivers (minio, s3, azure, gcs)
  shared/      Zod schemas, share-code generator, types
  ui/          Tailwind components (Logo, Waveform, UploadDropzone, ShareCard)
  visualizers/ React-Three-Fiber 3D preset library, shared by both apps
infra/
  docker-compose.yml       local dev stack
  docker-compose.prod.yml  prod stack with bind mounts + Litestream
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
- **soundcloud-downloader** for the visualizer's build-time WTF track prefetch
- **Caddy** reverse proxy for auto-HTTPS in prod

## License

[AGPL-3.0-or-later](./LICENSE) — anyone running a modified public instance must share their changes. This protects the hub model and keeps forks open.

## Contributing

We love contributors. See [`CONTRIBUTING.md`](./CONTRIBUTING.md). The 3D visualizer system in particular is a great place to start — each preset is a single self-contained R3F file in `packages/visualizers/src/presets/`.

## Sustainability

torus.wtf is run as a passion project, not a startup. We accept donations via [GitHub Sponsors](#) and [Open Collective](#), and a tiny optional [Supporter tier](#) ($3/mo) gets you a custom subdomain. The visualizer offers a $10 one-time unlock for higher export quality. No ads, no data sales, no VC funding — see [`PRINCIPLES.md`](./PRINCIPLES.md).

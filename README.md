# torus

> **3D visuals for your audio — plus a few sharp tools for music.**

torus turns any audio into something you want to look at. Point it at Spotify, Ableton, Splice, a file, or your mic, shape the visuals, and export for Reels, Shorts, a release, or a live set. The visualizer is the heart of it; around that lives a small set of focused tools.

No ads. No algorithmic feed. No data selling. No subscription treadmill — the only thing we ever charge for is one optional, one-time **Production License**. See [`PRINCIPLES.md`](./PRINCIPLES.md).

## What's inside

- **Visualizer** (`/`) — turn any audio into GPU-accelerated 3D visuals. Capture from a browser tab, a file, or your mic; tune reactivity, colors, and camera; export real-time WebM or pre-rendered high-quality video.
- **Conductor** (`/conductor`) — a lightweight in-browser SoundFont DAW for sketching music.
- **Transcriber** (`/transcriber`) — audio → MIDI, entirely in your browser.
- **Stem Separation** — on the way.
- **Profiles & accounts** — magic-link or Discord sign-in, a simple `/u/<handle>` profile, and the account-bound Production License.

### The Production License

Everything is free. Free exports are watermarked and capped at 720p / 30 fps. The **$10 one-time, account-bound Production License** unlocks:

- exports up to 4K resolution
- high frame-rate exports (60 / 120 / 240 fps)
- no `torus.wtf` watermark
- commercial-use permission for your exports
- custom palette colors and title-card styling
- a licensed badge on your profile

## Architecture

A single Next.js app, deployed on Vercel, backed by libSQL (Turso in production, a local SQLite file in dev).

```
apps/
  visualizer/        # the whole product — visualizer, Conductor, Transcriber, auth, profiles, license
packages/
  db/                # Drizzle schema + libSQL client + migrations
  shared/            # shared types/utilities
  ui/                # shared UI primitives (Logo, Toast, magic-link notice)
  visualizers/       # the visualizer presets + engine
```

## Quick start

**Prereqs:** Node 22+, pnpm 10+.

```bash
pnpm install
cp .env.example .env      # the defaults work for local dev as-is
pnpm db:migrate           # creates ./data/torus.db
pnpm dev                  # http://localhost:3000
```

That's it — one app, one port. Auth, email, and payments are all optional; the app runs without them. To test email sign-in locally, run any SMTP catcher (e.g. Mailhog) on `:1025` and read mail at `:8025`.

To exercise the paid export paths without real billing, open `/unlock` and use **Activate test mode**.

## Common scripts

```bash
pnpm dev            # run the app
pnpm build          # production build
pnpm typecheck      # tsc across the workspace
pnpm lint           # eslint across the workspace
pnpm test           # unit tests
pnpm db:generate    # generate a migration from schema changes
pnpm db:migrate     # apply migrations
pnpm db:studio      # drizzle studio
```

## Deployment

Deploy `apps/visualizer` to Vercel and provide the Turso connection: either set `DATABASE_URL` (a `libsql://…turso.io` URL) plus `TURSO_AUTH_TOKEN`, or use the Vercel Turso integration, which injects `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` (both are read automatically). Configure the optional integrations (SMTP, Discord, Polar) as needed — see [`.env.example`](./.env.example). Run `pnpm db:migrate` against the Turso database once before first launch.

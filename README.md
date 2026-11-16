# torus

torus turns audio into 3D visuals in the browser and exports them as video. It runs at [torus.wtf](https://torus.wtf).

torus is free. It has no ads, no paid tier, and no required account. Audio is analyzed and rendered on your device and is never uploaded. [PRINCIPLES.md](./PRINCIPLES.md) lists the commitments.

## What it does

- **Visualizer** (`/`). Takes audio from a file, a microphone, a browser tab, or desktop capture and draws it with one of nine WebGL visualizers. It exports a real-time recording (WebM or MP4) or an offline pre-render (MP4, up to 4K and 240 fps).
- **Conductor** (`/conductor`). A SoundFont DAW for sketching music.
- **Transcriber** (`/transcriber`). Converts audio to MIDI in the browser.
- **Accounts.** Optional. Magic-link or Discord sign-in gives you a handle and a profile at `/u/<handle>`.

## Repository layout

One Next.js app and four workspace packages, managed with pnpm and Turborepo.

```
apps/visualizer        The app: visualizer, Conductor, Transcriber, accounts
packages/visualizers   Visualizer presets and the rendering engine (React Three Fiber)
packages/db            Drizzle schema, libSQL client, migrations
packages/ui            Shared UI components
packages/shared        Shared types and id generation
```

[apps/visualizer/README.md](./apps/visualizer/README.md) describes the app in more detail.

## Quick start

You need Node 22 or newer and pnpm 10 or newer.

```bash
pnpm install
cp .env.example .env      # the defaults work for local dev
pnpm db:migrate           # creates ./data/torus.db
pnpm dev                  # http://localhost:3000
```

Sign-in and email are optional, and the app runs without them. To test email sign-in locally, run an SMTP catcher such as Mailhog on port 1025 and read the mail on port 8025.

## Scripts

```bash
pnpm dev            # run the app
pnpm build          # production build
pnpm typecheck      # tsc across the workspace
pnpm lint           # eslint across the workspace
pnpm test           # unit tests (Vitest)
pnpm format         # prettier
pnpm db:generate    # generate a migration from schema changes
pnpm db:migrate     # apply migrations
pnpm db:studio      # open Drizzle Studio
```

CI runs `db:migrate`, `typecheck`, `lint`, and `test` on every push and pull request.

## Deployment

Deploy `apps/visualizer` to Vercel. The database is libSQL: a local SQLite file in development and [Turso](https://turso.tech) in production.

Connect the database in one of two ways:

- Set `DATABASE_URL` to a `libsql://` URL and `DATABASE_AUTH_TOKEN` to its token.
- Use the Vercel Turso integration, which sets `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.

Run `pnpm db:migrate` against the production database once before the first launch. [.env.example](./.env.example) lists the optional SMTP and Discord settings.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). New visualizers are a good first contribution.

## License

[AGPL-3.0-or-later](./LICENSE).

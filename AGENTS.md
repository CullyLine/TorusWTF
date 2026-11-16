# AGENTS.md

## Cursor Cloud specific instructions

**Product:** `torus` — a single Next.js 15 app (`apps/visualizer`) that turns audio into GPU-accelerated 3D visuals, plus in-browser tools (Conductor, Transcriber, Projector) and optional accounts. It's a pnpm + Turborepo monorepo (`packages/{db,shared,ui,visualizers}`). Standard commands live in the root `README.md` and `package.json` scripts; prefer those.

### Running the app
- Dev server: `pnpm dev` (Turbo → Next.js). Serves on **http://localhost:3000**.
- The `dev`/`build` scripts first run `copy-*-assets.mjs` steps that bundle SoundFont / basic-pitch model / libsonare wasm into `public/`. This is normal startup output, not an error.
- One app, one port. Auth, email (SMTP), and Discord OAuth are all **optional**. The app runs without them. Every feature is free, so there is no paid path to test.
- Core hello-world with no external input: open `/`, click **"Try with demo audio"** — it loads a bundled demo track and renders animated 3D visuals; the Preset panel switches visual styles live.

### Database (local dev)
- Uses libSQL. Local dev is a plain on-disk SQLite file at `./data/torus.db` (repo root), created by applying migrations. Production uses hosted Turso. No DB server/process is needed locally.
- `pnpm db:migrate` applies the migrations. The DB path is anchored to the repo root regardless of cwd, so it writes `./data/torus.db` at the repo root.
- The DB only backs accounts and profiles. If you only need the visualizer/Conductor/Transcriber, you can skip migration entirely (those are fully client-side).

### Lint / test / build
- `pnpm test` — Vitest across the workspace; all suites pass.
- `pnpm build` — production Next.js build; succeeds.
- `pnpm lint` — ESLint across the workspace; all packages lint clean.

### Chrome / hardware acceleration (Cloud VM)
- The torus visualizer shows a dismissible banner when WebGL reports a software renderer (`swiftshader`, `llvmpipe`, etc.) — see `apps/visualizer/src/lib/hwAccel.ts`.
- Cloud VM Chrome is initially configured with `--use-angle=swiftshader-webgl` and the VNC session sets `LIBGL_ALWAYS_SOFTWARE=1` / `GALLIUM_DRIVER=llvmpipe` because there is **no physical GPU** (`/dev/dri` absent).
- To enable Chrome's hardware-acceleration path, `/usr/local/bin/google-chrome` (and `/usr/local/bin/chrome`) were updated to: unset those Mesa env vars, drop SwiftShader flags, and add `--enable-gpu --ignore-gpu-blocklist`. Chrome's **Settings → System → "Use graphics acceleration when available"** should be ON (it is by default).
- **The banner may still appear** even after these changes: Chrome may report WebGL as "Hardware accelerated" on `chrome://gpu`, but the actual renderer string is still `ANGLE (Mesa, llvmpipe …)` — CPU software rendering. The torus banner is correct in this case. Visualizers still work; performance is limited. To fully clear the banner you need a machine with a real GPU, or dismiss it with the ✕ button (stored in `localStorage` under `torus-visualizer-hwaccel-banner-dismissed`).
- After changing Chrome launch flags, kill all Chrome processes (`pkill -9 chrome`), remove `~/.config/google-chrome/Singleton{Lock,Socket,Cookie}`, and relaunch via `/usr/local/bin/google-chrome`.

### Notes
- `CONTRIBUTING.md` says to run `cd infra && docker compose up -d` for Redis + MinIO, but **there is no `infra/` directory or compose file in the repo**, and `REDIS_URL`/`STORAGE_*` env vars are unused scaffolding. No Docker is needed for local dev.
- `cp .env.example .env` — the defaults work as-is for local dev.

# AGENTS.md

## Cursor Cloud specific instructions

**Product:** `torus` — a single Next.js 15 app (`apps/visualizer`) that turns audio into GPU-accelerated 3D visuals, plus in-browser tools (Conductor, Transcriber, Projector) and account/license features. It's a pnpm + Turborepo monorepo (`packages/{db,shared,ui,visualizers}`). Standard commands live in the root `README.md` and `package.json` scripts; prefer those.

### Running the app
- Dev server: `pnpm dev` (Turbo → Next.js). Serves on **http://localhost:3000** (the `apps/visualizer/README.md` mention of 3001 is stale; the real port is 3000).
- The `dev`/`build` scripts first run `copy-*-assets.mjs` steps that bundle SoundFont / basic-pitch model / libsonare wasm into `public/`. This is normal startup output, not an error.
- One app, one port. Auth, email (SMTP), Discord OAuth, and Polar payments are all **optional** — the app runs fine without them. To exercise paid export paths without billing, open `/unlock` → **Activate test mode**.
- Core hello-world with no external input: open `/`, click **"Try with demo audio"** — it loads a bundled demo track and renders animated 3D visuals; the Preset panel switches visual styles live.

### Database (local dev)
- Uses libSQL. Local dev is a plain on-disk SQLite file at `./data/torus.db` (repo root), created by applying migrations. Production uses hosted Turso. No DB server/process is needed locally.
- **Gotcha — `pnpm db:migrate` is currently broken under this Node/tsx toolchain.** `packages/db` is ESM (`"type": "module"`), but `packages/db/src/client.ts` references a bare `require` on the `file:` (native libsql) code path. That escape hatch is fine inside Next/webpack at runtime (webpack defines `__non_webpack_require__`), but the standalone `tsx src/migrate.ts` script runs as ESM where `require` is undefined → `ReferenceError: require is not defined`.
- Workaround to apply migrations without touching source (a bare `require` in ESM resolves against `globalThis`):
  ```bash
  cd packages/db
  cat > ./__migrate_boot.mts <<'EOF'
  import { createRequire } from 'node:module';
  (globalThis as any).require = createRequire(import.meta.url);
  await import('./src/migrate.ts');
  EOF
  DATABASE_URL='file:./data/torus.db' pnpm exec tsx ./__migrate_boot.mts
  rm -f ./__migrate_boot.mts
  cd -
  ```
  The DB path is anchored to the repo root regardless of cwd, so this writes `./data/torus.db` at the repo root.
- The DB only backs accounts/profiles/licenses. If you only need the visualizer/Conductor/Transcriber, you can skip migration entirely (those are fully client-side).

### Lint / test / build
- `pnpm test` — Vitest across the workspace; all suites pass.
- `pnpm build` — production Next.js build; succeeds.
- `pnpm lint` — **currently fails on pre-existing issues in `packages/db`** (a `require()` in `src/native-libsql.cjs` flagged by `@typescript-eslint/no-require-imports`, plus an unused eslint-disable in `src/client.ts`). This is a pre-existing code/config issue, not an environment problem; other packages lint clean.

### Chrome / hardware acceleration (Cloud VM)
- The torus visualizer shows a dismissible banner when WebGL reports a software renderer (`swiftshader`, `llvmpipe`, etc.) — see `apps/visualizer/src/lib/hwAccel.ts`.
- Cloud VM Chrome is initially configured with `--use-angle=swiftshader-webgl` and the VNC session sets `LIBGL_ALWAYS_SOFTWARE=1` / `GALLIUM_DRIVER=llvmpipe` because there is **no physical GPU** (`/dev/dri` absent).
- To enable Chrome's hardware-acceleration path, `/usr/local/bin/google-chrome` (and `/usr/local/bin/chrome`) were updated to: unset those Mesa env vars, drop SwiftShader flags, and add `--enable-gpu --ignore-gpu-blocklist`. Chrome's **Settings → System → "Use graphics acceleration when available"** should be ON (it is by default).
- **The banner may still appear** even after these changes: Chrome may report WebGL as "Hardware accelerated" on `chrome://gpu`, but the actual renderer string is still `ANGLE (Mesa, llvmpipe …)` — CPU software rendering. The torus banner is correct in this case. Visualizers still work; performance is limited. To fully clear the banner you need a machine with a real GPU, or dismiss it with the ✕ button (stored in `localStorage` under `torus-visualizer-hwaccel-banner-dismissed`).
- After changing Chrome launch flags, kill all Chrome processes (`pkill -9 chrome`), remove `~/.config/google-chrome/Singleton{Lock,Socket,Cookie}`, and relaunch via `/usr/local/bin/google-chrome`.

### Notes
- `CONTRIBUTING.md` says to run `cd infra && docker compose up -d` for Redis + MinIO, but **there is no `infra/` directory or compose file in the repo**, and `REDIS_URL`/`STORAGE_*` env vars are unused scaffolding. No Docker is needed for local dev.
- `cp .env.example .env` — the defaults work as-is for local dev.

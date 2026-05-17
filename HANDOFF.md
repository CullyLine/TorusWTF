# HANDOFF — for future agents (and future-you)

This file is the orientation packet for anyone picking up work on torus.fm with a fresh context. Read this end-to-end before doing anything else.

---

## 0. TL;DR — the project in three sentences

**torus.fm** is a no-bullshit, open-source, self-hostable audio clip sharing site — a spiritual successor to Clyp.it. Drag a file in, get an instant short share link, beautiful frequency-band-colored waveform, optional fullscreen 3D visualizers (Torus Field, Particle Storm, Spectral Tunnel, Volumetric Waveform). Monorepo: Next.js 15 web app + BullMQ worker + Drizzle on SQLite (+ Litestream backup) + pluggable Storage (MinIO/S3/Azure/GCS).

---

## 1. Where everything lives

| Where | What |
| --- | --- |
| `F:\CODE STUFF\TorusFM` | the entire project (Windows, AMD64). It's the agent root. |
| `F:\CODE STUFF\TorusFM\.git` | git repo, branch `main`, no remote configured yet |
| `F:\CODE STUFF\TorusFM\data\torus.db` | the SINGLE canonical SQLite file — do not let multiple copies appear |
| `F:\CODE STUFF\TorusFM\.env` | local dev env (copied from `.env.example` by `start.bat`) |
| `F:\CODE STUFF\TorusFM\assets\` | the four brand logo PNGs |
| `~/.cursor/plans/clyp-successor-mvp_84ced26b.plan.md` | the original product/architecture plan — read it for design intent |

The user is on **Windows 10, AMD Ryzen 5 3600, PowerShell**. Docker Desktop is installed and running. Node 22.22, pnpm 10.31, git 2.37.

---

## 2. Brand context (do not lose this)

- **Name**: `torus` (always lowercase, never "Torus FM" or "TorusFM")
- **URL**: `torus.fm` (not registered yet — user will register on Porkbun)
- **Defensive grabs recommended**: `torus.audio`, `torus.app`
- **Why this name**: the geometric form of a loop = the medium of music. Also a meaningful nod to the user's first musical influence, an EDM producer named Torus.
- **Visual language**:
  - Color palette: `#0A0B1E` (cosmic indigo bg) + `#FF2D95` (bass magenta) / `#22D3CE` (mid teal) / `#F7E08C` (high gold) — these are also the frequency-band colors on the waveform
  - Primary logo: minimal donut ring outline + `torus.fm` wordmark beneath (`.fm` smaller/lighter). Reference: `assets/torus-logo-1-minimal-ring-v2.png`. There are three other variants in `assets/`.
- **Sacred-geometry energy-flow concept**: the user cares about this. Don't dismiss it as window dressing — it's why the Torus Field 3D preset exists and why the brand mark is what it is.

---

## 3. The hard rules — read PRINCIPLES.md before proposing features

`PRINCIPLES.md` at the repo root is a hard contract with users, not a marketing line. The forbidden list:

- No ads, ever
- No algorithmic engagement-maximizing feeds
- No selling user data
- No training AI models on uploaded clips without explicit per-clip opt-in
- No "premium-only" core features (upload, share, waveform, 3D visualizers, community — all free forever)
- No notification / email nag campaigns
- No dark patterns in unsubscribe / account-deletion flows
- No tracking cookies / third-party analytics by default
- No VC funding (the Clyp.it death spiral)

**If you propose a feature, justify it against this list first.** The user picked these rules deliberately and asked that future-them not be allowed to forget them.

---

## 4. Tech stack quick map

```
apps/
  web/      Next.js 15 + React 19 + Tailwind v4 + Route Handlers (UI + entire API)
  worker/   BullMQ worker for ffmpeg + audio analysis
packages/
  db/       Drizzle SQLite schema + migrations
  storage/  Storage interface + drivers (minio/s3/azure/gcs)
  shared/   share-code generator, week-bucket helpers, Zod env, types
  ui/       Waveform, UploadDialog, Toast, Logo, ShareCard
  visualizers/  R3F presets + audio analyser hook
infra/      docker-compose for dev + prod, Caddyfile, Litestream
```

Auth: Lucia-style sessions in SQLite. Magic-link via SMTP (Mailhog locally). Discord OAuth via `arctic` v3 (PKCE).
Payments: Polar.sh (HMAC-verified webhook, custom-subdomain perk in v1).

---

## 5. The dev loop (what to type)

```powershell
# from F:\CODE STUFF\TorusFM:
start.bat              # full one-click bootstrap
stop.bat               # stop docker services (data preserved)
reset.bat              # nuke DB + MinIO volume (asks first)
update.bat             # git pull + reinstall + migrate

# manual:
pnpm install
docker compose -f infra/docker-compose.yml up -d
pnpm db:migrate
pnpm dev               # next + worker via turbo
pnpm -r typecheck
pnpm -r test
```

**Local URLs**:
- `http://localhost:3000` — Next.js app
- `http://localhost:8025` — Mailhog (caught magic-link emails)
- `http://localhost:9001` — MinIO console (`minioadmin` / `minioadmin`)

---

## 6. Gotchas we hit (and you will too if you don't read this)

These are the bugs we already fought through. Future agent: if any of these symptoms reappear, look here first.

### 6.1 pnpm v10 silently skips install scripts
**Symptom**: `Could not locate the bindings file` (better-sqlite3 has no `.node` binary).
**Why**: pnpm v10 ignores postinstall scripts by default for security.
**Fix (already in place)**: `pnpm.onlyBuiltDependencies` array in root `package.json` listing `better-sqlite3`, `sharp`, `esbuild`, `msgpackr-extract`, `unrs-resolver`. If you add a new native dep, add it to that list and run `pnpm install --force` once.

### 6.2 Monorepo cwd: relative paths break
**Symptom**: `no such table: votes` even after migration, or `STORAGE_*` env vars undefined.
**Why**: Each process (web, worker, migrate CLI) has a different cwd. A `./data/torus.db` becomes a different file in each. Same with `.env`.
**Fix (already in place)**: both `packages/db/src/client.ts` and `apps/web/next.config.ts` and `apps/worker/src/index.ts` walk up the filesystem looking for `pnpm-workspace.yaml` and resolve from that root. If you add another process that touches `.env` or the DB, do the same walk-up.

### 6.3 Next.js route param naming conflict
**Symptom**: `You cannot use different slug names for the same dynamic path`.
**Why**: Next.js requires the same param name at the same path depth across ALL routes. Don't have `[shareCode]` in one route and `[clipId]` in another at the same depth.
**Current convention**: everything under `/api/clips/[shareCode]/...` uses `shareCode` (not internal id).

### 6.4 `.js` extensions in TypeScript imports break Next bundling
**Symptom**: `Module not found: Can't resolve './foo.js'` at build/dev time.
**Why**: TypeScript's `bundler` moduleResolution accepts `from './foo.js'` referring to `./foo.tsx`, but Next.js's webpack pipeline can't follow this mapping for `transpilePackages`.
**Convention**: **never use `.js` extensions on relative imports in this repo.** This applies to both `from '...'` and `await import('...')`. The worker uses `tsx` at runtime so `.js` would technically work there, but stay consistent.

### 6.5 BullMQ jobIds can't contain `:`
**Symptom**: `Error: Custom Id cannot contain :`.
**Why**: BullMQ v5 reserves `:` as a Redis-key namespace separator in jobIds.
**Fix**: use `-` (we use `clip-${id}` as jobId).

### 6.5b ESM import hoisting beats your IIFE env loader
**Symptom**: env vars set by `dotenv` are undefined inside imported modules — e.g. `Could not load credentials from any providers` in the worker.
**Why**: ESM evaluates all `import` statements before running any non-import top-level code, regardless of source order. So `import { processClip } from './jobs/process-clip'` runs `process-clip.ts`'s top-level (`const storage = createStorage()`) BEFORE the IIFE that calls `dotenv.config()`.
**Fix (already in place)**: in `apps/worker/src/jobs/process-clip.ts`, both `db` and `storage` are lazy function singletons (`const db = () => (_db ??= getDb())`) so they only construct on first call — well after env vars are populated. If you add another module-level singleton that reads env, apply the same pattern.

### 6.6 Windows `.bat` files have three sharp edges
**Symptoms** range from `... was unexpected at this time` to scripts silently exiting.
**Always**:
- Save with **CRLF line endings** (enforced by `.gitattributes`)
- **Pure ASCII** in `.bat` files — no em-dashes, smart quotes, or box-drawing characters
- **No parens** in echo statements that are inside `if (...) (...)` blocks — they close the block early. Use single-line `if X goto :label` form instead.
- Use `ping -n N 127.0.0.1 >nul` instead of `timeout /t N` (timeout fails when stdin is redirected)
- Add `pause` before `exit /b 1` so the window doesn't auto-close on double-click crash
- When writing `.bat` content via PowerShell, force CRLF explicitly: `$text -replace "`r`n","`n" -replace "`n","`r`n"` then write as ASCII bytes.

### 6.7 `.env` lives at repo root, not in `apps/web/`
Already covered in 6.2. Don't move it. Don't create a duplicate.

### 6.8 Next.js + React 19 peer dep warnings
You'll see `unmet peer react@^18` warnings from some R3F-adjacent packages on install. They're cosmetic — `@react-three/fiber` v9, `@react-three/drei` v10, and `@react-three/postprocessing` v3 all genuinely support React 19. Ignore.

---

## 7. Sequence diagram for the core upload flow

```
Browser                  Next.js API         MinIO                Worker (BullMQ)
   |                          |                  |                      |
   | POST /api/clips          |                  |                      |
   |------------------------->|                  |                      |
   |                          | rate-limit check |                      |
   |                          | gen share code   |                      |
   |                          | gen claim_token  |                      |
   |                          | issue presign    |                      |
   |  201 + presigned URL     |                  |                      |
   |<-------------------------|                  |                      |
   |                                             |                      |
   |   PUT (file bytes) ----------------------->|                      |
   |   201 OK                                    |                      |
   |                                             |                      |
   | POST /api/clips/SHARE/complete              |                      |
   |------------------------->|                  |                      |
   |                          | objectExists?    |                      |
   |                          |--------------->  |                      |
   |                          | enqueue clip-ID  ----------------------> |
   |  200 OK + status=proc.   |                                          |
   |<-------------------------|                                          |
   |                                                                    |
   |              SSE /api/clips/SHARE/stream  <-- polls DB             |
   |<==================================================== ffprobe -> opus
   |              clip-update event with audioUrl etc.   peaks/FFT/palette
   |                                                     spectrogram.png
   |                                                     og.png
   |                                                     mark status=ready
```

---

## 8. Project state at handoff

**Branch**: `main`, 8 commits, no remote yet.
**Last working state**: dev server boots, home page returns HTTP 200, upload init returns valid presigned MinIO URL, BullMQ enqueue now uses `-` not `:`.

**Recent commit history** (newest first):
```
fix: BullMQ jobIds can't contain : -> use clip-<id>     (this commit)
fix: load .env from monorepo root in web + worker
fix: strip .js from dynamic import() calls
fix: actually boot — route conflict, .js imports, single DB path
fix: pnpm native module approvals + start.bat resilience
fix: .bat scripts use CRLF, pure ASCII, and goto-based ifs
feat: one-double-click dev scripts (start/stop/reset/update)
feat: initial torus.fm monorepo
```

**Verified working end-to-end** (as of last fix):
- ✅ Home page renders
- ✅ `pnpm -r typecheck` passes cleanly
- ✅ `pnpm test` passes (8 unit tests in shared)
- ✅ Docker dev stack comes up
- ✅ Migrations apply
- ✅ Upload init issues a valid presigned URL
- ⏳ Full upload → process → playback round-trip (worker hasn't been invoked end-to-end yet during user testing)

**Known gaps / next things to tackle**:
- The worker's actual processing pipeline (ffmpeg + audiowaveform) hasn't run end-to-end yet in user testing. Watch for issues with ffmpeg path, Goertzel FFT correctness, sharp/svg rendering.
- No real e2e test exists yet (Playwright config is there but only smoke tests).
- No GitHub repo yet — user will create one and push when ready.
- No domain registered. `torus.fm` availability already verified, just needs purchase.
- `.env.example` defaults assume local MinIO — production env requires real `MINIO_ACCESS_KEY`, `SESSION_SECRET`, `DOMAIN`, `LETSENCRYPT_EMAIL`.

---

## 9. Communication norms with the user

- The user thinks like a producer/builder, not a JS-framework specialist. Explain framework-specific errors in plain language.
- They value **directness and brevity** over hedging. Don't say "perhaps we might consider" — say "do this."
- They appreciate honest pushback. When they suggested ideas during planning, the productive moves were challenging weak ones (e.g., I pushed back on the original Next.js+Fastify split, on certain logo concepts, on bad domain choices).
- They explicitly asked at handoff to "think of everything a future agent would need to know" — that's why this file exists. Update it as you learn things.
- They run scripts by double-clicking, not from a terminal. So failure modes that look fine in a terminal (window closing immediately, no error visible) are real problems.

---

## 10. If you find yourself wanting to do something out of scope

Stop and ask the user first. Things that count as scope changes:

- Adding any new dependency that isn't on the existing approved list
- Adding analytics, telemetry, or any third-party SDK
- Changing the public URL shape (`torus.fm/XXXXXXXX`)
- Changing the data model in a way that requires a migration
- Touching `PRINCIPLES.md`
- Anything in `SUCCESSION.md`

---

*Last reviewed: 2026-05-17 by the agent who shipped the v0.1 monorepo. Update this date and a short note when you finish meaningful work.*

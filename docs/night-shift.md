# night shift — torus.wtf

Autonomous improvement loop for the visualizer. One **Architect** run each morning replaces the Priority list below with ten ranked ideas; **Builder** runs through the day each ship one idea as a PR. A human reviews every PR and merges at the end of the day — nothing lands on `main` without review.

**The mission:** make the visualizers more fluid, more alive, more beautiful.

- *Fluid* — motion quality. Easing, springs, inertia, continuity. Nothing pops, snaps, or moves linearly unless it's a deliberate hit on a transient.
- *Alive* — the feeling of a living thing. Idle breathing, anticipation, organic variation, deeper audio-reactivity (transients, beat phase, spectral nuance — see `packages/visualizers/src/metrics.ts`), behavior that surprises without ever feeling random.
- *Beautiful* — color, light, and composition. Palette life, bloom discipline, camera choreography, framing that owns the screen (see the "Pulse Update" framing philosophy in `packages/visualizers/src/registry.ts`).

## Shared rules

**Scope — where night shift has full creative power:**

- `packages/visualizers/` — presets (`src/presets/`), the engine (`SceneRig.tsx`, `modulation.tsx`, `livingPalette.tsx`, `metrics.ts`, `BackgroundLayer.tsx`, `AuraLayer.tsx`, `cameraZoom.tsx`, `VisualizerCanvas.tsx`), control schema and registry defaults.
- `apps/visualizer/` — visualizer UI polish and control wiring only where an idea requires it.
- New presets are welcome: one self-contained R3F component in `packages/visualizers/src/presets/` plus a registry entry (per `CONTRIBUTING.md`). New preset controls go through `controlSchema.ts` + `presetControls` — the panel renders them generically; never hand-build UI for one preset.

**Hard rules — inherited from `apps/visualizer/ROADMAP.md`; violating any means abort the run and leave a note in the Built log instead of a PR:**

1. Only touch `apps/visualizer/` and `packages/visualizers/`. Never touch `apps/web/`, `apps/worker/`, `packages/db/`, `packages/storage/`, `packages/ui/`, billing, auth, or migrations.
2. Never push to `main`. Builders always work on a feature branch and open a PR; the Architect only ever pushes `night-shift`.
3. Never modify `PRINCIPLES.md`, `LICENSE`, `SECURITY.md`, or `CODE_OF_CONDUCT.md`.
4. Never add analytics, tracking, third-party SDKs, ad scripts, telemetry, or any external script tag.
5. Never break the torus.wtf clip player (`apps/web/src/components/ClipPlayer.tsx` + `VisualizerViewport.tsx`). New `@torus/visualizers` props must be optional and default to current behavior.
6. Never break the `VisualizerSceneProps` contract — additions must be optional props that existing presets can ignore.
7. Never gate live preview behind the paid unlock. Only export quality / format / extras are paid.
8. Respect `prefers-reduced-motion` in any new animated UI.
9. New runtime dependencies only if small, well-justified in the PR body, and license-compatible (AGPL). Prefer zero.

**Performance and accessibility are part of beauty:**

- Every preset supports `tier: 'high' | 'mid' | 'low'`. New visual work must degrade gracefully — no idea ships if it tanks mid-tier. State the tier behavior in the PR.
- Aim for 60 fps on high tier. Prefer shader/instancing work over per-frame allocations; no per-frame GC churn.
- Accessibility bugs are real bugs here (see `PRINCIPLES.md`).

**Style:** `CONTRIBUTING.md` applies — TypeScript (no unjustified `any`), Prettier, Conventional Commits, comments only for non-obvious intent.

**Coordination mechanics:**

- The `night-shift` branch is the shared ledger; this file is the only file the Architect and the claim/log steps of Builders edit on it.
- Never rebase or force-push `night-shift`. Always `git fetch` and pull the latest `night-shift` immediately before editing the ledger, and push immediately after — the window between claim and push is the race you're avoiding.
- The Built log is append-only.

## Architect role

Runs once each morning. Never opens a PR; never pushes anything except `night-shift`.

1. Work only on the `night-shift` branch — create it from `origin/main` if it doesn't exist. Sync this file with any newer copy on `origin/night-shift` first.
2. Ground yourself: read `PRINCIPLES.md`, `CONTRIBUTING.md`, the hard rules in `apps/visualizer/ROADMAP.md`, the engine and presets under `packages/visualizers/src/`, recent commits on `main`, the Built log below, and open PRs.
3. Replace the Priority list below with **exactly 10 ideas, ranked best-first** by expected impact on fluid / alive / beautiful.
4. Each idea must be small enough for a single Builder pass (one PR, one sitting) and must not duplicate the Built log, an open PR, or an unchecked item on the `apps/visualizer/ROADMAP.md` execution queue. Unbuilt ideas from yesterday may be re-ranked, rewritten, or dropped freely.
5. Mix scales across the list: some single-preset polish, some engine-wide motion/color/reactivity work, occasionally a whole new preset (a new preset is one idea, not several).
6. Commit the updated list and push `night-shift`.

**Priority item format:**

```
- [ ] NS-YYYYMMDD-NN (S|M) **Title** — what changes on screen, and why it reads as more fluid/alive/beautiful. Area: <files or presets>. Accept: <one observable check>.
```

## Builder role

Runs several times a day. Ships exactly one item per run.

1. `git fetch`, then read the Priority list from the `night-shift` branch (or from `main` if that branch doesn't exist yet).
2. Take the **highest-priority item that is unclaimed, not built, and has no open PR** — exactly one item per run, never a second take of the same item. If everything is claimed or built, stop cleanly without a PR.
3. Claim it first: on `night-shift`, mark the item `[~] building <ISO timestamp>` and push. If the push is rejected, re-fetch and re-check the list — someone else may have claimed it.
4. Branch off the latest `origin/main` as `agent/<yyyymmdd>-<slug>` and implement a working first draft. Rough edges in code are acceptable; broken or half-rendered visuals are not — it must *look* intentional and feel like the mission.
5. Verify (the boot check):
   - `pnpm install`
   - `pnpm typecheck` && `pnpm lint` && `pnpm test`
   - `pnpm --filter @torus/visualizer build`
   - Fix what they surface. If the environment genuinely cannot run them, prefix the PR title with `[UNVERIFIED]`.
6. Open a PR titled with a conventional commit (e.g. `feat(visualizer): …`), body containing:
   - what changed on screen and why it serves fluid / alive / beautiful,
   - **exact steps to see it** — route, preset, suggested audio (e.g. "bass-heavy track"), and what to look for,
   - tier behavior (high / mid / low) and any perf notes,
   - risks or follow-ups.
7. Back on `night-shift`: check the item off with the PR link (`[x] … — PR #NN`) and append a Built log entry. Push.
8. Never push to `main`.

## Priority list

- [ ] NS-20260717-01 (S) **Aura flock to the beat** — Aura wisps drift inward on `gather`, burst outward on impact/`release`, and brighten with `shimmer`/`hat` — the presence layer flocks with the music instead of only wandering on Perlin paths. Alive across every preset. Area: `AuraLayer.tsx`. Accept: with Aura up, wisps visibly inhale before kicks and glitter on hats on any preset.
- [ ] NS-20260717-02 (S) **SceneRig light kit accents** — Bass light punches on `kick`, mid light cracks laterally on `snare`, high light ticks on `hat` (on top of existing swell/impact/shimmer ride) so the shared stage lighting answers the drum kit. Beautiful and alive engine-wide. Area: `SceneRig.tsx` (point-light frame loop). Accept: four-on-the-floor — kick brightens the low light, snare flashes the mid, hats sparkle the high, without strobing the whole scene.
- [ ] NS-20260717-03 (S) **Background musical inhale** — Nebula/aurora/glow (and starfield sparkle) ease inward/dim on `gather`, swell with `tension` through builds, and catch faint `shimmer` glitter — the sky listens with the track instead of only drifting on breath/flow. Area: `BackgroundLayer.tsx`. Accept: with Nebula or Aurora on, a pre-beat inhale is visible; hats add a brief sky glitter distinct from bass swell.
- [ ] NS-20260717-04 (S) **FOV punch spring** — Perspective FOV punch-in no longer assigns `targetFov` each frame; ease through a short SmoothDamp so lens kicks feel fluid and settle cleanly while afterglow still exhales wider. Fluid across all presets. Area: `SceneRig.tsx` (FOV block). Accept: on heavy kicks the lens tightens then eases back — no FOV stair-steps; quiet passages stay lens-still.
- [ ] NS-20260717-05 (S) **Star Field kit sparkle** — Spiral arms keep their flow, but stars tick-twinkle on `hat`, core punches on `kick`, and arm rotation locks a subtle phase to `barPhase` so the galaxy keeps time. Area: `presets/StarField.tsx`. Accept: hats produce sharp twinkles distinct from kick core pulses; arms feel bar-locked on a steady beat.
- [ ] NS-20260717-06 (M) **Liquid Blob inhale & phrase echo** — Metaball field contracts on `gather`, releases on impact, and in post-phrase gaps a faded `echo` ripple travels the surface so the goo anticipates and answers instead of only inflating. Area: `presets/LiquidBlob.tsx`. Accept: pre-beat squeeze visible; after a phrase gap, one delayed surface ripple passes without looking random.
- [ ] NS-20260717-07 (S) **Particle Storm kit whip** — Swarm already gathers; add `kick` floor punch, `snare` lateral crack, `hat` sparkle size-ticks, and a brief `echo` reverse-current in gaps so the storm plays the kit. Area: `presets/ParticleStorm.tsx`. Accept: kick vs snare push different axes; hats glitter particle size; after a gap, a faint reverse swirl once.
- [ ] NS-20260717-08 (S) **Torus Field kit & echo** — Brand torus keeps gather breath; outer point cloud ticks on `hat`, tube pulse on `kick`, lateral flash on `snare`, and `echo` briefly reverses flow drift in gaps. Signature form that drums with the track. Area: `presets/TorusField.tsx`. Accept: kick/snare/hat hit different parts of the form; after a phrase gap, flow drift reverses once then resumes.
- [ ] NS-20260717-09 (M) **New preset: Tide Veil** — Soft fullscreen caustic veil (raymarched or sheet shader) that rolls with `swell`, folds on `gather`, flashes caustics on impact, and holds warm residual light on `afterglow`. A new fluid beauty mode between Liquid Blob goo and Chrome metal. Area: new `presets/TideVeil.tsx` + `registry.ts` (+ `controlSchema` only if one preset-owned slider). Accept: preset appears in the picker; owns the frame at defaults; mid/low tiers drop detail without breaking.
- [ ] NS-20260717-10 (S) **Mandelbrot Zoom gather dive** — Fractal zoom eases slightly outward on `gather` (anticipation), then dives harder on impact/`kick` while `tension` nudges iteration ornate-ness through builds — the bulb inhales before it plunges. Area: `presets/MandelbrotZoom.tsx`. Accept: pre-beat slight zoom-out then hit dive; builds look more ornate before the drop without hitching mid-tier.

## Built log

*(Append-only: `YYYY-MM-DD — NS-id — PR #NN — one-line result`.)*

- 2026-07-16 — NS-20260716-01 — PR #16 — Camera pose springs (SmoothDamp) so mode switches glide; bass shake still on top.
- 2026-07-16 — NS-20260716-02 — PR #17 — Liquid Chrome inhale/release + hat rim sparkle + echo ripples.
- 2026-07-16 — NS-20260716-03 — PR #18 — Shared bloom breathes with swell/afterglow + gather; soft hit envelope avoids kick strobe.
- 2026-07-16 — NS-20260716-04 — PR #19 — Living palette EMA mood warmth (valence+tenderness) amber/cyan drift; drop kicks kept.
- 2026-07-16 — NS-20260716-05 — PR #20 — Cosmic Mandala gather inhale + kick/snare ring split + hat halo ticks + echo shimmer reverse.
- 2026-07-16 — NS-20260716-06 — PR #21 — Outrun Grid tension sun stretch + gather horizon dip + drop/afterglow grid heat wash.
- 2026-07-16 — NS-20260716-07 — PR #22 — Volumetric Waveform gather pinch + impact bloom + traveling phrase-echo ghost crest.

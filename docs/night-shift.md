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

- [x] NS-20260722-01 (S) **SceneRig cinematic pose SmoothDamp** — Cinematic look already eases on shot cuts (~0.28s) but pose still uses the short camera spring, so framing can whip into the next shot; SmoothDamp cinematic position on cut with the longer horizon (zero vel on cut like look) so dollies glide. Fluid camera across every preset in cinematic mode. Area: `SceneRig.tsx`. Accept: on cinematic shot cuts, camera position eases without a whip; mid-shot authored path still tracks; look SmoothDamp from #52 and leanIn/release Z from #62 unchanged. — PR #73
- [x] NS-20260722-02 (S) **Star Field holdBreath hush + tenderness arm soften** — During `holdBreath` / deep `silence`, nearly freeze arm spin and twinkle rate; on `tenderness` soften arm wind and particle jitter so the galaxy listens on gentle vocals. Alive. Area: `presets/StarField.tsx`. Accept: quiet held bar almost stills the spiral then resumes; tender vocal passage softens arms vs harsh instrumental; gather arm inhale + kit/snare from #26/#49 still fire. — PR #74
- [x] NS-20260722-03 (S) **Liquid Chrome holdBreath surface stillness** — During `holdBreath` / deep `silence`, ease deformation speed so the chrome holds still and listens (gather inhale, kit axes, echo ripples, and tenderness calm stay). Alive. Area: `presets/LiquidChrome.tsx`. Accept: quiet bar nearly freezes surface motion then thaws; kick/snare/gather/echo/tenderness from #17/#43 still readable when music returns. — PR #75
- [x] NS-20260722-04 (M) **New preset: Night Bloom** — Radial soft-light petals that open on `swell`, inhale toward center on `gather`, flare on impact, and mote-glitter on `hat` — a luminous floral field between Cosmic Mandala geometry and Ember Drift ash. Area: new `presets/NightBloom.tsx` + `registry.ts` (+ `controlSchema` only if one preset-owned slider). Accept: preset appears in the picker; owns the frame at defaults; mid/low tiers drop petal/layer count without breaking. — PR #76
- [ ] NS-20260722-05 (S) **Ember Drift kit accents** — Rising ash currently answers gather/impact/afterglow/hat only; wire kick upward lift punch and snare lateral ash shear so drums speak through the field (hat ticks stay). Alive. Area: `presets/EmberDrift.tsx`. Accept: kick/snare/hat each produce a distinct ash accent; gather inhale + impact flare + afterglow from #54 stay intact.
- [ ] NS-20260722-06 (S) **Aura vocal warmth + tenderness radius** — Bias wisp color toward a soft vocal-warm mix with `vocalActivity`; on `tenderness` slightly expand flock radius and soften speed so the aura opens and warms on gentle vocals. Alive engine-wide. Area: `AuraLayer.tsx`. Accept: vocal-led verse warms aura vs instrumental; tender passage softens/opens flock; gather flock + holdBreath huddle + leanIn approach from #32/#48/#61 stay distinct.
- [ ] NS-20260722-07 (S) **Mandelbrot holdBreath stillness** — During `holdBreath` / deep `silence`, nearly freeze zoom crawl and ornate motion so the fractal listens (gather dive, kit, and echo stay). Alive. Area: `presets/MandelbrotZoom.tsx`. Accept: quiet held bar almost freezes the dive then resumes; gather/kick/snare/echo from #31/#51 still fire when music returns.
- [ ] NS-20260722-08 (S) **Torus Field leanIn anticipation pull** — On `leanIn`, ease tube radius / presence slightly inward (anticipation) without overriding gather inhale, kit accents, or afterglow warmth. Alive. Area: `presets/TorusField.tsx`. Accept: pre-drop leanIn visibly pulls the field in; kick/snare/hat + echo reverse + afterglow from #29/#58 stay distinct.
- [ ] NS-20260722-09 (S) **Silk Wake holdBreath hush + tenderness soften** — During `holdBreath`, slow braid travel and ease ribbon contrast; on `tenderness` soften ribbon sharpness/jitter so the silk listens on gentle vocals. Alive. Area: `presets/SilkWake.tsx`. Accept: quiet bar nearly stills braids then resumes; tender passage softens vs aggressive drop; kit accents + gather fold + afterglow from #36/#68 stay intact.
- [ ] NS-20260722-10 (S) **Mist Spiral kit accents** — Rising coils currently answer gather/impact/afterglow/hat only; wire kick axial thrust and snare lateral coil shear so drums speak through the mist (hat motes stay). Alive. Area: `presets/MistSpiral.tsx`. Accept: kick/snare/hat each produce a distinct coil accent; gather inhale + impact flare + afterglow from #64 stay intact.

## Built log

*(Append-only: `YYYY-MM-DD — NS-id — PR #NN — one-line result`.)*

- 2026-07-16 — NS-20260716-01 — PR #16 — Camera pose springs (SmoothDamp) so mode switches glide; bass shake still on top.
- 2026-07-16 — NS-20260716-02 — PR #17 — Liquid Chrome inhale/release + hat rim sparkle + echo ripples.
- 2026-07-16 — NS-20260716-03 — PR #18 — Shared bloom breathes with swell/afterglow + gather; soft hit envelope avoids kick strobe.
- 2026-07-16 — NS-20260716-04 — PR #19 — Living palette EMA mood warmth (valence+tenderness) amber/cyan drift; drop kicks kept.
- 2026-07-16 — NS-20260716-05 — PR #20 — Cosmic Mandala gather inhale + kick/snare ring split + hat halo ticks + echo shimmer reverse.
- 2026-07-16 — NS-20260716-06 — PR #21 — Outrun Grid tension sun stretch + gather horizon dip + drop/afterglow grid heat wash.
- 2026-07-16 — NS-20260716-07 — PR #22 — Volumetric Waveform gather pinch + impact bloom + traveling phrase-echo ghost crest.
- 2026-07-17 — NS-20260717-02 — PR #23 — SceneRig kit accents: kick bass punch, snare mid lateral crack, hat high tick.
- 2026-07-17 — NS-20260717-03 — PR #24 — BackgroundLayer gather inhale + tension swell + shimmer/hat sky glitter.
- 2026-07-17 — NS-20260717-04 — PR #25 — FOV punch SmoothDamp: lens kicks ease in/out, no stair-steps.
- 2026-07-17 — NS-20260717-05 — PR #26 — Star Field hat twinkles, kick core punches, barPhase-locked arm spin.
- 2026-07-17 — NS-20260717-06 — PR #27 — Liquid Blob gather inhale + one-shot phrase-echo surface ripple.
- 2026-07-17 — NS-20260717-07 — PR #28 — Particle Storm kick/snare axes, hat size ticks, one-shot echo reverse swirl.
- 2026-07-17 — NS-20260717-08 — PR #29 — Torus Field kick tube / snare lateral / hat ticks + one-shot echo reverse drift.
- 2026-07-17 — NS-20260717-09 — PR #30 — Tide Veil fullscreen caustic sheet: swell roll, gather fold, impact flash, afterglow warmth.
- 2026-07-17 — NS-20260717-10 — PR #31 — Mandelbrot Zoom gather inhale + impact/kick dive + tension ornate power.
- 2026-07-18 — NS-20260718-01 — PR #32 — Aura wisps flock: gather inhale, impact/release burst, hat/shimmer glitter.
- 2026-07-18 — NS-20260718-02 — PR #33 — Anima kit soul accents: kick core punch, snare mid ring, hat halo ticks.
- 2026-07-18 — NS-20260718-03 — PR #34 — Infinite Tunnel kit accents: kick wall punch, snare lateral warp, hat rail sparkle.
- 2026-07-18 — NS-20260718-04 — PR #35 — Flow Field kit currents: kick bass thrust, snare mid shear, hat high densify/sparkle.
- 2026-07-18 — NS-20260718-05 — PR #36 — Silk Wake: braided ribbons gather-fold, impact flare, afterglow trails.
- 2026-07-18 — NS-20260718-06 — PR #37 — Camera zoom SmoothDamp: wheel/pinch target eases via critically-damped spring; idle settles still.
- 2026-07-18 — NS-20260718-07 — PR #38 — Living palette gather cool + impact/kick warm bloom on mood-warmth EMA.
- 2026-07-18 — NS-20260718-08 — PR #39 — Mod-matrix release SmoothDamp: fast attack, inertial settle, no overshoot.
- 2026-07-18 — NS-20260718-09 — PR #40 — Volumetric Waveform kit accents: kick Y floor thump, snare X crease, hat dust glitter.
- 2026-07-18 — NS-20260718-10 — PR #41 — Outrun Grid kit: hat dash ticks, kick sun-core punch, snare roadside flash.
- 2026-07-19 — NS-20260719-01 — PR #42 — SceneRig shake amp + XY offsets SmoothDamp; quiet settles still.
- 2026-07-19 — NS-20260719-02 — PR #43 — Liquid Chrome kick floor bulge + snare lateral crack; hats unchanged.
- 2026-07-19 — NS-20260719-03 — PR #44 — Halo Rain: concentric luminous rings drift/gather-inhale/impact flare/hat ticks.
- 2026-07-19 — NS-20260719-04 — PR #45 — Background afterglow amber warmth linger on nebula/aurora/glow.
- 2026-07-19 — NS-20260719-05 — PR #46 — Preset crossfade: ghost-frame dissolve ~0.35s; reduced-motion snaps.
- 2026-07-19 — NS-20260719-06 — PR #47 — Liquid Blob kick Y inflate + snare X satellite shear; hats unchanged.
- 2026-07-19 — NS-20260719-07 — PR #48 — Aura holdBreath/silence: wisps nearly freeze + soft center huddle; thaw on return.
- 2026-07-19 — NS-20260719-08 — PR #49 — Star Field gather arm inhale + snare lateral streak.
- 2026-07-19 — NS-20260719-09 — PR #50 — LightLevel exposure SmoothDamp with swell/afterglow; user baseline stays floor.
- 2026-07-19 — NS-20260719-10 — PR #51 — Mandelbrot snare X←Y domain shear + one-shot phrase-echo orbit reverse.
- 2026-07-20 — NS-20260720-01 — PR #52 — Cinematic look SmoothDamp (~0.28s) on shot cuts; settles still mid-shot.
- 2026-07-20 — NS-20260720-02 — PR #53 — Anima phrase-echo: one-shot core brighten + aurora counter-sweep in gaps.
- 2026-07-20 — NS-20260720-03 — PR #54 — Ember Drift rising ashfield: swell lift, gather inhale, impact flare, hat ticks.
- 2026-07-20 — NS-20260720-04 — PR #55 — Flow Field tenderness calm + convergence power-lock bandSpread.
- 2026-07-20 — NS-20260720-05 — PR #56 — Cosmic Mandala vocal rim deepen + tender contrast soften.
- 2026-07-20 — NS-20260720-06 — PR #57 — Living palette holdBreath hush: cool mood warmth + slow hue crawl.
- 2026-07-20 — NS-20260720-07 — PR #58 — Torus Field afterglow amber tube warmth linger.
- 2026-07-20 — NS-20260720-08 — PR #59 — Outrun Grid phrase-echo: one-shot ghost dash/lane shimmer + brief road reverse.
- 2026-07-20 — NS-20260720-09 — PR #60 — Infinite Tunnel holdBreath: nearly freeze rush + ease wall punch; thaw for kit/echo.
- 2026-07-20 — NS-20260720-10 — PR #61 — Aura leanIn: mild camera/center approach; gather inhale + holdBreath huddle stay distinct.
- 2026-07-21 — NS-20260721-01 — PR #62 — SceneRig leanIn/release Z SmoothDamp (~0.22s); quiet settles still.
- 2026-07-21 — NS-20260721-02 — PR #63 — Bloom holdBreath soft dim (~0.22 breath notch); gather/hit stay.
- 2026-07-21 — NS-20260721-03 — PR #64 — Mist Spiral: rising mist coils, gather inhale, impact flare, hat motes.
- 2026-07-21 — NS-20260721-04 — PR #65 — Background leanIn sky pull + vocal warmth under afterglow amber.
- 2026-07-21 — NS-20260721-05 — PR #66 — Particle Storm tenderness calm + vocal-warm tint; kit/echo stay.
- 2026-07-21 — NS-20260721-06 — PR #67 — Volumetric Waveform holdBreath freeze + tenderness ridge soften; kit/echo stay.
- 2026-07-21 — NS-20260721-07 — PR #68 — Silk Wake kit accents: kick braid thrust, snare shear flash, hat mote ticks.
- 2026-07-21 — NS-20260721-08 — PR #69 — Liquid Blob holdBreath: freeze deformation + satellite chatter; gather/kit/echo stay.
- 2026-07-21 — NS-20260721-09 — PR #70 — Halo Rain phrase-echo: one-shot upward reverse rain + cooler ring after-image.
- 2026-07-21 — NS-20260721-10 — PR #71 — Tide Veil holdBreath hush + tenderness soften; gather/impact/afterglow stay.
- 2026-07-22 — NS-20260722-01 — PR #73 — SceneRig cinematic pose SmoothDamp on shot cuts (~0.28s, zero vel); look + leanIn/release Z unchanged.
- 2026-07-22 — NS-20260722-02 — PR #74 — Star Field holdBreath hush + tenderness arm/wind soften; gather/kit stay.
- 2026-07-22 — NS-20260722-03 — PR #75 — Liquid Chrome holdBreath freeze deformation + idle spin; gather/kit/echo/tenderness stay.
- 2026-07-22 — NS-20260722-04 — PR #76 — Night Bloom: radial soft-light petals open on swell, inhale on gather, flare on impact, hat tip motes.

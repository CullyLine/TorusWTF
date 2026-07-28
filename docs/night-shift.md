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

*(2026-07-28 — fourth consecutive full sweep: all ten shipped and merged (#114–#123). The rig now covers every macro, Jellyfish Bloom pulses on the roster, the sky plays the kit, and the quiet-passage sweep reached Flow Field, Cosmic Mandala, Halo Rain, Mist Spiral, Paper Lanterns, and Particle Storm. Today: the aura plays its last missing drum and the palette learns to coil dark before the drop — the two remaining engine-wide gaps; one new preset — Murmuration — puts the flocking archetype (banked turns, trailing inertia, no straight lines) at the center of "fluid/alive/beautiful"; the brand-signature Torus Field finally learns stillness; the newest preset gains anticipation and memory; and the proven soft-metric and phrase-echo passes sweep Infinite Tunnel, Mandelbulb, Tide Veil, Ink Bloom, and Particle Storm. Dropped for now (still valid future gaps): Halo Rain leanIn, remaining preset echo one-shots (Silk Wake, Night Bloom, Ember Drift, Opal Slick, Alien Planet, Mist Spiral, Paper Lanterns), Paper Lanterns leanIn, BackgroundLayer echo (deliberately skipped — three engine layers already answer the gap), the emitters system.)*

- [x] NS-20260728-01 (S) **Aura kick core pulse** — Engine-wide: the wisp overlay flocks, flicks on snare, glitters on hats, huddles, leans, echoes, and warms in afterglow — but the kick drum, the heartbeat, passes straight through it. Give `kick` a soul-glow core pulse plus a brief inward-downward wisp dip, so the overlay's chest thumps when the bass hits the floor — the vertical/radial answer to the snare's lateral flick. The overlay finishes its kit everywhere it rides. Alive. Area: `AuraLayer.tsx`. Accept: a drum loop visibly reads kick as a core pulse + wisp dip distinct from the snare lateral flick (#122) and hat glitter; gather inhale (#32), holdBreath huddle (#48), leanIn approach (#61), echo counter-swirl (#107), and afterglow ember warmth (#122) stay distinct. — PR #124
- [x] NS-20260728-02 (M) **New preset: Murmuration** — A starling flock at dusk: thousands of instanced birds wheel through curl-noise flow with banked turns and trailing inertia — the flock is never a straight line, always a ribbon folding over itself. `gather` banks the flock tighter with pre-beat anticipation, `kick` pulses a contraction-expansion wave through the body, `snare` shears the heading laterally, `hat` sparks wingtip glints, `tenderness` washes the sky golden-hour warm, `holdBreath` hangs the flock on still wings. Flocking is the purest "alive" archetype and nothing on the roster owns it (Anima's curtains and the Aura motes only hint at it). One self-contained R3F component + registry entry (controls via `controlSchema.ts` if any). Area: `presets/Murmuration.tsx`, `registry.ts`. Accept: preset appears in the panel; the flock wheels with visibly banked, inertial turns and reads as one folding body at 60 fps on high tier; mid/low tiers degrade gracefully (fewer birds, simpler wings). — PR #125
- [x] NS-20260728-03 (S) **Torus Field holdBreath** — The brand-signature preset punches the kit, echoes, warms in afterglow, and leans in — but a held quiet bar flows past at full speed. During `holdBreath`, ease the field's flow and rotation to a suspended hang and dim the particles toward a still ember ring, thawing on the music's return. The signature learns the signature gesture. Alive. Area: `presets/TorusField.tsx`. Accept: a quiet held bar visibly stills the torus flow and dims it, then it resumes; kick tube / snare lateral / hat ticks + echo reverse drift (#29), afterglow warmth (#58), and leanIn pull (#91) stay distinct. — PR #126
- [ ] NS-20260728-04 (S) **Living palette tension coil** — Engine-wide: the palette cools on leanIn, hushes on holdBreath, glints on echo, and locks on convergence — but ignores `tension`, the climb itself. As tension rises, deepen value contrast and pull colors toward the palette's darkest anchor with hue held steady, so the whole scene visibly coils dark before the drop and springs back through the existing dropEvent bloom. Value/contrast movement — distinct from leanIn's cyan hue tilt (#84), hush's desaturated crawl (#57), and convergence's hue pull (#106). Beautiful everywhere at once. Area: `livingPalette.tsx`. Accept: a build-up visibly darkens and deepens the palette then the drop blooms it back, no snap either way; leanIn cool, holdBreath hush, echo glint (#94), convergence lock, and mood warmth (#19) stay distinct.
- [ ] NS-20260728-05 (S) **Jellyfish Bloom leanIn + phrase echo** — The newest preset contracts, thrusts, gusts, glints, softens, and hangs — but never anticipates or remembers: on `leanIn`, drift the bloom gently nearer with the bells angling up expectantly, easing back on release; on `echo`, fire a one-shot bioluminescent pulse train that ripples jelly-to-jelly through the bloom in the phrase gap — the bloom answering the music. Alive. Area: `presets/JellyfishBloom.tsx`. Accept: a build-up visibly draws the bloom nearer and a phrase gap fires one visible pulse train through the jellies; gather contract / kick thrust / snare gust / hat plankton / tenderness moonlight / holdBreath hang (#115) stay distinct.
- [ ] NS-20260728-06 (S) **Infinite Tunnel tenderness + afterglow** — The tunnel punches the kit, freezes on holdBreath, and echoes — but rushes gentle passages at full aggression and forgets its drops instantly: on `tenderness`, ease the rush speed and warm the walls candlelit-soft; on `afterglow`, leave a lingering warm heat trace on the walls after big moments. Alive/beautiful. Area: `presets/InfiniteTunnel.tsx`. Accept: a tender passage visibly slows and warms the tunnel and the bars after a drop keep a warm wall trace, both easing out; kit accents (#34), holdBreath freeze (#60), and echo stay distinct.
- [ ] NS-20260728-07 (S) **Mandelbulb tenderness + leanIn** — The fractal grows ornate on tension, dives on kicks, echoes, and holds its breath — but treats a gentle vocal passage like a drop: on `tenderness`, soften contrast, warm the color wash, and gentle the orbit; on `leanIn`, draw the camera in with slow anticipation, releasing back after the drop. Alive. Area: `presets/MandelbrotZoom.tsx`. Accept: a tender passage visibly reads softer/warmer with a gentler orbit and a build-up visibly closes in then releases, no snap; gather inhale / kick dive / tension ornate (#31), snare shear + echo (#51), and holdBreath freeze (#90) stay distinct.
- [ ] NS-20260728-08 (S) **Tide Veil phrase echo** — The caustic sheet rolls, folds, splits the kit, hushes, and softens — but phrase gaps pass unanswered: on `echo`, fire a one-shot cool moonlit glint train that replays the last bars' rhythm as it travels across the veil, fading as it goes. The water remembers the phrase. Alive/beautiful. Area: `presets/TideVeil.tsx`. Accept: a phrase gap fires one visible glint train across the sheet, then it rests; kit split (#103), holdBreath hush + tenderness soften (#71), and swell/gather/impact/afterglow (#30) stay distinct.
- [ ] NS-20260728-09 (S) **Ink Bloom phrase echo** — The ink blooms on kicks, shears, sparkles, pales to milk, and suspends on holdBreath — but never answers a phrase gap: on `echo`, re-curl a one-shot ghost plume in cooler, paler ink that replays the gap's rhythm — the water remembering what was just played. Alive. Area: `presets/InkBloom.tsx`. Accept: a phrase gap fires one ghost-plume replay clearly distinct in color from the kick plumes; kick plumes / snare shear / hat motes / gather draw / tenderness milk (#87) and holdBreath suspend (#102) stay intact.
- [ ] NS-20260728-10 (S) **Particle Storm leanIn** — The swarm whips the kit, echoes, calms on tenderness, and hangs on holdBreath — but blows through build-ups without gathering itself: on `leanIn`, tighten the orbit radius and drift the swarm subtly nearer, coiled and expectant, loosening back on release. Alive. Area: `presets/ParticleStorm.tsx`. Accept: a build-up visibly coils the swarm tighter and nearer, then it loosens after the drop, no snap; kick/snare axes + hat ticks + echo reverse swirl (#28), tenderness calm (#66), and holdBreath hang (#123) stay distinct.

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
- 2026-07-22 — NS-20260722-05 — PR #77 — Ember Drift kick upward lift + snare lateral shear; hat ticks + gather/impact/afterglow stay.
- 2026-07-23 — NS-20260723-01 — PR #78 — Rainforest snare lateral canopy wind-gust (Buffer A foliage + Image shear).
- 2026-07-23 — NS-20260723-02 — PR #79 — Tidal Sanctuary snare lateral whitecap crest crack (foam/spray shear).
- 2026-07-23 — NS-20260723-03 — PR #80 — Galaxy Garden phrase-echo: one-shot reverse arm swirl + cooler glint crest replay.
- 2026-07-23 — NS-20260723-04 — PR #81 — Alien Planet snare lateral mist/canopy shear ripple (flank flash).
- 2026-07-23 — NS-20260723-05 — PR #82 — Background holdBreath sky hush: ease drift + dim glitter; gather/leanIn/afterglow stay.
- 2026-07-23 — NS-20260723-06 — PR #83 — Night Bloom kick radial petal pulse + snare lateral shear; hat tip motes stay.
- 2026-07-24 — NS-20260724-01 — PR #84 — Living palette leanIn cool cyan + sat tighten; gather/hush/mood warmth stay distinct.
- 2026-07-24 — NS-20260724-02 — PR #85 — Rainforest phrase-echo: one-shot cool-lime canopy firefly glints in Image pass.
- 2026-07-24 — NS-20260724-03 — PR #86 — Tidal Sanctuary tenderness: ease chop/swell + milky pearlescent sheen; holdBreath glass stays distinct.
- 2026-07-24 — NS-20260724-04 — PR #87 — Ink Bloom: kick curling plumes, snare shear, hat motes, gather center, tenderness milk.
- 2026-07-24 — NS-20260724-05 — PR #88 — Lava Choir hat ember crust ticks + tenderness dark-glass cooling.
- 2026-07-24 — NS-20260724-06 — PR #89 — SceneRig tenderness: key/rim dim+warm amber, shake floor down; kit/leanIn/DoF stay.
- 2026-07-24 — NS-20260724-07 — PR #90 — Mandelbulb holdBreath: nearly freeze morph/orbit; gather/kit/echo stay.
- 2026-07-24 — NS-20260724-08 — PR #91 — Torus Field leanIn: inward major-radius/tube presence pull; gather/kit/echo/afterglow stay.
- 2026-07-24 — NS-20260724-09 — PR #92 — Silk Wake holdBreath hush + tenderness soften; kit/gather/afterglow stay.
- 2026-07-24 — NS-20260724-10 — PR #93 — Mist Spiral kick upward swirl thrust + snare lateral coil shear; hat/gather/impact stay.
- 2026-07-25 — NS-20260725-01 — PR #94 — Living palette one-shot echo hue shimmer + sat glint; gather/lean/hush/mood stay distinct.
- 2026-07-25 — NS-20260725-02 — PR #95 — Rainforest tenderness: ease canopy sway + warm soft-mist Image veil; holdBreath/kit/echo stay.
- 2026-07-25 — NS-20260725-03 — PR #96 — Opal Slick: thin-film puddle sheen; kick ripples bend rainbow, snare shear, hat glints, gather pull, tenderness pearl.
- 2026-07-25 — NS-20260725-04 — PR #97 — SceneRig one-shot echo SmoothDamp lateral parallax sway; kit/leanIn/cinematic/shake stay distinct.
- 2026-07-25 — NS-20260725-05 — PR #98 — Tidal Sanctuary one-shot echo moonlit glint train across the swell; kick/snare/hat/tenderness stay distinct.
- 2026-07-25 — NS-20260725-06 — PR #99 — Ember Drift holdBreath: freeze ash mid-air + dim toward coals; thaw upward; kit/gather/impact/afterglow stay.
- 2026-07-25 — NS-20260725-07 — PR #100 — Halo Rain kick center ring pulse + snare lateral shear flash; hat/echo stay.
- 2026-07-25 — NS-20260725-08 — PR #101 — Background tenderness: ease drift + milk-amber warm-dim; gather/holdBreath/leanIn/afterglow stay distinct.
- 2026-07-25 — NS-20260725-09 — PR #102 — Ink Bloom holdBreath: suspend plumes mid-curl + glass surface; thaw into billow; kick/snare/hat/gather/tenderness stay.
- 2026-07-25 — NS-20260725-10 — PR #103 — Tide Veil kit split: kick deep caustic surge, snare lateral fold crack, hat ridge sparkles; swell/gather/impact/holdBreath/tenderness stay.
- 2026-07-26 — NS-20260726-01 — PR #104 — SceneRig tension coil: slow FOV tighten + Y creep; spring-loose on drop/release.
- 2026-07-26 — NS-20260726-02 — PR #105 — Paper Lanterns: buoyant night flotilla over dark water with mirrored glow; kick/snare/hat/gather/tenderness.
- 2026-07-26 — NS-20260726-03 — PR #106 — Living palette convergence chord lock: hue mean pull + sat deepen on lock-in.
- 2026-07-26 — NS-20260726-04 — PR #107 — Aura phrase-echo: one-shot counter-swirl + BPM glint replay in phrase gaps.
- 2026-07-26 — NS-20260726-05 — PR #108 — Opal Slick holdBreath: still swirl/ripples + dark glass mirror; thaw preserves kit/gather/tenderness.
- 2026-07-26 — NS-20260726-06 — PR #109 — Galaxy Garden leanIn: camera approach + mid-arm glint anticipation.
- 2026-07-26 — NS-20260726-07 — PR #110 — Outrun Grid holdBreath: road crawl + sun dim + held dash ticks.
- 2026-07-26 — NS-20260726-08 — PR #111 — Night Bloom holdBreath mid-open pause + tip hang; tenderness moonlit honey soften.
- 2026-07-26 — NS-20260726-09 — PR #112 — Ember Drift tenderness: slow rise + gentle drift + rosy soft coals (distinct from holdBreath).
- 2026-07-26 — NS-20260726-10 — PR #113 — Alien Planet tenderness: ease canopy sway + warm bio hush (distinct from holdBreath).
- 2026-07-27 — NS-20260727-01 — PR #114 — SceneRig convergence plant: SmoothDamp idle drift/orbit/flow sway floor + steadier look when bands lock.
- 2026-07-27 — NS-20260727-02 — PR #115 — Jellyfish Bloom: gather-contract / kick-thrust bells + lagged tentacles; snare gust, hat plankton, tender moonlight, holdBreath hang.
- 2026-07-27 — NS-20260727-03 — PR #116 — Background kit accents: kick nebula/glow core pulse + snare lateral aurora shear.
- 2026-07-27 — NS-20260727-04 — PR #117 — Flow Field holdBreath hang + leanIn densify/nearer; kit/tenderness/convergence stay distinct.
- 2026-07-27 — NS-20260727-05 — PR #118 — Cosmic Mandala holdBreath ring/halo pause + leanIn nearer/tighten spacing.
- 2026-07-27 — NS-20260727-06 — PR #119 — Halo Rain holdBreath suspend + tenderness candle hush; kit/echo intact.
- 2026-07-27 — NS-20260727-07 — PR #120 — Mist Spiral holdBreath hang + tenderness rosy dusk; kit gather/impact stay.
- 2026-07-27 — NS-20260727-08 — PR #121 — Paper Lanterns holdBreath: hang mid-rise + ember dim + glass water calm; kit/gather/tenderness ungated.
- 2026-07-27 — NS-20260727-09 — PR #122 — Aura snare lateral scatter flick + afterglow ember warmth on wisps/glow.
- 2026-07-27 — NS-20260727-10 — PR #123 — Particle Storm holdBreath: suspend mid-orbit + held hat ticks; kit/echo/tenderness stay intact.
- 2026-07-28 — NS-20260728-01 — PR #124 — Aura kick soul-glow core pulse + inward-downward wisp dip; snare/hat/gather/huddle/lean/echo/afterglow stay distinct.
- 2026-07-28 — NS-20260728-02 — PR #125 — Murmuration: dusk starling flock with banked curl turns, gather bank-in, kick wave, snare shear, hat glints, golden tenderness, holdBreath still wings.
- 2026-07-28 — NS-20260728-03 — PR #126 — Torus Field holdBreath: suspend flow/rotation + ember-ring dim; kit/echo/afterglow/leanIn stay distinct.

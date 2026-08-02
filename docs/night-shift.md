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

*(2026-08-02 — eighth consecutive full-speed day: all ten from 08-01 shipped and merged same day (#152–#161), including Dune Sea, the roster's first desert. Today: the day-old Dune Sea learns anticipation and memory — the same day-after pass Glowworm Grotto, Thunderhead, Murmuration, and Jellyfish Bloom each got; a new preset finally touches the two themes the roster still doesn't own, fire and creatures, in one stroke — Moth Ballet, moths orbiting a lone flame; Murmuration gains the falcon — real flocks compress under pressure, so `tension` + `barPhase` give it builds and a clock; `convergence` reaches Glowworm Grotto (synchronized glowworm displays are real) and the engine's Aura layer (wisps falling into one shared orbit — every preset benefits); and dual-metric passes close the long-dropped leanIn gaps on Ember Drift, Night Bloom, Opal Slick, and Paper Lanterns while Mist Spiral gets the phrase echo it's still missing. Dropped for now (still valid future gaps): Torus Field / Jellyfish Bloom tension, Tide Veil / Jellyfish Bloom vocalActivity, Alien Planet leanIn + barPhase, Murmuration release, Silk Wake echo, BackgroundLayer echo (deliberately skipped — three engine layers already answer the gap).)*

- [x] NS-20260802-01 (S) **Dune Sea leanIn + phrase echo** — The day-old desert plumes on kicks, shears ripples on snares, and hangs its grains on a held breath — but never anticipates or remembers: on `leanIn`, swell the dunes subtly nearer and still the wind expectantly, ripple lines tightening along the slip faces, easing back on release (approach, distinct from gather's inhale-swell); on `echo`, fire a one-shot moonlit shimmer train — cool silver glints tracing the gap's rhythm along a single ridgeline crest, fainter and cooler than kick plumes. The newest preset learns anticipation and memory, the proven day-after pass. Alive. Area: `presets/DuneSea.tsx`. Accept: a build-up visibly nears the dunes with tightening ripples then releases, and a phrase gap fires one faint cool glint train along one crest clearly distinct from kick plumes and the dropEvent sandstorm; kick crest plumes / snare wind shear / hat mica / gather swell / tension haze / tenderness honey / holdBreath hang (#152) stay distinct. — PR #162
- [ ] NS-20260802-02 (M) **New preset: Moth Ballet** — A lone flame in total darkness — a candle-bright point with a warm halo — and a ballet of moths spiraling it in lagged, banked orbits, wings catching the light. The roster owns water, sky, space, underground, forest, and desert, but its two most open themes are fire and creatures; this takes both in one stroke. `kick` flares the flame and pulls a surge of moths inward; `snare` gusts a lateral scatter through the swarm; `hat` winks wing glints as moths cross the light; `gather` tightens the orbits on a pre-beat inhale; `tension` gutters the flame taller and compresses the spiral as the build climbs; `dropEvent` bursts the flame once — moths scatter wide, then re-gather; `tenderness` warms the light toward honey and slows the ballet; `holdBreath` hangs every moth mid-wingbeat, flame steadying to a still point. One self-contained R3F component + registry entry (controls via `controlSchema.ts` if any). Area: `presets/MothBallet.tsx`, `registry.ts`. Accept: preset appears in the panel; on a drum-heavy track kicks visibly flare the flame and surge the moths inward, and a held quiet bar hangs them mid-wingbeat; 60 fps on high tier, mid/low reduce moth count and halo cost gracefully; visually distinct from Paper Lanterns' flames-over-water and Murmuration's dusk flock.
- [ ] NS-20260802-03 (S) **Murmuration tension + barPhase** — Real murmurations tighten under a falcon's pressure — and this flock never feels hunted: on `tension`, compress the flock into a denser, darker mass with sharper banked turns as the build climbs, springing loose and scattering open on the drop; with `barPhase`, run a continuous bar-locked contraction ripple through the flock so it breathes on the music's own clock (no stepping). Its last two major gaps. Alive. Area: `presets/Murmuration.tsx`. Accept: a build visibly compresses and darkens the flock with sharper turns then springs it loose on the drop, and the flock visibly pulses in time with the bar; gather bank-in / kick wave / snare shear / hat glints / tenderness golden / holdBreath still wings (#125), leanIn bank + echo glint ripple (#135), and convergence sheet lock (#146) stay distinct.
- [ ] NS-20260802-04 (S) **Glowworm Grotto convergence** — Real glowworm and firefly displays synchronize — and the grotto's threads still pulse alone: on `convergence`, settle the ceiling's scattered thread glows into one shared bar-locked wave of light rolling across the cavern, desyncing softly back into independent pulses as the lock fades, no snap. The cave's own lock-in, sibling to Thunderhead's heartbeat cell (#155) and Jellyfish Bloom's synced bells (#147). Alive. Area: `presets/GlowwormGrotto.tsx`. Accept: a locked-in groove visibly organizes the ceiling into one rolling shared glow wave, then disperses; kick cascade / snare lag-sway / hat winks / gather inhale / tension deepen / dropEvent blaze / tenderness amber / holdBreath embers (#144) and leanIn approach + echo ghost cascade (#153) stay distinct.
- [ ] NS-20260802-05 (S) **Aura layer convergence** — Engine-wide: the wisps flock, inhale, huddle, and echo — but never organize when the band locks in: on `convergence`, ease the scattered wisps into one shared orbital ring around the scene center — a calm, deliberate orbit, brightening faintly as it locks — dissolving back into free flocking as the lock fades. Flocks really do fall into formation; every preset gains the moment. Sibling to SceneRig's plant (#114), livingPalette's chord lock (#106), and Torus Field's lattice (#136). Alive. Area: `AuraLayer.tsx`. Accept: with the aura enabled over any preset, a locked-in groove visibly draws the wisps into one shared orbit that dissolves on release; gather inhale (#32), holdBreath huddle (#48), leanIn approach (#61), snare flick + afterglow embers (#122), kick soul-glow dip (#124), and echo counter-swirl (#107) stay distinct.
- [ ] NS-20260802-06 (S) **Ember Drift leanIn + barPhase** — The ash rises, flares, freezes, and spark-trains — but meets build-ups flat and drifts off the music's clock: on `leanIn`, densify the ash column and drift it subtly nearer, embers brightening faintly with expectation, easing back on release; with `barPhase`, breathe a slow bar-locked flicker through the coals so the field glows on the bar's own clock (continuous, no stepping). Its two long-dropped gaps, closed together. Fluid/alive. Area: `presets/EmberDrift.tsx`. Accept: a build-up visibly densifies and nears the ash with brightening embers then releases, and the coal glow visibly breathes in time with the bar; swell lift / gather inhale / impact flare / hat ticks (#54), kick lift + snare shear (#77), holdBreath freeze (#99), tenderness rosy calm (#112), and echo spark train (#140) stay distinct.
- [ ] NS-20260802-07 (S) **Night Bloom leanIn + dropEvent** — The petals open, pulse, pause, and ghost-bloom — but never poise for the drop or pay it off: on `leanIn`, draw the bloom subtly nearer with petal tips brightening, poised, easing back on release; on `dropEvent`, burst one full-garden bloom — every petal flaring open at once, then settling. Anticipation and payoff for the flower. Alive. Area: `presets/NightBloom.tsx`. Accept: a build-up visibly nears the bloom with brightening tips, and the drop flares every petal once then settles, clearly bigger than the per-hit impact flare; swell open / gather inhale / impact flare / hat tip motes (#76), kick pulse + snare shear (#83), holdBreath pause + tenderness honey (#111), and echo ghost bloom (#150) stay distinct.
- [ ] NS-20260802-08 (S) **Opal Slick leanIn + dropEvent** — The puddle ripples, shears, glints, and mirrors — but meets build-ups flat and drops without a payoff: on `leanIn`, drift the surface subtly nearer and tighten the thin-film interference bands, expectant, easing back on release; on `dropEvent`, slam one full-puddle shock ripple that bends the entire rainbow sheen at once, then stills. Alive/beautiful. Area: `presets/OpalSlick.tsx`. Accept: a build-up visibly nears the surface with tightening rainbow bands, and the drop fires one whole-puddle ripple then stills; kick ripples / snare shear / hat glints / gather pull / tenderness pearl (#96), holdBreath glass mirror (#108), and echo interference ripple train (#141) stay distinct.
- [ ] NS-20260802-09 (S) **Paper Lanterns leanIn + barPhase** — The flotilla pulses, gusts, hangs, and ember-trains — but never gathers for a drop and bobs off the music's clock: on `leanIn`, drift the lanterns subtly nearer and lift their glow with expectation, easing back on release; with `barPhase`, lock the gentle bobbing of lanterns and their water reflections to the bar so the flotilla rides the music's own swell (continuous, no stepping). Fluid/alive. Area: `presets/PaperLanterns.tsx`. Accept: a build-up visibly nears and brightens the flotilla then releases, and the bobbing visibly rides in time with the bar; kick / snare / hat / gather / tenderness (#105), holdBreath hang + glass water (#121), and echo ember train (#139) stay distinct.
- [ ] NS-20260802-10 (S) **Mist Spiral phrase echo** — The coils rise, thrust, shear, and lean — but phrase gaps pass unremembered, its last one-shot gap: on `echo`, fire a one-shot ghost coil — a cool silver-blue wisp retracing the gap's rhythm up the spiral, fainter and cooler than kick swirls, fading as it climbs. Alive. Area: `presets/MistSpiral.tsx`. Accept: a phrase gap fires one faint cool wisp climbing the spiral, clearly distinct from kick swirls and the impact flare; mist coils / gather inhale / impact flare / hat motes (#64), kick swirl + snare shear (#93), holdBreath hang + tenderness dusk (#120), and leanIn coil tighten (#143) stay distinct.

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
- 2026-07-28 — NS-20260728-04 — PR #127 — Living palette tension coil: value darken + contrast toward darkest anchor; spring-loose on drop.
- 2026-07-28 — NS-20260728-05 — PR #128 — Jellyfish Bloom leanIn nearer tip-up + one-shot jelly-to-jelly aqua echo pulse.
- 2026-07-28 — NS-20260728-06 — PR #129 — Infinite Tunnel tenderness rush ease + candlelit walls; afterglow amber heat linger.
- 2026-07-28 — NS-20260728-07 — PR #130 — Mandelbulb tenderness candle soften + leanIn approach.
- 2026-07-28 — NS-20260728-08 — PR #131 — Tide Veil phrase-echo: one-shot cool moonlit glint train across the sheet.
- 2026-07-28 — NS-20260728-09 — PR #132 — Ink Bloom phrase-echo: cooler silver-blue ghost plumes re-curl kick memory in phrase gaps.
- 2026-07-28 — NS-20260728-10 — PR #133 — Particle Storm leanIn: orbit coil + nearer approach; kit/echo/tenderness/holdBreath stay distinct.
- 2026-07-30 — NS-20260730-01 — PR #134 — Thunderhead: volumetric night storm; kick pocket lightning, snare rain shear, hat static, gather/tension/drop/tenderness/holdBreath.
- 2026-07-30 — NS-20260730-02 — PR #135 — Murmuration leanIn camera bank + one-shot phrase-echo cool glint ripple.
- 2026-07-30 — NS-20260730-03 — PR #136 — Torus Field convergence: phase-aligned ring lattice lock; flow steadies, rings sharpen.
- 2026-07-30 — NS-20260730-04 — PR #137 — Bubble emitter kit: kick buoyant surge+burst, hat young glints, gather core pull, holdBreath mid-water hush.
- 2026-07-30 — NS-20260730-05 — PR #138 — Infinite Tunnel leanIn: deeper throat pull + XY bore narrow on build-ups.
- 2026-07-30 — NS-20260730-06 — PR #139 — Paper Lanterns phrase-echo: one-shot cool ember train + water mirror from one lantern.
- 2026-07-30 — NS-20260730-07 — PR #140 — Ember Drift phrase-echo: cool blue-white spark train climbs through warm ash.
- 2026-07-30 — NS-20260730-08 — PR #141 — Opal Slick phrase-echo: silver interference ripple train bends thin-film rainbow.
- 2026-07-30 — NS-20260730-09 — PR #142 — Outrun Grid leanIn: horizon/sun approach + isotropic swell + road tighten; tension stretch stays distinct.
- 2026-07-30 — NS-20260730-10 — PR #143 — Mist Spiral leanIn: coil tighten + nearer drift on build-ups.
- 2026-07-31 — NS-20260731-01 — PR #144 — Glowworm Grotto: bioluminescent silk-thread cavern; kick cascade clusters, snare lag-sway, hat winks, gather/tension/drop/tender/holdBreath.
- 2026-07-31 — NS-20260731-02 — PR #145 — Thunderhead leanIn loom + cool phrase-echo sheet-lightning train.
- 2026-07-31 — NS-20260731-03 — PR #146 — Murmuration convergence: headings align + ribbon collapses into one sharp sheet on lock-in.
- 2026-07-31 — NS-20260731-04 — PR #147 — Jellyfish Bloom convergence: bells sync into one shared bar-locked pulse/glow, soft desync on release.
- 2026-07-31 — NS-20260731-05 — PR #148 — Bubble emitter snare lateral shear + tenderness milkier rise / softer glints.
- 2026-07-31 — NS-20260731-06 — PR #149 — Tidal Sanctuary leanIn: swell amp raise + horizon camera approach.
- 2026-07-31 — NS-20260731-07 — PR #150 — Night Bloom phrase-echo: cool moonlit ghost bloom center→tips.
- 2026-07-31 — NS-20260731-08 — PR #151 — Silk Wake leanIn: braid tighten + nearer drift on build-ups.
- 2026-08-01 — NS-20260801-01 — PR #152 — Dune Sea: moonlit desert ridgelines; kick crest plumes, snare wind shear, hat mica, gather swell, tension haze, drop sandstorm, tender honey, holdBreath hang.
- 2026-08-01 — NS-20260801-02 — PR #153 — Glowworm Grotto leanIn ceiling approach + tip brighten; one-shot cool silver-blue phrase-echo cascade.
- 2026-08-01 — NS-20260801-03 — PR #154 — Bubble emitter phrase-echo: one-shot BPM-paced cool silver glint-bubble train from the base.
- 2026-08-01 — NS-20260801-04 — PR #155 — Thunderhead convergence: interior flicker settles into one bar-locked heartbeat cell.
- 2026-08-01 — NS-20260801-05 — PR #156 — Alien Planet phrase-echo: cool cyan-silver spore glint train across canopy crowns.
- 2026-08-01 — NS-20260801-06 — PR #157 — Halo Rain leanIn: isotropic approach zoom + tighter ring spacing.
- 2026-08-01 — NS-20260801-07 — PR #158 — Tide Veil leanIn: isotropic approach zoom + denser caustic folds on build-ups.
- 2026-08-01 — NS-20260801-08 — PR #159 — Ink Bloom leanIn coil + nearer glass; dropEvent full-tank ink burst then settle.
- 2026-08-01 — NS-20260801-09 — PR #160 — Cosmic Mandala tension coil darken/tighten + continuous barPhase halo lock.
- 2026-08-01 — NS-20260801-10 — PR #161 — Outrun Grid tenderness rose dusk hush + vocal sun-rim breath.
- 2026-08-02 — NS-20260802-01 — PR #162 — Dune Sea leanIn approach + cool silver phrase-echo crest glint train.

# torus visualizer — execution roadmap

A sequential, opinionated build queue for items 1–19 of the post-v1 plan.
Composer 2.5 reads this file, picks the **next unchecked item from the top**, ships it as a single PR, then checks the box in the same PR. Keep working until all boxes are checked or you hit a blocker that needs human input.

---

## How Composer should work this file

For every item:

1. Read this file. Pick the first unchecked `- [ ]` item.
2. Read the "Files", "Implementation notes", and "Acceptance criteria" for that item.
3. Read any files listed under "Files" to ground yourself in current code.
4. Create a branch from `main`: `feat/v2-NN-<short-slug>` (e.g. `feat/v2-01-toast`).
5. Implement the item. Stay within the scope cap. Do not touch files outside this app unless explicitly listed.
6. Run the quality gates (below). Fix until clean. If you can't pass after 3 attempts, abort, commit what you have to the branch, and append a "blocked" entry under "Blocked / needs human input" at the bottom of this file.
7. Update [`CHANGELOG.md`](../../CHANGELOG.md) with a one-line entry under an `## Unreleased` section. Create the file if it doesn't exist.
8. Check the `- [ ]` box in this file → `- [x]`. Add a tiny "shipped in #PR" suffix once the PR is opened.
9. Commit. Push. Open a PR titled `[v2] feat(visualizer): <feature>` with the body sections listed under "PR body template" at the bottom of this file.
10. Move to the next item.

**Do not batch multiple items into one PR.** Each numbered item = one PR. Small focused PRs are reviewable; big mixed PRs are not.

---

## Quality gates (every PR must pass)

```powershell
pnpm install                                   # if you touched deps
pnpm --filter @torus/visualizer typecheck
pnpm --filter @torus/visualizer lint
pnpm --filter @torus/visualizer build
pnpm --filter @torus/web typecheck             # regression check — sacred
pnpm --filter @torus/visualizers typecheck     # regression check — sacred
```

All five must pass clean before you open the PR. Pre-existing lint *warnings* in other packages are fine; new *errors* anywhere are not.

---

## Hard rules (violating any = abort and ask for human input)

1. **Only touch** `apps/visualizer/` and `packages/visualizers/`. Never touch `apps/web/`, `apps/worker/`, `packages/db/`, `packages/storage/`, `packages/ui/`, billing, auth, or migrations.
2. **Never push to `main`.** Always a feature branch + PR.
3. **Never modify** `PRINCIPLES.md`, `LICENSE`, `SUCCESSION.md`, `THREAT_MODEL.md`, or `SECURITY.md`.
4. **Never add** analytics, tracking, third-party SDKs, ad scripts, telemetry, or any external script tag.
5. **Never break** the torus.fm clip player (`apps/web/src/components/ClipPlayer.tsx` + `VisualizerViewport.tsx`). New `@torus/visualizers` props must be optional and default to current behavior.
6. **Never change** the `VisualizerSceneProps` shape (would break existing presets). Add new optional props on `VisualizerCanvas` only.
7. **Never gate live preview** behind the paid unlock. Only export quality / format / extras are paid.
8. **Respect `prefers-reduced-motion`** in any new animated UI.
9. **No narrative code comments** (`// initialize foo`). Only comment non-obvious intent.

---

## Execution order (renumbered for dependency safety)

Items appear in the order Composer should ship them. The "(was #N in original list)" tag preserves traceability to the spec discussion.

### Foundations — ship these first, later items depend on them

#### - [x] shipped 1. Toast notifications (was #7)

**Why:** Multiple later items need to surface success/error to the user without `alert()` or `window.prompt()`. Build the primitive once.

**Tier:** Free.
**Scope:** ~120 LOC.
**Dependencies:** None.

**Files:**

- Add `apps/visualizer/src/components/Toast.tsx`
- Add `apps/visualizer/src/hooks/useToast.ts`
- Modify `apps/visualizer/src/app/layout.tsx` — mount provider
- Modify any current caller of `window.prompt` / `window.alert` to use the new toast (`apps/visualizer/src/components/VisualizerApp.tsx` `handleSavePreset` and surrounding UX)

**Implementation notes:**

- React context provider `ToastProvider` + `useToast()` hook exposing `{ toast, prompt }` where `prompt(opts) => Promise<string | null>`.
- Toast stack in bottom-right of viewport, max 3 visible, auto-dismiss after 4s.
- Variants: `info`, `success`, `error`.
- Reuse Tailwind brand tokens (`bg-torus-mid/15`, `text-torus-mid`, `border-torus-border-strong`).
- The `prompt` variant renders an inline toast with a text input + confirm/cancel. Replaces `window.prompt` for the "save preset" flow.

**Acceptance criteria:**

- Saving a preset uses the in-app toast prompt, not `window.prompt`.
- Successful save shows a green success toast; failure shows red.
- Toasts respect `prefers-reduced-motion` (no slide-in animation under reduced motion).

---

#### - [x] shipped 2. Settings persistence (was #1)

**Why:** Today every slider, palette, preset, and source choice resets on page reload. Foundational UX fix and unblocks "settings page" later.

**Tier:** Free.
**Scope:** ~120 LOC.
**Dependencies:** Item 1 (uses toast for "settings cleared" confirmation in #25, not required here).

**Files:**

- Add `apps/visualizer/src/hooks/usePersistedState.ts`
- Modify `apps/visualizer/src/components/VisualizerApp.tsx`
- Modify `apps/visualizer/src/lib/storage.ts` — add new keys

**Implementation notes:**

- New hook `usePersistedState<T>(key: string, initial: T): [T, Setter]` that reads from `localStorage` on mount (SSR-safe — return `initial` until hydrated) and writes on change with a small debounce (200ms).
- Replace `useState` for `preset`, `palette`, `controls`, `resolution`, `fps`, `sourceKind` in `VisualizerApp.tsx`.
- Add new keys to `storage.ts`:
  - `torus-visualizer-preset`
  - `torus-visualizer-palette`
  - `torus-visualizer-controls`
  - `torus-visualizer-export-resolution`
  - `torus-visualizer-export-fps`
- For paid-only settings (1080p+, 60fps+), if user is no longer unlocked, downgrade silently to free max on load.
- Do NOT persist the audio source itself (object URLs / streams) — only the *kind* of source last used.

**Acceptance criteria:**

- Set bass slider to 0.3, refresh — slider is still 0.3.
- Change palette to "Cool ocean", refresh — palette is still ocean.
- Lock a paid resolution, "deactivate" license in code, refresh — resolution clamps to 720p.
- No SSR hydration mismatch errors in console.

---

#### - [x] shipped 3. Snapshot PNG export (was #3)

**Why:** One-click poster image of the current frame. Free feature, drives organic sharing. Also the primitive that item 19 builds on for saved-preset thumbnails.

**Tier:** Free, no watermark (this is a screenshot, not a video export).
**Scope:** ~80 LOC.
**Dependencies:** Item 1 (success toast).

**Files:**

- Add `apps/visualizer/src/lib/snapshot.ts` — `takeSnapshot(canvas, mime?): Blob`
- Modify `apps/visualizer/src/components/ExportPanel.tsx` — add "Snapshot PNG" secondary button
- Modify `apps/visualizer/src/components/VisualizerApp.tsx` — wire the button to `glCanvasRef`

**Implementation notes:**

- Snapshot reads the R3F canvas via the existing `glCanvasRef` and calls `canvas.toBlob('image/png')`.
- Filename: `torus-visualizer-snapshot-<timestamp>.png`.
- Disabled when no source has been loaded.
- Show "Snapshot saved" success toast on download.

**Acceptance criteria:**

- Drop a track, click "Snapshot PNG" → PNG downloads at the current viewport resolution.
- Works for file, mic, and tab sources.
- Filename includes a timestamp.

---

### Quick wins — high user value, low risk

#### - [x] shipped 4. Audio file scrubber + timeline (was #2)

**Why:** File mode has no transport. Producers want to scrub to the drop before exporting.

**Tier:** Free.
**Scope:** ~150 LOC.
**Dependencies:** None.

**Files:**

- Add `apps/visualizer/src/components/Scrubber.tsx`
- Modify `apps/visualizer/src/components/VisualizerApp.tsx` — render scrubber under the viewport when source is file
- Modify `apps/visualizer/src/hooks/useAudioSource.ts` — expose `currentTime`, `duration`, `seek(t)`

**Implementation notes:**

- Listens to `timeupdate`, `durationchange`, `loadedmetadata` on the file's `HTMLAudioElement`.
- Click anywhere on the bar to seek. Drag to scrub. Keyboard: ← / → seek ±5s, Shift+← / Shift+→ ±15s.
- Display formatted time `M:SS / M:SS` on the right.
- Visual: thin progress bar in brand colors, taller hit target (~32px) for easy clicking, no gradient bling — minimal.
- Hidden in mic and tab modes.

**Acceptance criteria:**

- Drop a 1-minute track, click middle of scrubber → audio jumps to ~30s and visualizer keeps reacting.
- Keyboard left/right arrow seeks (but only when not focused in an input — guard like the existing Space shortcut does).
- No layout shift when switching from file to mic source.

---

#### - [x] shipped 5. Aspect ratio presets for export (was #4)

**Why:** 9:16 is essential for Reels/Shorts/TikTok. 1:1 for Instagram. Today everyone gets stuck with 16:9.

**Tier:** Free for 16:9; 9:16 / 1:1 / 4:5 are free too (no reason to gate framing). Resolution/FPS gating stays as-is.
**Scope:** ~120 LOC.
**Dependencies:** None.

**Files:**

- Modify `apps/visualizer/src/lib/export-config.ts` — add `AspectRatio` type + sizes
- Modify `apps/visualizer/src/components/ExportPanel.tsx` — add aspect selector
- Modify `apps/visualizer/src/components/VisualizerApp.tsx` — pass aspect to canvas during export
- Modify `apps/visualizer/src/hooks/useExport.ts` — compute export `{width, height}` from `resolution × aspect`

**Implementation notes:**

- New `AspectRatio = '16:9' | '9:16' | '1:1' | '4:5'`.
- New helper `dimensionsFor(res, aspect): {width, height}` that scales the long edge to the resolution's vertical and recomputes the other axis. E.g. 1080p 9:16 = 1080×1920.
- Persist last-used aspect via `usePersistedState` (item 2).
- During live preview, viewport letterboxes the canvas to show the chosen aspect (CSS aspect-ratio on a container).
- Aspect selector UI: 4 small icons (rectangle horizontal / rectangle vertical / square / portrait) with labels.

**Acceptance criteria:**

- Pick 9:16 + 1080p → preview shows a vertical letterboxed visualizer; export file is 1080×1920.
- Pick 1:1 + 720p → export file is 720×720.
- Aspect choice persists across reload.

---

#### - [x] shipped 6. Demo audio file (was #5)

**Why:** Visitors who don't have a track to hand should still get the wow moment. Lowers bounce on the landing page.

**Tier:** Free.
**Scope:** ~30 LOC + asset.
**Dependencies:** None.

**Files:**

- Add `apps/visualizer/public/demo.mp3` — a short (15–20s), royalty-free loop. **Until a real asset is curated, use a placeholder generated from a public-domain source — record an `AudioContext`-generated tone sequence if no asset is available. Note in the PR description that a real curated loop should replace it before launch.**
- Modify `apps/visualizer/src/components/AudioSourcePicker.tsx` — add "Try with demo audio" link under the dropzone
- Modify `apps/visualizer/src/components/VisualizerApp.tsx` — handler that fetches `/demo.mp3` as a `File` and calls `handleFile`

**Implementation notes:**

- The "Try demo" link is only visible when no source is loaded.
- Demo file goes in `public/` so Next serves it at `/demo.mp3`.
- Add a note in `apps/visualizer/README.md` about replacing the demo asset.

**Acceptance criteria:**

- Open `/` with no source → "Try demo" link visible.
- Click it → demo plays and visualizer reacts.
- After demo loads, the link disappears (source is loaded).

---

#### - [x] shipped 7. Better empty-state animation (was #6)

**Why:** Current empty state is plain text. Spending 30 seconds on a beautiful animated torus ring drawing itself makes a strong first impression.

**Tier:** Free.
**Scope:** ~120 LOC.
**Dependencies:** Item 6 (demo button placement).

**Files:**

- Add `apps/visualizer/src/components/EmptyStateHero.tsx`
- Modify `apps/visualizer/src/components/VisualizerApp.tsx` — render `EmptyStateHero` in the viewport when `!audio.source`

**Implementation notes:**

- Inline SVG: brand torus ring outline drawing itself via `stroke-dasharray` + `stroke-dashoffset` animation, looping every ~6s.
- Text below: "Drop a track, talk into your mic, or share a tab." + the "Try demo" button from item 6.
- Respect `prefers-reduced-motion`: render the ring statically.

**Acceptance criteria:**

- Initial load with no source shows the animated ring.
- Once any source loads, the ring is gone.
- With reduced motion enabled, the ring is shown but not animated.

---

#### - [x] shipped 8. Idle UI auto-hide in viewport (was #8)

**Why:** Producers using this as a listening companion want the visual front-and-center. Hide controls after a few seconds of inactivity.

**Tier:** Free.
**Scope:** ~100 LOC.
**Dependencies:** None.

**Files:**

- Add `apps/visualizer/src/hooks/useIdleHide.ts`
- Modify `apps/visualizer/src/components/VisualizerApp.tsx`

**Implementation notes:**

- Hook returns `{ uiVisible, reveal }`. `reveal()` shows + resets a 2.5s timer. Pointer move/click/wheel/keydown anywhere in viewport call `reveal()`.
- Applies only to viewport-overlay controls (file name display, REC badge, future shortcuts hint). The sidebar always stays visible.
- During export (`isRecording`), force `uiVisible = true` so REC badge doesn't hide.
- Smooth opacity transition, 250ms.
- Respect `prefers-reduced-motion`: instant toggle, no transition.

**Acceptance criteria:**

- Load a track, sit still for 3s → file name overlay fades out.
- Move mouse → overlay fades back in.
- During recording, overlay stays visible regardless of idle.

---

#### - [ ] 9. Keyboard shortcut help modal (was #9)

**Why:** Shortcuts are mentioned once in the empty state. Producers want a `?` key reference.

**Tier:** Free.
**Scope:** ~100 LOC.
**Dependencies:** None.

**Files:**

- Add `apps/visualizer/src/components/ShortcutsModal.tsx`
- Modify `apps/visualizer/src/components/VisualizerApp.tsx` — register `?` key, manage open state

**Implementation notes:**

- Modal opens on `?` (Shift + /). Closes on `Escape` or click-outside.
- Lists: Space (play/pause), F (fullscreen), R (random preset), ← / → (seek if scrubber from item 4 exists), ? (this modal).
- Plain Tailwind modal, no extra deps.
- Accessible: trap focus, return focus to opener on close, ARIA dialog labels.

**Acceptance criteria:**

- Press `?` from anywhere except an input → modal opens.
- Escape closes it.
- All listed shortcuts work as documented.

---

### New presets — independent, ship in any order

Each new preset is a single self-contained R3F file under `packages/visualizers/src/presets/` + one entry in `packages/visualizers/src/registry.ts`. The visualizer app picks them up automatically via the registry. Add a brand color to `PRESET_COLORS` in `apps/visualizer/src/components/PresetPicker.tsx`.

For every preset:

- Export a `<Name>Scene` component implementing `VisualizerSceneProps`.
- Use `useMetricsRef()` for audio data, not `analyser` directly (same pattern as existing presets).
- Provide three tier counts (low/mid/high) for any particle/geometry budget.
- Self-contained — no shared shader files, no external assets.
- Add to `VisualizerId` union + `VISUALIZERS` registry.
- Smoke-test in the visualizer app: drop a track, switch to the new preset, verify it reacts.

#### - [ ] 10. New preset: Cosmic Mandala (was #10)

**Why:** Brand-aligned sacred geometry, complements Torus Field as a signature preset.

**Tier:** Free.
**Scope:** ~220 LOC.

**Files:**

- Add `packages/visualizers/src/presets/CosmicMandala.tsx`
- Modify `packages/visualizers/src/registry.ts`
- Modify `apps/visualizer/src/components/PresetPicker.tsx` (color swatch)

**Implementation notes:**

- 6 or 8-fold radial symmetry. Concentric rings of `torusGeometry` instances rotating at different rates.
- Bass = ring expansion + breath. Mid = inner geometry rotation speed. High = outer particle shimmer.
- Beat triggers a brief "pulse" outward.
- Tier scaling: 3 / 5 / 7 ring layers.

**Acceptance criteria:**

- New preset appears in picker + `pickRandomVisualizerPreset()` rotation.
- Reacts visibly to bass/mid/high.
- No GL warnings in console.

---

#### - [ ] 11. New preset: Star Field / Galaxy Spiral (was #11)

**Why:** Universal appeal, gentler than Particle Storm.

**Tier:** Free.
**Scope:** ~200 LOC.

**Files:**

- Add `packages/visualizers/src/presets/StarField.tsx`
- Modify `packages/visualizers/src/registry.ts`
- Modify `apps/visualizer/src/components/PresetPicker.tsx`

**Implementation notes:**

- Particles distributed along a logarithmic spiral (2–3 arms). Mild rotation.
- Bass causes arms to wind tighter; energy controls overall brightness; high triggers tiny "twinkle" bursts on a random subset of particles.
- Tier scaling: 2k / 6k / 14k particles.

**Acceptance criteria:**

- Recognizable spiral shape on first load.
- Reacts to all three bands.
- Smooth at 60fps on `mid` tier.

---

#### - [ ] 12. New preset: Outrun Grid (was #12)

**Why:** Synthwave aesthetic, perfect for the music-producer audience.

**Tier:** Free.
**Scope:** ~260 LOC.

**Files:**

- Add `packages/visualizers/src/presets/OutrunGrid.tsx`
- Modify `packages/visualizers/src/registry.ts`
- Modify `apps/visualizer/src/components/PresetPicker.tsx`

**Implementation notes:**

- Horizontal infinite grid scrolling toward the camera, sun-circle on the horizon, mountain silhouette mid-distance.
- Sun pulses with bass. Grid line color cycles with palette. Mountain silhouette wobbles with mid.
- Use a single large `planeGeometry` with a custom `shaderMaterial` (inline GLSL) for the grid — perf > geometry approach.
- Tier scaling: shader-only, so vary fragment branches and bloom intensity.

**Acceptance criteria:**

- On load: vertical grid recedes to horizon, sun centered, mountains visible.
- Bass kick = sun pulses.
- Smooth at 60fps on `mid` tier.

---

#### - [ ] 13. New preset: Liquid Chrome (was #13)

**Why:** Premium aesthetic, instantly recognizable as "high production value".

**Tier:** Free.
**Scope:** ~270 LOC.

**Files:**

- Add `packages/visualizers/src/presets/LiquidChrome.tsx`
- Modify `packages/visualizers/src/registry.ts`
- Modify `apps/visualizer/src/components/PresetPicker.tsx`

**Implementation notes:**

- Single central blob (`icosahedronGeometry` with high subdivision) with `meshStandardMaterial` (metalness 1, roughness 0.15).
- Vertex shader displacement using 3D noise driven by bass + beat.
- No HDR environment to keep deps minimal — rely on the existing `SceneRig` lights. Document in a comment that an `Environment` from drei would look better and is a v2 enhancement.
- Tier scaling: 32 / 64 / 128 subdivisions.

**Acceptance criteria:**

- Reflective metallic blob deforming with the music.
- 60fps on `mid` tier with the default subdivision count.

---

### Advanced export — biggest paid-tier value drivers

#### - [ ] 14. Pre-render export mode for file sources (was #15)

**Why:** Real-time `MediaRecorder` at 4K stutters and looks bad. Pre-rendering frame-by-frame from a file gives broadcast-quality output.

**Tier:** Paid only.
**Scope:** ~300 LOC.
**Dependencies:** None (export pipeline already exists).

**Files:**

- Add `apps/visualizer/src/lib/prerender.ts`
- Modify `apps/visualizer/src/hooks/useExport.ts` — branch on `mode: 'realtime' | 'prerender'`
- Modify `apps/visualizer/src/components/ExportPanel.tsx` — add mode toggle (paid only, file mode only)

**Implementation notes:**

- Pre-render path (file source only):
  1. Pause audio playback. Disconnect existing audio graph briefly.
  2. Decode the file via `AudioContext.decodeAudioData` → `AudioBuffer`.
  3. Create an `OfflineAudioContext` matching the file (sample rate × length × channels).
  4. For each video frame at the target FPS: seek the audio playhead, run the analyser on the `OfflineAudioContext`'s analyser node OR — simpler v1 — feed the same bands by sampling the frequency data of the file pre-computed in chunks.
  5. Render one R3F frame, `canvas.toBlob('image/png')` → append to a frame queue.
  6. Mux the PNG frames + the original audio with `MediaRecorder` driven by a `requestAnimationFrame` loop on an offscreen canvas at the target FPS, OR — if item 15 (ffmpeg.wasm) has already shipped — pipe to ffmpeg.wasm for proper MP4.
- Show a progress bar (rendered frames / total frames). Allow cancel.
- v1 of pre-render acceptable behavior: 2–5x faster than real-time. Document the speed-up in the PR.
- DO NOT pre-render mic or tab sources (continue using real-time path for those).
- Lock the mode toggle behind `useUnlock()`.

**Acceptance criteria:**

- Paid user with a file source can pick "Pre-render" mode.
- Export of a 30-second track at 1080p / 60fps takes meaningfully less wall-clock than 30s (target: < 20s).
- Output WebM plays correctly with synced audio.
- Mic / tab modes hide the pre-render toggle entirely.

---

#### - [ ] 15. MP4 export via ffmpeg.wasm (was #14)

**Why:** WebM is technically fine but creators expect MP4. Removes a real friction point.

**Tier:** Paid only.
**Scope:** ~250 LOC + new dep.
**Dependencies:** Item 14 (cleaner integration; can be done independently if needed).

**Files:**

- `apps/visualizer/package.json` — add `@ffmpeg/ffmpeg` and `@ffmpeg/util`. Pin to current major (`^0.12.x` family). Mark `onlyBuiltDependencies` in root `package.json` only if needed.
- Add `apps/visualizer/src/lib/ffmpeg.ts` — lazy-load wrapper
- Modify `apps/visualizer/src/hooks/useExport.ts` — after WebM blob produced, optionally transcode to MP4
- Modify `apps/visualizer/src/components/ExportPanel.tsx` — format select: WebM (default, free) or MP4 (paid)

**Implementation notes:**

- ffmpeg.wasm is ~30MB. **Lazy-load on first MP4 export**, not on app boot. Show a "Loading MP4 encoder…" toast (item 1) during initial load.
- Self-host the ffmpeg wasm + worker files in `public/ffmpeg/` to avoid CDN tracking and CORS issues. Reference instructions in PR.
- Transcode command: `ffmpeg -i input.webm -c:v libx264 -preset fast -crf 22 -c:a aac output.mp4`.
- For very long exports (> 10 min) warn about memory; cap MP4 export at a reasonable file size (e.g. 2GB) and bail with a toast if over.
- Add a one-line explanation in the UI: "MP4 takes ~15s extra to transcode."

**Acceptance criteria:**

- Paid user picks MP4 → records → ~15s "transcoding…" state → MP4 downloads.
- MP4 plays in QuickTime / Windows Media Player / browser.
- Free user can't select MP4 (locked option, routes to `/unlock`).
- App boot bundle does NOT include ffmpeg.wasm (verify via build output size).

---

#### - [ ] 16. Lower-third title overlay for exports (was #16)

**Why:** Creators want their track name + artist branded onto the export.

**Tier:** Free (basic), paid (custom positioning + color).
**Scope:** ~180 LOC.
**Dependencies:** Item 5 (aspect ratios — overlay positioning depends on aspect).

**Files:**

- Add `apps/visualizer/src/components/TitleOverlayPanel.tsx`
- Modify `apps/visualizer/src/lib/compose.ts` — accept optional `titleOverlay` config and draw it during compositing
- Modify `apps/visualizer/src/hooks/useExport.ts` — thread through the config
- Modify `apps/visualizer/src/components/VisualizerApp.tsx` — wire up state + persist via item 2

**Implementation notes:**

- Inputs: Title (string), Subtitle (string), Show/hide toggle.
- Free: bottom-left position, brand font (system fallback), white text on a translucent torus-indigo background bar, 8% of width tall.
- Paid: position picker (4 corners + bottom-center), text color, background opacity.
- Title overlay is drawn on the compositing canvas (`compose.ts`) — appears in exports only, not in live preview. The live preview shows a small "Title: X" indicator in the sidebar instead.
- Empty title = no overlay drawn.

**Acceptance criteria:**

- Free user adds "My Track" title → exports a video with the title in bottom-left.
- Paid user can change position + color.
- Empty title field results in no overlay in the export.

---

### Smart features

#### - [ ] 17. Smart palette from album art (was #17)

**Why:** Producers drop a track and want the visuals to match their cover art. One-click palette extraction is a delight feature.

**Tier:** Free.
**Scope:** ~180 LOC.
**Dependencies:** Item 1 (toast for "palette extracted").

**Files:**

- Add `apps/visualizer/src/lib/extractPalette.ts`
- Modify `apps/visualizer/src/components/ControlPanel.tsx` — add "Extract from image…" button under palette section
- Modify `apps/visualizer/src/components/VisualizerApp.tsx` — wire file input

**Implementation notes:**

- Click → hidden file input (image accept). User picks a PNG/JPG.
- Draw the image to a small offscreen canvas (e.g. 64×64), sample pixels.
- Hand-rolled simple k-means or median-cut quantizer to find 3 dominant colors. No external deps.
- Sort the 3 colors by luminance: lowest → bass, mid → mid, highest → high. Tweak if it produces dull results: prefer most-saturated colors.
- On success, apply to `palette` state + show "Palette extracted from <filename>" success toast.
- File handle is discarded immediately after sampling — no upload, no storage.

**Acceptance criteria:**

- Drop a colorful image → palette swatches change to match.
- Drop a grayscale image → palette goes monochrome.
- No image data sent anywhere (verify via DevTools network).

---

#### - [ ] 18. BPM detection + display (was #18)

**Why:** Producers think in BPM. Showing detected BPM proves the visualizer is "smart" and helps users dial reactivity for the right feel.

**Tier:** Free.
**Scope:** ~150 LOC.
**Dependencies:** None.

**Files:**

- Add `apps/visualizer/src/hooks/useBPM.ts`
- Add `apps/visualizer/src/components/BPMIndicator.tsx`
- Modify `apps/visualizer/src/components/VisualizerApp.tsx`

**Implementation notes:**

- Hook reads the existing analyser via `getTimeDomainData`, applies a simple onset-detection over a rolling 8s window (energy flux + autocorrelation in the 60–180 BPM band).
- Quantize to nearest integer BPM. Smooth over 4s.
- Display: small "120 BPM" pill in the bottom-left of the viewport (under or near the file-name display). Toggleable via a sidebar setting persisted by item 2 (default: off).
- For mic/tab sources, BPM may be noisy or unstable — that's fine, show "—" if confidence is low.

**Acceptance criteria:**

- Drop a 128 BPM track → indicator shows 126–130 within a few seconds.
- Toggling off hides the indicator.
- Setting persists across reloads.

---

#### - [ ] 19. Saved-preset thumbnails (was #19)

**Why:** Saved presets are currently a text list. A visual grid is far more usable.

**Tier:** Paid only (saved presets are already a paid feature).
**Scope:** ~150 LOC.
**Dependencies:** Item 3 (snapshot helper).

**Files:**

- Modify `apps/visualizer/src/lib/storage.ts` — add `thumbnail?: string` (data URL) to `SavedPreset`
- Modify `apps/visualizer/src/components/ControlPanel.tsx` — capture thumbnail on save + render grid
- Modify `apps/visualizer/src/components/VisualizerApp.tsx` — wire `glCanvasRef` into the save flow

**Implementation notes:**

- On "Save current as…", call `snapshot.ts` (from item 3) with the canvas, downsize to 256×144 (16:9 thumbnail), convert to data URL.
- Replace the current `<ul>` list with a 2-column grid of cards: thumbnail + name + delete button.
- Storage size watchdog: if `localStorage` usage > 4MB, warn via toast and refuse new thumbnail (save preset without thumbnail).
- Backward-compatible: old saved presets with no thumbnail render with a placeholder torus icon.

**Acceptance criteria:**

- Save a preset → entry appears in the grid with a real thumbnail of what was on screen.
- Load preset → applies as before.
- Delete preset → removed from grid.
- Old presets (no thumbnail) still render and load.

---

## PR body template

Every PR Composer opens should use this body structure:

```markdown
## What

<1–2 sentence summary>

## Why

<Reference the ROADMAP.md item number + brief rationale>

## Changes

- <file> — <what changed>
- <file> — <what changed>

## How to test

1. <step>
2. <step>

## Quality gates

- [x] `pnpm --filter @torus/visualizer typecheck`
- [x] `pnpm --filter @torus/visualizer lint`
- [x] `pnpm --filter @torus/visualizer build`
- [x] `pnpm --filter @torus/web typecheck` (regression)
- [x] `pnpm --filter @torus/visualizers typecheck` (regression)

## Principles check

- No analytics / tracking / third-party SDKs added
- Live preview not gated behind paid unlock
- prefers-reduced-motion respected (if animated)
- Does not touch apps/web, apps/worker, or any package outside visualizer scope

## Risks

<Anything the maintainer should look at carefully>
```

---

## Blocked / needs human input

(Composer appends here when it aborts.)

<!-- Example:
- **2026-05-22** | Item 14 (pre-render) | OfflineAudioContext sample-rate mismatch with file >48kHz. Need maintainer guidance on resampling strategy.
-->

---

## Done log

- 2026-05-21 | Item 1 (Toast notifications) | commit dd2edbf
- 2026-05-21 | Item 2 (Settings persistence) | commit e03b82f
- 2026-05-21 | Item 3 (Snapshot PNG export) | commit e29e23a
- 2026-05-21 | Item 4 (Audio scrubber) | commit 22bdca8
- 2026-05-21 | Item 5 (Aspect ratio presets) | commit d51947e
- 2026-05-21 | Item 6 (Demo audio file) | commit 9bb8623
- 2026-05-21 | Item 7 (Better empty-state animation) | commit 0be10a1
- 2026-05-21 | Item 8 (Idle UI auto-hide) | commit 23a6223

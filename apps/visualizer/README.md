# torus visualizer

Turn any audio into beautiful 3D visuals and export for Reels, Shorts, and portfolios.

Sibling app to [torus.wtf](../web) — lives at `visualizer.torus.wtf` in production. Currently deployed at `torus-fm-visualizer.vercel.app` until DNS is migrated.

## What's in the box

### Audio sources (3)

- **File** — drag-and-drop any local MP3, WAV, FLAC, OGG, Opus, M4A, or AAC
- **Mic** — microphone or line-in via `getUserMedia({ audio: true })`
- **Desktop** — capture audio from Spotify, Ableton, Splice, or any other app via Chrome/Edge tab/system audio sharing (`getDisplayMedia({ audio: true })`). A first-run modal walks the user through the OS-specific flow.

### Presets (12)

| ID | Name | Vibe |
|---|---|---|
| `liquid_blob` | Liquid Blob | Default — raymarched metaballs (smin field), amorphous, no spiky vertices |
| `anima` | Anima | The living creature — aurora curtains + soul core that listens with you |
| `torus_field` | Torus Field | Flowing torus with bass-reactive bloom, the brand signature |
| `particle_storm` | Particle Storm | High-density particles, beat-driven bursts |
| `infinite_tunnel` | Tunnel | Infinite segmented tunnel — bass explodes the walls, mids drive pyramid teeth, flow-field particles ride the current |
| `volumetric_waveform` | Volumetric Waveform | Time-domain ribbon in 3D |
| `cosmic_mandala` | Cosmic Mandala | Radial symmetry, dreamlike |
| `star_field` | Star Field | Face-on spiral galaxy with twinkles and beat-driven camera punches |
| `outrun_grid` | Outrun Grid | Real 3D wireframe terrain receding to a banded synthwave sun |
| `liquid_chrome` | Liquid Chrome | GPU-shader chrome blob with fresnel + procedural env reflection |
| `halo_rain` | Halo Rain | Concentric luminous rings drifting like celestial rain — gather inhale, impact flare, hat ticks |
| `mandelbrot_zoom` | Mandelbrot Zoom | Smooth looped fractal zoom, palette-locked colors, audio-reactive speed |

### UI features

- **Full-bleed viewport** — visuals take the whole screen below the header. Controls float on the left as a translucent glass panel that auto-hides when the cursor is idle (3s) or leaves the window.
- **Mad-scientist controls** — Gain, Bass/Mid/High mix, Bloom, Speed, and Smoothness with 5x slider headroom. Double-click any value above a slider to type any number with no clamp (out-of-range values display in the bass accent and the slider thumb pins at its nearest edge). Smoothness eases the audio metrics over time so visuals don't snap pointy at high gain.
- **Custom 3-band palette** (unlocked tier) — bass/mid/high colors persist per preset
- **Smart palette from image** — extract a bass/mid/high palette from any image, and auto-match it to a track's embedded cover art on upload (sampled in-browser, never uploaded)
- **Title card** — lower-third track/artist overlay burned into exports only; auto-filled from embedded ID3/MP4/FLAC tags. Free renders a brand bottom-left card; unlocked adds position, color, and opacity
- **Saved presets** (unlocked tier) — stash settings combinations to localStorage
- **Snapshot** — PNG of the current frame
- **BPM detection** — optional overlay using a fast tempogram on file sources
- **Hardware acceleration warning** — dismissible banner detects software WebGL rendering
- **Feedback button** — pre-fills a GitHub issue with category/title/body

### Free vs paid

| Feature | Free | Full ($10 one-time) |
| --- | --- | --- |
| All 12 presets + live preview | Yes | Yes |
| Export length | Unlimited | Unlimited |
| Export resolution | 720p | Up to 4K |
| Export FPS | 30 | Up to 240 |
| Watermark on exports | Small corner mark | Optional — off, default badge, or your own logo |
| Pre-rendered MP4 (file/WTF) | Yes (watermarked) | Yes |
| Smart palette from image | Yes | Yes |
| Title card on exports | Bottom-left brand card | Position + color + opacity |
| Custom 3-band palette | — | Yes |
| Saved presets | — | Yes |
| Future presets | — | Free forever |

Live preview is never watermarked.

## Quick start

From the monorepo root:

```powershell
pnpm install
pnpm --filter @torus/visualizer dev
```

Open <http://localhost:3001>.

### Building locally (with WTF prefetch)

```powershell
pnpm --filter @torus/visualizer build
```

This runs `scripts/fetch-demos.mjs` first, which downloads the latest 10 public tracks from the configured SoundCloud account into `public/demos/`. If SoundCloud is unreachable, the build continues without WTF tracks (button hides itself in the UI).

### Demo audio attribution

`public/demo.mp3` ("Try with demo audio") is **"Scheming Weasel (faster version)" by Kevin MacLeod** ([incompetech.com](https://incompetech.com)), licensed under [Creative Commons: By Attribution 3.0](https://creativecommons.org/licenses/by/3.0/). Keep this credit if you redistribute the app.

## Environment variables

Add to the root `.env`:

```env
# Polar.sh — Production License checkout (account-bound, one-time $10)
POLAR_API_KEY=
POLAR_PRODUCTION_LICENSE_PRODUCT_ID=
POLAR_WEBHOOK_SECRET=

# Optional — base URL used in OG metadata / canonical URLs
NEXT_PUBLIC_SITE_URL=https://visualizer.torus.wtf
```

### Manual Polar setup

1. Create a product: **torus visualizer — full unlock**
2. Type: one-time, $10 USD
3. Enable **license keys** as a benefit
4. Copy product ID → `POLAR_PRODUCTION_LICENSE_PRODUCT_ID`
5. Set webhook endpoint to `https://your-domain/api/license/webhook` and copy the secret → `POLAR_WEBHOOK_SECRET`
6. Reuse `POLAR_API_KEY` from torus.wtf if already set

## Deploy

Vercel-first. Project root in the Vercel dashboard should point at `apps/visualizer`. Build command and install command are wired in `apps/visualizer/vercel.json`.

```
Build:   pnpm --filter @torus/visualizer build
Install: pnpm install --frozen-lockfile --filter @torus/visualizer...
Output:  apps/visualizer/.next
```

Point the production domain (`visualizer.torus.wtf` once DNS migrates) as a custom domain on the Vercel project.

## Export format

Two export paths:

- **Record (real-time)** — captures the live canvas via `MediaRecorder` to WebM (VP9 + Opus), or MP4 (H.264 + AAC) when `MediaRecorder.isTypeSupported('video/mp4; codecs="avc1, mp4a.40.2"')` returns true. Works for every source.
- **Pre-render (file / WTF only)** — renders the whole track frame-by-frame offline (offline FFT + BPM prescan + WebCodecs `VideoEncoder`/`AudioEncoder` muxed with `mp4-muxer`) into a broadcast-quality MP4 without playing it through in real time. Needs a WebCodecs-capable browser (Chrome/Edge or Firefox 130+); falls back to Record elsewhere.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Space` | Play / pause (file source) |
| `F` | Fullscreen viewport |
| `R` | Random preset |
| `←` / `→` | Seek ±5s (file source) |
| `Shift+←` / `Shift+→` | Seek ±15s (file source) |
| `?` | Show shortcuts modal |

## License

AGPL-3.0-or-later (monorepo root). The visualizer shares `@torus/visualizers` with the torus.wtf clip-sharing app, so any improvement to a preset benefits both.

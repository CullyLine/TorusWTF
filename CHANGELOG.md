# Changelog

## 0.1.0

- Consolidate the project into a single Next.js app (`apps/visualizer`): visualizer, Conductor, Transcriber, accounts/profiles, and the Production License all under one roof
- Remove clip hosting, the background worker, object storage, and the VPS/Docker deployment path
- Switch the database to libSQL (Turso in production, a local SQLite file in dev); trim the schema to accounts, sessions, and license state
- Add the one-time, account-bound **Production License** ($10): high-quality 1440p exports, high frame rates, watermark removal, commercial-use rights, and a profile badge — wired through Polar checkout + webhook
- Account-bound export gating: free exports are watermarked and capped; the license lifts the caps site-wide
- Add a global, uninvasive top-left app accordion and top-right account menu on every page, with a Stem Separation "coming soon" entry
- New cosmic-doughnut brand mark and favicon
- Refresh README, PRINCIPLES, and site copy around "3D visuals for your audio"; set version 0.1.0

## Unreleased

- Add in-app toast notifications with prompt support for preset saving
- Persist visualizer settings (preset, palette, controls, export options, source kind) across reloads
- Add one-click Snapshot PNG export with timestamped filename
- Add file audio scrubber with click, drag, and keyboard seek
- Add export aspect ratio presets with letterboxed preview
- Add demo audio file with try-demo link for empty state
- Add animated torus ring empty-state hero with demo button in viewport
- Add idle auto-hide for viewport overlay controls during playback
- Add keyboard shortcuts help modal (? key)
- Add Cosmic Mandala visualizer preset
- Add Star Field galaxy spiral preset
- Add Outrun Grid synthwave shader preset
- Add Liquid Chrome metallic blob preset
- Add BPM detection pill with persisted sidebar toggle
- Rebrand Tab audio source to Desktop with first-run setup guide for Spotify / Ableton / Splice capture
- Add Mandelbrot Zoom fractal preset with music-reactive colors and intensity-driven dive speed
- Add pre-rendered MP4 export (offline FFT + BPM prescan + WebCodecs + mp4-muxer) for file and WTF sources
- Add smart palette extraction from album art / any image, auto-matched from a track's embedded cover on upload
- Add lower-third title card overlay burned into exports, auto-filled from embedded ID3/MP4/FLAC tags
- Add saved-preset thumbnail grid captured from the live frame, with a placeholder for legacy presets and a localStorage budget guard
- Add Open Graph and Twitter social card images, expand SEO metadata, allow display-capture permissions
- Bump Next.js to 15.5.18 to address upstream CVEs and move typedRoutes out of experimental
- Smooth out audio reactivity: raised-cosine crossover bands + perceptual scaling fix band "rubberbanding", auto-gain (AGC) levels any track, default punch and fast-attack/slow-release smoothing keep motion alive (Gain becomes a trim, "Auto sensitivity" toggle added)
- Add reactive backgrounds behind mesh presets (nebula, star field, aurora, glow) — slow, contrast-capped, reduced-motion aware, with a sidebar selector and intensity slider

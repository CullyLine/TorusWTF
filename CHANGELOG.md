# Changelog

## Unreleased

- Rewrite the README for people who are not developers: what torus is, how to use it in four steps, and what it costs. Developer setup moves to the bottom
- Shorten CONTRIBUTING, SECURITY, the code of conduct, and the issue templates, and remove their references to Docker, MinIO, and other parts that no longer exist
- Format the whole repository with Prettier and check formatting in CI
- Restyle Conductor and Transcriber on the same controls, top bar, and colors as the visualizer
- Fix duplicate list keys in Conductor's instrument picker, and stop the app launcher from covering the piano roll's title
- Redesign the visualizer page. The controls are a docked sidebar with four tabs (Audio, Look, Automate, Export) instead of one long translucent panel that faded out, and playback has one transport bar under the stage
- Replace the separate intro screen with an empty state on the stage, and accept an audio file dropped anywhere on the page
- Add `H` to show or hide the controls. Shortcuts no longer fire with Ctrl, Cmd, or Alt held, and Space no longer blocks a focused button
- Fit the preview to the stage at the export aspect ratio at every window size
- Switch to solid surfaces with one accent color, raise faint text to WCAG AA contrast, and load IBM Plex Sans from the app's own origin
- Split `VisualizerApp` (1,382 lines) into a 600-line page plus `useLook`, `useStudioSource`, `useExportSettings`, `useStudioExport`, and a set of shared form controls
- Make torus free: remove the Production License, the Polar checkout and webhook, and every export limit. All resolutions up to 4K, all frame rates up to 240 fps, custom palette colors, saved presets, and title-card styling are available to everyone
- Make the export watermark optional for everyone, with support for a custom logo. It stays on by default
- Default new exports to 1080p
- Open custom profile subdomains to every account
- Show an "Early supporter" badge on profiles that bought the retired license
- Redirect `/license` and `/unlock` to the app
- Fix `pnpm db:migrate`, which crashed outside the Next.js bundle, and the lint error in `packages/db`. CI passes again
- Remove unused code left over from clip hosting (`packages/shared` env schema, share codes, week buckets)
- Rewrite the README, CONTRIBUTING, PRINCIPLES, and site copy to match the current app
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
- Add reactive backgrounds behind mesh presets (nebula, star field, aurora, glow). Slow, contrast-capped, reduced-motion aware, with a sidebar selector and intensity slider

## 0.1.0

- Consolidate the project into a single Next.js app (`apps/visualizer`): visualizer, Conductor, Transcriber, accounts/profiles, and the Production License all under one roof
- Remove clip hosting, the background worker, object storage, and the VPS/Docker deployment path
- Switch the database to libSQL (Turso in production, a local SQLite file in dev); trim the schema to accounts, sessions, and license state
- Add the one-time, account-bound **Production License** ($10): high-quality 1440p exports, high frame rates, watermark removal, commercial-use rights, and a profile badge. Wired through Polar checkout + webhook
- Account-bound export gating: free exports are watermarked and capped; the license lifts the caps site-wide
- Add a global, uninvasive top-left app accordion and top-right account menu on every page, with a Stem Separation "coming soon" entry
- New cosmic-doughnut brand mark and favicon
- Refresh README, PRINCIPLES, and site copy around "3D visuals for your audio"; set version 0.1.0

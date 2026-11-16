# torus app

The Next.js app behind [torus.wtf](https://torus.wtf). It contains the visualizer, Conductor, Transcriber, and optional accounts. The repository [README](../../README.md) covers setup.

## Visualizer

### Audio sources

- **File.** Drop an MP3, WAV, FLAC, OGG, Opus, M4A, or AAC file.
- **Mic.** A microphone or line-in, through `getUserMedia`.
- **Desktop.** Audio from Spotify, Ableton, or any other app, through `getDisplayMedia`. This needs Chrome or Edge. A dialog explains the steps for each operating system.
- **YouTube.** Plays a video in an embed and captures the tab's audio.

Audio never leaves the browser.

### Visualizers

The set is kept small on purpose. Retired ids still load, because `resolveVisualizerId` maps each one to its closest replacement.

| Id                    | Name                | What it draws                                               |
| --------------------- | ------------------- | ----------------------------------------------------------- |
| `flow_field`          | Flow Field          | Particles that follow a flow field you can stir by cursor   |
| `torus_field`         | Torus Field         | A flowing torus that blooms on bass                         |
| `infinite_tunnel`     | Tunnel              | A segmented tunnel whose walls react to each frequency band |
| `volumetric_waveform` | Volumetric Waveform | The spectrum as a ribbon in 3D                              |
| `cosmic_mandala`      | Cosmic Mandala      | Nested rings, one per frequency band                        |
| `star_field`          | Galaxy Garden       | A spiral galaxy with shockwaves on drops                    |
| `liquid_blob`         | Lava Choir          | Raymarched lava orbs that merge with the music              |
| `tidal_sanctuary`     | Tidal Sanctuary     | An ocean with depth, water, and foam on separate bands      |
| `plasma_globe`        | Plasma Globe        | A plasma globe built to a fixed performance budget          |

The presets and the rendering engine live in [`packages/visualizers`](../../packages/visualizers). The control panel is generated from `controlSchema.ts`, so a new slider needs no UI code.

### Controls

- Sliders for reactivity, color, light, camera, and each visualizer's own parameters. Double-click a value to type a number outside the slider's range.
- Palettes: built-in sets, three custom colors, or colors extracted from an image. A file with embedded cover art sets the palette on load.
- Screen styles and a particle emitter layer.
- Triggers fire one-shot actions from the music or from MIDI notes. Modulations route a continuous signal, such as vocals or drums, to any control.
- Saved presets and show files. A show file holds the whole look and can be exported and imported as JSON.
- A projector window mirrors the output for a second display.

Settings persist in `localStorage`.

### Export

- **Record.** Captures the live canvas with `MediaRecorder` to WebM, or MP4 where the browser supports it. Works for every source. Limited to the display's refresh rate, about 60 fps.
- **Pre-render.** Renders an uploaded file frame by frame with WebCodecs and muxes an MP4 with `mp4-muxer`. This is the only path that produces 120 and 240 fps. It needs Chrome, Edge, or Firefox 130 or newer.
- **Snapshot.** Saves the current frame as a PNG.

Resolutions go from 720p to 4K in four aspect ratios. A title card and a corner watermark can be burned into exports. The watermark is on by default, and you can turn it off or replace it with your own logo.

### Keyboard shortcuts

| Key                 | Action                        |
| ------------------- | ----------------------------- |
| `Space`             | Play or pause (file source)   |
| `←` / `→`           | Skip 5 seconds (file source)  |
| `Shift` + `←` / `→` | Skip 15 seconds (file source) |
| `F`                 | Fullscreen                    |
| `H`                 | Show or hide the controls     |
| `R`                 | Random visualizer             |
| `?`                 | Show the shortcut list        |

### Page layout and code

The page has a top bar, a sidebar of controls, and the stage. The sidebar has four tabs in the order a new user needs them: Audio, Look, Automate, Export. On a phone the sidebar becomes a sheet under the stage.

```
src/components/studio/   The page: VisualizerApp, top bar, tabs, transport bar, empty state, dialogs
src/components/panels/   One file per sidebar panel
src/components/ui/       Form controls and icons shared by every panel and by Conductor and Transcriber
src/hooks/useLook.ts             The look: visualizer, palette, sliders, effects, triggers, modulations
src/hooks/useExportSettings.ts   Export format and watermark
src/hooks/useStudioSource.ts     Choosing the audio: file, demo, mic, desktop, YouTube
src/hooks/useStudioExport.ts     Recording, rendering, and snapshots
```

`VisualizerApp` owns the audio source and the layout and passes state from those hooks to the panels. A panel builds its controls from `components/ui/controls.tsx` and does not carry its own styles for sliders, selects, or buttons. Colors and type are defined once in `src/app/globals.css`.

## Conductor and Transcriber

Conductor (`/conductor`) is a SoundFont DAW built on `spessasynth_lib`. Transcriber (`/transcriber`) converts audio to MIDI with Spotify's `basic-pitch` model. Both run in the browser.

The `dev` and `build` scripts first copy the SoundFont worklet, the `basic-pitch` model, and the `libsonare` WebAssembly files into `public/`. The copy lines in the console are expected.

## Accounts

Accounts are optional and nothing in the tools requires one. Sign-in is by magic link or Discord. An account has a handle, a profile at `/u/<handle>`, and an optional `<name>.torus.wtf` subdomain. Sessions are HttpOnly cookies. The schema is in [`packages/db`](../../packages/db).

## Environment variables

All of these are optional in development. [`.env.example`](../../.env.example) documents each one.

| Variable                                     | Purpose                                          |
| -------------------------------------------- | ------------------------------------------------ |
| `DATABASE_URL`, `DATABASE_AUTH_TOKEN`        | libSQL database for accounts                     |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`     | The same, as set by the Vercel Turso integration |
| `PUBLIC_URL`, `NEXT_PUBLIC_SITE_URL`         | Base URL for sign-in links and page metadata     |
| `SMTP_*`                                     | Email for magic links and the feedback form      |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | Discord sign-in                                  |

## Deploy

The Vercel project root is `apps/visualizer`. [`vercel.json`](./vercel.json) sets the install and build commands.

## Demo audio

`public/demo.mp3` is "Despresso Shots" by CullyLine, used with permission. The app fetches it only when someone presses the demo button.

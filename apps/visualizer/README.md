# How the torus code is organized

This page is for people who want to change the code. To use torus, go to [torus.wtf](https://torus.wtf). To run it on your computer, follow the steps in the main [README](../../README.md#for-developers).

Everything is one website, built with Next.js. It holds three tools: the visualizer at `/`, Conductor at `/conductor`, and Transcriber at `/transcriber`.

## Where things are

```
apps/visualizer/src/
  app/                  One folder per page, plus the sign-in and account routes
  components/studio/    The visualizer page: layout, stage, playback bar, dialogs
  components/panels/    The sidebar, one file per panel
  components/conductor/ Conductor
  components/transcriber/ Transcriber
  components/ui/        Buttons, sliders, and icons that every page shares
  hooks/                State for the visualizer page
  lib/                  Code with no interface: export, storage, audio tags

packages/
  visualizers/          The visualizers and the engine that draws them
  db/                   The database tables for accounts
  ui/                   The logo and a few shared pieces
  shared/               A few types and helpers the other packages share
```

## How the visualizer page works

`VisualizerApp` in `components/studio` lays out the page. It keeps its state in four hooks:

| Hook                | What it holds                                                                  |
| ------------------- | ------------------------------------------------------------------------------ |
| `useStudioSource`   | Where the audio comes from: a file, the demo, the microphone, or desktop audio |
| `useLook`           | The chosen visualizer, colors, sliders, effects, triggers, and modulations     |
| `useExportSettings` | Video size, frame rate, and watermark                                          |
| `useStudioExport`   | Recording, rendering, and snapshots                                            |

Settings are saved in the browser, so they are still there on the next visit.

Every panel builds its buttons and sliders from `components/ui/controls.tsx`. Colors and fonts are set once in `src/app/globals.css`.

## Add a visualizer

1. Create one React Three Fiber component in `packages/visualizers/src/presets/`.
2. Add it to the list in `packages/visualizers/src/registry.ts`.
3. Describe its sliders in `controlSchema.ts`. The sidebar draws them for you.

A visualizer must still run well on slow devices. Each one receives a `tier` of `high`, `mid`, or `low` and should draw less on the lower tiers.

## Settings for your own copy

torus runs without any of these. Add them to a file named `.env` when you need the feature. [`.env.example`](../../.env.example) explains each one.

| Setting                                      | What it turns on                                        |
| -------------------------------------------- | ------------------------------------------------------- |
| `DATABASE_URL`, `DATABASE_AUTH_TOKEN`        | The database that stores accounts                       |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`     | The same, when Vercel's Turso integration sets it up    |
| `PUBLIC_URL`, `NEXT_PUBLIC_SITE_URL`         | The web address used in sign-in links and link previews |
| `SMTP_*`                                     | Sending email, for sign-in links and the feedback form  |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | Signing in with Discord                                 |

## Put it online

torus.wtf runs on [Vercel](https://vercel.com) with a [Turso](https://turso.tech) database.

1. Create a Vercel project and set its root folder to `apps/visualizer`. [`vercel.json`](./vercel.json) holds the build commands.
2. Connect a Turso database. Either add Vercel's Turso integration, or set `DATABASE_URL` and `DATABASE_AUTH_TOKEN` yourself.
3. Run `pnpm db:migrate` once against that database to create the tables.

## Credits

- The demo track, `public/demo.mp3`, is "Despresso Shots" by CullyLine, used with permission.
- [docs/shader-provenance.md](../../docs/shader-provenance.md) lists where the visual ideas came from and the one outside library the visualizers use.

# torus

torus turns your music into moving 3D visuals, right in your web browser. You can save the result as a video.

**Try it at [torus.wtf](https://torus.wtf).** It is free. You do not need an account, and there is nothing to install.

## How to use it

1. **Open [torus.wtf](https://torus.wtf) on a computer.** Chrome and Edge work best.
2. **Add audio.** Drop in a music file, turn on your microphone, or press "Play the demo track".
3. **Choose a look.** Open the Look tab, pick a visualizer, and move the sliders until you like what you see.
4. **Save a video.** Open the Export tab and press "Render full track". The video goes to your downloads folder.

## Good to know

- **Your audio stays on your computer.** torus does its work in your browser and never uploads your music.
- **It is free.** There are no ads and no paid version.
- **Your videos are yours.** You can post them anywhere, including for paid work. You still need the rights to the music in them.
- **A computer works best.** torus also runs on a phone, with the controls in a panel under the picture.

## More tools

torus comes with two more tools for making music. Both are free and run in your browser.

- [Conductor](https://torus.wtf/conductor) lets you write music with built-in instruments.
- [Transcriber](https://torus.wtf/transcriber) listens to a recording and writes out its notes as a MIDI file. A MIDI file stores which notes are played and when, so music software can play them back or edit them.

## Help

If something is broken or confusing, press Feedback at the top of the app or email [support@torus.wtf](mailto:support@torus.wtf).

## For developers

torus is open source. To run it on your own computer you need [Node.js](https://nodejs.org) 22 or newer and [pnpm](https://pnpm.io) 10 or newer.

```bash
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm dev
```

Then open <http://localhost:3000>.

- [CONTRIBUTING.md](./CONTRIBUTING.md) explains how to report a problem or change the code.
- [apps/visualizer/README.md](./apps/visualizer/README.md) explains how the code is organized and how to put it online.
- [PRINCIPLES.md](./PRINCIPLES.md) lists what torus promises the people who use it.

## License

torus is licensed under [AGPL-3.0-or-later](./LICENSE). In short, you may use, copy, and change the code. If you run a changed version as a website, you must offer its source code to the people who use it.

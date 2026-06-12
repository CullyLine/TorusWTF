import Link from 'next/link';
import { SUPPORT_EMAIL, mailto } from '@/lib/constants';

export const metadata = {
  title: 'about',
  description: 'What torus is: 3D visuals for your audio, plus a few sharp tools for music.',
};

export default function AboutPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-6 py-20">
      <img
        src="/torus-mascot.png"
        alt="The torus mascot — a doughnut made of audio waveforms"
        className="mx-auto mb-8 w-full max-w-md rounded-2xl"
      />
      <h1 className="text-3xl font-semibold tracking-tight">about torus</h1>

      <section className="mt-8 space-y-5 text-sm leading-relaxed text-torus-fg-dim">
        <p>
          <strong className="text-torus-fg">torus is 3D visuals for your audio.</strong> Point it at
          Spotify, Ableton, Splice, a file, or your mic and watch the sound turn into something you
          want to look at. Tweak it, then export for Reels, Shorts, a release, or a live set.
        </p>
        <p>
          The visualizer is the heart of it. Around that we’re building a small set of sharp tools
          for people who make music — a SoundFont DAW (<Link href="/conductor" className="underline">Conductor</Link>),
          an in-browser audio-to-MIDI{' '}
          <Link href="/transcriber" className="underline">
            Transcriber
          </Link>
          , and stem separation on the way. One roof, no fuss.
        </p>
        <p>
          The name is <strong>torus</strong> — the shape of a loop, and yes, a doughnut. Sound goes
          in, energy comes around. The mascot is, quite literally, a donut made of waveforms.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">how it works</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-torus-fg-dim">
          <li>
            <strong className="text-torus-fg">Capture</strong> — grab audio from a tab, a file, or
            your mic. No signup.
          </li>
          <li>
            <strong className="text-torus-fg">Shape</strong> — pick a preset, tune the reactivity,
            colors, and camera until it feels right.
          </li>
          <li>
            <strong className="text-torus-fg">Export</strong> — render a clip for socials or your
            portfolio. Free exports are watermarked and capped; the{' '}
            <Link href="/license" className="underline">
              Production License
            </Link>{' '}
            lifts the caps and adds commercial-use rights.
          </li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">what it is not</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-torus-fg-dim">
          <li>not an ad-funded platform</li>
          <li>not an algorithmic feed</li>
          <li>not a data broker</li>
          <li>not a subscription treadmill — one honest, optional upgrade</li>
        </ul>
      </section>

      <p className="mt-12 text-xs text-torus-fg-faint">
        Read the{' '}
        <Link href="/principles" className="underline">
          principles
        </Link>
        . Best-effort service, made with care. Questions?{' '}
        <a href={mailto(SUPPORT_EMAIL)} className="underline">
          {SUPPORT_EMAIL}
        </a>
        .
      </p>

      <p className="mt-4 text-xs text-torus-fg-faint">
        Demo audio: &ldquo;Scheming Weasel (faster version)&rdquo; by Kevin MacLeod (
        <a
          href="https://incompetech.com"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          incompetech.com
        </a>
        ), licensed under{' '}
        <a
          href="https://creativecommons.org/licenses/by/3.0/"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          CC BY 3.0
        </a>
        .
      </p>

      <p className="mt-10 text-xs text-torus-fg-faint">
        <Link href="/" className="hover:text-torus-fg">
          Home
        </Link>
        {' · '}
        <Link href="/about" className="hover:text-torus-fg">
          About
        </Link>
        {' · '}
        <Link href="/principles" className="hover:text-torus-fg">
          Principles
        </Link>
        {' · '}
        <Link href="/privacy" className="hover:text-torus-fg">
          Privacy
        </Link>
        {' · '}
        <Link href="/terms" className="hover:text-torus-fg">
          Terms
        </Link>
      </p>
    </main>
  );
}

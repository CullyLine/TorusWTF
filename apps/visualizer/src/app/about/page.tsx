import Link from 'next/link';
import { SiteFooter } from '@/components/SiteFooter';
import { SUPPORT_EMAIL, mailto } from '@/lib/constants';

export const metadata = {
  title: 'about',
  description: 'torus turns audio into 3D visuals you can export as video. Free, in your browser.',
};

export default function AboutPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-6 py-20">
      <img
        src="/torus-mascot.png"
        alt="The torus mascot, a doughnut made of audio waveforms"
        className="mx-auto mb-8 w-full max-w-md rounded-md"
      />
      <h1 className="text-3xl font-semibold tracking-tight">about torus</h1>

      <section className="mt-8 space-y-5 text-sm leading-relaxed text-torus-fg-dim">
        <p>
          <strong className="text-torus-fg">torus turns audio into 3D visuals.</strong> Play a file,
          use your mic, or capture the sound from Spotify, Ableton, or any other app. Adjust the
          look, then export it as video.
        </p>
        <p>
          Two more music tools run in the same app.{' '}
          <Link href="/conductor" className="underline">
            Conductor
          </Link>{' '}
          is a SoundFont DAW for sketching ideas, and{' '}
          <Link href="/transcriber" className="underline">
            Transcriber
          </Link>{' '}
          converts audio to MIDI. Stem separation is planned.
        </p>
        <p>A torus is the shape of a doughnut, so the mascot is a doughnut made of waveforms.</p>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">how it works</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-torus-fg-dim">
          <li>
            <strong className="text-torus-fg">Add audio.</strong> Drop a file, turn on your mic, or
            share a tab or your desktop audio. You do not need an account.
          </li>
          <li>
            <strong className="text-torus-fg">Shape the look.</strong> Pick a visualizer, then set
            how it reacts, its colors, and the camera.
          </li>
          <li>
            <strong className="text-torus-fg">Export.</strong> Record in real time, or pre-render an
            MP4 at up to 4K and 240 fps. Exports are free and yours to use, including commercially.
          </li>
        </ol>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">what it costs</h2>
        <p className="mt-3 text-sm text-torus-fg-dim">
          Nothing. There are no ads, no paid tier, and no data sales. Your audio is analyzed and
          rendered in your browser and never uploaded. The{' '}
          <Link href="/principles" className="underline">
            principles
          </Link>{' '}
          page lists what torus commits to.
        </p>
      </section>

      <p className="mt-12 text-xs text-torus-fg-faint">
        Questions?{' '}
        <a href={mailto(SUPPORT_EMAIL)} className="underline">
          {SUPPORT_EMAIL}
        </a>
      </p>

      <p className="mt-4 text-xs text-torus-fg-faint">
        Demo audio: &quot;Despresso Shots&quot; by CullyLine, used with permission.
      </p>

      <SiteFooter />
    </main>
  );
}

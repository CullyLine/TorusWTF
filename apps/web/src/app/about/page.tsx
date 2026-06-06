import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';

export const metadata = {
  title: 'about',
  description: 'What torus.wtf is, what it is not, and why it exists.',
};

export default function AboutPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-6 py-12">
      <SiteHeader />
      <h1 className="mt-12 text-3xl font-semibold tracking-tight">about torus.wtf</h1>

      <section className="mt-8 space-y-5 text-sm leading-relaxed text-torus-fg-dim">
        <p>
          torus.wtf is a no-bullshit way to share audio clips with your friends and the community.
          Drag a file in. Get a link. Send it. That's it.
        </p>

        <p>
          The internet used to have more small, lovingly-maintained corners for sharing sound.
          Many of them are gone. torus.wtf is our attempt to bring that spirit back — without ads,
          without growth hacks, without selling your data.
        </p>

        <p>
          The brand is <strong>torus</strong> — the geometric shape of a loop. Every clip you share
          is a loop. Sacred geometry, sound-as-shape, audio-as-energy-flow: the visual language is{' '}
          <Link href="/" className="underline">
            in the product
          </Link>
          .
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">what we are not</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-torus-fg-dim">
          <li>not a radio station</li>
          <li>not a streaming service</li>
          <li>not a social network with an algorithmic feed</li>
          <li>not a music store</li>
          <li>not a startup chasing growth</li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">how it works</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-torus-fg-dim">
          <li>
            <strong>Upload</strong> — drag-and-drop or click. No account needed.
          </li>
          <li>
            <strong>Share</strong> — you get a short URL the moment the upload finishes.
          </li>
          <li>
            <strong>Beauty</strong> — every clip is transcoded, fingerprinted, and rendered with a
            unique frequency-band-colored waveform. Want to go bigger? Hit the visualizer button for
            a fullscreen 3D experience.
          </li>
          <li>
            <strong>Community (optional)</strong> — sign in to comment, vote, follow. Anonymous
            uploads remain anonymous forever.
          </li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">read more</h2>
        <ul className="mt-3 flex flex-col gap-2 text-sm">
          <li>
            <Link href="/principles" className="underline">
              PRINCIPLES
            </Link>{' '}
            — the no-bullshit charter (no ads, no AI training, no VC, etc.)
          </li>
          <li>
            <Link href="/support" className="underline">
              support
            </Link>{' '}
            — donate to keep the lights on
          </li>
          <li>
            <Link href="/moderation" className="underline">
              moderation log
            </Link>{' '}
            — public record of every moderation action
          </li>
          <li>
            <a
              href="https://github.com/YOUR_ORG/torus"
              className="underline"
              target="_blank"
              rel="noreferrer"
            >
              github
            </a>{' '}
            — AGPL-3.0, self-hostable
          </li>
        </ul>
      </section>

      <p className="mt-12 text-xs text-torus-fg-faint">
        Best-effort free service. No SLA. No promises. ♥
      </p>
    </main>
  );
}

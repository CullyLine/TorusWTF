import { SiteFooter } from '@/components/SiteFooter';
import { SUPPORT_EMAIL, mailto } from '@/lib/constants';

export const metadata = {
  title: 'principles',
  description: 'What torus will and will not do.',
};

export default function PrinciplesPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-6 py-20">
      <h1 className="text-3xl font-semibold tracking-tight">principles</h1>
      <p className="mt-3 text-sm text-torus-fg-dim">
        These are the commitments torus makes to the people who use it. A feature that breaks one
        does not ship.
      </p>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">we will never</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-torus-fg-dim">
          <li>show ads or sponsored placements</li>
          <li>sell or rent your data</li>
          <li>run an algorithmic feed built to keep you scrolling</li>
          <li>load third-party trackers by default</li>
          <li>use dark patterns in sign-up or account deletion</li>
          <li>require an account to use the tools</li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">we will always</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-torus-fg-dim">
          <li>keep the visualizer, Conductor, and Transcriber free, exports included</li>
          <li>process your audio in your browser, without uploading or storing it</li>
          <li>let you delete your account and its data from settings</li>
          <li>treat accessibility bugs like any other bug</li>
          <li>describe uptime plainly: this is a best-effort service with no guarantee</li>
        </ul>
      </section>

      <p className="mt-12 text-xs text-torus-fg-faint">
        Questions?{' '}
        <a href={mailto(SUPPORT_EMAIL)} className="underline">
          {SUPPORT_EMAIL}
        </a>
      </p>

      <SiteFooter />
    </main>
  );
}

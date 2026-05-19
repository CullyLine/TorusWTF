import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { Logo } from '@torus/ui';
import { isValidShareCode, normalizeShareCode } from '@torus/shared';
import { db, clips } from '@/lib/db';
import { notFound } from 'next/navigation';
import { ReportForm } from './ReportForm';

interface PageProps {
  params: Promise<{ shareCode: string }>;
}

export default async function ReportPage({ params }: PageProps) {
  const { shareCode } = await params;
  if (!isValidShareCode(shareCode)) notFound();
  const code = normalizeShareCode(shareCode);
  const [clip] = await db
    .select({ shareCode: clips.shareCode, title: clips.title })
    .from(clips)
    .where(eq(clips.shareCode, code))
    .limit(1);
  if (!clip) notFound();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-12">
      <Logo size={28} href={`/${clip.shareCode}`} className="text-torus-fg" />
      <h1 className="mt-10 text-2xl font-semibold tracking-tight">report a clip</h1>
      <p className="mt-2 text-sm text-torus-fg-dim">
        Reporting <span className="font-mono">{clip.shareCode}</span>
        {clip.title ? ` — “${clip.title}”` : ''}.
      </p>
      <div className="mt-8">
        <ReportForm shareCode={clip.shareCode} />
      </div>
      <p className="mt-12 text-xs text-torus-fg-faint">
        Reports are reviewed by maintainers. Public moderation log:{' '}
        <Link href="/moderation" className="underline">
          /moderation
        </Link>
        .
      </p>
    </main>
  );
}

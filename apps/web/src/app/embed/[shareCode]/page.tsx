import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, clips } from '@/lib/db';
import { storage } from '@/lib/storage';
import { isValidShareCode, normalizeShareCode } from '@torus/shared';
import { EmbedClient } from './EmbedClient';

export const dynamic = 'force-dynamic';

export default async function EmbedPage({ params }: { params: Promise<{ shareCode: string }> }) {
  const { shareCode } = await params;
  if (!isValidShareCode(shareCode)) notFound();
  const code = normalizeShareCode(shareCode);
  const [clip] = await db.select().from(clips).where(eq(clips.shareCode, code)).limit(1);
  if (!clip || clip.deletedAt || clip.status !== 'ready') notFound();

  return (
    <EmbedClient
      shareCode={clip.shareCode}
      title={clip.title}
      audioUrl={clip.opusKey ? storage.publicUrl(clip.opusKey) : null}
      peaksUrl={clip.peaksKey ? storage.publicUrl(clip.peaksKey) : null}
      palette={clip.waveformPalette ? safeJson(clip.waveformPalette) : null}
    />
  );
}

function safeJson(raw: string) {
  try {
    return JSON.parse(raw) as { bass: string; mid: string; high: string };
  } catch {
    return null;
  }
}

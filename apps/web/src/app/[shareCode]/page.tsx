import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import { db, clips } from '@/lib/db';
import { storage } from '@/lib/storage';
import { isValidShareCode, normalizeShareCode } from '@torus/shared';
import { SharePageClient } from './SharePageClient';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ shareCode: string }>;
}

async function loadClipByShareCode(rawCode: string) {
  if (!isValidShareCode(rawCode)) return null;
  const code = normalizeShareCode(rawCode);
  const [clip] = await db.select().from(clips).where(eq(clips.shareCode, code)).limit(1);
  if (!clip || clip.deletedAt) return null;
  return clip;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { shareCode } = await params;
  const clip = await loadClipByShareCode(shareCode);
  if (!clip) return { title: 'not found' };

  const baseUrl = process.env.PUBLIC_URL ?? 'http://localhost:3000';
  const ogImageUrl = clip.ogImageKey
    ? storage.publicUrl(clip.ogImageKey)
    : `${baseUrl}/og-default.png`;
  const title = clip.title ?? 'untitled clip';
  const description = clip.description ?? 'Share the loop. torus.fm';
  const canonical = `${baseUrl}/${clip.shareCode}`;

  return {
    title,
    description,
    alternates: {
      canonical,
      types: {
        'application/json+oembed': `${baseUrl}/api/oembed?url=${encodeURIComponent(canonical)}`,
      },
    },
    openGraph: {
      type: 'music.song',
      title,
      description,
      url: canonical,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: title }],
      siteName: 'torus.fm',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function SharePage({ params }: PageProps) {
  const { shareCode } = await params;
  const clip = await loadClipByShareCode(shareCode);
  if (!clip) notFound();

  const palette = parsePalette(clip.waveformPalette);
  const audioUrl = clip.opusKey ? storage.publicUrl(clip.opusKey) : null;
  const peaksUrl = clip.peaksKey ? storage.publicUrl(clip.peaksKey) : null;
  const spectrogramUrl = clip.spectrogramKey ? storage.publicUrl(clip.spectrogramKey) : null;

  const baseUrl = process.env.PUBLIC_URL ?? 'http://localhost:3000';
  const shareUrl = `${baseUrl}/${clip.shareCode}`;

  return (
    <SharePageClient
      shareCode={clip.shareCode}
      shareUrl={shareUrl}
      title={clip.title}
      status={clip.status}
      statusError={clip.statusError}
      durationMs={clip.durationMs}
      palette={palette}
      audioUrl={audioUrl}
      peaksUrl={peaksUrl}
      spectrogramUrl={spectrogramUrl}
      visualizerPreset={clip.visualizerPreset}
      allowDownload={clip.allowDownload}
      originalKey={clip.originalKey}
    />
  );
}

function parsePalette(raw: string | null) {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { bass: string; mid: string; high: string };
  } catch {
    return null;
  }
}

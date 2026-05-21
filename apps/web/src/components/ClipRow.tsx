import Link from 'next/link';
import { storage } from '@/lib/storage';

export interface ClipListEntry {
  clipId: string;
  shareCode: string;
  title: string | null;
  ogImageKey: string | null;
  durationMs: number | null;
  ownerHandle: string | null;
  voteCount?: number;
}

export function ClipRow({
  entry,
  rank,
  showVotes,
}: {
  entry: ClipListEntry;
  rank?: number;
  showVotes?: boolean;
}) {
  return (
    <li>
      <Link
        href={`/${entry.shareCode}`}
        className="flex items-center gap-4 rounded-lg p-3 hover:bg-torus-surface"
      >
        {typeof rank === 'number' ? (
          <span className="w-8 text-center font-mono text-sm text-torus-fg-faint">{rank}</span>
        ) : null}
        <div
          className="h-12 w-20 flex-shrink-0 rounded bg-torus-surface"
          style={{
            backgroundImage: entry.ogImageKey
              ? `url(${storage.publicUrl(entry.ogImageKey)})`
              : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            {entry.title ?? <span className="opacity-50">untitled</span>}
          </div>
          <div className="mt-1 font-mono text-xs text-torus-fg-faint">
            {entry.ownerHandle ? `@${entry.ownerHandle}` : 'anonymous'}
            {entry.durationMs ? ` · ${formatDuration(entry.durationMs)}` : ''}
          </div>
        </div>
        {showVotes && typeof entry.voteCount === 'number' ? (
          <span className="font-mono text-sm text-torus-fg-dim">
            {entry.voteCount} {entry.voteCount === 1 ? 'vote' : 'votes'}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

export function RecentTile({ entry }: { entry: ClipListEntry }) {
  return (
    <li>
      <Link
        href={`/${entry.shareCode}`}
        className="block overflow-hidden rounded-lg border border-torus-border hover:border-torus-border-strong"
      >
        <div
          className="aspect-[2/1] w-full bg-torus-surface"
          style={{
            backgroundImage: entry.ogImageKey
              ? `url(${storage.publicUrl(entry.ogImageKey)})`
              : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
          aria-hidden
        />
        <div className="px-3 py-2">
          <div className="truncate text-xs font-medium">
            {entry.title ?? <span className="opacity-50">untitled</span>}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-torus-fg-faint">
            torus.fm/{entry.shareCode}
          </div>
        </div>
      </Link>
    </li>
  );
}

function formatDuration(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, '0')}`;
}

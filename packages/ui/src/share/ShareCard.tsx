'use client';
import { useCallback, useState, type CSSProperties } from 'react';
import { useToast } from '../toast/Toast';

interface ShareCardProps {
  shareUrl: string;
  title?: string | null;
}

/**
 * The "your link is ready" card — copy, native share, monospace URL.
 */
export function ShareCard({ shareUrl, title }: ShareCardProps) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share;

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.show('Copied to clipboard', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.show('Copy failed — select the URL manually', 'error');
    }
  }, [shareUrl, toast]);

  const share = useCallback(async () => {
    if (!navigator.share) {
      await copy();
      return;
    }
    try {
      await navigator.share({
        title: title ? `${title} · torus.fm` : 'torus.fm clip',
        text: title ?? 'Listen on torus.fm',
        url: shareUrl,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      toast.show('Share failed — try Copy instead', 'error');
    }
  }, [shareUrl, title, copy, toast]);

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
      <code
        style={{
          flex: 1,
          padding: '10px 14px',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.18)',
          borderRadius: 999,
          fontFamily: 'var(--font-mono)',
          fontSize: 14,
          userSelect: 'all',
          display: 'flex',
          alignItems: 'center',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {shareUrl}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy share URL"
        style={{
          ...actionBtnStyle,
          background: copied ? 'var(--color-torus-mid)' : 'var(--color-torus-fg)',
          color: 'var(--color-torus-bg)',
          minWidth: 88,
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      {canNativeShare ? (
        <button
          type="button"
          onClick={share}
          aria-label="Share clip"
          style={{
            ...actionBtnStyle,
            background: 'transparent',
            color: 'var(--color-torus-fg)',
            border: '1px solid rgba(255,255,255,0.22)',
            minWidth: 88,
          }}
        >
          Share
        </button>
      ) : null}
    </div>
  );
}

const actionBtnStyle: CSSProperties = {
  padding: '0 18px',
  borderRadius: 999,
  border: 'none',
  fontWeight: 500,
  fontSize: 13,
  cursor: 'pointer',
  transition: 'background 0.15s ease',
};

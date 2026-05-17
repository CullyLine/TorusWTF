'use client';
import { useCallback, useState } from 'react';
import { useToast } from '../toast/Toast';

interface ShareCardProps {
  shareUrl: string;
}

/**
 * The "your link is ready" card — big copy button, monospace URL, satisfying success state.
 */
export function ShareCard({ shareUrl }: ShareCardProps) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

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
          padding: '0 18px',
          background: copied ? 'var(--color-torus-mid)' : 'var(--color-torus-fg)',
          color: 'var(--color-torus-bg)',
          borderRadius: 999,
          border: 'none',
          fontWeight: 500,
          fontSize: 13,
          cursor: 'pointer',
          transition: 'background 0.15s ease',
          minWidth: 96,
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

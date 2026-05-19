'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react';
import { CLAIM_TOKEN_HEADER, getClaimTokenForShareCode } from '@/lib/claim-tokens';

interface EditClipDialogProps {
  open: boolean;
  shareCode: string;
  initialTitle: string | null;
  initialAllowDownload: boolean;
  onClose: () => void;
  onSaved: (data: { title: string | null; allowDownload: boolean }) => void;
}

export function EditClipDialog({
  open,
  shareCode,
  initialTitle,
  initialAllowDownload,
  onClose,
  onSaved,
}: EditClipDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(initialTitle ?? '');
  const [allowDownload, setAllowDownload] = useState(initialAllowDownload);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setTitle(initialTitle ?? '');
    setAllowDownload(initialAllowDownload);
    setError(null);
  }, [open, initialTitle, initialAllowDownload]);

  const handleClose = useCallback(() => {
    if (busy) return;
    onClose();
  }, [busy, onClose]);

  const onSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setBusy(true);
      setError(null);
      try {
        const claimToken = getClaimTokenForShareCode(shareCode);
        const headers: Record<string, string> = { 'content-type': 'application/json' };
        if (claimToken) headers[CLAIM_TOKEN_HEADER] = claimToken;

        const res = await fetch(`/api/clips/${shareCode}`, {
          method: 'PATCH',
          headers,
          credentials: 'same-origin',
          body: JSON.stringify({
            title,
            allowDownload,
            ...(claimToken ? { claimToken } : {}),
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          clip?: { title: string | null; allowDownload: boolean };
        };
        if (!res.ok) {
          throw new Error(data.error ?? `Save failed (${res.status})`);
        }
        onSaved({
          title: data.clip?.title ?? (title.trim() || null),
          allowDownload: data.clip?.allowDownload ?? allowDownload,
        });
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save changes.');
      } finally {
        setBusy(false);
      }
    },
    [shareCode, title, allowDownload, onClose, onSaved],
  );

  return (
    <dialog
      ref={dialogRef}
      onClose={handleClose}
      onCancel={handleClose}
      aria-labelledby="edit-clip-title"
      style={{
        border: '1px solid rgba(255,255,255,0.14)',
        background: '#0c0d1a',
        color: 'var(--color-torus-fg)',
        borderRadius: 16,
        padding: 0,
        maxWidth: 520,
        width: '90vw',
        margin: 'auto',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}
    >
      <form onSubmit={onSubmit} style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 id="edit-clip-title" style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            Edit details
          </h2>
          <button type="button" onClick={handleClose} disabled={busy} aria-label="Close" style={closeBtn}>
            ✕
          </button>
        </div>

        <label htmlFor="edit-clip-title-input" style={labelStyle}>
          Title
        </label>
        <input
          id="edit-clip-title-input"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={140}
          disabled={busy}
          style={inputStyle}
        />

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginTop: 20,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={allowDownload}
            onChange={(e) => setAllowDownload(e.target.checked)}
            disabled={busy}
          />
          <span>Enable downloads</span>
        </label>
        <p style={{ margin: '8px 0 0', fontSize: 12, opacity: 0.55, lineHeight: 1.45 }}>
          When off, listeners can stream your clip but won&apos;t see a download button.
        </p>

        {error ? (
          <p role="alert" style={{ marginTop: 16, fontSize: 13, color: 'var(--color-torus-bass)' }}>
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          style={{
            ...primaryBtn,
            width: '100%',
            marginTop: 24,
            opacity: busy ? 0.6 : 1,
            cursor: busy ? 'wait' : 'pointer',
          }}
        >
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </dialog>
  );
}

const labelStyle: CSSProperties = {
  display: 'block',
  marginTop: 20,
  fontSize: 12,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  opacity: 0.7,
};

const inputStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  marginTop: 8,
  padding: '10px 14px',
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.14)',
  background: 'rgba(255,255,255,0.04)',
  color: 'inherit',
  fontSize: 15,
  boxSizing: 'border-box',
};

const primaryBtn: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '12px 20px',
  borderRadius: 999,
  border: 'none',
  background: 'var(--color-torus-fg)',
  color: 'var(--color-torus-bg)',
  fontSize: 14,
  fontWeight: 600,
};

const closeBtn: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'inherit',
  fontSize: 18,
  cursor: 'pointer',
  opacity: 0.7,
};

'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useToast } from '../toast/Toast.js';

type VisualizerPreset =
  | 'none'
  | 'torus_field'
  | 'particle_storm'
  | 'spectral_tunnel'
  | 'volumetric_waveform';

interface CreateClipResponse {
  clipId: string;
  shareCode: string;
  shareUrl: string;
  uploadUrl: string;
  uploadKey: string;
  claimToken: string | null;
}

interface UploadDialogProps {
  open: boolean;
  onClose: () => void;
}

type UploadState =
  | { phase: 'idle' }
  | { phase: 'requesting' }
  | { phase: 'uploading'; progress: number }
  | { phase: 'finalizing' }
  | { phase: 'done'; shareUrl: string; shareCode: string; clipId: string }
  | { phase: 'error'; message: string };

const ACCEPT = '.mp3,.wav,.flac,.aiff,.aif,.ogg,.opus,.m4a,.webm,audio/*';

const PRESET_OPTIONS: { id: VisualizerPreset; label: string; hint: string }[] = [
  { id: 'none', label: 'None', hint: 'Just the waveform — no 3D' },
  { id: 'torus_field', label: 'Torus Field', hint: 'The signature' },
  { id: 'particle_storm', label: 'Particle Storm', hint: 'Punchy energy' },
  { id: 'spectral_tunnel', label: 'Spectral Tunnel', hint: 'Melodic / ambient' },
  { id: 'volumetric_waveform', label: 'Volumetric Wave', hint: 'Minimal 3D' },
];

export function UploadDialog({ open, onClose }: UploadDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const [state, setState] = useState<UploadState>({ phase: 'idle' });
  const [title, setTitle] = useState('');
  const [preset, setPreset] = useState<VisualizerPreset>('none');
  const [isDragging, setIsDragging] = useState(false);
  const toast = useToast();

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  }, [open]);

  useEffect(() => {
    if (!open) {
      // Reset when re-opening
      setState({ phase: 'idle' });
      setTitle('');
      setPreset('none');
    }
  }, [open]);

  const startUpload = useCallback(
    async (file: File) => {
      try {
        setState({ phase: 'requesting' });

        const presetForApi: Exclude<VisualizerPreset, 'none'> | 'none' = preset;
        const initRes = await fetch('/api/clips', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type || 'audio/mpeg',
            bytes: file.size,
            title: title.trim() || undefined,
            visualizerPreset: presetForApi,
          }),
        });

        if (!initRes.ok) {
          const text = await initRes.json().catch(() => ({ error: 'Upload init failed.' }));
          throw new Error(text.error || `HTTP ${initRes.status}`);
        }
        const init: CreateClipResponse = await initRes.json();

        // Persist claim token for anonymous uploads — used at signup to attach clips.
        if (init.claimToken && typeof localStorage !== 'undefined') {
          const existing = JSON.parse(localStorage.getItem('torus_claim_tokens') || '[]');
          existing.push({ token: init.claimToken, shareCode: init.shareCode, at: Date.now() });
          localStorage.setItem('torus_claim_tokens', JSON.stringify(existing.slice(-100)));
        }

        // Upload directly to storage with XHR for progress reporting.
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhrRef.current = xhr;
          xhr.open('PUT', init.uploadUrl, true);
          xhr.setRequestHeader('Content-Type', file.type || 'audio/mpeg');
          xhr.upload.onprogress = (e) => {
            if (!e.lengthComputable) return;
            setState({ phase: 'uploading', progress: e.loaded / e.total });
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`Upload failed (${xhr.status}).`));
          };
          xhr.onerror = () => reject(new Error('Network error during upload.'));
          xhr.onabort = () => reject(new Error('Upload cancelled.'));
          xhr.send(file);
        });

        setState({ phase: 'finalizing' });
        const completeRes = await fetch(`/api/clips/${init.clipId}/complete`, {
          method: 'POST',
        });
        if (!completeRes.ok) {
          const text = await completeRes.json().catch(() => ({ error: 'Finalize failed.' }));
          throw new Error(text.error || `HTTP ${completeRes.status}`);
        }

        // Copy URL to clipboard — the moment users want.
        try {
          await navigator.clipboard.writeText(init.shareUrl);
          toast.show(`Copied ${init.shareUrl}`, 'success');
        } catch {
          toast.show(`Uploaded: ${init.shareUrl}`, 'success');
        }

        setState({
          phase: 'done',
          shareUrl: init.shareUrl,
          shareCode: init.shareCode,
          clipId: init.clipId,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed.';
        setState({ phase: 'error', message });
        toast.show(message, 'error');
      }
    },
    [preset, title, toast],
  );

  const onFileChosen = useCallback(
    (file: File) => {
      if (!title) setTitle(stripExt(file.name));
      void startUpload(file);
    },
    [startUpload, title],
  );

  const onPick = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) onFileChosen(f);
    },
    [onFileChosen],
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const f = e.dataTransfer.files?.[0];
      if (f) onFileChosen(f);
    },
    [onFileChosen],
  );

  const cancelUpload = useCallback(() => {
    xhrRef.current?.abort();
  }, []);

  const handleClose = useCallback(() => {
    if (state.phase === 'uploading' || state.phase === 'finalizing') {
      // Don't block close — upload continues in background and toast surfaces share link.
    }
    onClose();
  }, [onClose, state.phase]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={onClose}
      aria-labelledby="upload-dialog-title"
      style={{
        background: '#0A0B1E',
        color: '#F5F5FA',
        border: '1px solid rgba(255,255,255,0.18)',
        borderRadius: 16,
        padding: 0,
        maxWidth: 520,
        width: '90vw',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}
    >
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 id="upload-dialog-title" style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            Upload a clip
          </h2>
          <button type="button" onClick={handleClose} aria-label="Close upload" style={closeBtn}>
            ✕
          </button>
        </div>

        {state.phase === 'idle' || state.phase === 'requesting' ? (
          <>
            <Dropzone
              onDrop={onDrop}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onClick={() => inputRef.current?.click()}
              isDragging={isDragging}
            />
            <input ref={inputRef} type="file" accept={ACCEPT} onChange={onPick} hidden />
            <label htmlFor="upload-title" style={labelStyle}>
              Title <span style={{ opacity: 0.5 }}>(optional)</span>
            </label>
            <input
              id="upload-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="defaults to filename"
              maxLength={140}
              style={inputStyle}
            />
            <fieldset style={{ border: 'none', padding: 0, margin: '20px 0 0' }}>
              <legend style={{ ...labelStyle, padding: 0 }}>3D visualizer (optional)</legend>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, 1fr)',
                  gap: 6,
                  marginTop: 8,
                }}
              >
                {PRESET_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPreset(opt.id)}
                    aria-pressed={preset === opt.id}
                    title={opt.hint}
                    style={{
                      ...presetBtn,
                      ...(preset === opt.id ? presetBtnActive : null),
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </fieldset>
          </>
        ) : null}

        {state.phase === 'uploading' ? (
          <UploadingView progress={state.progress} onCancel={cancelUpload} />
        ) : null}

        {state.phase === 'finalizing' ? (
          <div style={{ marginTop: 24, padding: 16, textAlign: 'center', opacity: 0.7 }}>
            Wrapping up...
          </div>
        ) : null}

        {state.phase === 'done' ? (
          <DoneView shareUrl={state.shareUrl} onClose={handleClose} />
        ) : null}

        {state.phase === 'error' ? (
          <div
            role="alert"
            style={{
              marginTop: 16,
              padding: 16,
              border: '1px solid var(--color-torus-bass)',
              borderRadius: 12,
              color: 'var(--color-torus-bass)',
              fontSize: 13,
            }}
          >
            {state.message}
            <div style={{ marginTop: 12 }}>
              <button type="button" onClick={() => setState({ phase: 'idle' })} style={ghostBtn}>
                Try again
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </dialog>
  );
}

interface DropzoneProps {
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: DragEvent<HTMLDivElement>) => void;
  onClick: () => void;
  isDragging: boolean;
}

function Dropzone({ onDrop, onDragOver, onDragLeave, onClick, isDragging }: DropzoneProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      aria-label="Drop an audio file or click to browse"
      style={{
        marginTop: 16,
        padding: '40px 16px',
        border: `2px dashed ${isDragging ? 'var(--color-torus-mid)' : 'rgba(255,255,255,0.2)'}`,
        borderRadius: 12,
        textAlign: 'center',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        background: isDragging ? 'rgba(34, 211, 206, 0.06)' : 'transparent',
      }}
    >
      <div style={{ fontSize: 14, opacity: 0.8 }}>
        Drag an audio file here, or{' '}
        <span style={{ textDecoration: 'underline' }}>click to browse</span>
      </div>
      <div style={{ fontSize: 12, opacity: 0.5, marginTop: 8 }}>
        mp3 · wav · flac · aiff · ogg · opus · m4a · up to 200 MB
      </div>
    </div>
  );
}

function UploadingView({ progress, onCancel }: { progress: number; onCancel: () => void }) {
  const pct = Math.round(progress * 100);
  return (
    <div style={{ marginTop: 24 }}>
      <div
        style={{
          height: 6,
          width: '100%',
          background: 'rgba(255,255,255,0.08)',
          borderRadius: 999,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background:
              'linear-gradient(90deg, var(--color-torus-bass), var(--color-torus-mid), var(--color-torus-high))',
            transition: 'width 0.15s ease',
          }}
        />
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 10,
          fontSize: 12,
          opacity: 0.6,
        }}
      >
        <span>Uploading… {pct}%</span>
        <button type="button" onClick={onCancel} style={ghostBtn}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function DoneView({ shareUrl, onClose }: { shareUrl: string; onClose: () => void }) {
  return (
    <div style={{ marginTop: 24, textAlign: 'center' }}>
      <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 10 }}>
        Share link copied to clipboard:
      </div>
      <div
        style={{
          padding: '10px 14px',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.18)',
          borderRadius: 999,
          fontFamily: 'var(--font-mono)',
          fontSize: 14,
          userSelect: 'all',
          wordBreak: 'break-all',
        }}
      >
        {shareUrl}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 20 }}>
        <a href={new URL(shareUrl).pathname} style={primaryBtn}>
          Open clip page
        </a>
        <button type="button" onClick={onClose} style={ghostBtn}>
          Close
        </button>
      </div>
    </div>
  );
}

function stripExt(name: string): string {
  return name.replace(/\.[a-zA-Z0-9]+$/, '');
}

const closeBtn = {
  background: 'transparent',
  border: 'none',
  color: 'inherit',
  fontSize: 16,
  opacity: 0.5,
  cursor: 'pointer',
  padding: 4,
} as const;

const labelStyle = {
  display: 'block',
  marginTop: 20,
  marginBottom: 6,
  fontSize: 12,
  opacity: 0.7,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
} as const;

const inputStyle = {
  width: '100%',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.12)',
  color: 'var(--color-torus-fg)',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 14,
} as const;

const presetBtn = {
  padding: '8px 4px',
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  color: 'inherit',
  fontSize: 11,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
} as const;

const presetBtnActive = {
  background: 'rgba(34, 211, 206, 0.08)',
  borderColor: 'var(--color-torus-mid)',
  color: 'var(--color-torus-mid)',
} as const;

const primaryBtn = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '10px 18px',
  background: 'var(--color-torus-fg)',
  color: 'var(--color-torus-bg)',
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 500,
  textDecoration: 'none',
} as const;

const ghostBtn = {
  padding: '10px 18px',
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.2)',
  color: 'var(--color-torus-fg)',
  borderRadius: 999,
  fontSize: 13,
  cursor: 'pointer',
} as const;

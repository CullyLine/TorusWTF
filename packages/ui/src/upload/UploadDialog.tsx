'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from 'react';
import { MagicLinkSentNotice, type DevMailInfo } from '../auth/MagicLinkSentNotice';
import { useToast } from '../toast/Toast';
import type { UploadAuthConfig } from './upload-context';

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
  pendingFile?: File | null;
  auth?: UploadAuthConfig;
}

type UploadState =
  | { phase: 'idle' }
  | { phase: 'requesting' }
  | { phase: 'uploading'; progress: number }
  | { phase: 'finalizing' }
  | { phase: 'done'; shareUrl: string; shareCode: string; clipId: string }
  | { phase: 'error'; message: string };

const ACCEPT = '.mp3,.wav,.flac,.aiff,.aif,.ogg,.opus,.m4a,.webm,audio/*';

const DEFAULT_CREATOR = 'Anonymous';

export function UploadDialog({ open, onClose, pendingFile = null, auth }: UploadDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const [state, setState] = useState<UploadState>({ phase: 'idle' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [creator, setCreator] = useState(DEFAULT_CREATOR);
  const [signInOpen, setSignInOpen] = useState(false);
  const [magicEmail, setMagicEmail] = useState('');
  const [magicSent, setMagicSent] = useState(false);
  const [magicDevMail, setMagicDevMail] = useState<DevMailInfo | null>(null);
  const [magicBusy, setMagicBusy] = useState(false);
  const [magicError, setMagicError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const toast = useToast();
  const sessionUser = auth?.sessionUser ?? null;

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  }, [open]);

  useEffect(() => {
    if (!open) {
      setState({ phase: 'idle' });
      setTitle('');
      setCreator(DEFAULT_CREATOR);
      setSignInOpen(false);
      setMagicEmail('');
      setMagicSent(false);
      setMagicDevMail(null);
      setMagicError(null);
      setSelectedFile(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    void auth?.refreshSession();
  }, [open, auth]);

  useEffect(() => {
    if (!open || !signInOpen) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === 'torus-auth-success') {
        void auth?.refreshSession();
        setSignInOpen(false);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [open, signInOpen, auth]);

  useEffect(() => {
    if (!open || (!signInOpen && !magicSent)) return;
    const id = window.setInterval(() => {
      void auth?.refreshSession();
    }, 2000);
    return () => window.clearInterval(id);
  }, [open, signInOpen, magicSent, auth]);

  useEffect(() => {
    if (sessionUser) setSignInOpen(false);
  }, [sessionUser]);

  useEffect(() => {
    if (!open || !pendingFile) return;
    setSelectedFile(pendingFile);
    setTitle((t) => t || stripExt(pendingFile.name));
  }, [open, pendingFile]);

  const startUpload = useCallback(
    async (file: File) => {
      try {
        setState({ phase: 'requesting' });

        const initRes = await fetch('/api/clips', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type || 'audio/mpeg',
            bytes: file.size,
            title: title.trim() || undefined,
            creatorDisplayName: sessionUser ? undefined : creator,
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
        const completeRes = await fetch(`/api/clips/${init.shareCode}/complete`, {
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
    [title, creator, sessionUser, toast],
  );

  const onMagicSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setMagicError(null);
      setMagicBusy(true);
      try {
        const res = await fetch('/api/auth/magic', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: magicEmail }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          devMail?: DevMailInfo;
        };
        if (!res.ok) {
          throw new Error(data.error ?? `Sign-in failed (${res.status})`);
        }
        setMagicDevMail(data.devMail ?? null);
        setMagicSent(true);
      } catch (err) {
        setMagicError(err instanceof Error ? err.message : 'Sign-in failed.');
      } finally {
        setMagicBusy(false);
      }
    },
    [magicEmail],
  );

  const onFileChosen = useCallback((file: File) => {
    setSelectedFile(file);
    setTitle((t) => t || stripExt(file.name));
  }, []);

  const onPick = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) onFileChosen(f);
      e.target.value = '';
    },
    [onFileChosen],
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const f = e.dataTransfer.files?.[0];
      if (f) onFileChosen(f);
    },
    [onFileChosen],
  );

  const onConfirmUpload = useCallback(() => {
    if (!selectedFile) return;
    void startUpload(selectedFile);
  }, [selectedFile, startUpload]);

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
        margin: 'auto',
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

        {state.phase === 'idle' ? (
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
              selectedFile={selectedFile}
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
            {sessionUser ? (
              <div style={{ marginTop: 20 }}>
                <span style={labelStyle}>Creator</span>
                <div style={{ marginTop: 8 }}>
                  <a
                    href={`/u/${encodeURIComponent(sessionUser.handle)}`}
                    style={{
                      color: 'var(--color-torus-mid)',
                      fontSize: 15,
                      fontWeight: 500,
                      textDecoration: 'none',
                    }}
                  >
                    @{sessionUser.handle}
                  </a>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 20 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <label htmlFor="upload-creator" style={{ ...labelStyle, marginTop: 0 }}>
                    Creator
                  </label>
                  <span style={{ fontSize: 12, color: 'var(--color-torus-fg-dim, rgba(245,245,250,0.55))' }}>
                    or{' '}
                    <button
                      type="button"
                      onClick={() => setSignInOpen((o) => !o)}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        color: 'var(--color-torus-mid)',
                        textDecoration: 'underline',
                        cursor: 'pointer',
                        font: 'inherit',
                        fontSize: 'inherit',
                      }}
                    >
                      sign in
                    </button>
                  </span>
                </div>
                <input
                  id="upload-creator"
                  type="text"
                  value={creator}
                  onChange={(e) => setCreator(e.target.value)}
                  placeholder={DEFAULT_CREATOR}
                  maxLength={64}
                  style={{ ...inputStyle, marginTop: 8 }}
                />
                {signInOpen ? (
                  <div
                    style={{
                      marginTop: 12,
                      padding: 14,
                      borderRadius: 12,
                      border: '1px solid rgba(255,255,255,0.12)',
                      background: 'rgba(255,255,255,0.03)',
                    }}
                  >
                    {magicSent ? (
                      <MagicLinkSentNotice
                        email={magicEmail}
                        devMail={magicDevMail}
                        compact
                      />
                    ) : (
                      <form onSubmit={onMagicSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <input
                          type="email"
                          required
                          autoComplete="email"
                          value={magicEmail}
                          onChange={(e) => setMagicEmail(e.target.value)}
                          placeholder="you@example.com"
                          disabled={magicBusy}
                          style={inputStyle}
                        />
                        <button type="submit" disabled={magicBusy || !magicEmail} style={ghostBtn}>
                          {magicBusy ? 'sending…' : 'send sign-in link'}
                        </button>
                        {magicError ? (
                          <p role="alert" style={{ margin: 0, fontSize: 12, color: 'var(--color-torus-bass)' }}>
                            {magicError}
                          </p>
                        ) : null}
                      </form>
                    )}
                    {auth?.discordAuth ? (
                      <button
                        type="button"
                        onClick={() => auth.openDiscordSignIn()}
                        style={{ ...ghostBtn, width: '100%', marginTop: 10 }}
                      >
                        Continue with Discord
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
            <button
              type="button"
              onClick={onConfirmUpload}
              disabled={!selectedFile}
              style={{
                ...primaryBtn,
                width: '100%',
                justifyContent: 'center',
                marginTop: 24,
                opacity: selectedFile ? 1 : 0.4,
                cursor: selectedFile ? 'pointer' : 'not-allowed',
              }}
            >
              Upload
            </button>
          </>
        ) : null}

        {state.phase === 'requesting' ? (
          <div style={{ marginTop: 24, padding: 16, textAlign: 'center', opacity: 0.7 }}>
            Preparing upload...
          </div>
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
  selectedFile: File | null;
}

function Dropzone({
  onDrop,
  onDragOver,
  onDragLeave,
  onClick,
  isDragging,
  selectedFile,
}: DropzoneProps) {
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
        {selectedFile ? (
          <>
            <span style={{ color: 'var(--color-torus-mid)' }}>{selectedFile.name}</span>
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.6 }}>
              Drop or click to choose a different file
            </div>
          </>
        ) : (
          <>
            Drag an audio file here, or{' '}
            <span style={{ textDecoration: 'underline' }}>click to browse</span>
          </>
        )}
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

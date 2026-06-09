'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface SettingsUser {
  id: string;
  handle: string;
  email: string | null;
  avatarUrl: string | null;
  bio: string | null;
  customSubdomain: string | null;
  hasLicense: boolean;
}

interface SettingsFormProps {
  initialUser: SettingsUser;
}

export function SettingsForm({ initialUser }: SettingsFormProps) {
  const router = useRouter();
  const [bio, setBio] = useState(initialUser.bio ?? '');
  const [avatarUrl, setAvatarUrl] = useState(initialUser.avatarUrl ?? '');
  const [handle, setHandle] = useState(initialUser.handle);
  const [subdomain, setSubdomain] = useState(initialUser.customSubdomain ?? '');
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileOk, setProfileOk] = useState(false);
  const [subBusy, setSubBusy] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);
  const [subOk, setSubOk] = useState(false);
  const [dangerOpen, setDangerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmHandle, setConfirmHandle] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteTitleId = useId();
  const deletePanelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  const licensed = initialUser.hasLicense;
  const normalizedConfirmHandle = confirmHandle.replace(/^@/, '').toLowerCase();
  const confirmMatches =
    normalizedConfirmHandle === initialUser.handle.toLowerCase();

  useEffect(() => {
    if (!confirmOpen) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = deletePanelRef.current?.querySelector<HTMLElement>(
      'button, [href], input, [tabindex]:not([tabindex="-1"])',
    );
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setConfirmOpen(false);
      }
      if (e.key === 'Tab' && deletePanelRef.current) {
        const focusable = deletePanelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const firstEl = focusable[0]!;
        const lastEl = focusable[focusable.length - 1]!;
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previousFocus.current?.focus();
    };
  }, [confirmOpen]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileBusy(true);
    setProfileError(null);
    setProfileOk(false);
    try {
      const res = await fetch('/api/me', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          bio: bio || null,
          avatarUrl: avatarUrl.trim() || null,
          handle: handle !== initialUser.handle ? handle : undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setProfileError(data.error ?? 'Could not save profile.');
        return;
      }
      setProfileOk(true);
      router.refresh();
    } catch {
      setProfileError('Network error.');
    } finally {
      setProfileBusy(false);
    }
  }

  async function saveSubdomain(e: React.FormEvent) {
    e.preventDefault();
    if (!licensed) return;
    setSubBusy(true);
    setSubError(null);
    setSubOk(false);
    try {
      const res = await fetch('/api/me/subdomain', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subdomain: subdomain.trim() || null }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setSubError(data.error ?? 'Could not update subdomain.');
        return;
      }
      setSubOk(true);
      router.refresh();
    } catch {
      setSubError('Network error.');
    } finally {
      setSubBusy(false);
    }
  }

  async function confirmDelete() {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const res = await fetch('/api/auth/me', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirmHandle: normalizedConfirmHandle }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setDeleteError(data.error ?? 'Could not delete account.');
        return;
      }
      setConfirmOpen(false);
      router.push('/');
      router.refresh();
    } catch {
      setDeleteError('Network error.');
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="mt-10 space-y-12">
      <section>
        <h2 className="text-lg font-semibold">Profile</h2>
        <form onSubmit={(e) => void saveProfile(e)} className="mt-4 space-y-4">
          {initialUser.email ? (
            <label className="block text-sm">
              <span className="text-torus-fg-dim">Email</span>
              <input
                type="email"
                value={initialUser.email}
                readOnly
                className="mt-1 w-full rounded-lg border border-torus-border bg-torus-surface/50 px-3 py-2 text-sm text-torus-fg-dim"
              />
            </label>
          ) : null}
          <label className="block text-sm">
            <span className="text-torus-fg-dim">Handle</span>
            <input
              type="text"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-torus-border-strong bg-torus-surface px-3 py-2 font-mono text-sm"
              autoComplete="username"
            />
            <span className="mt-1 block text-xs text-torus-fg-faint">
              Old links to /u/{initialUser.handle} will redirect here.
            </span>
          </label>
          <label className="block text-sm">
            <span className="text-torus-fg-dim">Bio</span>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={500}
              rows={4}
              className="mt-1 w-full rounded-lg border border-torus-border-strong bg-torus-surface px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-torus-fg-dim">Avatar URL</span>
            <input
              type="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://..."
              className="mt-1 w-full rounded-lg border border-torus-border-strong bg-torus-surface px-3 py-2 text-sm"
            />
          </label>
          {profileError ? <p className="text-sm text-torus-bass">{profileError}</p> : null}
          {profileOk ? <p className="text-sm text-torus-mid">Saved.</p> : null}
          <button
            type="submit"
            disabled={profileBusy}
            className="rounded-full bg-torus-fg px-5 py-2 text-sm font-medium text-torus-bg disabled:opacity-50"
          >
            {profileBusy ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Custom subdomain</h2>
        <p className="mt-2 text-sm text-torus-fg-dim">
          {licensed ? (
            'Point a subdomain at your profile — a Production License perk.'
          ) : (
            <>
              Custom subdomains are a{' '}
              <Link href="/license" className="text-torus-mid underline">
                Production License
              </Link>{' '}
              perk.
            </>
          )}
        </p>
        <form onSubmit={(e) => void saveSubdomain(e)} className="mt-4 flex gap-2">
          <input
            type="text"
            value={subdomain}
            onChange={(e) => setSubdomain(e.target.value)}
            disabled={!licensed}
            placeholder="yourname"
            className="flex-1 rounded-lg border border-torus-border-strong bg-torus-surface px-3 py-2 font-mono text-sm disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!licensed || subBusy}
            className="rounded-full border border-torus-border-strong px-4 py-2 text-sm disabled:opacity-50"
          >
            {subBusy ? '…' : 'Save'}
          </button>
        </form>
        {subError ? <p className="mt-2 text-sm text-torus-bass">{subError}</p> : null}
        {subOk && subdomain.trim() ? (
          <p className="mt-2 text-sm text-torus-mid">
            Saved — {subdomain.trim()}.torus.wtf
          </p>
        ) : subOk ? (
          <p className="mt-2 text-sm text-torus-mid">Saved.</p>
        ) : null}
      </section>

      <section className="rounded-xl border border-torus-bass/30 p-6">
        <button
          type="button"
          onClick={() => setDangerOpen((v) => !v)}
          className="text-lg font-semibold text-torus-bass"
        >
          Danger zone {dangerOpen ? '▾' : '▸'}
        </button>
        {dangerOpen ? (
          <div className="mt-4 space-y-4 text-sm text-torus-fg-dim">
            <p>
              Deleting your account is permanent. Your profile, handle, and Production License record
              are removed. No dark patterns.
            </p>
            <button
              type="button"
              onClick={() => {
                setConfirmOpen(true);
                setConfirmHandle('');
                setDeleteError(null);
              }}
              className="rounded-lg border border-torus-bass/50 px-4 py-3 text-left hover:bg-torus-bass/5"
            >
              <span className="font-medium text-torus-bass">Delete my account</span>
            </button>
          </div>
        ) : null}
      </section>

      {confirmOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmOpen(false);
          }}
        >
          <div
            ref={deletePanelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={deleteTitleId}
            className="w-full max-w-md rounded-xl border border-torus-border-strong bg-torus-bg p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id={deleteTitleId} className="text-lg font-semibold">
              Delete account
            </h3>
            <p className="mt-2 text-sm text-torus-fg-dim">
              Type <strong className="font-mono text-torus-fg">{initialUser.handle}</strong> to
              confirm.
            </p>
            <input
              type="text"
              value={confirmHandle}
              onChange={(e) => setConfirmHandle(e.target.value)}
              placeholder={initialUser.handle}
              className="mt-4 w-full rounded-lg border border-torus-border-strong bg-torus-surface px-3 py-2 font-mono text-sm"
              autoComplete="off"
            />
            {deleteError ? <p className="mt-2 text-sm text-torus-bass">{deleteError}</p> : null}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-full px-4 py-2 text-sm text-torus-fg-dim hover:bg-torus-surface"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteBusy || !confirmMatches}
                onClick={() => void confirmDelete()}
                className="rounded-full bg-torus-bass px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {deleteBusy ? 'Deleting…' : 'Confirm delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

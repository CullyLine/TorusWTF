'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { hasPerk } from '@/lib/tier-perks';

interface SettingsUser {
  id: string;
  handle: string;
  email: string | null;
  avatarUrl: string | null;
  bio: string | null;
  tier: 'free' | 'supporter';
  customSubdomain: string | null;
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
  const [dangerOpen, setDangerOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState<'anonymize' | 'delete_all' | null>(null);
  const [confirmHandle, setConfirmHandle] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const supporter = hasPerk(initialUser.tier, 'custom_subdomain');

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
    if (!supporter) return;
    setSubBusy(true);
    setSubError(null);
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
      router.refresh();
    } catch {
      setSubError('Network error.');
    } finally {
      setSubBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteMode) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const res = await fetch('/api/auth/me', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: deleteMode, confirmHandle }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setDeleteError(data.error ?? 'Could not delete account.');
        return;
      }
      setDeleteMode(null);
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
          {supporter
            ? 'Point a subdomain at your profile (Supporter perk).'
            : 'Custom subdomains are a Supporter perk — see /support.'}
        </p>
        <form onSubmit={(e) => void saveSubdomain(e)} className="mt-4 flex gap-2">
          <input
            type="text"
            value={subdomain}
            onChange={(e) => setSubdomain(e.target.value)}
            disabled={!supporter}
            placeholder="yourname"
            className="flex-1 rounded-lg border border-torus-border-strong bg-torus-surface px-3 py-2 font-mono text-sm disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!supporter || subBusy}
            className="rounded-full border border-torus-border-strong px-4 py-2 text-sm disabled:opacity-50"
          >
            {subBusy ? '…' : 'Save'}
          </button>
        </form>
        {subError ? <p className="mt-2 text-sm text-torus-bass">{subError}</p> : null}
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
              Deleting your account is permanent. Choose whether to keep your clips online as
              Anonymous (with rescue links emailed to you) or delete everything you uploaded.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  setDeleteMode('anonymize');
                  setConfirmHandle('');
                  setDeleteError(null);
                }}
                className="rounded-lg border border-torus-border-strong px-4 py-3 text-left hover:bg-torus-surface"
              >
                <span className="font-medium text-torus-fg">Anonymize my clips</span>
                <span className="mt-1 block text-xs">
                  Clips stay up; you get email rescue links to manage them later.
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteMode('delete_all');
                  setConfirmHandle('');
                  setDeleteError(null);
                }}
                className="rounded-lg border border-torus-bass/50 px-4 py-3 text-left hover:bg-torus-bass/5"
              >
                <span className="font-medium text-torus-bass">Delete everything</span>
                <span className="mt-1 block text-xs">
                  Wipes all your clips, storage files, and your account.
                </span>
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {deleteMode ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl border border-torus-border-strong bg-torus-bg p-6">
            <h3 className="text-lg font-semibold">
              {deleteMode === 'anonymize' ? 'Anonymize and delete account' : 'Delete everything'}
            </h3>
            <p className="mt-2 text-sm text-torus-fg-dim">
              Type <strong className="font-mono text-torus-fg">@{initialUser.handle}</strong> to
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
                onClick={() => setDeleteMode(null)}
                className="rounded-full px-4 py-2 text-sm text-torus-fg-dim hover:bg-torus-surface"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  deleteBusy || confirmHandle.toLowerCase() !== initialUser.handle.toLowerCase()
                }
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

'use client';

import { useState } from 'react';

interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: number | null;
  createdAt: number;
}

export function DeveloperApp({
  initialKeys,
  balance,
  baseUrl,
}: {
  initialKeys: KeyRow[];
  balance: number;
  baseUrl: string;
}) {
  const [keys, setKeys] = useState<KeyRow[]>(initialKeys);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function createKey() {
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    setFreshKey(null);
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to create key.');
      setFreshKey(data.key.key);
      setKeys((prev) => [
        {
          id: data.key.id,
          name: data.key.name,
          prefix: data.key.prefix,
          lastUsedAt: null,
          createdAt: data.key.createdAt,
        },
        ...prev,
      ]);
      setName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create key.');
    } finally {
      setCreating(false);
    }
  }

  async function revokeKey(id: string) {
    if (!confirm('Revoke this key? Any agent using it will stop working immediately.')) return;
    const res = await fetch(`/api/keys/${id}`, { method: 'DELETE' });
    if (res.ok) setKeys((prev) => prev.filter((k) => k.id !== id));
  }

  const curlExample = `curl -X POST ${baseUrl}/api/v1/stems \\
  -H "Authorization: Bearer tk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"audioUrl":"https://example.com/song.mp3","wait":true}'`;

  return (
    <>
      <div className="mt-10 flex items-end justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">developers</h1>
        <div className="text-right">
          <div className="text-xs text-torus-fg-faint">balance</div>
          <div className="text-2xl font-semibold text-torus-mid">{balance} cr</div>
        </div>
      </div>
      <p className="mt-2 text-sm text-torus-fg-dim">
        Call TorusFM compute services from your own code or AI agents. Per-call billing in
        credits — same price as the Lab, no markup.{' '}
        <a href="/credits" className="underline">
          Top up credits
        </a>
        .
      </p>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-torus-fg-dim">Create an API key</h2>
        <div className="mt-3 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Key name (e.g. my-agent)"
            maxLength={80}
            className="flex-1 rounded-lg border border-torus-border bg-transparent px-3 py-2 text-sm outline-none focus:border-torus-mid/50"
          />
          <button
            onClick={createKey}
            disabled={creating || !name.trim()}
            className="rounded-lg border border-torus-border-strong px-4 py-2 text-sm font-medium transition-colors hover:border-torus-mid/50 disabled:opacity-50"
          >
            {creating ? 'Creating…' : 'Create'}
          </button>
        </div>
        {error ? <p className="mt-2 text-sm text-torus-bass">{error}</p> : null}

        {freshKey ? (
          <div className="mt-4 rounded-xl border border-torus-mid/40 bg-torus-mid/5 p-4">
            <p className="text-xs text-torus-fg-dim">
              Copy this key now — it won’t be shown again.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-lg bg-black/30 px-3 py-2 text-sm">
                {freshKey}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(freshKey);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="rounded-lg border border-torus-border-strong px-3 py-2 text-xs"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium text-torus-fg-dim">Your keys</h2>
        {keys.length === 0 ? (
          <p className="mt-3 text-sm text-torus-fg-faint">No keys yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-torus-border text-sm">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="font-medium">{k.name}</div>
                  <div className="text-xs text-torus-fg-faint">
                    <code>{k.prefix}…</code> · created{' '}
                    {new Date(k.createdAt).toLocaleDateString()} ·{' '}
                    {k.lastUsedAt
                      ? `last used ${new Date(k.lastUsedAt).toLocaleDateString()}`
                      : 'never used'}
                  </div>
                </div>
                <button
                  onClick={() => revokeKey(k.id)}
                  className="rounded-lg border border-torus-border px-3 py-1.5 text-xs text-torus-fg-dim transition-colors hover:border-torus-bass/50 hover:text-torus-bass"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-12">
        <h2 className="text-sm font-medium text-torus-fg-dim">Quickstart</h2>
        <p className="mt-2 text-sm text-torus-fg-dim">
          Separate a song into stems. Pass <code>wait:true</code> to block until it’s done, or
          poll the returned <code>statusUrl</code>.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-xl border border-torus-border bg-black/30 p-4 text-xs leading-relaxed">
          {curlExample}
        </pre>
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <a href="/api/v1/services" className="underline">
            Service catalog
          </a>
          <a href="/api/v1/openapi.json" className="underline">
            OpenAPI spec
          </a>
          <span className="text-torus-fg-faint">
            MCP endpoint: <code>{baseUrl}/api/mcp</code>
          </span>
        </div>
      </section>
    </>
  );
}

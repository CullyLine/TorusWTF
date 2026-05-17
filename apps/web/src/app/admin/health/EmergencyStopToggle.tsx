'use client';

import { useState, useTransition } from 'react';

interface Props {
  initial: boolean;
}

export function EmergencyStopToggle({ initial }: Props) {
  const [active, setActive] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = () => {
    startTransition(async () => {
      setError(null);
      const res = await fetch('/api/admin/emergency-stop', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ active: !active }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Toggle failed.');
        return;
      }
      setActive(!active);
    });
  };

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={[
          'rounded-full px-5 py-3 text-sm font-medium transition',
          active
            ? 'bg-torus-bass text-torus-bg hover:opacity-90'
            : 'bg-torus-fg text-torus-bg hover:opacity-90',
          pending ? 'opacity-50' : '',
        ].join(' ')}
      >
        {pending ? 'updating…' : active ? 'resume uploads' : 'pause uploads'}
      </button>
      <span className={`text-xs font-mono ${active ? 'text-torus-bass' : 'text-torus-mid'}`}>
        currently: {active ? 'PAUSED' : 'live'}
      </span>
      {error ? (
        <span role="alert" className="text-xs text-torus-bass">
          {error}
        </span>
      ) : null}
    </div>
  );
}

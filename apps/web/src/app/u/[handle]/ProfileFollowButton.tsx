'use client';

import { useState, useTransition } from 'react';

interface Props {
  handle: string;
  initialFollowing: boolean;
}

export function ProfileFollowButton({ handle, initialFollowing }: Props) {
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    startTransition(async () => {
      const method = following ? 'DELETE' : 'POST';
      const res = await fetch(`/api/users/${handle}/follow`, { method });
      if (res.ok) setFollowing(!following);
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className={[
        'rounded-full px-4 py-2 text-xs font-medium transition',
        following
          ? 'border border-torus-border-strong bg-torus-surface text-torus-fg hover:bg-torus-bg'
          : 'bg-torus-fg text-torus-bg hover:opacity-90',
        pending ? 'opacity-50' : '',
      ].join(' ')}
    >
      {pending ? '…' : following ? 'following' : 'follow'}
    </button>
  );
}

'use client';

import { useUploadDialog } from '@torus/ui';

interface UploadButtonProps {
  variant?: 'primary' | 'pill';
  label?: string;
  className?: string;
}

export function UploadButton({
  variant = 'primary',
  label = 'Upload a clip',
  className,
}: UploadButtonProps) {
  const { open } = useUploadDialog();
  const base =
    variant === 'pill'
      ? 'rounded-full border border-torus-border-strong px-4 py-2 text-xs text-torus-fg hover:bg-torus-surface'
      : 'rounded-full bg-torus-fg px-6 py-3 text-sm font-medium text-torus-bg hover:opacity-90';
  return (
    <button
      type="button"
      onClick={open}
      className={[base, 'transition', className].filter(Boolean).join(' ')}
      title="Press U from anywhere"
    >
      {label}
    </button>
  );
}

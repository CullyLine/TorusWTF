'use client';

import { useEffect, useRef, useState } from 'react';

interface EditableNumberProps {
  value: number;
  onCommit: (next: number) => void;
  format?: (v: number) => string;
  ariaLabel?: string;
  outOfRange?: boolean;
}

export function EditableNumber({
  value,
  onCommit,
  format = (v) => v.toFixed(2),
  ariaLabel,
  outOfRange = false,
}: EditableNumberProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const startEdit = () => {
    setDraft(String(value));
    setEditing(true);
  };

  const commit = () => {
    const parsed = Number(draft);
    if (Number.isFinite(parsed)) onCommit(parsed);
    setEditing(false);
  };

  const cancel = () => {
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        step="any"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
        aria-label={ariaLabel}
        className="w-20 border-b border-torus-mid bg-transparent text-right tabular-nums text-torus-fg outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
    );
  }

  return (
    <span
      onDoubleClick={startEdit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'F2') startEdit();
      }}
      role="button"
      tabIndex={0}
      title="Double-click to set exact value (no limits)"
      className={`cursor-pointer select-none tabular-nums hover:text-torus-mid ${outOfRange ? 'text-torus-bass' : ''}`}
    >
      {format(value)}
    </span>
  );
}

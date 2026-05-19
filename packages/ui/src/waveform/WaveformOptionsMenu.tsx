'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';

export interface WaveformOptionsMenuProps {
  spectrogramAvailable?: boolean;
  showSpectrogram?: boolean;
  onShowSpectrogramChange?: (value: boolean) => void;
  visualizerAvailable?: boolean;
  showVisualizer?: boolean;
  onShowVisualizerChange?: (value: boolean) => void;
}

export function WaveformOptionsMenu({
  spectrogramAvailable,
  showSpectrogram,
  onShowSpectrogramChange,
  visualizerAvailable,
  showVisualizer,
  onShowVisualizerChange,
}: WaveformOptionsMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const hasItems =
    (spectrogramAvailable && onShowSpectrogramChange) ||
    (visualizerAvailable && onShowVisualizerChange);

  if (!hasItems) return null;

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="More options"
        aria-expanded={open}
        aria-haspopup="menu"
        style={pillBtnStyle}
        title="More options"
      >
        ···
      </button>

      {open ? (
        <div role="menu" style={menuStyle}>
          {visualizerAvailable && onShowVisualizerChange ? (
            <label style={menuItemStyle}>
              <input
                type="checkbox"
                checked={showVisualizer ?? false}
                onChange={(e) => onShowVisualizerChange(e.target.checked)}
              />
              <span>Enable 3D visualizer</span>
            </label>
          ) : null}
          {spectrogramAvailable && onShowSpectrogramChange ? (
            <label style={menuItemStyle}>
              <input
                type="checkbox"
                checked={showSpectrogram ?? false}
                onChange={(e) => onShowSpectrogramChange(e.target.checked)}
              />
              <span>Show spectrogram</span>
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const pillBtnStyle: CSSProperties = {
  padding: '6px 14px',
  background: 'transparent',
  color: 'var(--color-torus-fg)',
  border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 999,
  fontSize: 14,
  lineHeight: 1,
  letterSpacing: '0.12em',
  cursor: 'pointer',
};

const menuStyle: CSSProperties = {
  position: 'absolute',
  right: 0,
  bottom: 'calc(100% + 8px)',
  minWidth: 220,
  padding: '8px 0',
  background: '#12132a',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 12,
  boxShadow: '0 16px 48px rgba(0,0,0,0.45)',
  zIndex: 20,
};

const menuItemStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 16px',
  fontSize: 13,
  cursor: 'pointer',
  color: 'var(--color-torus-fg)',
};

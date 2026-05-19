'use client';

import dynamic from 'next/dynamic';
import { useEffect, type CSSProperties, type RefObject } from 'react';
import { VISUALIZERS, type VisualizerId } from '@torus/visualizers';
import type { WaveformPalette } from '@torus/shared';

const VisualizerCanvas = dynamic(
  () => import('@torus/visualizers').then((mod) => mod.VisualizerCanvas),
  { ssr: false },
);

const PRESET_IDS = Object.keys(VISUALIZERS) as VisualizerId[];

interface VisualizerViewportProps {
  audioRef: RefObject<HTMLAudioElement | null>;
  palette: WaveformPalette;
  activePreset: VisualizerId;
  onActivePresetChange: (id: VisualizerId) => void;
  theater: boolean;
  onTheaterChange: (theater: boolean) => void;
  uiVisible: boolean;
  onRevealUi: () => void;
  presetOpen: boolean;
  onPresetOpenChange: (open: boolean) => void;
}

export function VisualizerViewport({
  audioRef,
  palette,
  activePreset,
  onActivePresetChange,
  theater,
  onTheaterChange,
  uiVisible,
  onRevealUi,
  presetOpen,
  onPresetOpenChange,
}: VisualizerViewportProps) {
  useEffect(() => {
    if (!theater) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onTheaterChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [theater, onTheaterChange]);

  const menuMaxHeight = theater ? 'min(280px, 48vh)' : 'min(112px, 22vh)';

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%' }}
      onPointerMove={onRevealUi}
      onPointerEnter={onRevealUi}
      onPointerDown={onRevealUi}
      onWheel={onRevealUi}
      onTouchStart={onRevealUi}
    >
      <VisualizerCanvas
        audioRef={audioRef}
        preset={activePreset}
        palette={palette}
        embedded
        onInteract={onRevealUi}
      />

      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          opacity: uiVisible || presetOpen ? 1 : 0,
          transition: 'opacity 0.35s ease',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            pointerEvents: 'auto',
          }}
        >
          <button
            type="button"
            onClick={() => onPresetOpenChange(!presetOpen)}
            aria-expanded={presetOpen}
            aria-haspopup="listbox"
            style={overlayBtnStyle}
            title={VISUALIZERS[activePreset].hint}
          >
            {VISUALIZERS[activePreset].label}
          </button>
          {presetOpen ? (
            <div
              role="listbox"
              aria-label="3D visualizer preset"
              style={{
                ...presetMenuStyle,
                maxHeight: menuMaxHeight,
              }}
            >
              {PRESET_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="option"
                  aria-selected={id === activePreset}
                  onClick={() => {
                    onActivePresetChange(id);
                    onPresetOpenChange(false);
                    onRevealUi();
                  }}
                  style={{
                    ...presetItemStyle,
                    ...(id === activePreset ? presetItemActiveStyle : null),
                  }}
                >
                  {VISUALIZERS[id].label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div style={{ position: 'absolute', top: 10, right: 10, pointerEvents: 'auto' }}>
          <button
            type="button"
            onClick={() => onTheaterChange(!theater)}
            aria-pressed={theater}
            style={overlayBtnStyle}
            title={theater ? 'Exit theater mode' : 'Theater mode'}
          >
            {theater ? 'exit theater' : 'theater'}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayBtnStyle: CSSProperties = {
  padding: '8px 14px',
  background: 'rgba(10, 11, 30, 0.55)',
  color: 'var(--color-torus-fg)',
  border: '1px solid rgba(255,255,255,0.22)',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: '0.03em',
  cursor: 'pointer',
  backdropFilter: 'blur(8px)',
};

const presetMenuStyle: CSSProperties = {
  marginTop: 8,
  minWidth: 180,
  padding: '6px 0',
  background: 'rgba(10, 11, 30, 0.92)',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 12,
  boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  WebkitOverflowScrolling: 'touch',
};

const presetItemStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '10px 14px',
  background: 'transparent',
  border: 'none',
  color: 'var(--color-torus-fg)',
  fontSize: 13,
  textAlign: 'left',
  cursor: 'pointer',
  flexShrink: 0,
};

const presetItemActiveStyle: CSSProperties = {
  background: 'rgba(34, 211, 206, 0.12)',
  color: 'var(--color-torus-mid)',
};

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Waveform } from '@torus/ui';
import type { PeaksJson, WaveformPalette } from '@torus/shared';
import { pickRandomVisualizerPreset, type VisualizerId } from '@torus/visualizers';
import { VisualizerViewport } from '@/components/VisualizerViewport';
import { useIdleOverlayUi } from '@/hooks/useIdleOverlayUi';

const DEFAULT_PALETTE: WaveformPalette = {
  bass: '#FF2D95',
  mid: '#22D3CE',
  high: '#F7E08C',
};

interface ClipPlayerProps {
  shareCode?: string;
  peaks?: PeaksJson;
  palette?: WaveformPalette;
  audioUrl?: string;
  spectrogramUrl?: string;
  durationSec?: number;
  height?: number;
  canManageClip?: boolean;
  onEditDetails?: () => void;
  onDeleteClip?: () => void;
}

export function ClipPlayer({
  shareCode,
  peaks,
  palette,
  audioUrl,
  spectrogramUrl,
  durationSec,
  height = 180,
  canManageClip,
  onEditDetails,
  onDeleteClip,
}: ClipPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playedOnceRef = useRef(false);
  const [visualizerEnabled, setVisualizerEnabled] = useState(false);
  const [theater, setTheater] = useState(false);
  const [activePreset, setActivePreset] = useState<VisualizerId>('torus_field');
  const { uiVisible, presetOpen, setPresetOpen, revealUi } = useIdleOverlayUi();

  const colors = palette ?? DEFAULT_PALETTE;
  const canUse3D = !!audioUrl;

  useEffect(() => {
    if (!shareCode) return;
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => {
      if (playedOnceRef.current) return;
      playedOnceRef.current = true;
      void fetch(`/api/clips/${shareCode}/play`, { method: 'POST', credentials: 'same-origin' }).catch(
        () => undefined,
      );
    };

    audio.addEventListener('play', onPlay);
    return () => audio.removeEventListener('play', onPlay);
  }, [shareCode, audioUrl]);

  const handleVisualizerEnabledChange = useCallback(
    (enabled: boolean) => {
      if (enabled) {
        setActivePreset(pickRandomVisualizerPreset());
      } else {
        setTheater(false);
        setPresetOpen(false);
      }
      setVisualizerEnabled(enabled);
    },
    [setPresetOpen],
  );

  const visualizerSlot =
    visualizerEnabled && canUse3D ? (
      <VisualizerViewport
        audioRef={audioRef}
        palette={colors}
        activePreset={activePreset}
        onActivePresetChange={setActivePreset}
        theater={theater}
        onTheaterChange={setTheater}
        uiVisible={uiVisible}
        onRevealUi={revealUi}
        presetOpen={presetOpen}
        onPresetOpenChange={setPresetOpen}
      />
    ) : null;

  return (
    <Waveform
      ref={audioRef}
      peaks={peaks}
      palette={palette}
      audioUrl={audioUrl}
      spectrogramUrl={spectrogramUrl}
      durationSec={durationSec}
      height={height}
      visualizerEnabled={visualizerEnabled}
      onVisualizerEnabledChange={handleVisualizerEnabledChange}
      visualizerAvailable={canUse3D}
      visualizerTheater={theater}
      theaterOverlayVisible={uiVisible || presetOpen}
      onTheaterOverlayActivity={revealUi}
      visualizerSlot={visualizerSlot}
      canManageClip={canManageClip}
      onEditDetails={onEditDetails}
      onDeleteClip={onDeleteClip}
    />
  );
}

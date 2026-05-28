'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import type { PointLight } from 'three';
import { useMetricsRef } from './metrics';
import { useCameraZoomDistanceRef } from './cameraZoom';
import { NEUTRAL_ANIMA, updateAnima, type AnimaState } from './dsp/anima';
import type { CreaturePersonality } from './dsp/creature';
import { AuraLayer } from './AuraLayer';
import {
  createCinematicState,
  updateCinematicCamera,
  type CinematicState,
} from './dsp/cinematic';

export type CameraMode = 'still' | 'drift' | 'orbit' | 'dive' | 'cinematic';

interface SceneRigProps {
  palette: { bass: string; mid: string; high: string };
  tier: 'high' | 'mid' | 'low';
  embedded?: boolean;
  bloomIntensity?: number;
  cameraMode?: CameraMode;
  /** 0 = off, 1 = noticeable, 3 = subwoofer-in-a-car. */
  bassShake?: number;
  /** 0 = dead-reactive (no breathing); 1 = full Anima life. Default 0.5. */
  anima?: number;
  /** 0 = no aura, 1 = full wisp cloud + soul glow. Default 0.4. */
  aura?: number;
  /** Optional creature personality for tempo-biased heartbeat. */
  creature?: CreaturePersonality;
  /** Cinematic playback rate (only used when cameraMode === 'cinematic'). */
  cinematicSpeed?: number;
}

/**
 * Shared lighting, bass-reactive camera shake, and bloom god-rays for all presets.
 */
export function SceneRig({
  palette,
  tier,
  embedded,
  bloomIntensity,
  cameraMode = 'drift',
  bassShake = 0,
  anima = 0.5,
  aura = 0.4,
  creature,
  cinematicSpeed = 1,
}: SceneRigProps) {
  const metricsRef = useMetricsRef();
  const bassLight = useRef<PointLight>(null);
  const midLight = useRef<PointLight>(null);
  const highLight = useRef<PointLight>(null);
  const zoomDistanceRef = useCameraZoomDistanceRef();
  const fallbackZ = embedded ? 3.2 : 4;
  const animaState = useRef<AnimaState>({ ...NEUTRAL_ANIMA });
  const cinematicState = useRef<CinematicState>(createCinematicState());

  useFrame((state) => {
    const m = metricsRef.current;
    const t = state.clock.elapsedTime;
    const baseZ = zoomDistanceRef?.current ?? fallbackZ;

    if (bassLight.current) {
      bassLight.current.intensity = 0.6 + m.bass * 2.8 + m.beat * 1.5;
      bassLight.current.distance = 12 + m.breath * 6;
    }
    if (midLight.current) {
      midLight.current.intensity = 0.5 + m.mid * 2.2;
    }
    if (highLight.current) {
      highLight.current.intensity = 0.35 + m.high * 2.5;
    }

    const shake = m.beat * (embedded ? 0.06 : 0.1) + m.bass * 0.02;

    // Look-at target the rest of the rig will use. Cinematic overrides this;
    // every other mode leaves it at the scene origin.
    let lookTargetX = 0;
    let lookTargetY = 0;
    let lookTargetZ = 0;

    switch (cameraMode) {
      case 'still':
        state.camera.position.set(0, 0, baseZ);
        break;
      case 'orbit': {
        const radius = embedded ? 0.8 : 1.2;
        state.camera.position.x = Math.sin(t * 0.35) * radius;
        state.camera.position.y = Math.sin(t * 0.18) * 0.35;
        state.camera.position.z = baseZ + Math.cos(t * 0.35) * radius * 0.5;
        break;
      }
      case 'dive':
        state.camera.position.x = Math.sin(t * 12.1) * shake * 0.5;
        state.camera.position.y = Math.cos(t * 9.7) * shake * 0.35;
        state.camera.position.z = baseZ - m.bass * 1.4 - m.beat * 0.6;
        break;
      case 'cinematic': {
        const cine = updateCinematicCamera(cinematicState.current, t, m.bpm, cinematicSpeed);
        state.camera.position.set(cine.pos.x, cine.pos.y, cine.pos.z);
        lookTargetX = cine.look.x;
        lookTargetY = cine.look.y;
        lookTargetZ = cine.look.z;
        break;
      }
      case 'drift':
      default:
        state.camera.position.x = Math.sin(t * 18.7) * shake;
        state.camera.position.y = Math.cos(t * 14.3) * shake * 0.7;
        state.camera.position.z = baseZ + Math.sin(t * 11.1) * shake * 0.4;
        break;
    }

    // Subwoofer rumble: high-frequency low-amplitude wobble that scales with
    // current bass + recent beat. Lives ON TOP of cameraMode placement.
    if (bassShake > 0) {
      const bassPunch = m.bass * 0.6 + m.beat * 1.4;
      const amp = bassShake * bassPunch * (embedded ? 0.04 : 0.07);
      // Two slightly desynced sines so it doesn't feel like a clean wave;
      // y dominates because real subs you feel in your chest vertically.
      state.camera.position.y += Math.sin(t * 87.3) * amp;
      state.camera.position.x += Math.sin(t * 63.1 + 1.7) * amp * 0.45;
      state.camera.position.z += Math.sin(t * 52.7 + 0.9) * amp * 0.3;
    }

    // Choreography — creature emotional motion. Independent of audio reactivity.
    // leanIn dollies camera inward; release dollies outward (the exhale);
    // holdBreath dampens motion (the listener's stillness).
    const leanZ = -m.leanIn * 0.35;
    const releaseZ = m.release * 0.5;
    const stillness = 1 - m.holdBreath * 0.85;
    state.camera.position.z += leanZ + releaseZ;

    // Anima — the always-living layer. Even in silence the creature breathes.
    if (anima > 0) {
      updateAnima(animaState.current, t, creature);
      const a = animaState.current;
      const animaAmp = anima * stillness;
      // Heartbeat: subtle z-axis breathing (in/out of the scene).
      state.camera.position.z += a.heartbeat * 0.025 * animaAmp;
      // Drift: subtle look-target offset for a "head turning slowly" feel.
      state.camera.lookAt(
        lookTargetX + a.driftYaw * 0.6 * animaAmp,
        lookTargetY + a.driftPitch * 0.6 * animaAmp,
        lookTargetZ,
      );
    } else {
      state.camera.lookAt(lookTargetX, lookTargetY, lookTargetZ);
    }
  });

  const tierBloom = tier === 'low' ? 0.8 : 1.1;
  const resolvedBloom = bloomIntensity ?? tierBloom;

  return (
    <>
      <ambientLight intensity={0.28} />
      <pointLight ref={bassLight} position={[0, -1.5, 2]} color={palette.bass} intensity={1} />
      <pointLight ref={midLight} position={[2, 1, 1]} color={palette.mid} intensity={0.8} />
      <pointLight ref={highLight} position={[-2, 0.5, -1]} color={palette.high} intensity={0.6} />
      <spotLight
        position={[0, 4, 0]}
        angle={0.45}
        penumbra={0.8}
        intensity={0.4}
        color={palette.mid}
        distance={14}
      />

      <AuraLayer palette={palette} amount={aura} tier={tier} />

      {tier !== 'low' ? (
        <EffectComposer multisampling={tier === 'high' ? 4 : 0}>
          <Bloom
            intensity={resolvedBloom}
            luminanceThreshold={0.12}
            luminanceSmoothing={0.9}
            mipmapBlur
          />
          <Vignette eskil={false} offset={0.2} darkness={0.55} />
        </EffectComposer>
      ) : null}
    </>
  );
}

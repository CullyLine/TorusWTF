'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { EffectComposer, Vignette } from '@react-three/postprocessing';
import { BloomEffect } from 'postprocessing';
import type { PerspectiveCamera, PointLight } from 'three';
import { useMetricsRef } from './metrics';
import { useModulation } from './modulation';
import type { VisualImpulses } from './impulse';
import { useCameraZoomDistanceRef } from './cameraZoom';
import { NEUTRAL_ANIMA, updateAnima, type AnimaState } from './dsp/anima';
import type { CreaturePersonality } from './dsp/creature';
import { AuraLayer } from './AuraLayer';
import { LightLevel, type LightLevelEffectImpl } from './LightLevelEffect';
import {
  createCinematicState,
  updateCinematicCamera,
  type CinematicState,
} from './dsp/cinematic';
import {
  DEFAULT_FLOW_PARAMS,
  flowParamsFromMetrics,
  sampleFlow,
  type FlowParams,
  type Vec3Like,
} from './dsp/flowfield';

export type CameraMode = 'still' | 'drift' | 'orbit' | 'dive' | 'cinematic' | 'flow';

/**
 * Safe zone around the scene origin. Every preset is anchored at (0,0,0);
 * if the camera gets closer than this the scene fills the whole frame (or
 * the camera ends up inside it). Enforced after ALL camera placement —
 * mode position, bass shake, choreography dollies, and anima heartbeat —
 * so no combination of audio spikes can push the camera into the center.
 */
const SAFE_MIN_CAMERA_DISTANCE = 1.5;

/**
 * Critically-damped spring smooth-time (seconds) for camera pose.
 * Short enough that orbit/drift track their targets without visible lag,
 * long enough that mode switches and cinematic cuts glide instead of teleport.
 */
const CAMERA_SPRING_SMOOTH = 0.16;
const LOOK_SPRING_SMOOTH = 0.14;

/** Short SmoothDamp time for FOV punch — punchy but no per-frame stair-steps. */
const FOV_SPRING_SMOOTH = 0.09;

/**
 * Gentle SmoothDamp for Light-level musical breath — chorus lift and
 * afterglow linger, slower than FOV so exposure never flashes with kicks.
 */
const LIGHT_BREATH_SPRING_SMOOTH = 0.28;

interface ScalarSpring {
  value: number;
  velocity: number;
  initialized: boolean;
}

/**
 * Unity-style SmoothDamp (critically damped) for a scalar. Mutates spring
 * state. First call snaps to the target so values don't fly in on mount.
 */
function smoothDamp(
  state: ScalarSpring,
  target: number,
  dt: number,
  smoothTime: number,
): number {
  if (!state.initialized) {
    state.value = target;
    state.velocity = 0;
    state.initialized = true;
    return target;
  }
  const st = Math.max(1e-4, smoothTime);
  const omega = 2 / st;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = state.value - target;
  const temp = (state.velocity + omega * change) * dt;
  state.velocity = (state.velocity - omega * temp) * exp;
  state.value = target + (change + temp) * exp;
  return state.value;
}

interface Spring3 {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  initialized: boolean;
}

function createSpring3(): Spring3 {
  return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, initialized: false };
}

/**
 * Unity-style SmoothDamp (critically damped) for one axis. Mutates velocity
 * ref-slot on the spring state. First call snaps to the target so the camera
 * doesn't fly in from the origin on mount.
 */
function springAxis(
  state: Spring3,
  axis: 'x' | 'y' | 'z',
  target: number,
  velocityKey: 'vx' | 'vy' | 'vz',
  dt: number,
  smoothTime: number,
): number {
  if (!state.initialized) {
    state[axis] = target;
    state[velocityKey] = 0;
    return target;
  }
  const st = Math.max(1e-4, smoothTime);
  const omega = 2 / st;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = state[axis] - target;
  const temp = (state[velocityKey] + omega * change) * dt;
  state[velocityKey] = (state[velocityKey] - omega * temp) * exp;
  state[axis] = target + (change + temp) * exp;
  return state[axis];
}

function springTo(
  state: Spring3,
  tx: number,
  ty: number,
  tz: number,
  dt: number,
  smoothTime: number,
): void {
  springAxis(state, 'x', tx, 'vx', dt, smoothTime);
  springAxis(state, 'y', ty, 'vy', dt, smoothTime);
  springAxis(state, 'z', tz, 'vz', dt, smoothTime);
  state.initialized = true;
}

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
  /**
   * Camera distance multiplier. 1 = each mode's natural framing; higher
   * pulls the camera further from the center, lower pushes in (never past
   * the safe minimum distance).
   */
  cameraDistance?: number;
  /**
   * Global light level. 1 = current look; <1 dims the whole frame, >1
   * brightens. Applied as a multiplicative exposure pass after bloom so it
   * works for shader presets too (which bypass scene lights entirely).
   * Musical swell/afterglow gently lifts this baseline via SmoothDamp —
   * the slider still sets the floor.
   */
  lightLevel?: number;
  /** One-shot commands from trigger mappings / MIDI (camPunch, bloomPulse, flash). */
  impulses?: VisualImpulses;
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
  cameraDistance = 1,
  lightLevel = 1,
  impulses,
}: SceneRigProps) {
  const metricsRef = useMetricsRef();
  const mods = useModulation();
  const bassLight = useRef<PointLight>(null);
  const midLight = useRef<PointLight>(null);
  const highLight = useRef<PointLight>(null);
  const resolvedBloomRef = useRef(1);
  const lightLevelRef = useRef<LightLevelEffectImpl | null>(null);
  const baseFovRef = useRef<number | null>(null);
  const fovSpringRef = useRef<ScalarSpring>({ value: 0, velocity: 0, initialized: false });
  // Light-level musical breath: swell/afterglow multiplier eases via SmoothDamp
  // on top of the user Light level baseline (baseline stays the floor).
  const lightBreathSpringRef = useRef<ScalarSpring>({
    value: 1,
    velocity: 0,
    initialized: false,
  });
  // Trigger-impulse envelopes: consumed from `impulses` on the frame they
  // fire, then rung down here (same struck-bell shape as the audio pulses).
  const camPunchEnvRef = useRef(0);
  const bloomPulseEnvRef = useRef(0);
  const flashEnvRef = useRef(0);
  // Musical bloom breath: slow chorus/verse envelope (swell + afterglow).
  // Separate from hit flash so kicks punch without owning the glow.
  const bloomBreathRef = useRef(0.55);
  // Soft hit ring-down for bloom — faster than swell, slower than raw impact.
  const bloomHitRef = useRef(0);

  // Constructed directly (not via the <Bloom> wrapper) so the frame loop
  // can pulse `intensity` with the music. The wrapper memoizes with
  // JSON.stringify(props), which both blocks per-frame updates and chokes
  // on object props.
  const bloomEffect = useMemo(
    () =>
      new BloomEffect({
        intensity: 1,
        luminanceThreshold: 0.1,
        luminanceSmoothing: 0.9,
        mipmapBlur: true,
      }),
    [],
  );
  useEffect(() => () => bloomEffect.dispose(), [bloomEffect]);
  const zoomDistanceRef = useCameraZoomDistanceRef();
  const fallbackZ = embedded ? 2.8 : 3.1;
  const animaState = useRef<AnimaState>({ ...NEUTRAL_ANIMA });
  const cinematicState = useRef<CinematicState>(createCinematicState());
  // Flow camera: a virtual anchor advected through the shared curl field.
  // The camera rides the same current the particles do — drifting, banking,
  // never colliding with the scene (radius is re-normalized every frame).
  const flowAnchorRef = useRef<Vec3Like>({ x: 0.2, y: 0.1, z: 1 });
  const flowCamParamsRef = useRef<FlowParams>({ ...DEFAULT_FLOW_PARAMS });
  const flowCamTimeRef = useRef(0);
  const flowCamScratch = useRef<Vec3Like>({ x: 0, y: 0, z: 0 });
  const prevFrameTime = useRef(0);
  // Critically-damped springs: modes write a desired pose each frame; the
  // camera eases toward it so orbit/drift/dive/flow glide and mode switches
  // never teleport. Bass shake is applied AFTER the spring so kick rumble
  // still lands on top of the fluid base.
  const camSpringRef = useRef<Spring3>(createSpring3());
  const lookSpringRef = useRef<Spring3>(createSpring3());
  const prevCameraModeRef = useRef<CameraMode>(cameraMode);

  useFrame((state, delta) => {
    const m = metricsRef.current;
    // Modulation-matrix values (fall back to props when a key isn't routed).
    const mv = mods.current;
    const t = state.clock.elapsedTime;
    const dist = Math.max(0.3, mv.cameraDistance ?? cameraDistance);
    const bassShakeNow = mv.bassShake ?? bassShake;
    const lightLevelNow = Math.max(0, mv.lightLevel ?? lightLevel);
    const baseZ = (zoomDistanceRef?.current ?? fallbackZ) * dist;
    const dtImp = Math.min(delta, 0.1);

    // Zero spring velocity on mode change so leftover momentum doesn't
    // overshoot the new path — position continuity alone handles the glide.
    if (prevCameraModeRef.current !== cameraMode) {
      camSpringRef.current.vx = 0;
      camSpringRef.current.vy = 0;
      camSpringRef.current.vz = 0;
      lookSpringRef.current.vx = 0;
      lookSpringRef.current.vy = 0;
      lookSpringRef.current.vz = 0;
      prevCameraModeRef.current = cameraMode;
    }

    // Consume one-shot trigger impulses, then decay their envelopes.
    if (impulses) {
      if (impulses.camPunch > 0.001) {
        camPunchEnvRef.current = Math.max(camPunchEnvRef.current, Math.min(1.5, impulses.camPunch));
        impulses.camPunch = 0;
      }
      if (impulses.bloomPulse > 0.001) {
        bloomPulseEnvRef.current = Math.max(
          bloomPulseEnvRef.current,
          Math.min(1.5, impulses.bloomPulse),
        );
        impulses.bloomPulse = 0;
      }
      if (impulses.flash > 0.001) {
        flashEnvRef.current = Math.max(flashEnvRef.current, Math.min(1.5, impulses.flash));
        impulses.flash = 0;
      }
    }
    camPunchEnvRef.current *= Math.exp(-dtImp / 0.22);
    bloomPulseEnvRef.current *= Math.exp(-dtImp / 0.35);
    flashEnvRef.current *= Math.exp(-dtImp / 0.16);
    const flash = flashEnvRef.current;

    // Light-level musical breath: choruses gently lift exposure via swell,
    // peaks linger on afterglow. SmoothDamp keeps the lift fluid — never a
    // kick strobe. Multiplier sits on the user Light level so the slider
    // still sets the floor (quiet ≈ 1×, loud lifts a notch).
    const lightBreathTarget = 1 + m.swell * 0.14 + m.afterglow * 0.1;
    const lightBreath = smoothDamp(
      lightBreathSpringRef.current,
      lightBreathTarget,
      dtImp,
      LIGHT_BREATH_SPRING_SMOOTH,
    );
    const effectiveLightLevel = lightLevelNow * lightBreath;

    // Low tier has no post-processing exposure pass, so the light level is
    // baked into the light intensities instead (see render section below).
    // Lights ride the pulse envelopes (impact rings down like a struck
    // bell, shimmer melts) so illumination lands with hits and glides to
    // rest instead of strobing on raw FFT flux. Colors are re-read every
    // frame so the living palette breathes through the lighting too.
    //
    // Kit accents: kick punches the bass light, snare cracks the mid light
    // laterally, hat ticks the high light — discrete drum answers on top of
    // the continuous swell/impact/shimmer ride. Envelopes already ring down,
    // so accents land as soft hits rather than strobing the whole stage.
    const frameLightScale = tier === 'low' ? effectiveLightLevel : 1;
    if (lightLevelRef.current) lightLevelRef.current.level = effectiveLightLevel;
    const kickPunch = Math.min(1.2, m.kick);
    const snareCrack = Math.min(1.2, m.snare);
    const hatTick = Math.min(1.2, m.hat);
    if (bassLight.current) {
      bassLight.current.intensity =
        (0.55 +
          m.bass * 2.4 +
          m.impact * 2.2 +
          kickPunch * 1.6 +
          m.afterglow * 0.7 +
          flash * 3) *
        frameLightScale;
      bassLight.current.distance = 12 + m.breath * 6 + kickPunch * 2.5;
      bassLight.current.color.set(palette.bass);
    }
    if (midLight.current) {
      midLight.current.intensity =
        (0.45 +
          m.mid * 2.0 +
          m.swell * 0.8 +
          snareCrack * 1.8 +
          m.afterglow * 0.4 +
          flash * 3) *
        frameLightScale;
      // Lateral crack: snare snaps the mid light outward on its home axis
      // then the envelope eases it home — a sideways flash, not a strobe.
      midLight.current.position.set(2 + snareCrack * 0.85, 1 + snareCrack * 0.15, 1);
      midLight.current.color.set(palette.mid);
    }
    if (highLight.current) {
      highLight.current.intensity =
        (0.3 + m.high * 1.6 + m.shimmer * 1.9 + hatTick * 1.4 + flash * 3) * frameLightScale;
      highLight.current.color.set(palette.high);
    }

    const shake = m.impact * (embedded ? 0.05 : 0.085) + m.bass * 0.015;
    const dtCam = Math.min(Math.max(delta, 0), 0.05);

    // Desired pose for this frame. Modes write here; the spring below eases
    // the real camera toward it so nothing teleports on mode changes.
    let desiredX = 0;
    let desiredY = 0;
    let desiredZ = baseZ;
    let lookTargetX = 0;
    let lookTargetY = 0;
    let lookTargetZ = 0;

    switch (cameraMode) {
      case 'still':
        desiredX = 0;
        desiredY = 0;
        desiredZ = baseZ;
        break;
      case 'orbit': {
        const radius = embedded ? 0.8 : 1.2;
        desiredX = Math.sin(t * 0.35) * radius;
        desiredY = Math.sin(t * 0.18) * 0.35;
        desiredZ = baseZ + Math.cos(t * 0.35) * radius * 0.5;
        break;
      }
      case 'dive':
        desiredX = Math.sin(t * 12.1) * shake * 0.5;
        desiredY = Math.cos(t * 9.7) * shake * 0.35;
        // The bass push-in eases toward the safe minimum instead of
        // subtracting linearly — heavy sustained bass (or AGC-boosted
        // quiet audio) can no longer park the camera at the origin.
        {
          const push = m.bass * 1.4 + m.beat * 0.6;
          const room = Math.max(0, baseZ - SAFE_MIN_CAMERA_DISTANCE);
          desiredZ = baseZ - room * (1 - Math.exp(-push / Math.max(0.5, room)));
        }
        break;
      case 'cinematic': {
        // Section-aware pacing: shots hold longer through quiet valleys
        // and cut faster at peaks. Integrated per-frame, so the varying
        // rate stays perfectly smooth.
        const pacing = cinematicSpeed * (0.55 + m.sectionLevel * 0.6);
        const cine = updateCinematicCamera(cinematicState.current, t, m.bpm, pacing);
        desiredX = cine.pos.x * dist;
        desiredY = cine.pos.y * dist;
        desiredZ = cine.pos.z * dist;
        lookTargetX = cine.look.x;
        lookTargetY = cine.look.y;
        lookTargetZ = cine.look.z;
        break;
      }
      case 'flow': {
        // Ride the current: advect a unit-sphere anchor through the flow
        // field, then place the camera along it at the configured distance.
        const dt = Math.min(Math.max(t - prevFrameTime.current, 0), 0.05);
        flowCamTimeRef.current += dt * (0.35 + Math.min(m.energy, 1.5) * 0.3);
        const fp = flowParamsFromMetrics(m, flowCamParamsRef.current);
        fp.time = flowCamTimeRef.current;
        fp.vortex = 0; // no vortex bias on the camera itself
        const anchor = flowAnchorRef.current;
        const fv = flowCamScratch.current;
        sampleFlow(fv, anchor.x * 2.2, anchor.y * 2.2, anchor.z * 2.2, 0, fp);
        const drift = dt * (0.16 + m.energy * 0.18 + m.dropEvent * 0.3);
        anchor.x += fv.x * drift;
        anchor.y += fv.y * drift * 0.6; // damp vertical so the horizon stays sane
        anchor.z += fv.z * drift;
        const alen = Math.hypot(anchor.x, anchor.y, anchor.z) || 1;
        anchor.x /= alen;
        anchor.y /= alen;
        anchor.z /= alen;
        // Lean into the music: the camera drifts closer as the track
        // swells and eases back out as it exhales.
        const radius = baseZ * (1 - m.swell * 0.09 - m.impact * 0.03 + Math.sin(t * 0.4) * 0.03);
        desiredX = anchor.x * radius;
        desiredY = anchor.y * radius;
        desiredZ = anchor.z * radius;
        break;
      }
      case 'drift':
      default: {
        // A slow lissajous float (actual drifting) + impact-driven shake.
        // Drift amplitude follows the song's section level so quiet
        // valleys hold nearly still — the camera lingers with the music.
        const driftAmp = 0.55 + m.sectionLevel * 0.45;
        desiredX = Math.sin(t * 0.21) * 0.3 * driftAmp + Math.sin(t * 18.7) * shake;
        desiredY =
          Math.cos(t * 0.17) * 0.2 * driftAmp + Math.cos(t * 14.3) * shake * 0.7;
        desiredZ =
          baseZ * (1 - m.swell * 0.06) +
          Math.sin(t * 0.13) * 0.22 * driftAmp +
          Math.sin(t * 11.1) * shake * 0.4;
        break;
      }
    }
    prevFrameTime.current = t;

    // Choreography — creature emotional motion. Independent of audio reactivity.
    // leanIn dollies camera inward; release dollies outward (the exhale);
    // holdBreath dampens motion (the listener's stillness).
    const leanZ = -m.leanIn * 0.35;
    const releaseZ = m.release * 0.5;
    const stillness = 1 - m.holdBreath * 0.85;
    desiredZ += leanZ + releaseZ;

    // Anima heartbeat folds into the desired pose so breathing eases with
    // the spring instead of fighting it.
    let lookYaw = 0;
    let lookPitch = 0;
    if (anima > 0) {
      updateAnima(animaState.current, t, creature);
      const a = animaState.current;
      const animaAmp = anima * stillness;
      desiredZ += a.heartbeat * 0.025 * animaAmp;
      lookYaw = a.driftYaw * 0.6 * animaAmp;
      lookPitch = a.driftPitch * 0.6 * animaAmp;
    }

    // Safe-zone the *desired* pose before springing — the spring then never
    // aims inside the forbidden radius.
    {
      const len = Math.hypot(desiredX, desiredY, desiredZ);
      if (len < SAFE_MIN_CAMERA_DISTANCE) {
        if (len < 1e-4) {
          desiredX = 0;
          desiredY = 0;
          desiredZ = SAFE_MIN_CAMERA_DISTANCE;
        } else {
          const s = SAFE_MIN_CAMERA_DISTANCE / len;
          desiredX *= s;
          desiredY *= s;
          desiredZ *= s;
        }
      }
    }

    springTo(camSpringRef.current, desiredX, desiredY, desiredZ, dtCam, CAMERA_SPRING_SMOOTH);
    const sprung = camSpringRef.current;
    state.camera.position.set(sprung.x, sprung.y, sprung.z);

    // Subwoofer rumble rides ON TOP of the sprung base so kick hits still
    // land; the impact envelope already settles amp smoothly after each hit.
    if (bassShakeNow > 0) {
      const bassPunch = m.bass * 0.5 + m.impact * 1.3;
      const amp = bassShakeNow * bassPunch * (embedded ? 0.04 : 0.07);
      // Two slightly desynced sines so it doesn't feel like a clean wave;
      // y dominates because real subs you feel in your chest vertically.
      state.camera.position.y += Math.sin(t * 87.3) * amp;
      state.camera.position.x += Math.sin(t * 63.1 + 1.7) * amp * 0.45;
      state.camera.position.z += Math.sin(t * 52.7 + 0.9) * amp * 0.3;
    }

    // Final safe-zone after bass shake (anima heartbeat is already in desired).
    {
      const len = state.camera.position.length();
      if (len < SAFE_MIN_CAMERA_DISTANCE) {
        if (len < 1e-4) {
          state.camera.position.set(0, 0, SAFE_MIN_CAMERA_DISTANCE);
        } else {
          state.camera.position.multiplyScalar(SAFE_MIN_CAMERA_DISTANCE / len);
        }
      }
    }

    // Look-at also springs — cinematic shot cuts glide instead of snapping.
    springTo(
      lookSpringRef.current,
      lookTargetX,
      lookTargetY,
      lookTargetZ,
      dtCam,
      LOOK_SPRING_SMOOTH,
    );
    const look = lookSpringRef.current;
    state.camera.lookAt(look.x + lookYaw, look.y + lookPitch, look.z);

    // FOV punch-in: hits tighten the lens a couple of degrees and afterglow
    // exhales wider. Target is SmoothDamp'd so envelope/FFT stair-steps
    // never write FOV directly — fluid punch across every preset.
    const cam = state.camera as PerspectiveCamera;
    if (cam.isPerspectiveCamera) {
      if (baseFovRef.current === null) baseFovRef.current = cam.fov;
      const punchIn = Math.min(
        7,
        m.impact * (0.9 + m.swell * 2.1) + camPunchEnvRef.current * 5,
      );
      const targetFov = baseFovRef.current - punchIn + m.afterglow * 1.3;
      const dtFov = Math.min(Math.max(delta, 0), 0.05);
      const nextFov = smoothDamp(fovSpringRef.current, targetFov, dtFov, FOV_SPRING_SMOOTH);
      if (Math.abs(cam.fov - nextFov) > 0.005) {
        cam.fov = nextFov;
        cam.updateProjectionMatrix();
      }
    }

    // Bloom musical breath: choruses glow via swell, peaks linger on
    // afterglow, gather lifts just before the downbeat, and hits flash
    // through a soft ring-down so kicks punch without strobing.
    const breathTarget = 0.5 + m.swell * 0.82 + m.afterglow * 0.5;
    // Rise through builds a touch faster than the verse exhale.
    const breathTau = breathTarget > bloomBreathRef.current ? 0.2 : 0.55;
    bloomBreathRef.current +=
      (breathTarget - bloomBreathRef.current) * (1 - Math.exp(-dtImp / breathTau));

    if (m.impact > bloomHitRef.current) {
      bloomHitRef.current = m.impact;
    } else {
      bloomHitRef.current *= Math.exp(-dtImp / 0.3);
    }

    bloomEffect.intensity =
      (mv.bloomIntensity ?? resolvedBloomRef.current) *
      (bloomBreathRef.current +
        m.gather * 0.28 +
        bloomHitRef.current * 0.16 +
        bloomPulseEnvRef.current * 1.1 +
        flash * 0.6);
  });

  const tierBloom = tier === 'low' ? 0.8 : 1.1;
  const resolvedBloom = bloomIntensity ?? tierBloom;
  // Ref-mirror so the frame loop reads the latest slider value without
  // re-creating the closure.
  resolvedBloomRef.current = resolvedBloom;
  const level = Math.max(0, lightLevel);
  // High/mid tiers get the exact multiplicative exposure pass below. The
  // low tier has no composer, so approximate by scaling the scene lights —
  // shader presets won't dim there, but they won't bloom-blow-out either.
  const lowTierLightScale = tier === 'low' ? level : 1;

  return (
    <>
      <ambientLight intensity={0.28 * lowTierLightScale} />
      <pointLight
        ref={bassLight}
        position={[0, -1.5, 2]}
        color={palette.bass}
        intensity={1 * lowTierLightScale}
      />
      <pointLight
        ref={midLight}
        position={[2, 1, 1]}
        color={palette.mid}
        intensity={0.8 * lowTierLightScale}
      />
      <pointLight
        ref={highLight}
        position={[-2, 0.5, -1]}
        color={palette.high}
        intensity={0.6 * lowTierLightScale}
      />
      <spotLight
        position={[0, 4, 0]}
        angle={0.45}
        penumbra={0.8}
        intensity={0.4 * lowTierLightScale}
        color={palette.mid}
        distance={14}
      />

      <AuraLayer palette={palette} amount={aura} tier={tier} />

      {tier !== 'low' ? (
        <EffectComposer multisampling={tier === 'high' ? 4 : 0}>
          <primitive object={bloomEffect} dispose={null} />
          <LightLevel ref={lightLevelRef} level={level} />
          <Vignette eskil={false} offset={0.16} darkness={0.38} />
        </EffectComposer>
      ) : null}
    </>
  );
}

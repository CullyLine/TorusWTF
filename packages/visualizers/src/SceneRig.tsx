'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useFBO } from '@react-three/drei';
import { EffectComposer, Vignette } from '@react-three/postprocessing';
import { BloomEffect } from 'postprocessing';
import type { PerspectiveCamera, PointLight } from 'three';
import { useMetricsRef } from './metrics';
import { useModulation } from './modulation';
import { consumeCinematicCut, type VisualImpulses } from './impulse';
import { useAdvanceCameraZoom, useCameraZoomDistanceRef } from './cameraZoom';
import { NEUTRAL_ANIMA, updateAnima, type AnimaState } from './dsp/anima';
import type { CreaturePersonality } from './dsp/creature';
import { AuraLayer } from './AuraLayer';
import { LightLevel, type LightLevelEffectImpl } from './LightLevelEffect';
import { HighlightGuard } from './effects/HighlightGuardEffect';
import {
  calculateBoundedBloomIntensity,
  calculateFlashLightBoost,
  clampLightSignal,
  clampReactiveLightIntensity,
} from './effects/brightness';
import { ScreenStyleEffect } from './effects/ScreenStyleEffect';
import type { ScreenEffectId } from './effects/screenEffects';
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
/** Default look SmoothDamp — snappy enough for orbit/drift gaze. */
const LOOK_SPRING_SMOOTH = 0.14;
/**
 * Cinematic shot cuts jump look-at discontinuously; a longer SmoothDamp
 * (~0.28s) lets framing glide into each cut without a pop, while position
 * springs (CAMERA_SPRING_SMOOTH) still handle the body.
 */
const CINEMATIC_LOOK_SPRING_SMOOTH = 0.28;

/** Short SmoothDamp time for FOV punch — punchy but no per-frame stair-steps. */
const FOV_SPRING_SMOOTH = 0.09;

/**
 * Gentle SmoothDamp for Light-level musical breath — chorus lift and
 * afterglow linger, slower than FOV so exposure never flashes with kicks.
 */
const LIGHT_BREATH_SPRING_SMOOTH = 0.28;

/**
 * Short SmoothDamp for impact/bass shake amplitude — tracks kicks without
 * stair-stepping on raw envelope/FFT frames.
 */
const SHAKE_AMP_SPRING_SMOOTH = 0.08;

/**
 * Even shorter SmoothDamp for bass-rumble XYZ offsets applied after the pose
 * spring — keeps rumble fluid while still landing on the hit.
 */
const SHAKE_OFFSET_SPRING_SMOOTH = 0.055;

/**
 * Choreography leanIn / release Z dollies — longer than pose spring so
 * anticipation and drop exhales glide instead of stair-stepping desiredZ
 * through raw metric envelopes each frame. Quiet settles fully still.
 */
const CHOREO_Z_SPRING_SMOOTH = 0.22;

interface ScalarSpring {
  value: number;
  velocity: number;
  initialized: boolean;
}

function createScalarSpring(): ScalarSpring {
  return { value: 0, velocity: 0, initialized: false };
}

/**
 * Unity-style SmoothDamp (critically damped) for a scalar. Mutates spring
 * state. First call snaps to the target so values don't fly in on mount.
 * Near-zero targets settle fully still (no micro-crawl).
 */
function smoothDampScalar(
  state: ScalarSpring,
  target: number,
  dt: number,
  smoothTime: number,
  settleEpsilon = 1e-5,
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
  if (
    Math.abs(target) < settleEpsilon &&
    Math.abs(state.value) < settleEpsilon &&
    Math.abs(state.velocity) < settleEpsilon
  ) {
    state.value = 0;
    state.velocity = 0;
  }
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

/**
 * Snap a near-rest spring exactly onto its target so look stays still
 * between cinematic cuts (no micro-crawl from residual velocity).
 */
function settleSpring3(
  state: Spring3,
  tx: number,
  ty: number,
  tz: number,
  posEps = 2e-4,
  velEps = 2e-4,
): void {
  if (!state.initialized) return;
  if (
    Math.abs(state.x - tx) < posEps &&
    Math.abs(state.y - ty) < posEps &&
    Math.abs(state.z - tz) < posEps &&
    Math.abs(state.vx) < velEps &&
    Math.abs(state.vy) < velEps &&
    Math.abs(state.vz) < velEps
  ) {
    state.x = tx;
    state.y = ty;
    state.z = tz;
    state.vx = 0;
    state.vy = 0;
    state.vz = 0;
  }
}

const SCREEN_DEPTH_TEXTURE_SIZE = 384;

function ScreenStylePass({
  screenEffect,
  shaderMix,
}: {
  screenEffect: Exclude<ScreenEffectId, 'none'>;
  shaderMix: number;
}) {
  const mods = useModulation();
  const depthTarget = useFBO(SCREEN_DEPTH_TEXTURE_SIZE, SCREEN_DEPTH_TEXTURE_SIZE, {
    depth: true,
    samples: 0,
  });
  const effect = useMemo(
    () =>
      new ScreenStyleEffect(
        'none',
        0,
        depthTarget.depthTexture,
        0.1,
        1000,
        SCREEN_DEPTH_TEXTURE_SIZE,
      ),
    [depthTarget.depthTexture],
  );
  const renderDepthRef = useRef(false);

  useEffect(() => () => effect.dispose(), [effect]);

  // Update first so the following depth prepass can skip all creative work
  // whenever the effective wet amount is zero.
  useFrame((state) => {
    const wet = mods.current.shaderMix ?? shaderMix;
    effect.style = screenEffect;
    effect.mix = wet;
    effect.time = state.clock.elapsedTime;

    const camera = state.camera as PerspectiveCamera;
    effect.setCameraRange(camera.near, camera.far);
    renderDepthRef.current =
      wet > 0.001 &&
      screenEffect !== 'pixel8' &&
      !state.gl.getContext().isContextLost();
  });

  // A small fixed-size prepass supplies depth discontinuities without asking
  // postprocessing to blit multisampled depth (invalid on some WebGL2 drivers).
  useFrame((state) => {
    if (!renderDepthRef.current) return;
    const previousTarget = state.gl.getRenderTarget();
    state.gl.setRenderTarget(depthTarget);
    state.gl.clear();
    state.gl.render(state.scene, state.camera);
    state.gl.setRenderTarget(previousTarget);
  });

  return <primitive object={effect} dispose={null} />;
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
   */
  lightLevel?: number;
  /** Hue-preserving final-frame highlight compression. Default on. */
  highlightProtection?: boolean;
  /** Mutually-exclusive whole-frame post-processing style. */
  screenEffect?: ScreenEffectId;
  /** Screen style wet/dry amount, also available as a modulation target. */
  shaderMix?: number;
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
  highlightProtection = true,
  screenEffect = 'none',
  shaderMix = 1,
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
  const fovSpringRef = useRef<ScalarSpring>(createScalarSpring());
  // Light-level musical breath: swell/afterglow multiplier eases via SmoothDamp
  // on top of the user Light level baseline (baseline stays the floor).
  const lightBreathSpringRef = useRef<ScalarSpring>(createScalarSpring());
  // Impact/bass shake amp + post-pose rumble offsets — SmoothDamp so kick
  // rumble rides the sprung camera without envelope stair-steps.
  const shakeAmpSpringRef = useRef<ScalarSpring>(createScalarSpring());
  const modeShakeOffsetSpringRef = useRef<Spring3>(createSpring3());
  const bassShakeAmpSpringRef = useRef<ScalarSpring>(createScalarSpring());
  const bassShakeOffsetSpringRef = useRef<Spring3>(createSpring3());
  // leanIn / release Z choreography — SmoothDamp so build anticipation and
  // drop exhales glide; pose spring + shake SmoothDamp stay independent.
  const leanZSpringRef = useRef<ScalarSpring>(createScalarSpring());
  const releaseZSpringRef = useRef<ScalarSpring>(createScalarSpring());
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
      tier === 'low'
        ? null
        : new BloomEffect({
            intensity: 1,
            luminanceThreshold: 0.35,
            luminanceSmoothing: 0.55,
            mipmapBlur: true,
          }),
    [tier],
  );
  useEffect(() => () => bloomEffect?.dispose(), [bloomEffect]);
  const zoomDistanceRef = useCameraZoomDistanceRef();
  const advanceZoom = useAdvanceCameraZoom();
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
  /** Tracks cinematic shot index so look velocity resets on each cut. */
  const prevCinematicShotRef = useRef(-1);

  useFrame((state, delta) => {
    const m = metricsRef.current;
    // Modulation-matrix values (fall back to props when a key isn't routed).
    const mv = mods.current;
    const t = state.clock.elapsedTime;
    const dist = Math.max(0.3, mv.cameraDistance ?? cameraDistance);
    const bassShakeNow = mv.bassShake ?? bassShake;
    const lightLevelNow = Math.min(2, Math.max(0, mv.lightLevel ?? lightLevel));
    // Wheel/pinch write a zoom *target*; SmoothDamp eases distanceRef so
    // framing pulls feel fluid (no stair-steps) and settle cleanly at rest.
    if (advanceZoom) advanceZoom(delta);
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
      // Re-arm shot tracking when entering cinematic so the first shot
      // doesn't count as a cut.
      prevCinematicShotRef.current = -1;
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
          Math.min(1, impulses.bloomPulse),
        );
        impulses.bloomPulse = 0;
      }
      if (impulses.flash > 0.001) {
        flashEnvRef.current = Math.max(flashEnvRef.current, Math.min(1, impulses.flash));
        impulses.flash = 0;
      }
      consumeCinematicCut(impulses, cameraMode === 'cinematic', cinematicState.current);
    }
    camPunchEnvRef.current *= Math.exp(-dtImp / 0.22);
    bloomPulseEnvRef.current *= Math.exp(-dtImp / 0.35);
    flashEnvRef.current *= Math.exp(-dtImp / 0.16);
    const flash = flashEnvRef.current;

    // Light-level musical breath: choruses gently lift exposure via swell,
    // peaks linger on afterglow. SmoothDamp keeps the lift fluid — never a
    // kick strobe. Multiplier sits on the user Light level so the slider
    // still sets the floor (quiet ≈ 1×, loud lifts a notch).
    // LightLevel runs on every tier (including low), so the breath writes
    // the exposure pass directly — no need to bake into scene lights.
    const lightBreathTarget = 1 + m.swell * 0.14 + m.afterglow * 0.1;
    const lightBreath = smoothDampScalar(
      lightBreathSpringRef.current,
      lightBreathTarget,
      dtImp,
      LIGHT_BREATH_SPRING_SMOOTH,
    );
    const effectiveLightLevel = lightLevelNow * lightBreath;

    // Lights ride the pulse envelopes (impact rings down like a struck
    // bell, shimmer melts) so illumination lands with hits and glides to
    // rest instead of strobing on raw FFT flux. Colors are re-read every
    // frame so the living palette breathes through the lighting too.
    //
    // Kit accents: kick punches the bass light, snare cracks the mid light
    // laterally, hat ticks the high light — discrete drum answers on top of
    // the continuous swell/impact/shimmer ride. Envelopes already ring down,
    // so accents land as soft hits rather than strobing the whole stage.
    if (lightLevelRef.current) lightLevelRef.current.level = effectiveLightLevel;
    const bassSignal = clampLightSignal(m.bass);
    const midSignal = clampLightSignal(m.mid);
    const highSignal = clampLightSignal(m.high);
    const impactSignal = clampLightSignal(m.impact);
    const swellSignal = clampLightSignal(m.swell);
    const shimmerSignal = clampLightSignal(m.shimmer);
    const afterglowSignal = clampLightSignal(m.afterglow);
    const kickPunch = Math.min(1.2, clampLightSignal(m.kick));
    const snareCrack = Math.min(1.2, clampLightSignal(m.snare));
    const hatTick = Math.min(1.2, clampLightSignal(m.hat));
    const flashLightBoost = calculateFlashLightBoost(flash);
    if (bassLight.current) {
      bassLight.current.intensity = clampReactiveLightIntensity(
        0.55 +
          bassSignal * 2.4 +
          impactSignal * 2.2 +
          kickPunch * 1.6 +
          afterglowSignal * 0.7 +
          flashLightBoost,
      );
      bassLight.current.distance = 12 + clampLightSignal(m.breath) * 6 + kickPunch * 2.5;
      bassLight.current.color.set(palette.bass);
    }
    if (midLight.current) {
      midLight.current.intensity = clampReactiveLightIntensity(
        0.45 +
          midSignal * 2.0 +
          swellSignal * 0.8 +
          snareCrack * 1.8 +
          afterglowSignal * 0.4 +
          flashLightBoost,
      );
      // Lateral crack: snare snaps the mid light outward on its home axis
      // then the envelope eases it home — a sideways flash, not a strobe.
      midLight.current.position.set(2 + snareCrack * 0.85, 1 + snareCrack * 0.15, 1);
      midLight.current.color.set(palette.mid);
    }
    if (highLight.current) {
      highLight.current.intensity = clampReactiveLightIntensity(
        0.3 + highSignal * 1.6 + shimmerSignal * 1.9 + hatTick * 1.4 + flashLightBoost,
      );
      highLight.current.color.set(palette.high);
    }

    const dtCam = Math.min(Math.max(delta, 0), 0.05);
    // Mode shake amp (dive/drift): SmoothDamp the envelope so kicks rumble
    // without frame-to-frame chatter on raw impact/bass.
    const shakeTarget = m.impact * (embedded ? 0.05 : 0.085) + m.bass * 0.015;
    const shake = smoothDampScalar(
      shakeAmpSpringRef.current,
      shakeTarget,
      dtCam,
      SHAKE_AMP_SPRING_SMOOTH,
    );

    // Desired pose for this frame. Modes write here; the spring below eases
    // the real camera toward it so nothing teleports on mode changes.
    // Mode impact/bass shake XY(Z) offsets are SmoothDamp'd separately so
    // envelope chatter never writes desired pose raw.
    let desiredX = 0;
    let desiredY = 0;
    let desiredZ = baseZ;
    let lookTargetX = 0;
    let lookTargetY = 0;
    let lookTargetZ = 0;
    let shakeOxTarget = 0;
    let shakeOyTarget = 0;
    let shakeOzTarget = 0;

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
        shakeOxTarget = Math.sin(t * 12.1) * shake * 0.5;
        shakeOyTarget = Math.cos(t * 9.7) * shake * 0.35;
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
        const pacing = (mv.cinematicSpeed ?? cinematicSpeed) * (0.55 + m.sectionLevel * 0.6);
        const cine = updateCinematicCamera(cinematicState.current, t, m.bpm, pacing);
        desiredX = cine.pos.x * dist;
        desiredY = cine.pos.y * dist;
        desiredZ = cine.pos.z * dist;
        lookTargetX = cine.look.x;
        lookTargetY = cine.look.y;
        lookTargetZ = cine.look.z;
        // Shot cuts jump look discontinuously — zero look velocity so the
        // longer cinematic SmoothDamp eases framing in cleanly (~0.28s).
        if (prevCinematicShotRef.current !== cine.shotIndex) {
          if (prevCinematicShotRef.current >= 0) {
            lookSpringRef.current.vx = 0;
            lookSpringRef.current.vy = 0;
            lookSpringRef.current.vz = 0;
          }
          prevCinematicShotRef.current = cine.shotIndex;
        }
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
        desiredX = Math.sin(t * 0.21) * 0.3 * driftAmp;
        desiredY = Math.cos(t * 0.17) * 0.2 * driftAmp;
        desiredZ = baseZ * (1 - m.swell * 0.06) + Math.sin(t * 0.13) * 0.22 * driftAmp;
        shakeOxTarget = Math.sin(t * 18.7) * shake;
        shakeOyTarget = Math.cos(t * 14.3) * shake * 0.7;
        shakeOzTarget = Math.sin(t * 11.1) * shake * 0.4;
        break;
      }
    }
    prevFrameTime.current = t;

    {
      const modeOff = modeShakeOffsetSpringRef.current;
      springTo(
        modeOff,
        shakeOxTarget,
        shakeOyTarget,
        shakeOzTarget,
        dtCam,
        SHAKE_OFFSET_SPRING_SMOOTH,
      );
      if (
        shake === 0 &&
        Math.abs(modeOff.x) < 1e-5 &&
        Math.abs(modeOff.y) < 1e-5 &&
        Math.abs(modeOff.z) < 1e-5
      ) {
        modeOff.x = 0;
        modeOff.y = 0;
        modeOff.z = 0;
        modeOff.vx = 0;
        modeOff.vy = 0;
        modeOff.vz = 0;
      } else {
        desiredX += modeOff.x;
        desiredY += modeOff.y;
        desiredZ += modeOff.z;
      }
    }

    // Choreography — creature emotional motion. Independent of audio reactivity.
    // leanIn dollies camera inward; release dollies outward (the exhale);
    // holdBreath dampens motion (the listener's stillness). Targets are
    // SmoothDamp'd so envelope stair-steps never write desiredZ raw —
    // anticipation dollies and drop exhales glide; quiet settles still.
    const stillness = 1 - m.holdBreath * 0.85;
    const leanZ = smoothDampScalar(
      leanZSpringRef.current,
      -m.leanIn * 0.35,
      dtCam,
      CHOREO_Z_SPRING_SMOOTH,
    );
    const releaseZ = smoothDampScalar(
      releaseZSpringRef.current,
      m.release * 0.5,
      dtCam,
      CHOREO_Z_SPRING_SMOOTH,
    );
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
    // land. Amp and XYZ offsets both SmoothDamp — envelope stair-steps never
    // write the camera directly; quiet settles fully still.
    {
      const bassPunch = m.bass * 0.5 + m.impact * 1.3;
      const ampTarget =
        bassShakeNow > 0 ? bassShakeNow * bassPunch * (embedded ? 0.04 : 0.07) : 0;
      const amp = smoothDampScalar(
        bassShakeAmpSpringRef.current,
        ampTarget,
        dtCam,
        SHAKE_AMP_SPRING_SMOOTH,
      );
      // Two slightly desynced sines so it doesn't feel like a clean wave;
      // y dominates because real subs you feel in your chest vertically.
      const oxTarget = Math.sin(t * 63.1 + 1.7) * amp * 0.45;
      const oyTarget = Math.sin(t * 87.3) * amp;
      const ozTarget = Math.sin(t * 52.7 + 0.9) * amp * 0.3;
      const off = bassShakeOffsetSpringRef.current;
      springTo(off, oxTarget, oyTarget, ozTarget, dtCam, SHAKE_OFFSET_SPRING_SMOOTH);
      // Settle snap — once amp and offsets are near rest, kill residual crawl.
      if (
        amp === 0 &&
        Math.abs(off.x) < 1e-5 &&
        Math.abs(off.y) < 1e-5 &&
        Math.abs(off.z) < 1e-5
      ) {
        off.x = 0;
        off.y = 0;
        off.z = 0;
        off.vx = 0;
        off.vy = 0;
        off.vz = 0;
      } else {
        state.camera.position.x += off.x;
        state.camera.position.y += off.y;
        state.camera.position.z += off.z;
      }
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

    // Look-at SmoothDamp: cinematic cuts use a longer smooth-time so
    // framing glides (~0.28s); other modes keep the snappier default.
    const lookSmooth =
      cameraMode === 'cinematic' ? CINEMATIC_LOOK_SPRING_SMOOTH : LOOK_SPRING_SMOOTH;
    springTo(
      lookSpringRef.current,
      lookTargetX,
      lookTargetY,
      lookTargetZ,
      dtCam,
      lookSmooth,
    );
    settleSpring3(lookSpringRef.current, lookTargetX, lookTargetY, lookTargetZ);
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
      const nextFov = smoothDampScalar(
        fovSpringRef.current,
        targetFov,
        dtFov,
        FOV_SPRING_SMOOTH,
      );
      if (Math.abs(cam.fov - nextFov) > 0.005) {
        cam.fov = nextFov;
        cam.updateProjectionMatrix();
      }
    }

    if (bloomEffect) {
      // Bloom musical breath: choruses glow via swell, peaks linger on
      // afterglow, gather lifts just before the downbeat, and hits flash
      // through a soft ring-down so kicks punch without strobing.
      const breathTarget = 0.5 + swellSignal * 0.82 + afterglowSignal * 0.5;
      // Rise through builds a touch faster than the verse exhale.
      const breathTau = breathTarget > bloomBreathRef.current ? 0.2 : 0.55;
      bloomBreathRef.current +=
        (breathTarget - bloomBreathRef.current) * (1 - Math.exp(-dtImp / breathTau));

      if (impactSignal > bloomHitRef.current) {
        bloomHitRef.current = impactSignal;
      } else {
        bloomHitRef.current *= Math.exp(-dtImp / 0.3);
      }

      bloomEffect.intensity = calculateBoundedBloomIntensity({
        baseIntensity: mv.bloomIntensity ?? resolvedBloomRef.current,
        breath: bloomBreathRef.current,
        gather: m.gather,
        hit: bloomHitRef.current,
        bloomPulse: bloomPulseEnvRef.current,
        flash,
      });
    }
  });

  const tierBloom = tier === 'low' ? 0.8 : 1.1;
  const resolvedBloom = bloomIntensity ?? tierBloom;
  // Ref-mirror so the frame loop reads the latest slider value without
  // re-creating the closure.
  resolvedBloomRef.current = resolvedBloom;
  const level = Math.min(2, Math.max(0, lightLevel));

  return (
    <>
      <ambientLight intensity={0.28} />
      <pointLight
        ref={bassLight}
        position={[0, -1.5, 2]}
        color={palette.bass}
        intensity={1}
      />
      <pointLight
        ref={midLight}
        position={[2, 1, 1]}
        color={palette.mid}
        intensity={0.8}
      />
      <pointLight
        ref={highLight}
        position={[-2, 0.5, -1]}
        color={palette.high}
        intensity={0.6}
      />
      <spotLight
        position={[0, 4, 0]}
        angle={0.45}
        penumbra={0.8}
        intensity={0.4}
        color={palette.mid}
        distance={14}
      />

      <AuraLayer palette={palette} amount={aura} tier={tier} />

      {tier === 'low' ? (
        <EffectComposer multisampling={0}>
          <>
            <LightLevel ref={lightLevelRef} level={level} />
            {screenEffect !== 'none' ? (
              <ScreenStylePass screenEffect={screenEffect} shaderMix={shaderMix} />
            ) : null}
            <HighlightGuard enabled={highlightProtection} />
          </>
        </EffectComposer>
      ) : (
        <EffectComposer multisampling={tier === 'high' ? 4 : 0}>
          <>
            {bloomEffect ? <primitive object={bloomEffect} dispose={null} /> : null}
            <LightLevel ref={lightLevelRef} level={level} />
            <Vignette eskil={false} offset={0.16} darkness={0.38} />
            {screenEffect !== 'none' ? (
              <ScreenStylePass screenEffect={screenEffect} shaderMix={shaderMix} />
            ) : null}
            <HighlightGuard enabled={highlightProtection} />
          </>
        </EffectComposer>
      )}
    </>
  );
}

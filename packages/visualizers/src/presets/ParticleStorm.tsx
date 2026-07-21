'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';
import { useModulation } from '../modulation';
import {
  DEFAULT_FLOW_PARAMS,
  flowParamsFromMetrics,
  sampleFlow,
  type FlowParams,
  type Vec3Like,
} from '../dsp/flowfield';
import { getDotTexture } from '../dotTexture';

/** EMA toward target with separate rise/fall time constants. */
function smoothToward(
  current: number,
  target: number,
  dt: number,
  riseTau: number,
  fallTau: number,
): number {
  const tau = target > current ? riseTau : fallTau;
  const a = 1 - Math.exp(-dt / Math.max(1e-4, tau));
  return current + (target - current) * a;
}

/**
 * Soft rose-warm voice tint — gentle vocal passages bias the swarm warm
 * vs harsh instrumental, without washing out band identity.
 */
const VOCAL_WARM = new THREE.Color(1.0, 0.72, 0.58);
/** Peak lerp toward VOCAL_WARM when vocal + tenderness are both high. */
const VOCAL_WARMTH_MIX = 0.34;

/**
 * Particle Storm — curl-advected swarm with kit whip + phrase echo.
 *  - gather → contracts toward center (existing inhale)
 *  - kick → floor punch along Y
 *  - snare → lateral crack along X
 *  - hat → sparkle size-ticks
 *  - echo → one reverse swirl in post-phrase gaps
 *  - tenderness → calms swirl/jitter (gentle vocal hush)
 *  - vocalActivity → soft-warms particle tint (alive cohesion)
 */
export function ParticleStormScene({ analyser, palette, tier, speed = 1 }: VisualizerSceneProps) {
  const mods = useModulation();
  const ref = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.PointsMaterial>(null);
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const metricsRef = useMetricsRef();
  const baseCount = tier === 'high' ? 8000 : tier === 'mid' ? 3500 : 1200;
  // Flow Field Update: the storm rides the shared curl current.
  const flowParamsRef = useRef<FlowParams>({ ...DEFAULT_FLOW_PARAMS });
  const flowTimeRef = useRef(0);
  const flowScratch = useRef<Vec3Like>({ x: 0, y: 0, z: 0 });
  const scratchBass = useRef(new THREE.Color());
  const scratchMid = useRef(new THREE.Color());
  const scratchHigh = useRef(new THREE.Color());
  const scratchWarm = useRef(new THREE.Color());
  const sprite = useMemo(() => getDotTexture(), []);

  // Kit whip envelopes + one-shot phrase-echo reverse swirl.
  const kickSmooth = useRef(0);
  const snareSmooth = useRef(0);
  const hatSmooth = useRef(0);
  const echoSmooth = useRef(0);
  const echoTravel = useRef(1); // 0..1 traveling; >=1 idle
  const echoArmed = useRef(true);
  const prevEcho = useRef(0);

  // Tenderness calm + vocal warmth envelopes — fluid hush, not gated snaps.
  const tenderSmooth = useRef(0);
  const vocalSmooth = useRef(0);

  // Low tier keeps the gestures readable without strobing sparse points.
  const kitAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  const echoAmp = tier === 'low' ? 0.7 : tier === 'mid' ? 0.9 : 1;
  // Vocal tint softens on lower tiers so sparse points don't bloom muddy.
  const vocalAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;

  const { positions, velocities, phases, bands } = useMemo(() => {
    const p = new Float32Array(baseCount * 3);
    const v = new Float32Array(baseCount * 3);
    const ph = new Float32Array(baseCount);
    const b = new Uint8Array(baseCount);
    for (let i = 0; i < baseCount; i++) {
      p[i * 3] = (Math.random() - 0.5) * 6;
      p[i * 3 + 1] = (Math.random() - 0.5) * 6;
      p[i * 3 + 2] = (Math.random() - 0.5) * 6;
      v[i * 3] = (Math.random() - 0.5) * 0.02;
      v[i * 3 + 1] = (Math.random() - 0.5) * 0.02;
      v[i * 3 + 2] = (Math.random() - 0.5) * 0.02;
      ph[i] = Math.random();
      b[i] = i % 3;
    }
    return { positions: p, velocities: v, phases: ph, bands: b };
  }, [baseCount]);

  const colors = useMemo(() => {
    const c = new Float32Array(baseCount * 3);
    const bass = new THREE.Color(palette.bass);
    const mid = new THREE.Color(palette.mid);
    const high = new THREE.Color(palette.high);
    for (let i = 0; i < baseCount; i++) {
      // Color follows the particle's flow band so converging currents read
      // as converging colors.
      const color = bands[i] === 0 ? bass : bands[i] === 1 ? mid : high;
      c[i * 3] = color.r;
      c[i * 3 + 1] = color.g;
      c[i * 3 + 2] = color.b;
    }
    return c;
  }, [baseCount, palette, bands]);

  useFrame((_state, delta) => {
    const points = ref.current;
    const mat = matRef.current;
    if (!points || !mat) return;

    const m = metricsRef.current;
    const spd = mods.current.speed ?? speed;
    const dtClamped = Math.min(delta, 0.05);

    // Tenderness calm + vocal warmth (alive cohesion). Soft rise/fall so
    // the swarm eases into hush / warm tint instead of stepping.
    tenderSmooth.current = smoothToward(
      tenderSmooth.current,
      Math.min(1, m.tenderness),
      dtClamped,
      0.12,
      0.22,
    );
    vocalSmooth.current = smoothToward(
      vocalSmooth.current,
      Math.min(1, m.vocalActivity) * vocalAmp,
      dtClamped,
      0.1,
      0.28,
    );
    const tender = tenderSmooth.current;
    const vocal = vocalSmooth.current;
    // Gentle vocal passages hush swirl/jitter; kit punches stay on their own
    // envelopes so kick/snare/hat whip remain readable when drums speak.
    const calm = 1 - tender * 0.58;

    // The storm's rage follows the song's arc: valleys drift, peaks tear.
    // Live drums whip the wind beyond what raw band energy reports.
    // Tenderness eases section pace so intimate moments feel held, not torn.
    const sectionPace = (0.7 + m.sectionLevel * 0.5) * (1 - tender * 0.32);
    const drive =
      delta *
      spd *
      (0.15 + m.energy * 2.4 + m.impact * 3 + m.drumActivity * 0.8) *
      sectionPace *
      calm;
    const pulse = 1 + m.bass * 0.8 + m.impact * 0.55;
    const activeRatio = 0.35 + m.flow * 0.65;

    // Smooth kit envelopes so punches feel fluid, not gated snaps.
    kickSmooth.current = smoothToward(
      kickSmooth.current,
      Math.min(1.2, m.kick) * kitAmp,
      dtClamped,
      0.018,
      0.14,
    );
    snareSmooth.current = smoothToward(
      snareSmooth.current,
      Math.min(1.2, m.snare) * kitAmp,
      dtClamped,
      0.016,
      0.11,
    );
    hatSmooth.current = smoothToward(
      hatSmooth.current,
      Math.min(1.2, m.hat) * kitAmp,
      dtClamped,
      0.012,
      0.055,
    );

    // One reverse swirl per echo impulse — arm on quiet, fire on rise.
    echoSmooth.current = smoothToward(
      echoSmooth.current,
      m.echo * echoAmp,
      dtClamped,
      0.05,
      0.3,
    );
    const echoNow = echoSmooth.current;
    if (echoNow < 0.08) echoArmed.current = true;
    if (echoArmed.current && echoNow > 0.22 && prevEcho.current <= 0.22) {
      echoTravel.current = 0;
      echoArmed.current = false;
    }
    prevEcho.current = echoNow;
    if (echoTravel.current < 1) {
      const bpm = m.bpm ?? 120;
      echoTravel.current = Math.min(1, echoTravel.current + dtClamped * (0.85 + bpm / 180));
    }
    const traveling = echoTravel.current < 1;
    // Fades from full reverse (−1) back to forward (1) over the travel.
    const reverseAmt = traveling ? echoSmooth.current * (1 - echoTravel.current) : 0;
    const flowSign = 1 - reverseAmt * 2;

    // Shared flow current — same math as the Flow Field flagship.
    flowTimeRef.current += dtClamped * spd * (0.5 + Math.min(m.energy, 1.5) * 0.4) * flowSign;
    const fp = flowParamsFromMetrics(m, flowParamsRef.current);
    fp.time = flowTimeRef.current;
    // Tenderness softens fine curl detail + swirl (the storm hushes).
    fp.turbulence *= 1 - tender * 0.72;
    fp.swirl *= 1 - tender * 0.48;
    const flowAmount =
      dtClamped * (0.45 + m.swell * 0.7 + m.dropEvent * 1.2) * flowSign * (0.72 + 0.28 * calm);
    // Pre-beat gather: the swarm contracts toward center in the breath
    // before each predicted beat, then the hit flings it back out.
    const gatherPull = 1 - m.gather * dtClamped * 1.6;
    const fv = flowScratch.current;

    // Hat sparkle: sharp size ticks on top of swell/impact body size.
    mat.size = 0.045 + m.swell * 0.05 + m.impact * 0.04 + hatSmooth.current * 0.055;
    // Afterglow keeps the swarm faintly incandescent after big moments.
    mat.opacity = Math.min(1, 0.55 + m.swell * 0.4 + m.afterglow * 0.15 + hatSmooth.current * 0.12);

    const posAttr = points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const colorAttr = points.geometry.getAttribute('color') as THREE.BufferAttribute;
    const colArr = colorAttr.array as Float32Array;

    // Live palette: bands re-tint every frame so color life and palette
    // swaps reach every particle (the mount-time buffer would stay frozen).
    const bassC = scratchBass.current.set(palette.bass);
    const midC = scratchMid.current.set(palette.mid);
    const highC = scratchHigh.current.set(palette.high);
    // Vocal-warm bias: voice presence warms tint; tenderness deepens the mix
    // so gentle vocal verses read softer/warmer than harsh instrumental.
    const warmMix = Math.min(1, vocal * (0.28 + tender * 0.55)) * VOCAL_WARMTH_MIX;
    if (warmMix > 0.001) {
      const warm = scratchWarm.current.copy(VOCAL_WARM);
      bassC.lerp(warm, warmMix);
      midC.lerp(warm, warmMix);
      highC.lerp(warm, warmMix);
    }
    const bassGain = 1 + m.impact * 0.35 + kickSmooth.current * 0.25;
    const midGain = 1 + m.mid * 0.25 + snareSmooth.current * 0.3;
    const highGain = 1 + m.shimmer * 0.45 + hatSmooth.current * 0.55;

    // Kit punches: kick floors Y, snare cracks X — distinct axes.
    const kickY = kickSmooth.current * dtClamped * 5.2;
    const snareX = snareSmooth.current * dtClamped * 5.0;

    for (let i = 0; i < baseCount; i++) {
      const i3 = i * 3;
      const alive = phases[i]! < activeRatio;
      const band = bands[i]!;
      const color = band === 0 ? bassC : band === 1 ? midC : highC;
      const gain = (alive ? 1 : 0.3) * (band === 0 ? bassGain : band === 1 ? midGain : highGain);
      colArr[i3] = Math.min(1, color.r * gain);
      colArr[i3 + 1] = Math.min(1, color.g * gain);
      colArr[i3 + 2] = Math.min(1, color.b * gain);
      if (!alive) continue;

      let x = (arr[i3] ?? 0) + (velocities[i3] ?? 0) * pulse * drive * 40;
      let y = (arr[i3 + 1] ?? 0) + (velocities[i3 + 1] ?? 0) * pulse * drive * 40;
      let z = (arr[i3 + 2] ?? 0) + (velocities[i3 + 2] ?? 0) * pulse * drive * 40;
      // Advect through the band's current. Each band rides its own field
      // until convergence merges them into one collective stream.
      sampleFlow(fv, x, y, z, band, fp);
      x = (x + fv.x * flowAmount) * gatherPull;
      y = (y + fv.y * flowAmount) * gatherPull;
      z = (z + fv.z * flowAmount) * gatherPull;
      // Kick floor punch (down); snare lateral crack (phase-split L/R).
      y -= kickY;
      const lateral = phases[i]! > 0.5 ? 1 : -1;
      x += snareX * lateral;
      const dist = Math.hypot(x, y, z);
      if (dist > 5 + m.breath * 2) {
        x *= 0.45;
        y *= 0.45;
        z *= 0.45;
      }
      arr[i3] = x;
      arr[i3 + 1] = y;
      arr[i3 + 2] = z;
    }
    posAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
    // Echo reverse also flips the whole-cloud spin so the reverse swirl reads.
    // Tenderness already hushes via `drive * calm`; mid spin softens further.
    points.rotation.y += drive * (0.5 + m.mid * (1 - tender * 0.4)) * flowSign;
    points.rotation.x += m.impact * 0.05 + m.dropEvent * 0.02 + kickSmooth.current * 0.012;
    // Snare briefly tilts the storm on Z so the lateral crack owns the frame.
    points.rotation.z += snareSmooth.current * 0.018 * (snareSmooth.current > 0.15 ? 1 : 0);

    if (analyser) analyser.getFrequencyData(freqBuf.current);
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} count={baseCount} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} count={baseCount} />
      </bufferGeometry>
      <pointsMaterial
        ref={matRef}
        size={0.055}
        map={sprite}
        sizeAttenuation
        transparent
        vertexColors
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

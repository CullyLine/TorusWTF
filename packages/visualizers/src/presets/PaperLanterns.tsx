'use client';

/**
 * Paper Lanterns — night flotilla of glowing paper lanterns over dark water.
 * Musical anatomy:
 *  - swell → sustained loft + warmer glow through choruses
 *  - kick → flame flare + buoyant lift surge (inertial, never a snap)
 *  - snare → lateral gust that sways the flotilla
 *  - hat → sparse ember ticks on selected lanterns
 *  - gather → draw lanterns toward center before the beat
 *  - tenderness → honey-warm soften (gentler bob, milkier glow)
 *  - holdBreath / deep silence → hang mid-rise, dim flames to embers,
 *    calm water toward glass; thaw upward on the music's return
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';
import { useModulation } from '../modulation';
import { getDotTexture } from '../dotTexture';

const COUNT_HIGH = 160;
const COUNT_MID = 90;
const COUNT_LOW = 48;

const WATER_Y = -1.85;
const Y_MIN = WATER_Y + 0.35;
const Y_MAX = 2.75;
const Y_SPAN = Y_MAX - Y_MIN;

function smoothToward(
  current: number,
  target: number,
  dt: number,
  riseTau: number,
  fallTau: number,
) {
  const tau = target > current ? riseTau : fallTau;
  const k = 1 - Math.exp(-dt / Math.max(tau, 1e-4));
  return current + (target - current) * k;
}

function hash01(n: number) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

export function PaperLanternsScene({ analyser, palette, tier, speed = 1 }: VisualizerSceneProps) {
  const mods = useModulation();
  const lanternRef = useRef<THREE.Points>(null);
  const lanternMatRef = useRef<THREE.PointsMaterial>(null);
  const mirrorRef = useRef<THREE.Points>(null);
  const mirrorMatRef = useRef<THREE.PointsMaterial>(null);
  const waterMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const metricsRef = useMetricsRef();

  const baseCount = tier === 'high' ? COUNT_HIGH : tier === 'mid' ? COUNT_MID : COUNT_LOW;
  // Mid keeps every reflection; low keeps every other — simpler water glow.
  const mirrorStride = tier === 'low' ? 2 : 1;
  const mirrorCount = Math.ceil(baseCount / mirrorStride);
  const kitAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  const stillAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;

  const scratchBass = useRef(new THREE.Color());
  const scratchMid = useRef(new THREE.Color());
  const scratchHigh = useRef(new THREE.Color());
  const scratchHoney = useRef(new THREE.Color(1, 0.72, 0.38));
  const scratchFlame = useRef(new THREE.Color(1, 0.88, 0.55));
  // Residual ember heat — holdBreath milks flames toward quiet coals.
  const scratchEmber = useRef(new THREE.Color(0.22, 0.1, 0.05));
  // Cool glass bed under the flotilla when the water hushes.
  const scratchGlass = useRef(new THREE.Color(0.03, 0.05, 0.08));
  const scratchMix = useRef(new THREE.Color());
  const scratchWater = useRef(new THREE.Color(0.02, 0.04, 0.07));

  const gatherSmooth = useRef(0);
  const kickSmooth = useRef(0);
  const snareSmooth = useRef(0);
  const hatSmooth = useRef(0);
  const swellSmooth = useRef(0.15);
  const tenderSmooth = useRef(0);
  const afterglowSmooth = useRef(0);
  // Hold-breath / deep-silence listen gate — hang/thaw without pops.
  const stillnessSmooth = useRef(0);
  const timeRef = useRef(0);

  // Per-lantern buoyant vertical velocity — inertia lives here.
  const liftVel = useRef(new Float32Array(baseCount));
  const swayVel = useRef(new Float32Array(baseCount * 2));

  const sprite = useMemo(() => getDotTexture(), []);

  const reducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const { positions, phases, sizes, bands, homeR, homeAng } = useMemo(() => {
    const p = new Float32Array(baseCount * 3);
    const ph = new Float32Array(baseCount);
    const sz = new Float32Array(baseCount);
    const b = new Uint8Array(baseCount);
    const hr = new Float32Array(baseCount);
    const ha = new Float32Array(baseCount);
    for (let i = 0; i < baseCount; i++) {
      const seed = i * 1.6180339887;
      const r = 0.35 + Math.sqrt(hash01(seed + 0.11)) * 2.55;
      const ang = hash01(seed + 0.37) * Math.PI * 2;
      hr[i] = r;
      ha[i] = ang;
      p[i * 3] = Math.cos(ang) * r;
      p[i * 3 + 1] = Y_MIN + hash01(seed + 0.71) * Y_SPAN;
      p[i * 3 + 2] = Math.sin(ang) * r * 0.88;
      ph[i] = hash01(seed + 2.3);
      b[i] = i % 3;
      // Lanterns read as soft orbs — larger than ash, varied silhouette.
      sz[i] = 0.85 + hash01(seed + 2.9) * 1.35;
    }
    liftVel.current = new Float32Array(baseCount);
    swayVel.current = new Float32Array(baseCount * 2);
    return { positions: p, phases: ph, sizes: sz, bands: b, homeR: hr, homeAng: ha };
  }, [baseCount]);

  const colors = useMemo(() => {
    const c = new Float32Array(baseCount * 3);
    const bass = new THREE.Color(palette.bass);
    const mid = new THREE.Color(palette.mid);
    const high = new THREE.Color(palette.high);
    const honey = new THREE.Color(1, 0.72, 0.38);
    for (let i = 0; i < baseCount; i++) {
      const band = bands[i]!;
      const base = band === 0 ? bass : band === 1 ? mid : high;
      const warm = base.clone().lerp(honey, 0.5 + (phases[i] ?? 0) * 0.22);
      c[i * 3] = warm.r;
      c[i * 3 + 1] = warm.g;
      c[i * 3 + 2] = warm.b;
    }
    return c;
  }, [baseCount, palette, bands, phases]);

  const mirrorPositions = useMemo(() => new Float32Array(mirrorCount * 3), [mirrorCount]);
  const mirrorColors = useMemo(() => new Float32Array(mirrorCount * 3), [mirrorCount]);

  useFrame((_state, delta) => {
    const lanterns = lanternRef.current;
    const lanternMat = lanternMatRef.current;
    const mirrors = mirrorRef.current;
    const mirrorMat = mirrorMatRef.current;
    if (!lanterns || !lanternMat) return;

    const m = metricsRef.current;
    const dt = Math.min(delta, 0.05);
    const pace = Math.max(0.05, mods.current.speed ?? speed);
    const calm = reducedMotion ? 0.4 : 1;
    const sectionPace = 0.78 + m.sectionLevel * 0.4;

    // Hold-breath stillness: the flotilla listens instead of rising through quiet.
    // Rise a touch slower than fall so the hang feels attentive; thaw promptly
    // when music returns so kit / gather / tenderness still fire.
    const stillnessTarget =
      Math.min(
        1,
        Math.max(m.holdBreath, m.silence * 0.92) + Math.min(m.holdBreath, m.silence) * 0.15,
      ) * stillAmp;
    stillnessSmooth.current = smoothToward(
      stillnessSmooth.current,
      stillnessTarget,
      dt,
      0.14,
      0.08,
    );
    const stillness = stillnessSmooth.current;
    // Nearly freeze continuous loft / bob / drift / yaw; leave a whisper so thaw never pops.
    const motionMul = 1 - stillness * 0.9;

    // Continuous clock freezes with the hang; kit envelopes stay on full dt.
    timeRef.current += dt * pace * sectionPace * calm * motionMul;

    gatherSmooth.current = smoothToward(gatherSmooth.current, m.gather, dt, 0.04, 0.14);
    swellSmooth.current = smoothToward(swellSmooth.current, m.swell, dt, 0.12, 0.45);
    kickSmooth.current = smoothToward(
      kickSmooth.current,
      Math.min(1.2, m.kick) * kitAmp,
      dt,
      0.025,
      0.14,
    );
    snareSmooth.current = smoothToward(
      snareSmooth.current,
      Math.min(1.2, m.snare) * kitAmp,
      dt,
      0.02,
      0.12,
    );
    hatSmooth.current = smoothToward(
      hatSmooth.current,
      Math.min(1.2, m.hat * 0.95 + m.shimmer * 0.22) * kitAmp,
      dt,
      0.025,
      0.1,
    );
    // Tenderness gentles — slow rise, softer fall so honey linger reads.
    tenderSmooth.current = smoothToward(tenderSmooth.current, m.tenderness, dt, 0.12, 0.22);
    afterglowSmooth.current = smoothToward(afterglowSmooth.current, m.afterglow, dt, 0.18, 0.8);

    const gather = gatherSmooth.current;
    const kick = kickSmooth.current;
    const snare = snareSmooth.current;
    const hat = hatSmooth.current;
    const swell = swellSmooth.current;
    const tender = tenderSmooth.current;
    const afterglow = afterglowSmooth.current;

    // Continuous loft: swell sustains — motionMul hangs the flotilla mid-rise.
    // Kick surge stays ungated so drum hits still punch through the thaw.
    const targetLift =
      (0.22 + swell * 0.55 + m.energy * 0.18 + m.bass * 0.1) *
      pace *
      sectionPace *
      calm *
      motionMul *
      (1 - gather * 0.55) *
      (1 - tender * 0.38);
    const kickLift = kick * 0.95 * pace * sectionPace * calm;

    // Embers dim: size + opacity ease down while suspended, then rekindle on thaw.
    const emberDim = 1 - stillness * 0.48;
    lanternMat.size =
      (0.095 + swell * 0.035 + kick * 0.055 + afterglow * 0.02) *
      (0.92 + kitAmp * 0.08) *
      (1 - tender * 0.12) *
      (0.72 + emberDim * 0.28);
    lanternMat.opacity = Math.min(
      1,
      (0.72 + swell * 0.18 + kick * 0.14 + afterglow * 0.1) * emberDim,
    );

    if (mirrorMat) {
      mirrorMat.size = lanternMat.size * 0.78;
      mirrorMat.opacity = Math.min(
        0.55,
        (0.28 + swell * 0.12 + kick * 0.1) *
          (tier === 'low' ? 0.7 : 1) *
          (1 - tender * 0.15) *
          emberDim,
      );
    }

    const waterMat = waterMatRef.current;
    if (waterMat) {
      const waterC = scratchWater.current.setRGB(0.02, 0.04, 0.07);
      // Honey tenderness milk-warms the water film slightly.
      waterC.offsetHSL(0.02 * tender, 0.08 * tender, 0.04 * tender);
      // holdBreath: cool glass hush — distinct from honey tenderness.
      waterC.lerp(scratchGlass.current, stillness * 0.72);
      waterMat.color.copy(waterC);
      waterMat.opacity =
        (0.55 + swell * 0.08 + tender * 0.06) * (1 - stillness * 0.18) + stillness * 0.68;
    }

    const posAttr = lanterns.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const colorAttr = lanterns.geometry.getAttribute('color') as THREE.BufferAttribute;
    const colArr = colorAttr.array as Float32Array;

    const bassC = scratchBass.current.set(palette.bass);
    const midC = scratchMid.current.set(palette.mid);
    const highC = scratchHigh.current.set(palette.high);
    const honeyC = scratchHoney.current.setRGB(1, 0.72, 0.38);
    const flameC = scratchFlame.current.setRGB(1, 0.88, 0.55);
    const emberC = scratchEmber.current.setRGB(0.22, 0.1, 0.05);
    const mixC = scratchMix.current;
    const t = timeRef.current;

    const vy = liftVel.current;
    const sway = swayVel.current;
    const gatherPull = 1 - gather * dt * 1.85;

    let mirrorIdx = 0;
    const mirrorArr = mirrors
      ? ((mirrors.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array)
      : null;
    const mirrorColArr = mirrors
      ? ((mirrors.geometry.getAttribute('color') as THREE.BufferAttribute).array as Float32Array)
      : null;

    for (let i = 0; i < baseCount; i++) {
      const i3 = i * 3;
      const phase = phases[i]!;
      const band = bands[i]!;
      const sizeMul = sizes[i]!;

      let x = arr[i3] ?? 0;
      let y = arr[i3 + 1] ?? 0;
      let z = arr[i3 + 2] ?? 0;

      // Buoyant inertia: continuous loft hangs under stillness; kick stays ungated.
      const personalTarget =
        (targetLift + kickLift) * (0.7 + sizeMul * 0.35) * (0.85 + phase * 0.3);
      vy[i] = smoothToward(vy[i] ?? 0, personalTarget, dt, 0.18, 0.28);
      y += (vy[i] ?? 0) * dt * 1.15;

      // Soft bob — tenderness gentles amplitude; holdBreath nearly freezes it.
      const bobAmp = (0.035 + swell * 0.02) * (1 - tender * 0.55) * motionMul;
      const bob =
        Math.sin(t * (0.85 + phase * 1.1) + phase * 14.0) * bobAmp +
        Math.sin(t * (1.35 + phase * 0.6) + phase * 6.2) * bobAmp * 0.45;
      y += bob * dt * 8;

      // Snare lateral gust — inertial sway vel, not a hard displace (ungated).
      const gustTargetX = snare * (i & 1 ? 1 : -1) * (0.9 + phase * 0.5) * 1.8 * pace * calm;
      const gustTargetZ = snare * (phase > 0.5 ? 1 : -1) * 0.55 * pace * calm;
      sway[i * 2] = smoothToward(sway[i * 2] ?? 0, gustTargetX, dt, 0.04, 0.16);
      sway[i * 2 + 1] = smoothToward(sway[i * 2 + 1] ?? 0, gustTargetZ, dt, 0.04, 0.16);
      x += (sway[i * 2] ?? 0) * dt;
      z += (sway[i * 2 + 1] ?? 0) * dt;

      // Idle drift — living, never thrash; hangs with holdBreath.
      const drift =
        Math.sin(t * (0.35 + phase * 0.4) + phase * 9.0) *
        (0.008 + m.mid * 0.01) *
        (1 - tender * 0.4) *
        motionMul;
      x += drift * pace * calm;
      z +=
        Math.cos(t * (0.28 + phase * 0.35) + phase * 5.0) *
        (0.006 + m.mid * 0.008) *
        pace *
        calm *
        motionMul;

      // Gather inhale toward flotilla center.
      x *= gatherPull;
      z *= gatherPull;
      const homePull = gather * dt * 0.9;
      const hx = Math.cos(homeAng[i]!) * (homeR[i]! * (1 - gather * 0.55));
      const hz = Math.sin(homeAng[i]!) * (homeR[i]! * 0.88 * (1 - gather * 0.55));
      x += (hx - x) * homePull;
      z += (hz - z) * homePull;

      // Recycle past the top — soft respawn just above the water.
      if (y > Y_MAX || Math.hypot(x, z) > 3.8) {
        const seed = i * 1.6180339887 + t * 0.01;
        const r = 0.35 + Math.sqrt(hash01(seed + 0.11)) * 2.4;
        const ang = hash01(seed + 0.37) * Math.PI * 2;
        x = Math.cos(ang) * r;
        y = Y_MIN + hash01(seed + 0.71) * 0.25;
        z = Math.sin(ang) * r * 0.88;
        vy[i] = personalTarget * 0.35;
        homeR[i] = r;
        homeAng[i] = ang;
      }

      // Keep lanterns above the water line.
      if (y < Y_MIN) y = Y_MIN + hash01(phase * 11.3) * 0.05;

      arr[i3] = x;
      arr[i3 + 1] = y;
      arr[i3 + 2] = z;

      const baseCol = band === 0 ? bassC : band === 1 ? midC : highC;
      mixC.copy(baseCol).lerp(honeyC, 0.42 + phase * 0.2 + afterglow * 0.25 + tender * 0.35);
      // Kick flares the flame toward pale gold.
      mixC.lerp(flameC, Math.min(0.75, kick * 0.55 + swell * 0.12));
      // Hold-breath embers: milk the flame toward residual coal heat
      // (distinct from tenderness honey-warm, which stays in the blend above).
      mixC.lerp(emberC, stillness * 0.62);

      const heightGlow = 0.78 + ((y - Y_MIN) / Y_SPAN) * 0.4;
      const tickSelect = hash01(phase * 17.13 + i * 0.31) > 0.68 ? 1 : 0;
      const sparkle = 1 + tickSelect * hat * (1.15 + m.shimmer * 0.35);
      const flameGain = 1 + kick * (0.35 + (band === 0 ? 0.2 : 0.05));
      const gain =
        heightGlow *
        sparkle *
        flameGain *
        (0.88 + swell * 0.22) *
        (1 - tender * 0.12) *
        (0.95 + afterglow * 0.12) *
        (1 - stillness * 0.42);

      colArr[i3] = Math.min(1, mixC.r * gain);
      colArr[i3 + 1] = Math.min(1, mixC.g * gain);
      colArr[i3 + 2] = Math.min(1, mixC.b * gain);

      // Mirrored water glow — rippled by swell, calmed to glass on holdBreath.
      if (mirrorArr && mirrorColArr && i % mirrorStride === 0 && mirrorIdx < mirrorCount) {
        const mi3 = mirrorIdx * 3;
        const ripple =
          (Math.sin(t * (0.7 + phase) + x * 1.4 + z * 1.1) * (0.04 + swell * 0.06) +
            Math.sin(t * 1.1 + z * 1.8) * snare * 0.05) *
          motionMul;
        mirrorArr[mi3] = x + ripple;
        mirrorArr[mi3 + 1] = WATER_Y - (y - WATER_Y) * 0.55 - 0.08;
        mirrorArr[mi3 + 2] = z + ripple * 0.6;
        const dim = (0.42 + swell * 0.12 + kick * 0.1) * (1 - stillness * 0.28);
        mirrorColArr[mi3] = Math.min(1, colArr[i3]! * dim * (0.85 + tender * 0.2));
        mirrorColArr[mi3 + 1] = Math.min(1, colArr[i3 + 1]! * dim * 0.9);
        mirrorColArr[mi3 + 2] = Math.min(1, colArr[i3 + 2]! * dim * 0.75);
        mirrorIdx += 1;
      }
    }

    posAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
    if (mirrors && mirrorArr && mirrorColArr) {
      (mirrors.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      (mirrors.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    }

    // Slow flotilla yaw — alive without spinning like a storm; freezes with holdBreath.
    lanterns.rotation.y +=
      dt *
      pace *
      calm *
      motionMul *
      (0.03 + m.mid * 0.025 + swell * 0.015) *
      (1 - tender * 0.35);
    if (mirrors) mirrors.rotation.y = lanterns.rotation.y;

    if (analyser) analyser.getFrequencyData(freqBuf.current);
  });

  return (
    <group>
      {/* Dark water plane — reflections read against it. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, WATER_Y, 0]}>
        <planeGeometry args={[12, 12, 1, 1]} />
        <meshBasicMaterial
          ref={waterMatRef}
          color="#050a12"
          transparent
          opacity={0.58}
          depthWrite={false}
        />
      </mesh>

      <points ref={lanternRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} count={baseCount} />
          <bufferAttribute attach="attributes-color" args={[colors, 3]} count={baseCount} />
        </bufferGeometry>
        <pointsMaterial
          ref={lanternMatRef}
          size={0.11}
          map={sprite}
          sizeAttenuation
          transparent
          vertexColors
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      <points ref={mirrorRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[mirrorPositions, 3]}
            count={mirrorCount}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[mirrorColors, 3]}
            count={mirrorCount}
          />
        </bufferGeometry>
        <pointsMaterial
          ref={mirrorMatRef}
          size={0.085}
          map={sprite}
          sizeAttenuation
          transparent
          vertexColors
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}

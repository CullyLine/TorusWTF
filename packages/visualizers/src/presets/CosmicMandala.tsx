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

const FOLDS = 8;

/**
 * Cosmic Mandala — sacred nested wire tori + shimmer halo.
 *
 * Soft-metric gestures (NS-20260727-05):
 *  - `holdBreath` / deep silence → ease ring/halo rotation to a suspended
 *    pause; hat ticks hold. Kit punches stay live so the thaw reads.
 *  - `leanIn` → draw the mandala nearer and tighten outer-ring spacing
 *    with pre-chorus anticipation (distinct from gather's whole-scale inhale).
 *
 * Build / clock (NS-20260801-09):
 *  - `tension` → darken the field and coil ring spacing tighter/sharper as the
 *    build climbs; spring loose on `dropEvent` / release (distinct from leanIn
 *    approach and gather's whole-scale inhale).
 *  - `barPhase` → phase-lock the slow shimmer-halo rotation to the bar clock
 *    (continuous unwrap, no stepping) so the mandala turns with the music.
 *
 * Gather inhale, kit split, phrase-echo shimmer reverse, and vocal rim /
 * tenderness soften stay ungated and distinct.
 */

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

export function CosmicMandalaScene({ analyser, palette, tier, speed = 1 }: VisualizerSceneProps) {
  const mods = useModulation();
  const groupRef = useRef<THREE.Group>(null);
  const ringsRef = useRef<THREE.Group>(null);
  const shimmerRef = useRef<THREE.Points>(null);
  const shimmerMatRef = useRef<THREE.PointsMaterial>(null);
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const metricsRef = useMetricsRef();
  const pulseRef = useRef(0);
  const vocalSmooth = useRef(0);
  const tenderSmooth = useRef(0);
  const stillnessSmooth = useRef(0);
  const leanSmooth = useRef(0);
  const tensionSmooth = useRef(0);
  /** Continuous unwrapped bar phase (turns + phase) for halo lock. */
  const barTurnsRef = useRef(0);
  const prevBarPhaseRef = useRef(0);
  /** Smoothed absolute shimmer Y under bar lock (radians). */
  const barHaloYRef = useRef(0);
  /** Residual freewheel spin layered under / instead of bar lock. */
  const freeHaloYRef = useRef(0);
  /** Tracks whether last frame had a known BPM (enter/exit lock without snap). */
  const hadBpmRef = useRef(false);
  const scratchColor = useRef(new THREE.Color());
  const scratchDark = useRef(new THREE.Color());
  const sprite = useMemo(() => getDotTexture(), []);

  const layerCount = tier === 'high' ? 7 : tier === 'mid' ? 5 : 3;
  const shimmerCount = tier === 'high' ? 900 : tier === 'mid' ? 420 : 180;
  // Vocal rim amp softens on lower tiers so mid/low stay readable without bloom blowout.
  const vocalAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  // HoldBreath / leanIn amp — low tier still pauses and approaches, just softer.
  const stillAmp = tier === 'high' ? 1 : tier === 'mid' ? 0.9 : 0.75;
  const leanAmp = tier === 'low' ? 0.7 : tier === 'mid' ? 0.9 : 1;
  // Tension / bar-lock amp — mid/low still coil and clock, just softer.
  const tensionAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  const barAmp = tier === 'low' ? 0.7 : tier === 'mid' ? 0.9 : 1;
  // Flow Field Update: the shimmer halo is advected through the shared curl
  // current with a spring back to its home ring — fluid swirl, stable form.
  const flowParamsRef = useRef<FlowParams>({ ...DEFAULT_FLOW_PARAMS });
  const flowTimeRef = useRef(0);
  const flowScratch = useRef<Vec3Like>({ x: 0, y: 0, z: 0 });

  const { shimmerPos, shimmerHome } = useMemo(() => {
    const p = new Float32Array(shimmerCount * 3);
    const home = new Float32Array(shimmerCount * 3);
    for (let i = 0; i < shimmerCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 2.2 + Math.random() * 1.4;
      p[i * 3] = Math.cos(a) * r;
      p[i * 3 + 1] = (Math.random() - 0.5) * 0.25;
      p[i * 3 + 2] = Math.sin(a) * r;
      home[i * 3] = p[i * 3]!;
      home[i * 3 + 1] = p[i * 3 + 1]!;
      home[i * 3 + 2] = p[i * 3 + 2]!;
    }
    return { shimmerPos: p, shimmerHome: home };
  }, [shimmerCount]);

  useFrame((_state, delta) => {
    const root = groupRef.current;
    const rings = ringsRef.current;
    const shimmer = shimmerRef.current;
    const shimmerMat = shimmerMatRef.current;
    if (!root || !rings) return;

    const m = metricsRef.current;
    const spd = mods.current.speed ?? speed;
    const dt = Math.min(delta, 0.05);
    pulseRef.current = Math.max(0, pulseRef.current - delta * 2.5);
    if (m.impact > 0.55) pulseRef.current = 1;

    // Hold-breath stillness: the mandala listens — rings pause, halo ticks hold.
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
    const motionMul = 1 - stillness * 0.92;
    // Hats gate under stillness so halo ticks hang; kick/snare stay live for thaw.
    const hatMul = 1 - stillness * 0.95;

    // LeanIn: fast climb into anticipation, slower release into the drop.
    // Soften only a little under holdBreath so approach still reads through hush.
    leanSmooth.current = smoothToward(
      leanSmooth.current,
      Math.min(1, m.leanIn) * leanAmp,
      dt,
      0.06,
      0.18,
    );
    const lean = leanSmooth.current * (1 - stillness * 0.35);

    // Tension coil: climb with the build, spring loose on the drop — never a snap.
    // Soft under stillness so a held quiet bar still owns the hush.
    let tensionTarget = Math.min(1, m.tension) * tensionAmp * (1 - stillness * 0.3);
    if (m.dropEvent > 0.4 || m.release > 0.55) tensionTarget = 0;
    tensionSmooth.current = smoothToward(
      tensionSmooth.current,
      tensionTarget,
      dt,
      0.1,
      0.22,
    );
    // Drop punches the spring open so the coil releases with the hit.
    if (m.dropEvent > 0.45) {
      tensionSmooth.current = smoothToward(tensionSmooth.current, 0, dt, 0.05, 0.05);
    }
    const tension = tensionSmooth.current;

    // Continuous bar unwrap for halo phase-lock (no 0→1 step).
    const bpmKnown = Boolean(m.bpm && m.bpm > 30);
    const barPhase = bpmKnown ? Math.min(1, Math.max(0, m.barPhase)) : 0;
    if (bpmKnown) {
      if (prevBarPhaseRef.current - barPhase > 0.5) {
        barTurnsRef.current += 1;
      }
      prevBarPhaseRef.current = barPhase;
    }
    // Bar breath modulates whole-mandala freewheel so the wheel inhales with the bar.
    const barBreath = bpmKnown ? Math.sin(barPhase * Math.PI * 2) : 0;

    // Vocal rim: voice presence deepens the outer sacred ring; tenderness
    // softens that rim-vs-core contrast so quiet verses glow gently.
    vocalSmooth.current = smoothToward(
      vocalSmooth.current,
      Math.min(1, m.vocalActivity) * vocalAmp,
      dt,
      0.1,
      0.28,
    );
    tenderSmooth.current = smoothToward(
      tenderSmooth.current,
      Math.min(1, m.tenderness),
      dt,
      0.12,
      0.3,
    );
    const vocal = vocalSmooth.current;
    const tender = tenderSmooth.current;
    // Tenderness softens rim contrast (vocal punch + outer/inner lift).
    const rimSoft = 1 - tender * 0.62;

    // Tenderness slows the wheel and softens the breath — vocal-led quiet
    // passages read as meditation, not machinery. Section level paces the
    // whole mandala with the song's arc.
    const soften = 1 - m.tenderness * 0.3;
    const sectionPace = (0.72 + m.sectionLevel * 0.5) * soften;

    // Gather: whole mandala inhales before the predicted beat, then the
    // existing impact/bass breath reads as the release.
    // LeanIn presence is Z approach + ring spacing (below) — never replaces gather.
    const gatherSqueeze = 1 - m.gather * 0.14;
    const breath =
      (1 + m.bass * 0.22 + m.swell * 0.12 + m.impact * 0.14 * soften) * gatherSqueeze;
    root.scale.setScalar(breath);
    // Draw nearer on leanIn — mild camera-ward pull, distinct from gather squeeze.
    root.position.z = -lean * 0.48;
    // Whole-mandala spin: now picks up mid + high + impact so the wheel
    // visibly turns at normal listening gain instead of waiting for the
    // user to crank everything to mad-scientist mode.
    // motionMul nearly freezes the wheel on holdBreath (no snap).
    // barBreath gently paces the freewheel so the mandala turns with the clock.
    root.rotation.y +=
      delta *
      spd *
      (0.18 + m.mid * 0.65 + m.high * 0.28 + m.impact * 0.5) *
      sectionPace *
      motionMul *
      (1 + barBreath * 0.28 * barAmp);

    // Rings follow the living palette: color assignments happen every frame
    // (the JSX material color would otherwise stay frozen at mount).
    // Kit split: kick pulses the inner rings; snare cracks the outer ones.
    const ringDenom = Math.max(1, layerCount - 1);
    const c = scratchColor.current;
    rings.children.forEach((child, i) => {
      const outerness = i / ringDenom;
      const innerness = 1 - outerness;
      const kickPulse = Math.min(1.2, m.kick) * innerness;
      const snareCrack = Math.min(1.2, m.snare) * outerness;
      // Squared outerness biases vocal deepen/thicken to the outer rim + halo.
      const rimWeight = outerness * outerness;
      const vocalRim = vocal * rimWeight;
      // Per-ring spin: was 0.12 + i*0.04 + m.mid*0.5. That made the inner
      // rings barely turn unless gain was huge. Tripled the music-driven
      // term and added high + impact so each ring flies on energy.
      const spin =
        (0.22 +
          i * 0.05 +
          m.mid * 1.7 +
          m.high * 0.95 +
          m.impact * 0.6 +
          snareCrack * 1.1 +
          kickPulse * 0.55) *
        sectionPace;
      // Continuous spin hushes under holdBreath; kit scale pulses stay ungated.
      child.rotation.z += delta * spd * spin * (i % 2 === 0 ? 1 : -1) * motionMul;
      child.rotation.x =
        Math.sin(_state.clock.elapsedTime * 0.4 + i) *
          (m.high * 0.35 + m.mid * 0.12) *
          motionMul +
        snareCrack * 0.08;
      // Kick: inner rings bloom outward; snare: outer rings briefly flare.
      // Vocal: outer rim thickens slightly — sacred geometry answering the voice.
      // LeanIn: outer rings pull inward (tighten spacing) — distinct from gather.
      // Tension: coil all rings tighter/sharper toward center (stronger on outer),
      // distinct from leanIn's mild outer-only approach squeeze.
      const leanTighten = 1 - lean * 0.14 * outerness;
      const tensionCoil = 1 - tension * (0.1 + outerness * 0.2);
      child.scale.setScalar(
        (1 + kickPulse * 0.2 + snareCrack * 0.14 + vocalRim * 0.18 * rimSoft) *
          leanTighten *
          tensionCoil,
      );
      const hex = i % 3 === 0 ? palette.bass : i % 3 === 1 ? palette.mid : palette.high;
      c.set(hex);
      // Value-only darken under tension — no hue shift (coil, not mood).
      if (tension > 0.001) {
        scratchDark.current.setRGB(0.04, 0.03, 0.07);
        c.lerp(scratchDark.current, tension * 0.42);
      }
      for (const grand of child.children) {
        const mat = (grand as THREE.Mesh).material;
        if (mat && !Array.isArray(mat) && 'emissiveIntensity' in mat) {
          const sm = mat as THREE.MeshStandardMaterial;
          // Afterglow holds the rings lit after the peak passes — the
          // mandala remembers the moment for a few seconds.
          // Vocal deepens outer-rim emissive; tenderness compresses the
          // outer-vs-inner rim contrast so tender verses glow evenly.
          // Tension darkens + sharpens metal/roughness as the build coils.
          const rimContrast = (outerness - 0.5) * 0.22 * rimSoft;
          sm.emissiveIntensity =
            (0.25 +
              m.swell * 0.5 +
              m.afterglow * 0.35 +
              (i === layerCount - 1 ? m.impact * 0.35 : 0) +
              kickPulse * 0.55 +
              snareCrack * 0.7 +
              vocalRim * 0.95 * rimSoft +
              rimContrast) *
            (1 - tension * 0.48);
          sm.metalness = 0.55 + tension * 0.28;
          sm.roughness = Math.max(0.12, 0.4 - tension * 0.26);
          sm.opacity = Math.max(0.18, 0.5 - i * 0.03 - tension * 0.12);
          sm.color.copy(c);
          sm.emissive.copy(c);
        }
      }
    });

    if (shimmer && shimmerMat) {
      // Hat ticks: sharp, short twinkles on the halo — distinct from the
      // slower shimmer envelope and the impact pulse.
      // Vocal: halo deepens with the voice (size + opacity), softened by tenderness.
      // hatMul holds ticks mid-air during holdBreath.
      shimmerMat.size =
        0.035 +
        m.shimmer * 0.05 +
        pulseRef.current * 0.03 +
        m.hat * 0.07 * hatMul +
        vocal * 0.045 * rimSoft;
      // Lead lines make the halo glitter — melody gets its own voice here.
      // Tension gently dims the halo with the coiled field.
      shimmerMat.opacity = Math.min(
        1,
        (0.45 +
          m.high * 0.45 +
          m.afterglow * 0.15 +
          m.leadActivity * 0.2 +
          m.hat * 0.35 * hatMul +
          vocal * 0.32 * rimSoft) *
          (1 - tension * 0.28),
      );
      shimmerMat.color.set(palette.high);
      if (tension > 0.001) {
        scratchDark.current.setRGB(0.05, 0.04, 0.1);
        shimmerMat.color.lerp(scratchDark.current, tension * 0.35);
      }
      // Phrase echo briefly reverses shimmer drift in post-phrase gaps —
      // the halo answers the silence by turning back on itself.
      const echoFlip = 1 - Math.min(1, m.echo) * 2;
      // Halo rotation: when BPM is known, phase-lock to the continuous bar
      // clock (half-turn per bar) — fluid SmoothToward follow, no stepping.
      // Freewheel residual keeps a little life; holdBreath still hushes via motionMul.
      const freeHaloRate =
        (0.35 + m.high * 1.6 + m.mid * 0.5) * sectionPace * echoFlip * motionMul;
      if (bpmKnown) {
        const continuousBar = barTurnsRef.current + barPhase;
        // Half-turn per bar — slow sacred wheel locked to the music's clock.
        const targetHaloY = -continuousBar * Math.PI * barAmp;
        if (!hadBpmRef.current) {
          // Enter lock: seed so composed angle matches the current freewheel pose.
          barHaloYRef.current = targetHaloY;
          freeHaloYRef.current = shimmer.rotation.y - targetHaloY;
          hadBpmRef.current = true;
        }
        barHaloYRef.current = smoothToward(barHaloYRef.current, targetHaloY, dt, 0.16, 0.16);
        freeHaloYRef.current -= delta * spd * freeHaloRate * 0.22;
        shimmer.rotation.y = barHaloYRef.current + freeHaloYRef.current;
      } else {
        if (hadBpmRef.current) {
          freeHaloYRef.current = shimmer.rotation.y;
          hadBpmRef.current = false;
        }
        freeHaloYRef.current -= delta * spd * freeHaloRate;
        shimmer.rotation.y = freeHaloYRef.current;
      }

      // Advect the halo through the shared current, spring-tethered to its
      // home ring so the mandala's silhouette survives the swirl.
      // motionMul freezes advection on holdBreath; spring still settles home.
      const dtClamped = Math.min(delta, 0.05);
      flowTimeRef.current +=
        dtClamped * (0.4 + Math.min(m.energy, 1.5) * 0.4) * echoFlip * motionMul;
      const fp = flowParamsFromMetrics(m, flowParamsRef.current);
      fp.time = flowTimeRef.current;
      const drift =
        dtClamped * (0.3 + m.energy * 0.7 + m.dropEvent * 1.4) * echoFlip * motionMul;
      const spring = dtClamped * 1.6;
      const fv = flowScratch.current;
      const posAttr = shimmer.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      for (let i = 0; i < shimmerCount; i++) {
        const i3 = i * 3;
        sampleFlow(fv, arr[i3]!, arr[i3 + 1]!, arr[i3 + 2]!, i % 3, fp);
        arr[i3] = arr[i3]! + fv.x * drift + (shimmerHome[i3]! - arr[i3]!) * spring;
        arr[i3 + 1] = arr[i3 + 1]! + fv.y * drift + (shimmerHome[i3 + 1]! - arr[i3 + 1]!) * spring;
        arr[i3 + 2] = arr[i3 + 2]! + fv.z * drift + (shimmerHome[i3 + 2]! - arr[i3 + 2]!) * spring;
      }
      posAttr.needsUpdate = true;
    }

    if (analyser) analyser.getFrequencyData(freqBuf.current);
  });

  const layers = useMemo(() => {
    return Array.from({ length: layerCount }, (_, i) => {
      const t = i / Math.max(1, layerCount - 1);
      const radius = 0.55 + t * 1.05;
      const tube = 0.08 + (1 - t) * 0.06;
      const color = i % 3 === 0 ? palette.bass : i % 3 === 1 ? palette.mid : palette.high;
      return { radius, tube, color, key: i };
    });
  }, [layerCount, palette]);

  return (
    <group ref={groupRef}>
      <group ref={ringsRef}>
        {layers.map(({ radius, tube, color, key }) => (
          <group key={key} rotation={[Math.PI / 2, 0, (key / FOLDS) * Math.PI * 2]}>
            {Array.from({ length: FOLDS }, (_, f) => (
              <mesh key={f} rotation={[0, 0, (f / FOLDS) * Math.PI * 2]}>
                <torusGeometry args={[radius, tube, 24, 48]} />
                <meshStandardMaterial
                  color={color}
                  emissive={color}
                  emissiveIntensity={0.3}
                  metalness={0.55}
                  roughness={0.4}
                  wireframe
                  transparent
                  opacity={0.5 - key * 0.03}
                />
              </mesh>
            ))}
          </group>
        ))}
      </group>

      <points ref={shimmerRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[shimmerPos, 3]} count={shimmerCount} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial
          ref={shimmerMatRef}
          size={0.04}
          map={sprite}
          color={palette.high}
          sizeAttenuation
          transparent
          opacity={0.7}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}

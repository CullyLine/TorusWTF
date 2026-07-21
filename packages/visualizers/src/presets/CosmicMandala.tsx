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
  const scratchColor = useRef(new THREE.Color());
  const sprite = useMemo(() => getDotTexture(), []);

  const layerCount = tier === 'high' ? 7 : tier === 'mid' ? 5 : 3;
  const shimmerCount = tier === 'high' ? 900 : tier === 'mid' ? 420 : 180;
  // Vocal rim amp softens on lower tiers so mid/low stay readable without bloom blowout.
  const vocalAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
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
    const gatherSqueeze = 1 - m.gather * 0.14;
    const breath =
      (1 + m.bass * 0.22 + m.swell * 0.12 + m.impact * 0.14 * soften) * gatherSqueeze;
    root.scale.setScalar(breath);
    // Whole-mandala spin: now picks up mid + high + impact so the wheel
    // visibly turns at normal listening gain instead of waiting for the
    // user to crank everything to mad-scientist mode.
    root.rotation.y +=
      delta * spd * (0.18 + m.mid * 0.65 + m.high * 0.28 + m.impact * 0.5) * sectionPace;

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
      child.rotation.z += delta * spd * spin * (i % 2 === 0 ? 1 : -1);
      child.rotation.x =
        Math.sin(_state.clock.elapsedTime * 0.4 + i) * (m.high * 0.35 + m.mid * 0.12) +
        snareCrack * 0.08;
      // Kick: inner rings bloom outward; snare: outer rings briefly flare.
      // Vocal: outer rim thickens slightly — sacred geometry answering the voice.
      child.scale.setScalar(
        1 + kickPulse * 0.2 + snareCrack * 0.14 + vocalRim * 0.18 * rimSoft,
      );
      const hex = i % 3 === 0 ? palette.bass : i % 3 === 1 ? palette.mid : palette.high;
      c.set(hex);
      for (const grand of child.children) {
        const mat = (grand as THREE.Mesh).material;
        if (mat && !Array.isArray(mat) && 'emissiveIntensity' in mat) {
          const sm = mat as THREE.MeshStandardMaterial;
          // Afterglow holds the rings lit after the peak passes — the
          // mandala remembers the moment for a few seconds.
          // Vocal deepens outer-rim emissive; tenderness compresses the
          // outer-vs-inner rim contrast so tender verses glow evenly.
          const rimContrast = (outerness - 0.5) * 0.22 * rimSoft;
          sm.emissiveIntensity =
            0.25 +
            m.swell * 0.5 +
            m.afterglow * 0.35 +
            (i === layerCount - 1 ? m.impact * 0.35 : 0) +
            kickPulse * 0.55 +
            snareCrack * 0.7 +
            vocalRim * 0.95 * rimSoft +
            rimContrast;
          sm.color.copy(c);
          sm.emissive.copy(c);
        }
      }
    });

    if (shimmer && shimmerMat) {
      // Hat ticks: sharp, short twinkles on the halo — distinct from the
      // slower shimmer envelope and the impact pulse.
      // Vocal: halo deepens with the voice (size + opacity), softened by tenderness.
      shimmerMat.size =
        0.035 +
        m.shimmer * 0.05 +
        pulseRef.current * 0.03 +
        m.hat * 0.07 +
        vocal * 0.045 * rimSoft;
      // Lead lines make the halo glitter — melody gets its own voice here.
      shimmerMat.opacity = Math.min(
        1,
        0.45 +
          m.high * 0.45 +
          m.afterglow * 0.15 +
          m.leadActivity * 0.2 +
          m.hat * 0.35 +
          vocal * 0.32 * rimSoft,
      );
      shimmerMat.color.set(palette.high);
      // Phrase echo briefly reverses shimmer drift in post-phrase gaps —
      // the halo answers the silence by turning back on itself.
      const echoFlip = 1 - Math.min(1, m.echo) * 2;
      // Counter-rotating shimmer cloud — also bumped up so it streaks
      // visibly across the rings on busy passages.
      shimmer.rotation.y -=
        delta * spd * (0.35 + m.high * 1.6 + m.mid * 0.5) * sectionPace * echoFlip;

      // Advect the halo through the shared current, spring-tethered to its
      // home ring so the mandala's silhouette survives the swirl.
      const dtClamped = Math.min(delta, 0.05);
      flowTimeRef.current += dtClamped * (0.4 + Math.min(m.energy, 1.5) * 0.4) * echoFlip;
      const fp = flowParamsFromMetrics(m, flowParamsRef.current);
      fp.time = flowTimeRef.current;
      const drift = dtClamped * (0.3 + m.energy * 0.7 + m.dropEvent * 1.4) * echoFlip;
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

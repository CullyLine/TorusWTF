'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';
import { useModulation } from '../modulation';

import { getDotTexture } from '../dotTexture';

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

export function VolumetricWaveformScene({ analyser, palette, tier, speed = 1 }: VisualizerSceneProps) {
  const mods = useModulation();
  const groupRef = useRef<THREE.Group>(null);
  const lineRef = useRef<THREE.LineSegments>(null);
  const ghostRef = useRef<THREE.LineSegments>(null);
  const dustRef = useRef<THREE.Points>(null);
  const timeBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const metricsRef = useMetricsRef();
  const scratchBass = useRef(new THREE.Color());
  const scratchMid = useRef(new THREE.Color());
  const scratchHigh = useRef(new THREE.Color());
  const scratchGhost = useRef(new THREE.Color());
  const sprite = useMemo(() => getDotTexture(), []);

  // Call-and-response state: gather pinch, impact bloom, echo ghost crest.
  const gatherSmooth = useRef(0);
  const echoSmooth = useRef(0);
  const bloomSmooth = useRef(0);
  const scaleSmooth = useRef(1);
  // Captured crest shape (per-sample |amp|) replayed as a faded traveling ghost.
  const crestShape = useRef<Float32Array | null>(null);
  const crestTravel = useRef(1); // 0..1 along the ribbon; >=1 means idle
  const echoArmed = useRef(true);
  const prevEcho = useRef(0);

  const samples = tier === 'high' ? 512 : tier === 'mid' ? 256 : 128;
  const dustCount = tier === 'high' ? 2000 : tier === 'mid' ? 900 : 400;
  // Low tier still gets phrase echo; mid/high just read the crest cleaner.
  const echoAmp = tier === 'low' ? 0.7 : tier === 'mid' ? 0.9 : 1;
  const pinchAmt = tier === 'low' ? 0.42 : 0.55;

  const positions = useMemo(() => new Float32Array(samples * 2 * 3), [samples]);
  const ghostPositions = useMemo(() => new Float32Array(samples * 2 * 3), [samples]);
  const colors = useMemo(() => {
    const c = new Float32Array(samples * 2 * 3);
    const bass = new THREE.Color(palette.bass);
    const mid = new THREE.Color(palette.mid);
    const high = new THREE.Color(palette.high);
    for (let i = 0; i < samples * 2; i++) {
      const t = i / (samples * 2);
      const color = t < 0.33 ? bass : t < 0.66 ? mid : high;
      c[i * 3] = color.r;
      c[i * 3 + 1] = color.g;
      c[i * 3 + 2] = color.b;
    }
    return c;
  }, [samples, palette]);

  const ghostColors = useMemo(() => new Float32Array(samples * 2 * 3), [samples]);

  const { dustPos, dustVel } = useMemo(() => {
    const p = new Float32Array(dustCount * 3);
    const v = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      p[i * 3] = (Math.random() - 0.5) * 5;
      p[i * 3 + 1] = (Math.random() - 0.5) * 3;
      p[i * 3 + 2] = (Math.random() - 0.5) * 2;
      v[i * 3] = (Math.random() - 0.5) * 0.01;
      v[i * 3 + 1] = Math.random() * 0.02;
      v[i * 3 + 2] = (Math.random() - 0.5) * 0.01;
    }
    return { dustPos: p, dustVel: v };
  }, [dustCount]);

  useFrame((_state, delta) => {
    const line = lineRef.current;
    const group = groupRef.current;
    const dust = dustRef.current;
    const ghost = ghostRef.current;
    if (!line || !group) return;

    const m = metricsRef.current;
    const dt = Math.min(delta, 0.1);
    const spd = mods.current.speed ?? speed;

    gatherSmooth.current = smoothToward(gatherSmooth.current, m.gather, dt, 0.04, 0.13);
    echoSmooth.current = smoothToward(echoSmooth.current, m.echo * echoAmp, dt, 0.05, 0.32);
    const bloomTarget = Math.min(1.2, m.impact * 0.85 + m.release * 0.25);
    bloomSmooth.current = smoothToward(bloomSmooth.current, bloomTarget, dt, 0.035, 0.16);

    group.rotation.y += delta * spd * (0.1 + m.mid * 0.4 + m.impact * 0.2);
    // Gather pinches the whole form toward the axis; impact/afterglow bloom out.
    const scaleTarget =
      1 -
      gatherSmooth.current * pinchAmt * 0.35 +
      bloomSmooth.current * 0.08 +
      m.swell * 0.1 +
      m.afterglow * 0.04;
    scaleSmooth.current = smoothToward(scaleSmooth.current, scaleTarget, dt, 0.045, 0.12);
    group.scale.setScalar(scaleSmooth.current);

    // The line itself brightens when a lead/vocal carries the moment —
    // the waveform IS the melody's voice, so give it presence.
    const lineMat = line.material as THREE.LineBasicMaterial;
    lineMat.opacity = Math.min(
      1,
      0.72 + m.leadActivity * 0.18 + m.vocalActivity * 0.1 + m.afterglow * 0.1,
    );

    // Live palette: re-tint the waveform gradient every frame so color life
    // and palette swaps reach the line (the mount-time buffer stays frozen).
    const cAttr = line.geometry.getAttribute('color') as THREE.BufferAttribute;
    const cArr = cAttr.array as Float32Array;
    const bassC = scratchBass.current.set(palette.bass);
    const midC = scratchMid.current.set(palette.mid);
    const highC = scratchHigh.current.set(palette.high);
    const vertCount = samples * 2;
    for (let i = 0; i < vertCount; i++) {
      const t = i / vertCount;
      const color = t < 0.33 ? bassC : t < 0.66 ? midC : highC;
      cArr[i * 3] = color.r;
      cArr[i * 3 + 1] = color.g;
      cArr[i * 3 + 2] = color.b;
    }
    cAttr.needsUpdate = true;

    // Phrase-echo crest: arm on silence after a phrase gap; one travel per
    // echo impulse so the ribbon answers once instead of strobing.
    const echoNow = echoSmooth.current;
    if (echoNow < 0.08) echoArmed.current = true;
    if (echoArmed.current && echoNow > 0.22 && prevEcho.current <= 0.22) {
      crestTravel.current = 0;
      echoArmed.current = false;
    }
    prevEcho.current = echoNow;

    if (crestTravel.current < 1) {
      // One slow sweep across the ribbon (~0.9–1.2s depending on speed).
      crestTravel.current = Math.min(1, crestTravel.current + dt * spd * (0.85 + m.bpm / 180));
    }

    if (analyser) {
      const bins = analyser.getTimeDomainData(timeBuf.current);
      if (bins > 0) {
        const arr = line.geometry.getAttribute('position').array as Float32Array;
        // Section level scales the wave's reach: quiet valleys draw close
        // and intimate, the song's biggest sections fill the frame.
        // Gather pinches amp toward the axis; impact blooms it open.
        const pinch = 1 - gatherSmooth.current * pinchAmt;
        const bloom = 1 + bloomSmooth.current * 0.55;
        const amp =
          (1.2 + m.energy * 1.3) * (0.75 + m.sectionLevel * 0.45) * pinch * bloom;

        if (!crestShape.current || crestShape.current.length !== samples) {
          crestShape.current = new Float32Array(samples);
        }
        const shape = crestShape.current;

        for (let i = 0; i < samples; i++) {
          const src = Math.floor((i / samples) * bins);
          const v = (timeBuf.current[src]! / 128 - 1) * amp;
          const x = (i / samples) * 6 - 3;
          const z = Math.sin(i * 0.1 + _state.clock.elapsedTime) * m.mid * 0.2;
          const baseIdx = i * 6;
          arr[baseIdx] = x;
          arr[baseIdx + 1] = v;
          arr[baseIdx + 2] = z;
          arr[baseIdx + 3] = x;
          arr[baseIdx + 4] = -v;
          arr[baseIdx + 5] = -z;

          // Keep refreshing the crest capture while energy is present so the
          // delayed echo replays a recent phrase shape, not silence.
          if (m.energy > 0.12 || m.vocalActivity > 0.15) {
            shape[i] = v;
          }
        }
        (line.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      }
    }

    // Ghost crest: faded delayed shape traveling once along the ribbon.
    if (ghost) {
      const gMat = ghost.material as THREE.LineBasicMaterial;
      const traveling = crestTravel.current < 1;
      const ghostStrength = traveling
        ? echoSmooth.current * (1 - crestTravel.current) * 0.85
        : 0;
      gMat.opacity = Math.min(0.55, ghostStrength * 0.7);
      gMat.visible = ghostStrength > 0.02;

      const gArr = ghost.geometry.getAttribute('position').array as Float32Array;
      const gCol = ghost.geometry.getAttribute('color').array as Float32Array;
      const ghostC = scratchGhost.current.set(palette.high);
      const shape = crestShape.current;
      const center = crestTravel.current; // 0..1 along ribbon
      const width = 0.14;

      for (let i = 0; i < samples; i++) {
        const t = i / samples;
        const x = t * 6 - 3;
        // Soft Gaussian envelope that slides left→right once.
        const dist = (t - center) / width;
        const envelope = Math.exp(-dist * dist);
        const base = shape ? (shape[i] ?? 0) : 0;
        // Ghost is a faded, slightly softened copy of the captured crest.
        const v = base * 0.72 * envelope * Math.max(ghostStrength, 0);
        const z = Math.sin(i * 0.1 + _state.clock.elapsedTime * 0.6) * 0.05;
        const baseIdx = i * 6;
        gArr[baseIdx] = x;
        gArr[baseIdx + 1] = v;
        gArr[baseIdx + 2] = z;
        gArr[baseIdx + 3] = x;
        gArr[baseIdx + 4] = -v;
        gArr[baseIdx + 5] = -z;

        const fade = envelope * Math.max(ghostStrength, 0);
        const ci = i * 6;
        for (let k = 0; k < 2; k++) {
          const o = ci + k * 3;
          gCol[o] = ghostC.r * (0.55 + fade * 0.45);
          gCol[o + 1] = ghostC.g * (0.55 + fade * 0.45);
          gCol[o + 2] = ghostC.b * (0.55 + fade * 0.45);
        }
      }
      (ghost.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (ghost.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    }

    if (dust) {
      const mat = dust.material as THREE.PointsMaterial;
      mat.size = 0.035 + m.flow * 0.05;
      mat.opacity = Math.min(1, 0.3 + m.swell * 0.55 + m.afterglow * 0.2);
      mat.color.set(palette.mid);
      const posAttr = dust.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      const drive = delta * spd * (0.5 + m.energy * 3.5 + m.impact * 3);
      const active = 0.2 + m.flow * 0.8;
      // Dust also inhales slightly on gather so the field feels of-a-piece.
      const dustPinch = 1 - gatherSmooth.current * 0.015;
      for (let i = 0; i < dustCount; i++) {
        if (i / dustCount > active) continue;
        const i3 = i * 3;
        arr[i3] = ((arr[i3] ?? 0) + (dustVel[i3] ?? 0) * drive * 20) * dustPinch;
        arr[i3 + 1] = (arr[i3 + 1] ?? 0) + (dustVel[i3 + 1] ?? 0) * drive * 20;
        arr[i3 + 2] = ((arr[i3 + 2] ?? 0) + (dustVel[i3 + 2] ?? 0) * drive * 20) * dustPinch;
        if (Math.abs(arr[i3 + 1]!) > 2.5) arr[i3 + 1] = 0;
      }
      posAttr.needsUpdate = true;
    }
  });

  return (
    <group ref={groupRef}>
      <lineSegments ref={lineRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
            count={samples * 2}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[colors, 3]}
            count={samples * 2}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial
          vertexColors
          transparent
          opacity={0.9}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          linewidth={1}
        />
      </lineSegments>
      <lineSegments ref={ghostRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[ghostPositions, 3]}
            count={samples * 2}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[ghostColors, 3]}
            count={samples * 2}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial
          vertexColors
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          linewidth={1}
        />
      </lineSegments>
      <points ref={dustRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[dustPos, 3]} count={dustCount} />
        </bufferGeometry>
        <pointsMaterial
          color={palette.mid}
          size={0.04}
          map={sprite}
          sizeAttenuation
          transparent
          opacity={0.5}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
    </group>
  );
}

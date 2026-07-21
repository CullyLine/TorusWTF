'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createBubblePool, emitBubbleBurst, stepBubblePool } from './bubbleSimulation';
import { BUBBLE_FRAGMENT_SHADER, BUBBLE_VERTEX_SHADER } from './bubbleShaders';
import { resolveEmitterRuntimeSettings } from './settings';
import type { EmitterContinuousSettings, EmitterRendererProps } from './types';

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function BubbleEmitter({
  settings,
  palette,
  metricsRef,
  modulationRef,
  impulses,
}: EmitterRendererProps) {
  const pixelRatio = useThree((state) => state.viewport.dpr);
  const runtimeRef = useRef<EmitterContinuousSettings>({
    rate: settings.rate,
    size: settings.size,
    lifetime: settings.lifetime,
    lift: settings.lift,
    spread: settings.spread,
    turbulence: settings.turbulence,
    opacity: settings.opacity,
  });
  const lastSpawnRevisionRef = useRef(-1);

  const pool = useMemo(
    () =>
      createBubblePool({
        capacity: settings.particleBudget,
        seed: settings.seed,
        burstLimit: settings.burstLimit,
      }),
    [settings.particleBudget, settings.seed, settings.burstLimit],
  );

  const buffers = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const position = new THREE.BufferAttribute(pool.positions, 3);
    const age = new THREE.BufferAttribute(pool.ages, 1);
    const lifetime = new THREE.BufferAttribute(pool.lifetimes, 1);
    const seed = new THREE.BufferAttribute(pool.seeds, 1);
    const size = new THREE.BufferAttribute(pool.sizes, 1);
    position.setUsage(THREE.DynamicDrawUsage);
    age.setUsage(THREE.DynamicDrawUsage);
    lifetime.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', position);
    geometry.setAttribute('aAge', age);
    geometry.setAttribute('aLifetime', lifetime);
    geometry.setAttribute('aSeed', seed);
    geometry.setAttribute('aSize', size);
    return { geometry, position, age, lifetime };
  }, [pool]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPointScale: { value: settings.size },
      uPixelRatio: { value: pixelRatio },
      uOpacity: { value: settings.opacity },
      uAudioGlow: { value: 1 },
      uColorBass: { value: new THREE.Color(palette.bass) },
      uColorMid: { value: new THREE.Color(palette.mid) },
      uColorHigh: { value: new THREE.Color(palette.high) },
    }),
    // Palette and settings are refreshed in the frame loop without replacing
    // the material or its uniform objects.
    [],
  );

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: BUBBLE_VERTEX_SHADER,
        fragmentShader: BUBBLE_FRAGMENT_SHADER,
        uniforms,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [uniforms],
  );

  useEffect(
    () => () => {
      buffers.geometry.dispose();
    },
    [buffers],
  );
  useEffect(
    () => () => {
      material.dispose();
    },
    [material],
  );

  useFrame((_state, delta) => {
    const runtime = resolveEmitterRuntimeSettings(
      settings,
      modulationRef.current,
      runtimeRef.current,
    );

    if (impulses && impulses.emitterBurst !== 0) {
      const strength = impulses.emitterBurst;
      impulses.emitterBurst = 0;
      if (strength > 0) emitBubbleBurst(pool, strength, runtime);
    }

    const metrics = metricsRef.current;
    stepBubblePool(pool, delta, runtime, metrics);

    buffers.position.needsUpdate = true;
    buffers.age.needsUpdate = true;
    if (lastSpawnRevisionRef.current !== pool.spawnRevision) {
      buffers.lifetime.needsUpdate = true;
      lastSpawnRevisionRef.current = pool.spawnRevision;
    }

    uniforms.uTime.value = pool.flowTime;
    uniforms.uPointScale.value = runtime.size * (1 + clamp(metrics.impact, 0, 1.2) * 0.08);
    uniforms.uPixelRatio.value = pixelRatio;
    uniforms.uOpacity.value = runtime.opacity;
    uniforms.uAudioGlow.value = clamp(
      0.78 +
        clamp(metrics.swell, 0, 1.5) * 0.2 +
        clamp(metrics.shimmer, 0, 1.5) * 0.28 +
        clamp(metrics.afterglow, 0, 1) * 0.1,
      0.55,
      1.35,
    );
    uniforms.uColorBass.value.set(palette.bass);
    uniforms.uColorMid.value.set(palette.mid);
    uniforms.uColorHigh.value.set(palette.high);
  });

  return (
    <points
      geometry={buffers.geometry}
      material={material}
      frustumCulled={false}
      renderOrder={4}
      dispose={null}
    />
  );
}

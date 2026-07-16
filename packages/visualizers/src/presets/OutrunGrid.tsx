'use client';

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';
import { useModulation } from '../modulation';

/**
 * Outrun Grid — synthwave drive with build-and-drop cinema:
 *  - tension → sun swells + stretches (charges the horizon)
 *  - gather → horizon dips (pre-drop inhale)
 *  - drop / afterglow → grid heat wash that eases back
 */

const terrainVertex = /* glsl */ `
uniform float uTime;
uniform float uScroll;
uniform float uBass;
uniform float uEnergy;

varying vec2 vUv;
varying float vHeight;
varying float vDist;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

void main() {
  vUv = uv;
  vec3 pos = position;
  vec2 sampleUv = uv * 8.0 + vec2(0.0, uScroll);
  float h = fbm(sampleUv) * 2.2;
  h += fbm(sampleUv * 2.5 + 4.0) * 0.8;
  float valley = exp(-pow((uv.x - 0.5) * 3.2, 2.0)) * 1.4;
  h -= valley;
  h *= 0.35 + uBass * 1.1;
  pos.y += h;
  vHeight = h;
  vDist = length(pos.xz);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const terrainFragment = /* glsl */ `
uniform float uTime;
uniform float uMid;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uBloom;
uniform float uHeat;
uniform vec3 uHeatColor;

varying vec2 vUv;
varying float vHeight;
varying float vDist;

void main() {
  vec2 grid = abs(fract(vUv * 40.0) - 0.5);
  // Crisp neon lines: a tight core stroke plus a faint halo. The previous
  // wide smoothstep made every cell glow edge-to-edge and the whole floor
  // washed out into a white carpet on loud passages.
  float d = min(grid.x, grid.y);
  float line = smoothstep(0.1, 0.0, d) + smoothstep(0.3, 0.0, d) * 0.25;
  float glow = exp(-vDist * 0.11);
  vec3 gridCol = mix(uColorA, uColorB, sin(vUv.y * 12.0 + uTime) * 0.5 + 0.5);
  // Drop heat wash: afterglow + impact bleed warm magenta into the grid,
  // then ease back — cinema after the drop, not a permanent tint.
  float heat = clamp(uHeat, 0.0, 1.4);
  gridCol = mix(gridCol, uHeatColor, heat * 0.72);
  vec3 col = gridCol * line * glow * (0.4 + uMid * 0.5 + vHeight * 0.3);
  col *= 1.0 + uBloom * 0.4 + heat * 0.55;
  // Soft traveling crest so the wash feels like a wave over the floor.
  float crest = sin(vUv.y * 18.0 - uTime * 2.4 + heat * 4.0) * 0.5 + 0.5;
  col += uHeatColor * crest * heat * 0.35 * line * glow;
  gl_FragColor = vec4(col, min(1.0, line) * glow);
}
`;

const skyVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const skyFragment = /* glsl */ `
uniform float uTime;
uniform float uBass;
uniform float uHigh;
uniform float uBeat;
uniform float uTension;
uniform float uGather;
uniform float uDropWash;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;

varying vec2 vUv;

void main() {
  vec2 uv = vUv;
  // Horizon dips on gather — the whole dusk plane inhales before the drop.
  float horizonDip = uGather * 0.085;
  float sunY = 0.62 - horizonDip;
  // Tension charges: sun swells outward and stretches vertically.
  float sunRadius = 0.14 + uBass * 0.05 + uTension * 0.11;
  float stretchY = 1.0 + uTension * 0.55;
  float stretchX = 1.0 - uTension * 0.12;

  // Horizon gradient tinted by the bass color so the sky follows the palette.
  vec3 duskLow = uSkyColor * 0.08;
  vec3 duskHigh = uSkyColor * 0.55;
  float skyY = uv.y + horizonDip * 0.35;
  vec3 sky = mix(duskLow, duskHigh, skyY);
  sky = mix(sky, uSkyColor * 0.16, smoothstep(0.0, 0.35, skyY));
  // Build heat in the lower sky as tension climbs.
  sky = mix(sky, uSunColor * 0.45, uTension * 0.28 * (1.0 - skyY));

  vec2 sunCenter = vec2(0.5 + sin(uTime * 0.15) * 0.02, sunY);
  vec2 sunUv = (uv - sunCenter) * vec2(stretchX, stretchY);
  float sun = smoothstep(sunRadius, 0.0, length(sunUv));
  vec3 sunCol = mix(uSunColor, vec3(1.0, 0.9, 0.7), 0.25 + uBass * 0.3 + uTension * 0.2) * sun;
  sunCol *= 1.0 + uTension * 0.65;

  float bandMask = smoothstep(0.02, 0.0, abs(fract((uv.y - sunY) * 28.0 + uTime * 0.5) - 0.5));
  sunCol *= 0.6 + bandMask * 0.8;

  float shimmer = sin(uv.x * 80.0 + uTime * 6.0) * uHigh * 0.015;
  uv.x += shimmer;

  vec3 col = sky + sunCol;
  col += uSunColor * (uBeat * 0.3 + uDropWash * 0.45);
  // Faint horizon glow line that dips with gather.
  float horizonLine = exp(-abs(uv.y - (0.28 - horizonDip)) * 48.0);
  col += uSunColor * horizonLine * (0.12 + uTension * 0.35 + uGather * 0.25);
  gl_FragColor = vec4(col, 1.0);
}
`;

function smoothToward(
  current: number,
  target: number,
  dt: number,
  riseTau: number,
  fallTau: number,
): number {
  const tau = target > current ? riseTau : fallTau;
  const k = 1 - Math.exp(-dt / Math.max(1e-4, tau));
  return current + (target - current) * k;
}

export function OutrunGridScene({ analyser, palette, tier, speed = 1 }: VisualizerSceneProps) {
  const mods = useModulation();
  const terrainMatRef = useRef<THREE.ShaderMaterial>(null);
  const skyMatRef = useRef<THREE.ShaderMaterial>(null);
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const metricsRef = useMetricsRef();
  const scrollRef = useRef(0);
  const beatDollyRef = useRef(0);
  const tensionSmooth = useRef(0);
  const gatherSmooth = useRef(0);
  const heatSmooth = useRef(0);
  const dropWashSmooth = useRef(0);
  const heatColorScratch = useRef(new THREE.Color());
  const heatHighScratch = useRef(new THREE.Color());
  const { camera } = useThree();

  const segments = tier === 'high' ? 160 : tier === 'mid' ? 96 : 64;
  const bloom = tier === 'high' ? 1 : tier === 'mid' ? 0.65 : 0.35;
  // Mid/low keep the same cinema language at slightly softer amplitude.
  const cinemaAmp = tier === 'high' ? 1 : tier === 'mid' ? 0.85 : 0.65;

  const terrainUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uScroll: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uEnergy: { value: 0 },
      uColorA: { value: new THREE.Color(palette.mid) },
      uColorB: { value: new THREE.Color(palette.high) },
      uBloom: { value: bloom },
      uHeat: { value: 0 },
      uHeatColor: { value: new THREE.Color(palette.bass) },
    }),
    [palette.mid, palette.high, palette.bass, bloom],
  );

  // Intentionally empty deps: uniform colors are re-set from the live
  // palette every frame in useFrame.
  const skyUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBass: { value: 0 },
      uHigh: { value: 0 },
      uBeat: { value: 0 },
      uTension: { value: 0 },
      uGather: { value: 0 },
      uDropWash: { value: 0 },
      uSunColor: { value: new THREE.Color(palette.bass) },
      uSkyColor: { value: new THREE.Color(palette.bass) },
    }),
    [],
  );

  useFrame((state, delta) => {
    const terrainMat = terrainMatRef.current;
    const skyMat = skyMatRef.current;
    if (!terrainMat || !skyMat) return;

    const m = metricsRef.current;
    const spd = mods.current.speed ?? speed;
    const dt = Math.min(delta, 0.1);
    // Drive speed follows the song's arc: valleys cruise, peaks floor it.
    // Tension adds a cinematic charge (not only "scroll faster").
    const sectionPace = 0.7 + m.sectionLevel * 0.55;
    const tensionPace = 1 + tensionSmooth.current * 0.22;
    scrollRef.current +=
      dt * spd * (0.45 + m.energy * 1.4 + m.impact * 0.8) * sectionPace * tensionPace;
    beatDollyRef.current = Math.max(0, beatDollyRef.current - dt * 4);
    if (m.impact > 0.35 || m.dropEvent > 0.45) beatDollyRef.current = 1;

    tensionSmooth.current = smoothToward(
      tensionSmooth.current,
      m.tension * cinemaAmp,
      dt,
      0.12,
      0.45,
    );
    gatherSmooth.current = smoothToward(
      gatherSmooth.current,
      m.gather * cinemaAmp,
      dt,
      0.04,
      0.14,
    );
    // Heat peaks on drop/impact, then rides afterglow so the wash eases back.
    const heatTarget =
      Math.min(
        1.35,
        m.dropEvent * 1.05 + m.impact * 0.55 + m.afterglow * 0.75 + m.release * 0.2,
      ) * cinemaAmp;
    heatSmooth.current = smoothToward(heatSmooth.current, heatTarget, dt, 0.05, 0.85);
    dropWashSmooth.current = smoothToward(
      dropWashSmooth.current,
      Math.min(1.2, m.dropEvent * 0.9 + m.impact * 0.35 + m.afterglow * 0.4) * cinemaAmp,
      dt,
      0.04,
      0.7,
    );

    terrainMat.uniforms.uTime!.value = state.clock.elapsedTime;
    terrainMat.uniforms.uScroll!.value = scrollRef.current;
    terrainMat.uniforms.uBass!.value = m.bass + m.impact * 0.4 + tensionSmooth.current * 0.15;
    terrainMat.uniforms.uMid!.value = m.mid + m.afterglow * 0.2;
    terrainMat.uniforms.uEnergy!.value = m.energy;
    terrainMat.uniforms.uHeat!.value = heatSmooth.current;
    (terrainMat.uniforms.uColorA!.value as THREE.Color).set(palette.mid);
    (terrainMat.uniforms.uColorB!.value as THREE.Color).set(palette.high);
    (terrainMat.uniforms.uHeatColor!.value as THREE.Color)
      .copy(heatColorScratch.current.set(palette.bass).lerp(heatColorScratch.current.set(palette.high), 0.35));

    skyMat.uniforms.uTime!.value = state.clock.elapsedTime;
    skyMat.uniforms.uBass!.value = m.bass + tensionSmooth.current * 0.4 + m.afterglow * 0.15;
    skyMat.uniforms.uHigh!.value = m.high;
    skyMat.uniforms.uBeat!.value = m.impact + m.dropEvent * 0.6;
    skyMat.uniforms.uTension!.value = tensionSmooth.current;
    skyMat.uniforms.uGather!.value = gatherSmooth.current;
    skyMat.uniforms.uDropWash!.value = dropWashSmooth.current;
    (skyMat.uniforms.uSunColor!.value as THREE.Color).set(palette.bass);
    (skyMat.uniforms.uSkyColor!.value as THREE.Color).set(palette.bass);

    // Camera: slight dip on gather, push in on drop wash — cinema not snap.
    const gatherCam = gatherSmooth.current * 0.12;
    const washCam = dropWashSmooth.current * 0.18;
    camera.position.z = 3.2 + beatDollyRef.current * 0.35 - washCam;
    camera.position.y = 1.4 + m.mid * 0.15 - gatherCam + tensionSmooth.current * 0.08;
    camera.lookAt(0, 0.2 - gatherCam * 0.5, -6);

    if (analyser) analyser.getFrequencyData(freqBuf.current);
  });

  return (
    <>
      <mesh position={[0, 1.5, -18]} scale={[40, 22, 1]}>
        <planeGeometry args={[1, 1]} />
        <shaderMaterial
          ref={skyMatRef}
          vertexShader={skyVertex}
          fragmentShader={skyFragment}
          uniforms={skyUniforms}
          depthWrite={false}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2.35, 0, 0]} position={[0, -0.8, -2]}>
        <planeGeometry args={[28, 36, segments, segments]} />
        <shaderMaterial
          ref={terrainMatRef}
          vertexShader={terrainVertex}
          fragmentShader={terrainFragment}
          uniforms={terrainUniforms}
          transparent
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </>
  );
}

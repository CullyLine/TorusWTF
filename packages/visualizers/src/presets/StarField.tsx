'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
// MIT GalaxyGeometry — Copyright 2025 AMIT DIGGA (threejs-galaxy-shader).
// Zero-position + a_index foundation only; Torus owns the audio ShaderMaterial.
import { GalaxyGeometry } from 'threejs-galaxy-shader';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';
import { useModulation } from '../modulation';
import { useCameraZoomDistanceRef } from '../cameraZoom';
import { FLOW_GLSL } from '../dsp/flowGlsl';

const ARMS = 3;

/**
 * Smooth toward a target with asymmetric rise/fall (seconds).
 * Keeps kit accents fluid — no linear snaps on hat/kick envelopes.
 */
function smoothToward(
  current: number,
  target: number,
  dt: number,
  riseTau: number,
  fallTau: number,
) {
  const tau = target > current ? riseTau : fallTau;
  const a = 1 - Math.exp(-dt / Math.max(1e-4, tau));
  return current + (target - current) * a;
}

const vertexShader = /* glsl */ `
${FLOW_GLSL}

attribute float a_index;

uniform float uTotal;
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uHigh;
uniform float uBeat;
uniform float uEnergy;
uniform float uFlowTime;
uniform float uFlowAmt;
uniform float uBandSpread;
uniform float uHat;
uniform float uKick;
uniform float uGather;
uniform float uSnare;
uniform float uDrop;
uniform float uShockTravel;
uniform float uShimmer;
uniform float uAfterglow;
uniform vec3 uColorBass;
uniform vec3 uColorMid;
uniform vec3 uColorHigh;

varying vec3 vColor;
varying float vAlpha;

float ggHash(float n) {
  return fract(sin(n * 127.1) * 43758.5453123);
}

void main() {
  float idx = a_index;
  float total = max(uTotal, 1.0);
  float h1 = ggHash(idx + 0.11);
  float h2 = ggHash(idx + 17.73);
  float h3 = ggHash(idx + 41.29);
  float h4 = ggHash(idx + 63.91);
  float h5 = ggHash(idx + 89.37);

  // Deterministic spiral from a_index + total count — no CPU Math.random.
  float arms = ${ARMS}.0;
  float pointsPerArm = max(floor(total / arms), 1.0);
  float armI = mod(floor(idx / pointsPerArm), arms);
  float alongArm = mod(idx, pointsPerArm) / pointsPerArm;
  // Mix sequential arm progress with a hash so stars don't form rigid rings.
  float t = clamp(mix(alongArm, h1, 0.55), 0.0, 1.0);
  float r = 0.12 + pow(t, 1.55) * 5.6;
  float theta =
    armI * (6.28318530718 / arms) +
    r * 0.95 +
    (h2 - 0.5) * 0.42;
  float yThick = (h3 - 0.5) * exp(-r * 0.35) * 0.55;
  float aPhase = h4;
  float aArm = armI;
  float aRadius = r;

  vec3 pos = vec3(cos(theta) * r, yThick, sin(theta) * r);

  // Black-hole accretion core: bass strengthens lensing twist + gravity pull.
  float coreDist = length(pos.xz) + 1e-5;
  float bhRadius = 0.28 + uBass * 0.22;
  float lens =
    (1.0 - smoothstep(bhRadius * 0.45, bhRadius * 3.2, coreDist)) *
    (0.35 + uBass * 0.95 + uKick * 0.35);
  float twist = lens * (1.1 + uBass * 1.8);
  float cT = cos(twist);
  float sT = sin(twist);
  float px = pos.x * cT - pos.z * sT;
  float pz = pos.x * sT + pos.z * cT;
  pos.x = px;
  pos.z = pz;
  float gravity = lens * (0.12 + uBass * 0.28);
  pos.xz *= 1.0 - gravity;
  // Mild vertical squash near the event horizon so the disc reads as a well.
  pos.y *= 1.0 - lens * 0.35;

  // Drop accretion shockwave: expanding radial front from the nucleus.
  float shockTravel = clamp(uShockTravel, 0.0, 1.0);
  float shockR = mix(0.15, 5.8, shockTravel);
  float shockEnvelope = uDrop * (1.0 - smoothstep(0.78, 1.0, shockTravel));
  float shockBand = exp(-pow((aRadius - shockR) * 3.2, 2.0)) * shockEnvelope;
  vec2 radial = pos.xz / (length(pos.xz) + 1e-5);
  pos.x += radial.x * shockBand * 0.62;
  pos.z += radial.y * shockBand * 0.62;
  pos.y += shockBand * 0.1;

  // Flow Field: arms breathe along curl currents until convergence.
  vec3 fv = ffFlow(pos, aArm, uFlowTime, 0.6, 0.5, 1.0, uBandSpread, 0.0);
  pos += fv * uFlowAmt * (0.4 + aPhase * 0.6);

  // Gather inhale: spiral arms contract toward the nucleus.
  float armWeight = smoothstep(0.35, 2.6, aRadius);
  float gatherPull = 1.0 - uGather * armWeight * 0.18;
  pos.x *= gatherPull;
  pos.z *= gatherPull;
  pos.y *= 1.0 - uGather * 0.1;

  // Snare lateral streak: tangential whip on mid-arm stars.
  float armBand =
    smoothstep(0.7, 1.9, aRadius) * (1.0 - smoothstep(3.4, 5.1, aRadius));
  float snareSelect = step(0.38, fract(aPhase * 31.7 + aArm * 0.29));
  float snareAmt = snareSelect * armBand * uSnare;
  vec2 tangentSeed = vec2(-pos.z, pos.x);
  vec2 tangential = tangentSeed / max(length(tangentSeed), 1e-5);
  pos.x += tangential.x * snareAmt * 0.58;
  pos.z += tangential.y * snareAmt * 0.58;
  pos.x += pos.x * snareAmt * 0.045;
  pos.z += pos.z * snareAmt * 0.045;

  // Soft high-band twinkle + shimmer/hat sparse glints.
  float twinkle = sin(uTime * (3.0 + aPhase * 5.0) + aPhase * 40.0) * 0.5 + 0.5;
  twinkle *= 0.35 + uHigh * 0.55 + uShimmer * 0.35;

  float hatSelect = step(0.68, fract(aPhase * 47.13 + aArm * 0.17));
  float hatTick = hatSelect * uHat * (0.75 + fract(aPhase * 13.7) * 0.45);
  float shimmerGlint =
    step(0.82, fract(aPhase * 91.3 + h5 * 0.37)) *
    uShimmer *
    (0.55 + twinkle * 0.45);

  float burst = step(0.97, fract(aPhase * 17.0 + uTime * 0.5 + uMid * 0.35));
  float core = 1.0 - smoothstep(0.0, 2.5, aRadius);
  float kickCore = core * uKick;
  float sizeBoost =
    1.0 +
    uBass * 0.4 +
    uBeat * 0.35 +
    burst * uMid * 1.8 +
    kickCore * 1.15 +
    hatTick * 0.55 +
    shimmerGlint * 0.7 +
    snareAmt * 0.75 +
    shockBand * 0.85;

  float rim = smoothstep(1.5, 5.0, aRadius);
  // Palette: hot high near core/glints, mid through arms, bass on outer/deep.
  vec3 hotCore = mix(uColorHigh, vec3(1.0, 0.97, 0.9), core * 0.22);
  vec3 armCol = mix(uColorMid, uColorHigh, aPhase * 0.35);
  vec3 rimCol = uColorBass;
  vec3 body = mix(mix(hotCore, armCol, smoothstep(0.0, 1.8, aRadius)), rimCol, rim);
  float lumDamp = mix(0.55, 1.0, smoothstep(0.2, 2.6, aRadius));
  float afterglowLift = uAfterglow * (0.08 + armWeight * 0.1);
  vec3 lit =
    body *
      (1.0 +
        twinkle * 0.32 +
        core * uBass * 0.2 +
        kickCore * 0.55 +
        uGather * armWeight * 0.08 +
        afterglowLift +
        shockBand * 0.4) +
    mix(body, uColorHigh, 0.7) * (hatTick * 0.85 + shimmerGlint * 0.95) +
    mix(uColorMid, uColorHigh, 0.45) * snareAmt * 0.95;
  // Preserve chroma under additive overlap — soft luma clamp, not desat-to-white.
  float luma = dot(lit, vec3(0.299, 0.587, 0.114));
  lit *= lumDamp * (luma > 1.35 ? (1.35 / luma) : 1.0);
  vColor = lit;

  float dense = 1.0 - smoothstep(0.0, 3.2, aRadius);
  float coreDamp = 1.0 - dense * 0.62;
  vAlpha =
    (0.12 +
      twinkle * 0.14 +
      uEnergy * 0.04 +
      uAfterglow * 0.035 +
      hatTick * 0.22 +
      shimmerGlint * 0.2 +
      kickCore * 0.08 +
      snareAmt * 0.2 +
      shockBand * 0.14) *
      coreDamp +
    core * 0.025;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  float viewDepth = max(0.9, -mvPosition.z);
  float sizeScale = mix(0.42, 1.0, smoothstep(0.4, 3.0, aRadius));
  float sizeCap = mix(4.0, 12.0, smoothstep(0.6, 3.5, aRadius));
  gl_PointSize = min((0.75 + sizeBoost * 0.8) * (20.0 / viewDepth) * sizeScale, sizeCap);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const fragmentShader = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;
  float soft = 1.0 - smoothstep(0.0, 0.5, d);
  gl_FragColor = vec4(vColor * soft, vAlpha * soft);
}
`;

export function StarFieldScene({ palette, tier, speed = 1 }: VisualizerSceneProps) {
  const mods = useModulation();
  const pointsRef = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const metricsRef = useMetricsRef();
  const zoomRef = useCameraZoomDistanceRef();
  const beatZoomRef = useRef(0);
  const { camera } = useThree();

  const hatSmooth = useRef(0);
  const kickSmooth = useRef(0);
  const gatherSmooth = useRef(0);
  const snareSmooth = useRef(0);
  const dropSmooth = useRef(0);
  const shimmerSmooth = useRef(0);
  const shockTravelRef = useRef(1);
  const shockArmedRef = useRef(true);
  const previousDropRef = useRef(0);
  // Seed with the JSX Y twist so absolute assignment doesn't flatten the disc.
  const spinAccum = useRef(Math.PI / 10);
  const flowTimeRef = useRef(0);

  const count = tier === 'high' ? 50_000 : tier === 'mid' ? 24_000 : 8_000;
  // Low tier: slightly softer kit so sparse stars don't strobe; mid/high full.
  const kitAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;

  // MIT GalaxyGeometry supplies zero positions + a_index; dispose on tier change.
  const geometry = useMemo(() => new GalaxyGeometry(count), [count]);
  useEffect(
    () => () => {
      geometry.dispose();
    },
    [geometry],
  );

  const uniforms = useMemo(
    () => ({
      uTotal: { value: count },
      uTime: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uHigh: { value: 0 },
      uBeat: { value: 0 },
      uEnergy: { value: 0 },
      uFlowTime: { value: 0 },
      uFlowAmt: { value: 0 },
      uBandSpread: { value: 0.9 },
      uHat: { value: 0 },
      uKick: { value: 0 },
      uGather: { value: 0 },
      uSnare: { value: 0 },
      uDrop: { value: 0 },
      uShockTravel: { value: 1 },
      uShimmer: { value: 0 },
      uAfterglow: { value: 0 },
      uColorBass: { value: new THREE.Color('#FF2E93') },
      uColorMid: { value: new THREE.Color('#8A5CFF') },
      uColorHigh: { value: new THREE.Color('#33E5FF') },
    }),
    // uTotal and palette colors are refreshed in the frame loop without
    // replacing the material or its uniform objects.
    [],
  );

  useFrame((state, delta) => {
    const mat = matRef.current;
    const points = pointsRef.current;
    if (!mat || !points) return;

    const m = metricsRef.current;
    const spd = Math.max(0.05, mods.current.speed ?? speed);
    const dt = Math.min(delta, 0.05);
    const bass = Math.min(2, Math.max(0, m.bass));
    const mid = Math.min(2, Math.max(0, m.mid));
    const high = Math.min(2, Math.max(0, m.high));
    const energy = Math.min(2, Math.max(0, m.energy));
    const sectionPace = 0.7 + Math.min(1, Math.max(0, m.sectionLevel)) * 0.55;

    mat.uniforms.uTotal!.value = count;
    mat.uniforms.uBass!.value = bass;
    mat.uniforms.uMid!.value = mid;
    mat.uniforms.uHigh!.value = high;
    mat.uniforms.uBeat!.value = Math.min(1.5, Math.max(0, m.impact));
    // Afterglow keeps the garden luminous after the chorus lets go.
    mat.uniforms.uEnergy!.value = Math.min(2, energy + m.afterglow * 0.25);
    mat.uniforms.uAfterglow!.value = Math.min(1, Math.max(0, m.afterglow));
    (mat.uniforms.uColorBass!.value as THREE.Color).set(palette.bass);
    (mat.uniforms.uColorMid!.value as THREE.Color).set(palette.mid);
    (mat.uniforms.uColorHigh!.value as THREE.Color).set(palette.high);

    hatSmooth.current = smoothToward(
      hatSmooth.current,
      Math.min(1.2, m.hat) * kitAmp,
      dt,
      0.028,
      0.09,
    );
    kickSmooth.current = smoothToward(
      kickSmooth.current,
      Math.min(1.2, m.kick) * kitAmp,
      dt,
      0.035,
      0.14,
    );
    gatherSmooth.current = smoothToward(
      gatherSmooth.current,
      Math.min(1, m.gather) * kitAmp,
      dt,
      0.05,
      0.14,
    );
    snareSmooth.current = smoothToward(
      snareSmooth.current,
      Math.min(1.2, m.snare) * kitAmp,
      dt,
      0.025,
      0.1,
    );
    dropSmooth.current = smoothToward(
      dropSmooth.current,
      Math.min(1.2, m.dropEvent) * kitAmp,
      dt,
      0.04,
      0.22,
    );
    shimmerSmooth.current = smoothToward(
      shimmerSmooth.current,
      Math.min(1.2, m.shimmer) * kitAmp,
      dt,
      0.05,
      0.16,
    );

    const dropNow = dropSmooth.current;
    if (dropNow < 0.08) shockArmedRef.current = true;
    if (shockArmedRef.current && dropNow > 0.3 && previousDropRef.current <= 0.3) {
      shockTravelRef.current = 0;
      shockArmedRef.current = false;
    }
    previousDropRef.current = dropNow;
    if (shockTravelRef.current < 1) {
      shockTravelRef.current = Math.min(
        1,
        shockTravelRef.current + dt * Math.max(0.1, spd) * (0.72 + m.sectionLevel * 0.28),
      );
    }

    mat.uniforms.uHat!.value = hatSmooth.current;
    mat.uniforms.uKick!.value = kickSmooth.current;
    mat.uniforms.uGather!.value = gatherSmooth.current;
    mat.uniforms.uSnare!.value = snareSmooth.current;
    mat.uniforms.uDrop!.value = dropNow;
    mat.uniforms.uShockTravel!.value = shockTravelRef.current;
    mat.uniforms.uShimmer!.value = shimmerSmooth.current;

    // Forward-only accumulators — never multiply clock time by changing energy.
    flowTimeRef.current += dt * spd * (0.4 + Math.min(energy, 1.5) * 0.4);
    mat.uniforms.uFlowTime!.value = flowTimeRef.current;
    mat.uniforms.uTime!.value = flowTimeRef.current;
    mat.uniforms.uFlowAmt!.value =
      (0.04 +
        Math.min(1, m.swell) * 0.18 +
        dropSmooth.current * 0.4 +
        Math.min(1, m.afterglow) * 0.1) *
      (1 - gatherSmooth.current * 0.35);
    // Convergence tightens band spread across spiral arms.
    mat.uniforms.uBandSpread!.value = (1 - m.convergence) * 0.9;

    beatZoomRef.current = Math.max(0, beatZoomRef.current - dt * 3.5);
    if (m.impact > 0.35) beatZoomRef.current = 1;

    const sway = energy * 0.08;
    spinAccum.current += dt * spd * (0.03 + mid * 0.06) * sectionPace;
    const barLock = m.barPhase > 0 ? Math.sin(m.barPhase * Math.PI * 2) * 0.045 : 0;
    points.rotation.y = spinAccum.current + barLock;
    points.rotation.x = Math.PI / 3 + Math.sin(state.clock.elapsedTime * 0.12) * 0.08 + sway;

    // GalaxyGeometry spans roughly ten world units. Fit against the narrow
    // viewport dimension so square and portrait projector/export frames keep
    // the full spiral before users intentionally zoom in.
    const aspect = Math.max(0.45, state.size.width / Math.max(state.size.height, 1));
    const aspectFit = Math.max(1, 1.4 / aspect);
    const baseZ = (zoomRef?.current ?? 3.1) * 3.55 * aspectFit;
    camera.position.set(
      Math.sin(state.clock.elapsedTime * 0.08) * sway * 2,
      Math.cos(state.clock.elapsedTime * 0.11) * sway,
      baseZ - beatZoomRef.current * 0.35 - kickSmooth.current * 0.12,
    );
    camera.lookAt(0, 0, 0);
  });

  return (
    // Disc tilted ~30° from face-on so spiral arms read with depth.
    <points
      ref={pointsRef}
      geometry={geometry}
      rotation={[Math.PI / 3, Math.PI / 10, 0]}
      frustumCulled={false}
    >
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

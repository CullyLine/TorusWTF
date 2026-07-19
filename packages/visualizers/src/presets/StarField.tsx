'use client';

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';
import { useModulation } from '../modulation';
import { useCameraZoomDistanceRef } from '../cameraZoom';
import { FLOW_GLSL } from '../dsp/flowGlsl';

const ARMS = 3;

/**
 * Smooth toward a target with asymmetric rise/fall (seconds).
 * Keeps gather inhale and snare streaks fluid — no linear snaps.
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

attribute float aPhase;
attribute float aRadius;
attribute float aArm;

uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uHigh;
uniform float uBeat;
uniform float uEnergy;
uniform float uFlowTime;
uniform float uFlowAmt;
uniform float uBandSpread;
uniform float uGather;
uniform float uSnare;
uniform vec3 uColorBass;
uniform vec3 uColorMid;
uniform vec3 uColorHigh;

varying vec3 vColor;
varying float vAlpha;

void main() {
  vec3 pos = position;
  // Flow Field Update: stars shimmer along a curl current. Displacement
  // (not advection) keeps the spiral intact — the galaxy breathes with the
  // music and settles back to a clean spiral at rest. Each ARM is a band:
  // they ride separate currents until the music converges.
  vec3 fv = ffFlow(pos, aArm, uFlowTime, 0.6, 0.5, 1.0, uBandSpread, 0.0);
  pos += fv * uFlowAmt * (0.4 + aPhase * 0.6);

  // Gather inhale: spiral arms contract toward the nucleus — outer arms
  // pull harder so the pre-beat breath reads as depth, not a flat scale.
  float armWeight = smoothstep(0.35, 2.6, aRadius);
  float gatherPull = 1.0 - uGather * armWeight * 0.18;
  pos.x *= gatherPull;
  pos.z *= gatherPull;
  pos.y *= 1.0 - uGather * 0.1;

  // Snare lateral streak: tangential whip on mid-arm stars (not the core,
  // not a sparse hat glitter). Distinct axes from kick-core / hat-tick work.
  float armBand =
    smoothstep(0.7, 1.9, aRadius) * (1.0 - smoothstep(3.4, 5.1, aRadius));
  float snareSelect = step(0.38, fract(aPhase * 31.7 + aArm * 0.29));
  float snareAmt = snareSelect * armBand * uSnare;
  vec2 tangential = normalize(vec2(-pos.z, pos.x) + 1e-5);
  pos.x += tangential.x * snareAmt * 0.58;
  pos.z += tangential.y * snareAmt * 0.58;
  // Tiny radial flare so the streak reads as a flash, not pure rotation.
  pos.x += pos.x * snareAmt * 0.045;
  pos.z += pos.z * snareAmt * 0.045;

  float twinkle = sin(uTime * (3.0 + aPhase * 5.0) + aPhase * 40.0) * 0.5 + 0.5;
  twinkle *= 0.35 + uHigh * 0.65;

  float burst = step(0.97, fract(aPhase * 17.0 + uTime * (0.5 + uMid)));
  float sizeBoost =
    1.0 + uBass * 0.4 + uBeat * 0.35 + burst * uMid * 1.8 + snareAmt * 0.75;

  float core = 1.0 - smoothstep(0.0, 2.5, aRadius);
  float rim = smoothstep(1.5, 5.0, aRadius);
  // Galaxy body follows the user's palette: hot bright core (high color),
  // mid-tone arms, and bass-colored outer rim — with a whisper of the
  // natural astronomy tint mixed in so it still reads as a galaxy.
  vec3 hotCore = mix(uColorHigh, vec3(1.0, 0.97, 0.9), core * 0.3);
  vec3 armCol = mix(uColorMid, uColorHigh, aPhase * 0.4);
  vec3 rimCol = uColorBass;
  vec3 body = mix(mix(hotCore, armCol, smoothstep(0.0, 1.8, aRadius)), rimCol, rim);
  // Per-star brightness also falls toward the packed center — the summed
  // additive light keeps the core glowing without clipping to white.
  float lumDamp = mix(0.62, 1.0, smoothstep(0.2, 2.6, aRadius));
  // Snare: selected arm stars flash mid→high along the streak.
  vec3 lit =
    body * (1.0 + twinkle * 0.35 + core * uBass * 0.2 + uGather * armWeight * 0.08) +
    mix(uColorMid, uColorHigh, 0.45) * snareAmt * 0.95;
  vColor = lit * lumDamp;
  // Alpha eases DOWN toward the dense center — tens of thousands of additive
  // sprites overlap there, so per-star opacity must shrink or it whites out.
  // The damp band is wide (radius 0..3.2) because the inner arms are nearly
  // as dense as the core itself.
  float dense = 1.0 - smoothstep(0.0, 3.2, aRadius);
  float coreDamp = 1.0 - dense * 0.6;
  vAlpha =
    (0.34 + twinkle * 0.3 + uEnergy * 0.08 + snareAmt * 0.38) * coreDamp +
    core * 0.04;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  // Base size kept small: 50k+ additively-blended points saturate the framebuffer
  // (and the bloom pass) instantly if individual sprites get too large.
  // The depth divisor is floored and the final size capped: a star drifting
  // near the camera plane must not become a screen-filling sprite.
  float pz = max(0.9, -mvPosition.z);
  // Dense-center sprites shrink hard: overdraw scales with sprite AREA, so
  // pixel-size stars in the packed core keep it luminous instead of white.
  float sizeScale = mix(0.45, 1.0, smoothstep(0.4, 3.0, aRadius));
  float sizeCap = mix(6.0, 18.0, smoothstep(0.6, 3.5, aRadius));
  gl_PointSize = min((1.2 + sizeBoost * 1.4) * (22.0 / pz) * sizeScale, sizeCap);
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
  float soft = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vColor * soft, vAlpha * soft);
}
`;

export function StarFieldScene({ analyser, palette, tier, speed = 1 }: VisualizerSceneProps) {
  const mods = useModulation();
  const pointsRef = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const metricsRef = useMetricsRef();
  const zoomRef = useCameraZoomDistanceRef();
  const beatZoomRef = useRef(0);
  const { camera } = useThree();

  // Gather inhale + snare streak envelopes (smoothed for fluid motion).
  const gatherSmooth = useRef(0);
  const snareSmooth = useRef(0);

  const count = tier === 'high' ? 50_000 : tier === 'mid' ? 24_000 : 8_000;
  // Low tier: slightly softer accents so sparse stars don't strobe.
  const kitAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;

  const { positions, phases, radii, arms } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const phase = new Float32Array(count);
    const radius = new Float32Array(count);
    const arm = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const armI = i % ARMS;
      const t = Math.random();
      const r = 0.15 + Math.pow(t, 1.55) * 5.5;
      const theta = armI * ((Math.PI * 2) / ARMS) + r * 0.95 + (Math.random() - 0.5) * 0.4;
      const yThick = (Math.random() - 0.5) * Math.exp(-r * 0.35) * 0.55;

      pos[i * 3] = Math.cos(theta) * r;
      pos[i * 3 + 1] = yThick;
      pos[i * 3 + 2] = Math.sin(theta) * r;
      phase[i] = Math.random();
      radius[i] = r;
      arm[i] = armI;
    }

    return { positions: pos, phases: phase, radii: radius, arms: arm };
  }, [count]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uHigh: { value: 0 },
      uBeat: { value: 0 },
      uEnergy: { value: 0 },
      uFlowTime: { value: 0 },
      uFlowAmt: { value: 0 },
      uBandSpread: { value: 0.9 },
      uGather: { value: 0 },
      uSnare: { value: 0 },
      uColorBass: { value: new THREE.Color('#FF2E93') },
      uColorMid: { value: new THREE.Color('#8A5CFF') },
      uColorHigh: { value: new THREE.Color('#33E5FF') },
    }),
    [],
  );
  const flowTimeRef = useRef(0);

  useFrame((state, delta) => {
    const mat = matRef.current;
    const points = pointsRef.current;
    if (!mat || !points) return;

    const m = metricsRef.current;
    const spd = mods.current.speed ?? speed;
    const dt = Math.min(delta, 0.05);
    // The galaxy turns with the song's arc — slow drift in valleys, real
    // rotation at peaks.
    const sectionPace = 0.7 + m.sectionLevel * 0.55;
    mat.uniforms.uTime!.value = state.clock.elapsedTime;
    mat.uniforms.uBass!.value = m.bass;
    mat.uniforms.uMid!.value = m.mid;
    mat.uniforms.uHigh!.value = m.high;
    mat.uniforms.uBeat!.value = m.impact;
    // Afterglow keeps the arms energized after the chorus lets go.
    mat.uniforms.uEnergy!.value = m.energy + m.afterglow * 0.25;
    (mat.uniforms.uColorBass!.value as THREE.Color).set(palette.bass);
    (mat.uniforms.uColorMid!.value as THREE.Color).set(palette.mid);
    (mat.uniforms.uColorHigh!.value as THREE.Color).set(palette.high);

    // Gather rises with the pre-beat breath; snare cracks fast and clears
    // before the next mid hit so streaks stay distinct from soft twinkle.
    gatherSmooth.current = smoothToward(
      gatherSmooth.current,
      Math.min(1, m.gather) * kitAmp,
      dt,
      0.045,
      0.14,
    );
    snareSmooth.current = smoothToward(
      snareSmooth.current,
      Math.min(1.2, m.snare) * kitAmp,
      dt,
      0.03,
      0.11,
    );
    mat.uniforms.uGather!.value = gatherSmooth.current;
    mat.uniforms.uSnare!.value = snareSmooth.current;

    flowTimeRef.current += dt * spd * (0.4 + Math.min(m.energy, 1.5) * 0.4);
    mat.uniforms.uFlowTime!.value = flowTimeRef.current;
    // Calm at rest, swirling on energy, surging on drops — and still
    // stirring for a while after a peak (afterglow). Gather softens the
    // curl so the inhale reads as held breath, not more turbulence.
    mat.uniforms.uFlowAmt!.value =
      (0.04 + m.swell * 0.18 + m.dropEvent * 0.4 + m.afterglow * 0.1) *
      (1 - gatherSmooth.current * 0.35);
    mat.uniforms.uBandSpread!.value = (1 - m.convergence) * 0.9;

    beatZoomRef.current = Math.max(0, beatZoomRef.current - delta * 3.5);
    if (m.impact > 0.35) beatZoomRef.current = 1;

    const sway = m.energy * 0.08;
    points.rotation.y += delta * spd * (0.03 + m.mid * 0.06) * sectionPace;
    // Sway AROUND the base tilt — assigning the raw sway here used to stomp
    // the JSX rotation and flatten the disc edge-on (white-hot smear).
    points.rotation.x = Math.PI / 3 + Math.sin(state.clock.elapsedTime * 0.12) * 0.08 + sway;

    const baseZ = zoomRef?.current ?? 4;
    camera.position.set(
      Math.sin(state.clock.elapsedTime * 0.08) * sway * 2,
      Math.cos(state.clock.elapsedTime * 0.11) * sway,
      baseZ - beatZoomRef.current * 0.35,
    );
    camera.lookAt(0, 0, 0);

    if (analyser) analyser.getFrequencyData(freqBuf.current);
  });

  return (
    // Previously [PI/2.05, 0, 0] which put the galaxy nearly face-on. The
    // disc is so thin that face-on read as a flat 2D smear — the user
    // perceived it as "horizontal" / lacking depth. Tilting the disc 30°
    // away from face-on (and adding a slight Y twist) reveals the spiral
    // arms in 3D: the far arms recede into the distance, near arms come
    // forward, and you can clearly see the disc curl around in space.
    <points ref={pointsRef} rotation={[Math.PI / 3, Math.PI / 10, 0]}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} count={count} itemSize={3} />
        <bufferAttribute attach="attributes-aPhase" args={[phases, 1]} count={count} itemSize={1} />
        <bufferAttribute attach="attributes-aRadius" args={[radii, 1]} count={count} itemSize={1} />
        <bufferAttribute attach="attributes-aArm" args={[arms, 1]} count={count} itemSize={1} />
      </bufferGeometry>
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

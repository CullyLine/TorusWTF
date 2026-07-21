'use client';

/**
 * Liquid Chrome — glossy displaced icosahedron. Call-and-response layer:
 *  - gather → surface inhales (scale + displacement squeeze) before the beat
 *  - impact → release punch expands the metal
 *  - kick → floor bulge (Y-axis thump on the lower hemisphere)
 *  - snare → lateral surface crack (X shear / crease)
 *  - hat / shimmer → fresnel rim sparkles
 *  - echo → faint delayed ripples travel across the chrome in phrase gaps
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';
import { useModulation } from '../modulation';

const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uEnergy;
uniform float uBeat;
uniform float uGather;
uniform float uEcho;
uniform float uKick;
uniform float uSnare;

varying vec3 vNormal;
varying vec3 vViewDir;
varying float vNoise;
varying float vRimSeed;
varying float vEchoWave;
varying float vSnareCrack;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * snoise(p);
    p *= 2.02;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 pos = position;
  vec3 n = normalize(normal);
  float t = uTime;
  // Gather softens displacement (the metal holds its breath); impact
  // and energy still push the surface out on the release.
  float inhale = 1.0 - uGather * 0.55;
  float disp = (0.12 + uBass * 0.35 + uBeat * 0.32 + uEnergy * 0.08) * inhale;
  vec3 samplePos = pos * 2.1 + vec3(t * 0.35, t * 0.28, t * 0.22);
  float noise = fbm(samplePos + uMid * 0.35);
  vNoise = noise;
  pos += n * noise * disp;

  // Kick: floor bulge — lower hemisphere thumps down/out on the kick,
  // distinct from the whole-body impact punch.
  float floorMask = smoothstep(0.35, -0.85, position.y);
  float kickBulge = uKick * (0.1 + floorMask * 0.22);
  pos.y -= kickBulge * 0.55;
  pos += n * kickBulge * 0.75;

  // Snare: lateral surface crack — phase-split X crease so L/R halves
  // shear apart briefly (not a rotation, not a rim glitter).
  float crackSeed = sin(position.y * 9.0 + position.z * 6.2);
  float snareCrack = uSnare * (0.55 + 0.45 * crackSeed);
  float side = position.x >= 0.0 ? 1.0 : -1.0;
  pos.x += snareCrack * 0.16 * side;
  pos += n * abs(snareCrack) * 0.04;
  vSnareCrack = snareCrack;

  // Echo: a traveling radial ripple across the shell — phrase memory.
  float radial = length(pos.xy) * 4.2 + pos.z * 1.6;
  float echoWave = sin(radial - t * 5.5) * uEcho;
  pos += n * echoWave * 0.085;
  vEchoWave = echoWave;

  // Whole-body inhale / hit-release (paired with mesh.scale in JS).
  pos *= 1.0 - uGather * 0.07 + uBeat * 0.045;

  float eps = 0.02;
  float nx = fbm(samplePos + vec3(eps, 0.0, 0.0)) - fbm(samplePos - vec3(eps, 0.0, 0.0));
  float ny = fbm(samplePos + vec3(0.0, eps, 0.0)) - fbm(samplePos - vec3(0.0, eps, 0.0));
  float nz = fbm(samplePos + vec3(0.0, 0.0, eps)) - fbm(samplePos - vec3(0.0, 0.0, eps));
  vec3 grad = normalize(vec3(nx, ny, nz));
  vNormal = normalize(normalMatrix * grad);
  // Stable-ish seed for rim glitter (view-independent enough to tick).
  vRimSeed = fract(noise * 7.13 + pos.x * 3.1 + pos.y * 5.7);

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  vViewDir = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const fragmentShader = /* glsl */ `
uniform float uTime;
uniform float uEnergy;
uniform float uBeat;
uniform float uSparkle;
uniform float uEcho;
uniform float uKick;
uniform float uSnare;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uEmissive;

varying vec3 vNormal;
varying vec3 vViewDir;
varying float vNoise;
varying float vRimSeed;
varying float vEchoWave;
varying float vSnareCrack;

vec3 envColor(vec3 dir) {
  float t = dir.y * 0.5 + 0.5;
  vec3 top = vec3(0.15, 0.35, 0.55);
  vec3 horizon = vec3(0.55, 0.12, 0.35);
  vec3 ground = vec3(0.02, 0.02, 0.06);
  vec3 sky = mix(horizon, top, smoothstep(0.0, 0.65, t));
  return mix(ground, sky, smoothstep(-0.2, 0.35, t));
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vViewDir);
  vec3 R = reflect(-V, N);
  vec3 env = envColor(R);

  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 base = mix(uColorA, uColorB, vNoise * 0.5 + 0.5);
  // Chrome leans on the palette (not the fixed env) so the body stays
  // colorful; emissive is kept low or loud passages clip the whole blob
  // to white.
  vec3 tintedEnv = mix(env, base, 0.45);
  vec3 chrome = mix(base * 0.4, tintedEnv, 0.5 + fresnel * 0.4);
  chrome += uEmissive * (0.08 + uEnergy * 0.2 + uBeat * 0.22 + uKick * 0.12);
  chrome += mix(uColorB, vec3(1.0), 0.4) * fresnel * 0.3;

  // Hat / shimmer: sharp rim sparkles — glitter, not a soft wash.
  float twinkle = step(0.72, fract(vRimSeed * 17.0 + uTime * 11.0));
  float sparkGate = smoothstep(0.12, 0.55, uSparkle);
  chrome += vec3(1.0) * fresnel * twinkle * sparkGate * (0.35 + uSparkle * 0.65);

  // Snare crease catches a brief mid highlight along the crack (not rim glitter).
  chrome += mix(uColorA, vec3(1.0), 0.35) * abs(vSnareCrack) * uSnare * 0.28;

  // Echo ripple leaves a faint bright crest on the metal.
  chrome += mix(uColorB, vec3(1.0), 0.5) * max(vEchoWave, 0.0) * uEcho * 0.22;

  gl_FragColor = vec4(chrome, 1.0);
}
`;

function smoothToward(current: number, target: number, dt: number, riseTau: number, fallTau: number) {
  const tau = target > current ? riseTau : fallTau;
  const k = 1 - Math.exp(-dt / Math.max(tau, 1e-4));
  return current + (target - current) * k;
}

export function LiquidChromeScene({ analyser, palette, tier, speed = 1 }: VisualizerSceneProps) {
  const mods = useModulation();
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const metricsRef = useMetricsRef();
  const timeRef = useRef(0);
  const gatherSmooth = useRef(0);
  const echoSmooth = useRef(0);
  const sparkleSmooth = useRef(0);
  const kickSmooth = useRef(0);
  const snareSmooth = useRef(0);
  const scaleSmooth = useRef(1);
  const scaleYSmooth = useRef(1);

  const detail = tier === 'high' ? 6 : tier === 'mid' ? 5 : 4;
  // Low tier still gets call-and-response (cheap uniforms); mid/high just
  // have denser geometry so ripples and rim glitter read sharper.
  const echoAmp = tier === 'low' ? 0.75 : 1;
  const sparkleAmp = tier === 'low' ? 0.7 : tier === 'mid' ? 0.9 : 1;
  const kitAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;

  const geometry = useMemo(() => new THREE.IcosahedronGeometry(1.1, detail), [detail]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uEnergy: { value: 0 },
      uBeat: { value: 0 },
      uGather: { value: 0 },
      uEcho: { value: 0 },
      uSparkle: { value: 0 },
      uKick: { value: 0 },
      uSnare: { value: 0 },
      uColorA: { value: new THREE.Color(palette.mid) },
      uColorB: { value: new THREE.Color(palette.high) },
      uEmissive: { value: new THREE.Color(palette.high) },
    }),
    [palette.mid, palette.high],
  );

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    const mat = matRef.current;
    if (!mesh || !mat) return;

    const m = metricsRef.current;
    const dt = Math.min(delta, 0.1);
    const spd = mods.current.speed ?? speed;
    // Music-paced clock: flows faster in loud passages, honors Speed.
    // Tenderness stills the surface — vocal-led quiet passages read as a
    // calm pool instead of churning metal.
    const calm = 1 - m.tenderness * 0.35;
    timeRef.current += dt * spd * (0.6 + m.swell * 0.9 + m.impact * 0.4) * calm;
    mat.uniforms.uTime!.value = timeRef.current;
    mat.uniforms.uBass!.value = m.bass * calm;
    mat.uniforms.uMid!.value = m.mid;
    // Afterglow keeps the chrome softly lit from within after big moments.
    mat.uniforms.uEnergy!.value = m.energy + m.afterglow * 0.4;
    mat.uniforms.uBeat!.value = m.impact;

    // Call-and-response envelopes — springy rise, slower release so the
    // inhale and echo ripples feel continuous rather than gated.
    gatherSmooth.current = smoothToward(gatherSmooth.current, m.gather, dt, 0.045, 0.14);
    echoSmooth.current = smoothToward(echoSmooth.current, m.echo * echoAmp, dt, 0.05, 0.28);
    const sparkleTarget = Math.min(1.2, m.hat * 0.85 + m.shimmer * 0.55) * sparkleAmp;
    sparkleSmooth.current = smoothToward(sparkleSmooth.current, sparkleTarget, dt, 0.03, 0.12);
    // Kit axes: fast attack so four-on-the-floor reads punchy, slower fall
    // so the metal doesn't chatter between hits.
    kickSmooth.current = smoothToward(
      kickSmooth.current,
      Math.min(1.2, m.kick) * kitAmp,
      dt,
      0.028,
      0.11,
    );
    snareSmooth.current = smoothToward(
      snareSmooth.current,
      Math.min(1.2, m.snare) * kitAmp,
      dt,
      0.025,
      0.1,
    );

    mat.uniforms.uGather!.value = gatherSmooth.current;
    mat.uniforms.uEcho!.value = echoSmooth.current;
    mat.uniforms.uSparkle!.value = sparkleSmooth.current;
    mat.uniforms.uKick!.value = kickSmooth.current;
    mat.uniforms.uSnare!.value = snareSmooth.current;

    (mat.uniforms.uColorA!.value as THREE.Color).set(palette.mid);
    (mat.uniforms.uColorB!.value as THREE.Color).set(palette.high);
    (mat.uniforms.uEmissive!.value as THREE.Color).set(palette.high);

    // Mesh-scale inhale / hit-release on top of vertex squeeze.
    // Kick adds a brief Y stretch so the floor thump also reads in silhouette.
    const scaleTarget =
      1 - gatherSmooth.current * 0.08 + m.impact * 0.055 + m.release * 0.02;
    scaleSmooth.current = smoothToward(scaleSmooth.current, scaleTarget, dt, 0.04, 0.11);
    const scaleYTarget = scaleSmooth.current * (1 + kickSmooth.current * 0.1);
    scaleYSmooth.current = smoothToward(scaleYSmooth.current, scaleYTarget, dt, 0.03, 0.1);
    mesh.scale.set(scaleSmooth.current, scaleYSmooth.current, scaleSmooth.current);

    // Snare: absolute Z roll (never accumulate) — a lateral flash of the shell.
    mesh.rotation.z = snareSmooth.current * 0.07 * (Math.sin(m.barPhase * Math.PI * 2) || 1);
    mesh.rotation.y += delta * spd * (0.15 + m.mid * 0.4) * (0.72 + m.sectionLevel * 0.5);
    mesh.rotation.x = Math.sin(state.clock.elapsedTime * 0.35) * 0.12 + m.high * 0.08;

    if (analyser) analyser.getFrequencyData(freqBuf.current);
  });

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  );
}

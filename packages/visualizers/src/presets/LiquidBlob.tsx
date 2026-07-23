'use client';

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';
import { useModulation } from '../modulation';

/**
 * Lava Choir (stable id: liquid_blob) — orthographic raymarched SDF of a
 * sculptural choir of independently breathing smooth-union orbs.
 *
 * Persistent harmonic voices stand in a shallow arc (bas-relief sculpture);
 * transient smaller voices flare on high/shimmer. Fluid, volcanic, musical —
 * not an anchor blob with appendages.
 *
 * Controls (stored keys preserved):
 *  - inflate → orb puff + smooth-union fusion
 *      low = distinct / stretching voices; high = plush fused choir
 *  - appendages → persistent voice count (clamped to MAX_APPENDAGES)
 *  - subSpheres → transient high-frequency voice count (clamped)
 *
 * Call-and-response + kit:
 *  - bass → broadens / deepens the low voices
 *  - mid → choir sway + fusion
 *  - high / shimmer → birth transient harmonic orbs
 *  - kick → vertical floor / puff pulse
 *  - snare → shears alternating voices
 *  - gather → contracts / inhales; impact+release expands
 *  - echo → one traveling surface harmonic
 *  - holdBreath / silence → ease motion nearly still
 *  - afterglow → residual heat
 */

const RAY_STEPS_HIGH = 96;
const RAY_STEPS_MID = 64;
const RAY_STEPS_LOW = 40;
const FULLSCREEN_TRIANGLE = new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]);

// Hard caps — loop bounds in the SDF, worst-case shader cost.
const MAX_APPENDAGES = 10;
const MAX_SUB_SPHERES = 8;

function buildFragmentShader(steps: number): string {
  return /* glsl */ `
#define RAY_STEPS ${steps}
#define MAX_APPENDAGES ${MAX_APPENDAGES}
#define MAX_SUB_SPHERES ${MAX_SUB_SPHERES}

uniform vec2 uResolution;
uniform float uTime;
// Monotonic JS-accumulated motion phase — always grows forward.
uniform float uPhase;
// Monotonic music-driven phase for choir sway / transient birth paths.
uniform float uOrbitPhase;
uniform float uBass;
uniform float uMid;
uniform float uHigh;
uniform float uEnergy;
uniform float uBeat;
uniform float uScale;
// 0..1 — orb puff + smooth-union fusion. Low = distinct stretching voices;
// high = plush fused choir.
uniform float uInflate;
// Persistent voice / orb count. Clamped to MAX_APPENDAGES.
uniform int uAppendages;
// Transient high-frequency voice count. Clamped to MAX_SUB_SPHERES.
uniform int uSubSphereCount;
// 0..1 shimmer envelope — gates transient voice radius.
uniform float uSubAmount;
uniform float uBarPhase;
uniform float uDrop;
uniform float uSilence;
uniform float uGather;
uniform float uEcho;
uniform float uEchoTravel;
uniform float uKick;
uniform float uSnare;
// 1 = paint built-in backdrop on ray miss; 0 = transparent for BackgroundLayer.
uniform float uBgAlpha;
uniform vec3 uColorBass;
uniform vec3 uColorMid;
uniform vec3 uColorHigh;

float sdSphere(vec3 p, float r) {
  return length(p) - r;
}

float smin(float a, float b, float k) {
  float kk = max(k, 1e-4);
  float h = clamp(0.5 + 0.5 * (b - a) / kk, 0.0, 1.0);
  return mix(b, a, h) - kk * h * (1.0 - h);
}

float safeLen(vec3 v) {
  return max(length(v), 1e-4);
}

vec3 safeNorm(vec3 v) {
  return v / safeLen(v);
}

// Soft volcanic domain warp — lava churn without collapsing the SDF.
vec3 warpSpace(vec3 p, float t) {
  float inhale = 1.0 - uGather * 0.5;
  float w = (0.055 + uMid * 0.04 + uEnergy * 0.025) * inhale;
  p.x += sin(p.y * 2.4 + t * 0.72) * w;
  p.y += cos(p.x * 2.1 + t * 0.58) * w * 0.85;
  p.z += sin(p.x * 1.9 + p.y * 1.6 + t * 0.81) * w * 0.55;
  return p;
}

// Transient harmonic voices alone (no persistent choir). Returns a huge
// sentinel when inactive so callers can skip smin — mixing a 1e9 distance
// through smin cancels float32 and zero-fills the field (screen-hit bug).
float transientField(vec3 p) {
  if (uSubSphereCount <= 0 || uSubAmount < 0.01) return 1e9;
  float ot = uOrbitPhase * 1.65;
  float d = 1e9;
  for (int i = 0; i < MAX_SUB_SPHERES; i++) {
    if (i >= uSubSphereCount) break;
    float fi = float(i);
    float slot = (fi + 0.5) / max(float(uSubSphereCount), 1.0) - 0.5;
    // Birth along the upper rim of the choir, drifting with shimmer.
    float drift = ot * (0.9 + fi * 0.11) + fi * 1.97;
    vec3 center = vec3(
      slot * 1.15 + sin(drift) * 0.12,
      0.28 + 0.16 * sin(drift * 1.3 + fi) + uHigh * 0.06,
      0.18 + 0.1 * cos(drift * 0.85 + fi * 0.7)
    );
    float presence = max(uSubAmount, 0.12);
    float baseR = 0.085 + 0.035 * sin(ot * 2.4 + fi * 1.7);
    float rr = baseR * presence * (0.85 + uHigh * 0.5);
    d = min(d, sdSphere(p - center, rr));
  }
  return d;
}

vec3 kickDomain(vec3 p) {
  float kickY = 1.0 + uKick * 0.42;
  return vec3(p.x, p.y / kickY, p.z);
}

// Persistent choir voices + soft magma hearth. Compact in unit space so
// max scale / inflate cannot put the ortho camera inside the field.
float sceneInner(vec3 p) {
  float t = uPhase;
  float tw = uTime;
  float ot = uOrbitPhase;

  float gatherSqueeze = 1.0 - uGather * 0.18;
  // Inflate: puff radii + widen smooth-union. Low inflate stretches voices.
  float puff = mix(0.78, 1.18, uInflate);
  // Keep repeated unions bounded: large k values compound across voices and
  // can otherwise turn max-gain passages into one frame-filling slab.
  float k = mix(0.025, 0.11, uInflate) + uMid * 0.02 + uEnergy * 0.01;
  float stretch = (1.0 - uInflate) * (0.22 + uBass * 0.18);

  // Kick: vertical floor / puff — anisotropic Y pulse through the choir.
  float kickY = 1.0 + uKick * 0.42;
  vec3 pk = kickDomain(p);

  // Magma hearth — deep bass body under the choir (always present).
  float hearthR = (0.22 + uBass * 0.14 * puff + uKick * 0.03) * gatherSqueeze;
  vec3 hearthC = vec3(0.0, -0.42 + uBass * 0.04, 0.05);
  float d = sdSphere(pk - hearthC, hearthR) * mix(1.0, kickY, 0.3);

  // Mid sway of the whole riser.
  float sway = sin(ot * 0.55) * (0.04 + uMid * 0.07) * (1.0 - uGather * 0.4);

  int voices = uAppendages;
  for (int i = 0; i < MAX_APPENDAGES; i++) {
    if (i >= voices) break;
    float fi = float(i);
    float n = max(float(voices), 1.0);
    float slot = (fi + 0.5) / n - 0.5;

    // Independent breath per voice — harmonic-ish phase offsets.
    float breath = sin(t * (0.9 + fi * 0.07) + fi * 1.618) * 0.5 + 0.5;
    float lowBias = 1.0 - abs(slot) * 0.55;

    // Arc / riser placement — persistent harmonic choir, not orbiting limbs.
    float span = 1.18 + uBass * 0.1 * lowBias;
    vec3 center = vec3(
      slot * span * 1.35 + sway,
      -0.08 + lowBias * 0.06 + breath * 0.05 * puff
        + uBass * 0.07 * lowBias
        - (1.0 - lowBias) * 0.04,
      0.12 - slot * slot * 0.35 + sin(fi * 2.1 + t * 0.3) * 0.04
    );

    // Snare shears alternating voices laterally.
    float side = mod(fi, 2.0) < 0.5 ? 1.0 : -1.0;
    center.x += uSnare * (0.14 + 0.05 * breath) * side;
    center.z += uSnare * 0.035 * cos(ot + fi) * side;

    // Gather pulls voices toward the hearth; impact expands outward.
    center = mix(center, hearthC + vec3(0.0, 0.2, 0.0), uGather * 0.35);
    center *= 1.0 + uBeat * 0.06;

    float rr = (0.14 + 0.035 * breath + uBass * 0.045 * lowBias * puff
             + uMid * 0.025 * puff + uSnare * 0.012)
             * puff * gatherSqueeze;

    // Low inflate: stretch voices into teardrop singers along local up.
    vec3 q = pk - center;
    if (stretch > 0.001) {
      float sy = 1.0 + stretch * (0.55 + 0.35 * sin(t + fi));
      float sx = 1.0 - stretch * 0.25;
      q = vec3(q.x / sx, q.y / sy, q.z / sx);
      d = smin(d, sdSphere(q, rr) * mix(1.0, sy, 0.35), k);
    } else {
      d = smin(d, sdSphere(q, rr), k);
    }
  }

  float td = transientField(pk);
  if (td < 1e8) {
    // Tighter union so hot harmonic orbs read as distinct rims.
    float tk = mix(0.08, 0.22, uInflate);
    d = smin(d, td, tk);
  }

  // Subtle lava skin ripples (gated by mid, softened on gather).
  float skin = 0.012 * sin(pk.x * 5.2 + tw * 0.85) * cos(pk.y * 4.6 + tw * 1.05);
  skin += 0.008 * sin(dot(pk, vec3(2.1, 1.7, 2.4)) * 3.1 + tw * 1.2);
  d += skin * (1.0 + uMid * 0.3) * (1.0 - uGather * 0.4);

  return d;
}

float sceneScale() {
  float s = max(uScale, 0.05);
  float breath = 1.0 - uGather * 0.12 + uBeat * 0.06;
  return s * max(breath, 0.7);
}

vec3 sceneDomain(vec3 p) {
  return warpSpace(p / sceneScale(), uPhase);
}

float scene(vec3 p) {
  float sEff = sceneScale();
  vec3 warped = sceneDomain(p);
  float d = sceneInner(warped) * sEff;

  // Traveling surface harmonic — crest walks across the choir face.
  if (uEcho > 0.01) {
    float along = warped.x + warped.y * 0.35;
    float crest = (uEchoTravel * 2.4) - 1.2;
    float ring = sin((along - crest) * 8.5) * exp(-abs(along - crest) * 3.6);
    d += ring * uEcho * 0.05 * sEff;
  }
  return d;
}

float echoCrest(vec3 pInner) {
  if (uEcho < 0.01) return 0.0;
  float along = pInner.x + pInner.y * 0.35;
  float crest = (uEchoTravel * 2.4) - 1.2;
  return max(0.0, sin((along - crest) * 8.5) * exp(-abs(along - crest) * 3.6));
}

vec3 calcNormal(vec3 p) {
  const vec2 e = vec2(0.0015, 0.0);
  return safeNorm(vec3(
    scene(p + e.xyy) - scene(p - e.xyy),
    scene(p + e.yxy) - scene(p - e.yxy),
    scene(p + e.yyx) - scene(p - e.yyx)
  ));
}

vec3 background(vec2 uv) {
  float r = length(uv);
  vec3 deep = uColorBass * 0.14;
  vec3 lift = uColorMid * 0.045;
  return mix(lift, deep, smoothstep(0.0, 1.15, r));
}

// Hue-preserving highlight — brighten along the color, never wash to white.
vec3 heatHighlight(vec3 c, float amount) {
  float a = clamp(amount, 0.0, 0.85);
  return c * (1.0 + a) + c * c * (a * 0.35);
}

void main() {
  vec2 fragCoord = gl_FragCoord.xy;
  vec2 uv = (fragCoord - 0.5 * uResolution) / uResolution.y;

  // Orthographic in-shader camera: per-pixel ray origin on the view plane,
  // common forward ray — floating bas-relief / sculpture read.
  float s = max(uScale, 0.05);
  // Leave enough vertical room for repeated smooth unions, especially in
  // portrait exports where the choir must remain a readable silhouette.
  float halfH = 2.6;
  float camZ = 3.0 + s * 1.35;
  vec3 rd = vec3(0.0, 0.0, -1.0);
  vec3 ro = vec3(uv.x * halfH, uv.y * halfH, camZ);

  // If somehow inside (extreme controls), nudge out along +Z.
  float d0 = scene(ro);
  if (d0 < 0.05) {
    ro.z += 0.5 + abs(d0);
  }

  float tMarch = 0.0;
  float d = 1e9;
  bool hit = false;
  float maxT = camZ + 2.5 * s;
  for (int i = 0; i < RAY_STEPS; i++) {
    vec3 p = ro + tMarch * rd;
    d = scene(p);
    // NaN / non-finite guard (GLSL ES 1.0 has no isfinite).
    if (d != d || d > 1e7) { hit = false; break; }
    if (d < 0.0015) { hit = true; break; }
    tMarch += d * 0.9;
    if (tMarch > maxT) break;
  }

  vec3 col;
  float alpha = 1.0;
  if (hit) {
    vec3 p = ro + tMarch * rd;
    vec3 n = calcNormal(p);
    vec3 V = -rd;

    vec3 keyDir = safeNorm(vec3(0.4, 0.65, 0.7));
    vec3 fillDir = safeNorm(vec3(-0.55, -0.25, 0.45));
    float keyDiff = max(0.0, dot(n, keyDir));
    float fillDiff = max(0.0, dot(n, fillDir)) * 0.45;

    // Palette: bass deep/internal/shadowed lava, mid body/faces,
    // high hot rims + transient harmonic orbs.
    float facing = clamp(0.5 + 0.5 * n.y + n.x * 0.12, 0.0, 1.0);
    float fres = pow(1.0 - max(0.0, dot(n, V)), 2.4);
    vec3 body = mix(uColorBass, uColorMid, facing);
    // Occluded / downward faces stay in deep lava.
    float cave = 1.0 - smoothstep(-0.55, 0.15, n.y);
    body = mix(body, uColorBass * 0.72, cave * 0.65);
    vec3 base = mix(body, uColorHigh, fres * 0.85);

    vec3 R = reflect(rd, n);
    float spec = pow(max(0.0, dot(R, keyDir)), 22.0);

    col = base * (0.2 + keyDiff * 0.62 + fillDiff * 0.32);
    col = heatHighlight(col, spec * 0.55);
    col += uColorHigh * fres * 0.4;

    // Transient tint at hit — well-defined ascending smoothstep.
    vec3 pInner = sceneDomain(p);
    float subAtHit = transientField(kickDomain(pInner)) * sceneScale();
    float subWeight = 1.0 - smoothstep(-0.015, 0.09, subAtHit);
    col = mix(col, uColorHigh * (1.25 + uHigh * 0.45), subWeight * 0.6);

    float barFlash = uBarPhase > 0.0 ? pow(1.0 - uBarPhase, 6.0) : 0.0;
    float silenceMute = 1.0 - uSilence * 0.7;
    // Afterglow heat rides uEnergy (JS adds afterglow into the uniform).
    col += uColorHigh * (uBeat * 0.28 + uEnergy * 0.1 + barFlash * 0.32 + uDrop * 0.75) * silenceMute;
    col += uColorBass * uKick * 0.2 * silenceMute;
    col += mix(uColorMid, uColorHigh, 0.4) * uSnare * 0.14 * silenceMute;

    float crest = echoCrest(pInner);
    col += mix(uColorMid, uColorHigh, 0.6) * crest * uEcho * 0.5 * silenceMute;

    float ao = clamp(0.55 + 0.45 * max(0.0, dot(n, V)), 0.0, 1.0);
    col *= ao;
    // Bound peak brightness — no whiteout at max gain.
    col = min(col, vec3(1.85));
  } else {
    col = background(uv) * uBgAlpha;
    alpha = uBgAlpha;
  }

  gl_FragColor = vec4(col, alpha);
}
`;
}

const vertexShader = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

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

export function LiquidBlobScene({
  palette,
  tier,
  scale = 1,
  speed = 1,
  inflate = 0.5,
  appendages = 5,
  subSpheres = 5,
  backdrop = false,
}: VisualizerSceneProps) {
  const mods = useModulation();
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const metricsRef = useMetricsRef();
  const { size, viewport } = useThree();
  const phaseRef = useRef(0);
  const orbitPhaseRef = useRef(0);
  // Local surface clock so holdBreath can freeze lava skin (not wall clock).
  const wobblePhaseRef = useRef(0);
  const stillnessSmooth = useRef(0);
  const gatherSmooth = useRef(0);
  const echoSmooth = useRef(0);
  const echoTravel = useRef(1);
  const echoArmed = useRef(true);
  const prevEcho = useRef(0);
  const kickSmooth = useRef(0);
  const snareSmooth = useRef(0);

  const steps = tier === 'high' ? RAY_STEPS_HIGH : tier === 'mid' ? RAY_STEPS_MID : RAY_STEPS_LOW;
  const fragmentShader = useMemo(() => buildFragmentShader(steps), [steps]);
  // Low tier still shows the full choir concept — slightly softer accents.
  const echoAmp = tier === 'low' ? 0.7 : tier === 'mid' ? 0.9 : 1;
  const gatherAmp = tier === 'low' ? 0.85 : 1;
  const kitAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;

  const uniforms = useMemo(
    () => ({
      uResolution: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uPhase: { value: 0 },
      uOrbitPhase: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uHigh: { value: 0 },
      uEnergy: { value: 0 },
      uBeat: { value: 0 },
      uScale: { value: 1 },
      uInflate: { value: 0.5 },
      uAppendages: { value: 5 },
      uSubSphereCount: { value: 5 },
      uSubAmount: { value: 0 },
      uBarPhase: { value: 0 },
      uDrop: { value: 0 },
      uSilence: { value: 0 },
      uGather: { value: 0 },
      uEcho: { value: 0 },
      uEchoTravel: { value: 1 },
      uKick: { value: 0 },
      uSnare: { value: 0 },
      uBgAlpha: { value: 1 },
      uColorBass: { value: new THREE.Color(1, 1, 1) },
      uColorMid: { value: new THREE.Color(1, 1, 1) },
      uColorHigh: { value: new THREE.Color(1, 1, 1) },
    }),
    [],
  );

  useFrame((_, delta) => {
    const mat = matRef.current;
    if (!mat) return;
    const m = metricsRef.current;
    const dt = Math.min(delta, 0.05);
    const mv = mods.current;
    const pace = Math.max(0.05, mv.speed ?? speed);
    const bass = Math.min(2, Math.max(0, m.bass));
    const mid = Math.min(2, Math.max(0, m.mid));
    const high = Math.min(2, Math.max(0, m.high));
    const energy = Math.min(2, Math.max(0, m.energy));

    const stillnessTarget = Math.min(
      1,
      Math.max(m.holdBreath, m.silence * 0.92) + Math.min(m.holdBreath, m.silence) * 0.15,
    );
    stillnessSmooth.current = smoothToward(
      stillnessSmooth.current,
      stillnessTarget,
      dt,
      0.14,
      0.08,
    );
    const stillness = stillnessSmooth.current;
    const motionMul = 1 - stillness * 0.92;

    // Forward-only phases — never walk backward on energy drops.
    const sectionPace = 0.75 + Math.min(1, Math.max(0, m.sectionLevel)) * 0.45;
    const phaseRate = (0.32 + Math.min(energy, 1.5) * 0.16) * pace * sectionPace * motionMul;
    phaseRef.current += dt * phaseRate;

    const orbitSpeed =
      (0.5 + mid * 1.45 + high * 0.85 + Math.min(1.5, m.impact) * 0.7) *
      pace *
      sectionPace *
      motionMul;
    orbitPhaseRef.current += dt * orbitSpeed;

    wobblePhaseRef.current += dt * motionMul;

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

    gatherSmooth.current = smoothToward(gatherSmooth.current, m.gather * gatherAmp, dt, 0.04, 0.13);
    echoSmooth.current = smoothToward(echoSmooth.current, m.echo * echoAmp, dt, 0.05, 0.3);

    const echoNow = echoSmooth.current;
    if (echoNow < 0.08) echoArmed.current = true;
    if (echoArmed.current && echoNow > 0.22 && prevEcho.current <= 0.22) {
      echoTravel.current = 0;
      echoArmed.current = false;
    }
    prevEcho.current = echoNow;
    if (echoTravel.current < 1) {
      const bpm = m.bpm && m.bpm > 30 ? m.bpm : 120;
      echoTravel.current = Math.min(1, echoTravel.current + dt * pace * (0.85 + bpm / 180));
    }

    const traveling = echoTravel.current < 1;
    const echoVis = traveling
      ? echoSmooth.current * (1 - echoTravel.current * 0.35)
      : echoSmooth.current * 0.08;

    mat.uniforms.uResolution!.value.set(size.width * viewport.dpr, size.height * viewport.dpr);
    mat.uniforms.uTime!.value = wobblePhaseRef.current;
    mat.uniforms.uPhase!.value = phaseRef.current;
    mat.uniforms.uOrbitPhase!.value = orbitPhaseRef.current;
    mat.uniforms.uBass!.value = bass;
    mat.uniforms.uMid!.value = mid;
    mat.uniforms.uHigh!.value = high;
    // Afterglow leaves heat in the body.
    mat.uniforms.uEnergy!.value = Math.min(2, energy + Math.min(1, m.afterglow) * 0.35);
    mat.uniforms.uBeat!.value = Math.min(1.4, m.impact + m.release * 0.35);
    mat.uniforms.uScale!.value = Math.max(0.1, Math.min(2, mv.scale ?? scale));
    mat.uniforms.uInflate!.value = Math.max(0, Math.min(1, mv.inflate ?? inflate));
    mat.uniforms.uAppendages!.value = Math.max(0, Math.min(MAX_APPENDAGES, Math.round(appendages)));
    mat.uniforms.uSubSphereCount!.value = Math.max(
      0,
      Math.min(MAX_SUB_SPHERES, Math.round(subSpheres)),
    );
    mat.uniforms.uSubAmount!.value = Math.min(1, Math.max(0, m.shimmer));
    mat.uniforms.uBarPhase!.value = m.barPhase;
    mat.uniforms.uDrop!.value = Math.min(1, Math.max(0, m.dropEvent));
    mat.uniforms.uSilence!.value = Math.min(1, Math.max(0, m.silence));
    mat.uniforms.uGather!.value = gatherSmooth.current;
    mat.uniforms.uEcho!.value = echoVis;
    mat.uniforms.uEchoTravel!.value = echoTravel.current;
    mat.uniforms.uKick!.value = kickSmooth.current;
    mat.uniforms.uSnare!.value = snareSmooth.current;
    mat.uniforms.uBgAlpha!.value = backdrop ? 0 : 1;
    (mat.uniforms.uColorBass!.value as THREE.Color).set(palette.bass);
    (mat.uniforms.uColorMid!.value as THREE.Color).set(palette.mid);
    (mat.uniforms.uColorHigh!.value as THREE.Color).set(palette.high);
  });

  // Fullscreen triangle (clip-space). Depth off for Bloom; transparent +
  // renderOrder 1 for BackgroundLayer compositing / projector prerender.
  return (
    <mesh frustumCulled={false} renderOrder={1}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[FULLSCREEN_TRIANGLE, 3]}
          count={3}
          itemSize={3}
        />
      </bufferGeometry>
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}

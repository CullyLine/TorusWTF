'use client';

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';
import { useModulation } from '../modulation';

/**
 * Liquid Blob — raymarched metaballs with smooth-minimum fusion.
 *
 * Distinct from Liquid Chrome (which is a vertex-displaced icosahedron and
 * can become spiky at high gain): this preset renders a soft amorphous mass
 * by raymarching a signed distance field made of N spheres blended with
 * `smin`. The whole thing is a single fullscreen quad — there is no surface
 * mesh that can spike, so high-gain audio just inflates and warps the blob
 * instead of producing pointy artifacts.
 *
 * Call-and-response layer:
 *  - gather → field contracts (inhale) before the beat
 *  - impact → release expands mass back out
 *  - echo → one faded radial ripple travels the surface in phrase gaps
 *
 * Kit accents (alive goo):
 *  - kick → anchor inflates along Y (floor thump)
 *  - snare → satellites shear laterally on X (mid crack)
 *  - hat / shimmer → sub-sphere pops (unchanged)
 *
 * Hold-breath listen:
 *  - holdBreath / deep silence → ease deformation speed + satellite
 *    chatter so the organism nearly freezes and listens, then thaws.
 *  - gather inhale + kick/snare/echo paths stay intact.
 */

const RAY_STEPS_HIGH = 96;
const RAY_STEPS_MID = 64;
const RAY_STEPS_LOW = 40;

// Hard cap on orbiting satellites. The for-loop in `sceneInner` runs at
// every raymarch step, so this directly controls worst-case shader cost.
// 10 is enough variety to look "many limbs" without making 1080p high-tier
// renders crawl on integrated GPUs.
const MAX_APPENDAGES = 10;

// Hard cap on sub-spheres. These are gated by a high-transient envelope
// so they spend most of the time at radius ~0 (cheap) and only flare up
// briefly on hi-hats / cymbals / vocal sibilance.
const MAX_SUB_SPHERES = 8;

function buildFragmentShader(steps: number): string {
  return /* glsl */ `
#define RAY_STEPS ${steps}
#define MAX_APPENDAGES ${MAX_APPENDAGES}
#define MAX_SUB_SPHERES ${MAX_SUB_SPHERES}

uniform vec2 uResolution;
uniform float uTime;
// Monotonic JS-accumulated motion phase. Always grows; never decreases
// when audio energy drops. Replaces the older approach of multiplying
// uTime by an energy-dependent factor, which made satellites visibly
// walk backward on energy drops.
uniform float uPhase;
// Separate monotonic phase whose rate is heavily mid/high/beat-driven.
// Drives the satellite orbits so they whip around the blob in time with
// the music without bleeding back into the surface wobble.
uniform float uOrbitPhase;
uniform float uBass;
uniform float uMid;
uniform float uHigh;
uniform float uEnergy;
uniform float uBeat;
uniform float uScale;
// 0..1 — how much of the bass response is *inflation* (uniform radial
// growth) vs *stretching* (anisotropic elongation along a wobble axis).
// 0 = pure stretch like elastic material being pulled; 1 = pure puff.
uniform float uInflate;
// How many orbiting satellite spheres ("appendages") fuse into the blob.
// 0 = just the anchor sphere alone. Clamped to MAX_APPENDAGES.
uniform int uAppendages;
// Maximum number of sub-spheres that can pop on high-freq transients.
// These are gated by uSubAmount so when transients are quiet they
// shrink to nothing and the cost goes to ~0.
uniform int uSubSphereCount;
// 0..1 envelope driven by detected high-frequency transients. Snaps
// up on hi-hat / cymbal / sibilant hits and decays slowly. Controls
// sub-sphere radius (so they fade smoothly into the main blob).
uniform float uSubAmount;
// 0..1 phase within current 4/4 bar. 0 = downbeat.
uniform float uBarPhase;
// 0..1 pulse on detected bass drops.
uniform float uDrop;
// 0..1 sustained silence — mutes color punch when high.
uniform float uSilence;
// 0..1 pre-beat gather — contracts the field (inhale).
uniform float uGather;
// 0..1 phrase-echo amplitude — drives a traveling surface ripple.
uniform float uEcho;
// 0..1 crest travel along the surface (0 at fire, 1 when spent).
uniform float uEchoTravel;
// 0..~1.2 kick envelope — anisotropic Y inflate on the anchor sphere.
uniform float uKick;
// 0..~1.2 snare envelope — lateral X shear on satellite centers.
uniform float uSnare;
// 1 = paint the built-in radial background on ray miss; 0 = output
// transparent pixels instead so a BackgroundLayer sky shows through and
// the blob reads as an object IN the environment.
uniform float uBgAlpha;
uniform vec3 uColorBass;
uniform vec3 uColorMid;
uniform vec3 uColorHigh;

float sdSphere(vec3 p, float r) {
  return length(p) - r;
}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// Flow Field Update: noise-gradient hash for the curl warp below. Same
// lattice math as the shared flow core (dsp/flowGlsl.ts), inlined lean
// because the raymarcher calls scene() hundreds of times per pixel.
float blobHash(vec3 ip) {
  return fract(sin(dot(ip, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}

vec3 blobNoiseGrad(vec3 p) {
  vec3 ip = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec3 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  float a = blobHash(ip);
  float b = blobHash(ip + vec3(1.0, 0.0, 0.0));
  float c = blobHash(ip + vec3(0.0, 1.0, 0.0));
  float d = blobHash(ip + vec3(1.0, 1.0, 0.0));
  float e = blobHash(ip + vec3(0.0, 0.0, 1.0));
  float f1 = blobHash(ip + vec3(1.0, 0.0, 1.0));
  float g = blobHash(ip + vec3(0.0, 1.0, 1.0));
  float h = blobHash(ip + vec3(1.0, 1.0, 1.0));
  float k1 = b - a;
  float k2 = c - a;
  float k3 = e - a;
  float k4 = a - b - c + d;
  float k5 = a - c - e + g;
  float k6 = a - b - e + f1;
  float k7 = -a + b + c - d + e - f1 - g + h;
  return du * vec3(
    k1 + k4 * u.y + k6 * u.z + k7 * u.y * u.z,
    k2 + k4 * u.x + k5 * u.z + k7 * u.z * u.x,
    k3 + k5 * u.y + k6 * u.x + k7 * u.x * u.y
  );
}

// Gentle domain warp — jelly-like undulation without breaking the SDF too
// badly. The trig layer gives the base jelly; the curl term (gradient ×
// axis = divergence-free) makes the surface ROIL like real fluid when the
// music pushes. Gather softens the churn (held breath); impact still kicks.
vec3 warpSpace(vec3 p, float t) {
  float inhale = 1.0 - uGather * 0.55;
  float w = (0.09 + uMid * 0.05 + uEnergy * 0.03) * inhale;
  p.x += sin(p.y * 2.0 + t * 0.85) * w;
  p.y += cos(p.z * 1.7 + t * 0.65) * w;
  p.z += sin(p.x * 2.2 + t * 1.05) * w * 0.65;
  vec3 g = blobNoiseGrad(p * 1.5 + vec3(t * 0.22, t * 0.17, -t * 0.19));
  p += cross(g, vec3(0.577, 0.577, 0.577))
     * (0.05 + uEnergy * 0.05 + uBeat * 0.04) * inhale;
  return p;
}

// Sub-sphere field — large fast-orbiting blobs that pop on high-freq
// transients and merge back into the main blob.
//
// IMPORTANT: returns the SDF of the sub-spheres ALONE (no main blob
// component) so we can reuse it at the hit point to decide how much
// to tint the surface toward the High palette colour. When uSubAmount
// is ~0 the radius collapses and every distance becomes huge — that's
// the desired "disappeared back into the blob" state.
float subField(vec3 p) {
  if (uSubSphereCount <= 0 || uSubAmount < 0.01) return 1e9;
  // Sub-spheres rotate ~1.8x faster than appendages so they read as
  // a distinct fast-twitch layer rather than just smaller appendages.
  float ot = uOrbitPhase * 1.8;
  float d = 1e9;
  for (int i = 0; i < MAX_SUB_SPHERES; i++) {
    if (i >= uSubSphereCount) break;
    float fi = float(i);
    float a = ot * (1.13 + fi * 0.19) + fi * 2.41;
    float b = ot * (0.97 + fi * 0.23) + fi * 1.71;
    float c = ot * (1.31 + fi * 0.17) + fi * 0.97;
    // Wide orbits so the bigger sub-spheres have room to fuse fluidly.
    float orbit = 0.52 + 0.22 * sin(ot * 0.55 + fi * 1.3);
    vec3 center = vec3(
      cos(a) * orbit,
      sin(b) * orbit * 0.85,
      sin(c) * orbit * 0.75
    );
    // Much larger than before — these read as chunky fluid bubbles, not
    // sparkles. A small floor keeps a hint of life even between transients.
    float presence = max(uSubAmount, 0.18);
    float baseR = 0.20 + 0.09 * sin(ot * 2.1 + fi);
    float rr = baseR * presence * (0.9 + uHigh * 0.45);
    d = min(d, sdSphere(p - center, rr));
  }
  return d;
}

// 5-blob field: one anchor + four orbiting satellites that fuse and split.
// Sized small at uScale=1 so the default render is intimate rather than
// screen-filling; the Scale slider multiplies the whole field uniformly.
float sceneInner(vec3 p) {
  // Single monotonic phase from JS, plus the absolute wall clock for the
  // surface wobble (which is fine to tie to uTime because it isn't position-
  // critical and the wobble already moves on its own).
  float t = uPhase;
  float tw = uTime;
  float ot = uOrbitPhase;

  // Gather pulls mass inward; impact (uBeat) still pops on the release.
  float gatherSqueeze = 1.0 - uGather * 0.16;

  // Anchor sphere — bass contributes here ONLY through the Inflate slider.
  // The beat still gets a small pop so taps register no matter where the
  // user has Inflate set. Kick elongates the anchor along Y (floor thump)
  // via anisotropic SDF scale — distinct from uniform inflate/bass puff.
  float r0 = (0.42 + uBass * 0.28 * uInflate + uBeat * 0.14 + uKick * 0.04) * gatherSqueeze;
  float kickY = 1.0 + uKick * 0.38;
  vec3 pKick = vec3(p.x, p.y / kickY, p.z);
  float d = sdSphere(pKick, r0) * mix(1.0, kickY, 0.35);

  float k = 0.44 + uMid * 0.24 + uHigh * 0.14;

  // Stretch axis: a slowly tumbling unit vector. When Inflate is LOW the
  // bass elongates the satellite cluster along this axis instead of puffing
  // the spheres — it pulls the blob like soft material being tugged.
  vec3 stretchAxis = normalize(vec3(
    sin(t * 0.31 + 0.7),
    cos(t * 0.27 + 1.3),
    sin(t * 0.41 + 2.1)
  ));
  float stretchAmt = uBass * (1.0 - uInflate) * 0.55 * gatherSqueeze;

  // Irrational-ish ratios for x/y/z rates so the three axes don't
  // recurrently align into the same standing pattern. GLSL needs a
  // constant loop bound, so we walk the max and break once we've placed
  // the requested number of satellites.
  for (int i = 0; i < MAX_APPENDAGES; i++) {
    if (i >= uAppendages) break;
    float fi = float(i);
    // Orbital angle uses the music-driven phase — satellites whip around the
    // anchor on busy passages and slow down on quiet ones.
    float a = ot * (0.71 + fi * 0.13) + fi * 1.731;
    float b = ot * (0.47 + fi * 0.09) + fi * 2.397;
    float c = ot * (0.59 + fi * 0.07) + fi * 0.973;
    // Per-satellite center bias so orbits don't all pass through origin —
    // breaks the "every satellite stalls at the same point" symmetry.
    vec3 bias = vec3(
      sin(fi * 2.13) * 0.09,
      cos(fi * 1.71) * 0.07,
      sin(fi * 3.31) * 0.08
    );
    // Orbit radius itself swells slightly with bass when inflate is up.
    // Gather tucks limbs in toward the anchor (visible pre-beat squeeze).
    float orbit = (0.55 + 0.16 * sin(t * 0.61 + fi * 1.9) + uBass * 0.18 * uInflate)
                * (1.0 - uGather * 0.28);
    vec3 center = bias + vec3(
      cos(a) * orbit,
      sin(b) * orbit * 0.8,
      sin(c) * orbit * 0.9
    );
    // Stretch pulls satellites along the axis. Phase-shifted so opposing
    // satellites get pushed in opposite directions, which reads as
    // taffy-pull instead of a uniform drift.
    center += stretchAxis * stretchAmt * cos(a + fi * 1.7) * 1.1;
    // Snare: lateral shear — phase-split L/R so satellites crack sideways
    // on the mid hit, distinct from the kick's Y inflate.
    float side = mod(fi, 2.0) < 0.5 ? 1.0 : -1.0;
    center.x += uSnare * (0.18 + 0.08 * sin(a + fi)) * side;
    center.z += uSnare * 0.04 * cos(b + fi * 0.7) * side;

    float rr = (0.20 + (uMid * 0.12 + uHigh * 0.08) * (0.45 + uInflate * 0.55)
             + 0.05 * sin(t * 1.37 + fi * 2.13)
             + uSnare * 0.02) * gatherSqueeze;
    d = smin(d, sdSphere(p - center, rr), k);
  }

  // Fold sub-spheres into the field with a tighter k than appendages.
  // The smaller smoothing window makes them read as distinct bumps
  // when they're at full radius, then they melt smoothly back into the
  // surface as uSubAmount decays toward 0.
  //
  // Skip the smin entirely when subField returns its 1e9 "no sub-spheres"
  // sentinel: GPU drivers compile mix(x, y, h) as x + (y - x) * h, and at
  // x = 1e9 the float32 cancellation swallows the real distance and
  // returns 0 — making the SDF zero everywhere, so every ray "hit" at the
  // camera and the blob filled the entire screen whenever the high band
  // was silent.
  float sd = subField(p);
  if (sd < 1e8) d = smin(d, sd, 0.26);

  float wobble = 0.02 * sin(p.x * 4.2 + tw * 0.9) * cos(p.y * 3.8 + tw * 1.05);
  wobble += 0.014 * sin(p.z * 5.1 + tw * 0.75) * cos(p.x * 3.3 + tw * 1.2);
  wobble += 0.01 * sin(dot(p, vec3(1.7, 2.1, 1.9)) * 2.8 + tw * 1.4);
  d += wobble * (1.0 + uMid * 0.35);

  return d;
}

// Standard SDF uniform scaling: shrink/grow space, then rescale the distance.
// Gather contracts the whole organism; impact expands on the release.
// Phrase echo adds a localized radial ripple that travels once per gap.
float scene(vec3 p) {
  float s = max(uScale, 0.05);
  float breath = 1.0 - uGather * 0.11 + uBeat * 0.055;
  float sEff = s * max(breath, 0.72);
  vec3 warped = warpSpace(p / sEff, uPhase);
  float d = sceneInner(warped) * sEff;

  // Traveling surface ripple — crest moves from core outward with uEchoTravel.
  if (uEcho > 0.01) {
    float radial = length(warped);
    float crest = uEchoTravel * 1.55;
    float ring = sin((radial - crest) * 10.0) * exp(-abs(radial - crest) * 4.2);
    d += ring * uEcho * 0.055 * sEff;
  }
  return d;
}

// Signed echo crest at a hit (for a faint highlight) — same radial math as
// the SDF ripple so light follows the traveling wave.
float echoCrest(vec3 pInner) {
  if (uEcho < 0.01) return 0.0;
  float radial = length(pInner);
  float crest = uEchoTravel * 1.55;
  return max(0.0, sin((radial - crest) * 10.0) * exp(-abs(radial - crest) * 4.2));
}

vec3 calcNormal(vec3 p) {
  const vec2 e = vec2(0.0015, 0.0);
  return normalize(vec3(
    scene(p + e.xyy) - scene(p - e.xyy),
    scene(p + e.yxy) - scene(p - e.yxy),
    scene(p + e.yyx) - scene(p - e.yyx)
  ));
}

vec3 background(vec2 uv) {
  // Soft radial gradient from bass color (deep, low) to mid (lifted) so the
  // blob has something to sit on without a hard rectangle edge.
  float r = length(uv);
  vec3 a = uColorBass * 0.12;
  vec3 b = uColorMid * 0.04;
  return mix(b, a, smoothstep(0.0, 1.1, r));
}

void main() {
  vec2 fragCoord = gl_FragCoord.xy;
  vec2 uv = (fragCoord - 0.5 * uResolution) / uResolution.y;

  // Camera setup: look straight at the origin from z = 3.
  vec3 ro = vec3(0.0, 0.0, 3.0);
  vec3 rd = normalize(vec3(uv, -1.5));

  float t = 0.0;
  float d = 1e9;
  bool hit = false;
  for (int i = 0; i < RAY_STEPS; i++) {
    vec3 p = ro + t * rd;
    d = scene(p);
    if (d < 0.0015) { hit = true; break; }
    t += d * 0.92;
    if (t > 8.0) break;
  }

  vec3 col;
  float alpha = 1.0;
  if (hit) {
    vec3 p = ro + t * rd;
    vec3 n = calcNormal(p);
    vec3 V = -rd;

    // Key light + soft fill — palette-tinted.
    vec3 keyDir = normalize(vec3(0.35, 0.55, 0.75));
    vec3 fillDir = normalize(vec3(-0.6, -0.3, 0.4));
    float keyDiff = max(0.0, dot(n, keyDir));
    float fillDiff = max(0.0, dot(n, fillDir)) * 0.5;

    // Iridescent fresnel — the rim takes the high color, the body lerps
    // between bass (deep) and mid (face).
    float fres = pow(1.0 - max(0.0, dot(n, V)), 2.5);
    vec3 body = mix(uColorBass, uColorMid, smoothstep(-1.0, 1.0, n.y) + n.x * 0.15);
    vec3 rim = uColorHigh;
    vec3 base = mix(body, rim, fres);

    // Spec highlight along key reflection.
    vec3 R = reflect(rd, n);
    float spec = pow(max(0.0, dot(R, keyDir)), 24.0) * 0.7;

    col = base * (0.22 + keyDiff * 0.65 + fillDiff * 0.35);
    col += vec3(spec) * mix(uColorMid, uColorHigh, 0.5);
    col += rim * fres * 0.45;

    // Sub-sphere tint: if the hit point sits on (or near) a sub-sphere
    // surface we push the colour hard toward the High palette colour so
    // the sub-spheres read as the same "voice" as the high transients
    // that spawned them. subWeight is 1 when the ray hit landed ON a
    // sub-sphere surface, 0 when we're well into the main body.
    //
    // We sample subField in normalized "inner" space — the same space
    // subField was defined in — because sceneInner is called with
    // pre-scaled coordinates everywhere else in this shader.
    float s = max(uScale, 0.05);
    vec3 pInner = p / s;
    // Reversed-edge smoothstep is undefined per the GLSL spec, so build
    // the falloff from the well-defined ascending form instead.
    float subAtHit = subField(pInner) * s;
    float subWeight = 1.0 - smoothstep(-0.02, 0.10, subAtHit);
    col = mix(col, uColorHigh * (1.4 + uHigh * 0.6), subWeight * 0.55);

    // Beat injection + downbeat flash + drop punch. Kick adds a brief bass
    // body glow; snare a mid crease flash — axes stay the main read.
    float barFlash = uBarPhase > 0.0 ? pow(1.0 - uBarPhase, 6.0) : 0.0;
    float silenceMute = 1.0 - uSilence * 0.7;
    col += uColorHigh * (uBeat * 0.35 + uEnergy * 0.12 + barFlash * 0.4 + uDrop * 0.9) * silenceMute;
    col += uColorBass * uKick * 0.18 * silenceMute;
    col += mix(uColorMid, uColorHigh, 0.35) * uSnare * 0.16 * silenceMute;

    // Phrase-echo crest: a soft bright ring that rides the delayed ripple.
    float crest = echoCrest(pInner);
    col += mix(uColorMid, uColorHigh, 0.55) * crest * uEcho * 0.55 * silenceMute;

    // Soft AO via distance to the next hit (cheap fake).
    float ao = clamp(0.6 + 0.4 * dot(n, V), 0.0, 1.0);
    col *= ao;
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

function smoothToward(current: number, target: number, dt: number, riseTau: number, fallTau: number) {
  const tau = target > current ? riseTau : fallTau;
  const k = 1 - Math.exp(-dt / Math.max(tau, 1e-4));
  return current + (target - current) * k;
}

export function LiquidBlobScene({
  analyser,
  palette,
  tier,
  scale = 1,
  speed = 1,
  inflate = 0.5,
  appendages = 4,
  subSpheres = 6,
  backdrop = false,
}: VisualizerSceneProps) {
  const mods = useModulation();
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const metricsRef = useMetricsRef();
  const { size } = useThree();
  const phaseRef = useRef(0);
  const orbitPhaseRef = useRef(0);
  // Local surface-wobble clock so holdBreath can freeze jelly jitter
  // (wall-clock uTime would keep twitching through silence).
  const wobblePhaseRef = useRef(0);
  // Hold-breath / deep-silence listen gate — freeze/thaw without pops.
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
  // Low tier still gets inhale + one echo pass; mid/high just read cleaner.
  const echoAmp = tier === 'low' ? 0.7 : tier === 'mid' ? 0.9 : 1;
  const gatherAmp = tier === 'low' ? 0.85 : 1;
  // Low tier still gets the kit axes; mid/high just read cleaner.
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
      uAppendages: { value: 4 },
      uSubSphereCount: { value: 6 },
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
      uColorBass: { value: new THREE.Color(palette.bass) },
      uColorMid: { value: new THREE.Color(palette.mid) },
      uColorHigh: { value: new THREE.Color(palette.high) },
    }),
    [palette.bass, palette.mid, palette.high],
  );

  useFrame((_, delta) => {
    const mat = matRef.current;
    if (!mat) return;
    const m = metricsRef.current;
    const dt = Math.min(delta, 0.05);
    // Modulation-matrix values (fall back to slider props when unrouted).
    const mv = mods.current;
    const pace = Math.max(0.05, mv.speed ?? speed);

    // Hold-breath stillness: the goo listens instead of writhing through quiet.
    // Rise a touch slower than the thaw so freeze reads as settling, not a cut.
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
    // Deformation + satellite chatter nearly stop; a whisper remains so the
    // SDF never looks frozen-solid / dead.
    const motionMul = 1 - stillness * 0.92;

    // Forward-only motion phase. Rate modulates with energy but the phase
    // itself never decreases, which prevents satellites from oscillating
    // when energy fluctuates rapidly. Section level paces the whole organism:
    // choruses writhe, verses breathe. holdBreath gates the advance rate.
    const sectionPace = 0.75 + m.sectionLevel * 0.45;
    const phaseRate =
      (0.35 + Math.min(m.energy, 1.5) * 0.18) * pace * sectionPace * motionMul;
    phaseRef.current += dt * phaseRate;

    // Orbit phase: heavily mid/high-driven (impact envelope for the kick)
    // so the satellites visibly whip around the blob on busy passages.
    // Floored so it never stalls — except during holdBreath, when chatter
    // eases so limbs listen with the body.
    const orbitSpeed =
      (0.6 + Math.min(m.mid, 2) * 1.6 + Math.min(m.high, 2) * 0.9 + m.impact * 0.8) *
      pace *
      sectionPace *
      motionMul;
    orbitPhaseRef.current += dt * orbitSpeed;

    // Surface jelly wobble advances with the same listen gate (not wall clock).
    wobblePhaseRef.current += dt * motionMul;

    // Kit axes: fast attack so four-on-the-floor reads punchy, slower fall
    // so the goo settles instead of gating off.
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

    // Call-and-response envelopes — quick rise into the inhale, slower fall
    // so the squeeze reads as anticipation rather than a gate.
    gatherSmooth.current = smoothToward(
      gatherSmooth.current,
      m.gather * gatherAmp,
      dt,
      0.04,
      0.13,
    );
    echoSmooth.current = smoothToward(echoSmooth.current, m.echo * echoAmp, dt, 0.05, 0.3);

    // One ripple travel per echo impulse — arm on quiet, fire on rise.
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

    // Echo amplitude rides the traveling crest; idle gaps stay nearly still.
    const traveling = echoTravel.current < 1;
    const echoVis = traveling
      ? echoSmooth.current * (1 - echoTravel.current * 0.35)
      : echoSmooth.current * 0.08;

    mat.uniforms.uResolution!.value.set(size.width, size.height);
    mat.uniforms.uTime!.value = wobblePhaseRef.current;
    mat.uniforms.uPhase!.value = phaseRef.current;
    mat.uniforms.uOrbitPhase!.value = orbitPhaseRef.current;
    mat.uniforms.uBass!.value = m.bass;
    mat.uniforms.uMid!.value = m.mid;
    mat.uniforms.uHigh!.value = m.high;
    // Afterglow keeps the body luminous for a few bars after a big chorus.
    mat.uniforms.uEnergy!.value = m.energy + m.afterglow * 0.3;
    // Impact envelope, not the raw beat spike: the pop swells in and melts
    // out over ~¼s so hits read as a fluid pulse of mass. Release adds a
    // little extra expand after gather so the inhale → hit lands as one gesture.
    mat.uniforms.uBeat!.value = Math.min(1.4, m.impact + m.release * 0.35);
    mat.uniforms.uScale!.value = mv.scale ?? scale;
    mat.uniforms.uInflate!.value = Math.max(0, Math.min(1, mv.inflate ?? inflate));
    // Round + clamp to the shader's hard cap. 0 = anchor sphere alone.
    mat.uniforms.uAppendages!.value = Math.max(
      0,
      Math.min(MAX_APPENDAGES, Math.round(appendages)),
    );

    mat.uniforms.uSubSphereCount!.value = Math.max(
      0,
      Math.min(MAX_SUB_SPHERES, Math.round(subSpheres)),
    );
    // Shared shimmer envelope (hi-hat / cymbal transients with a slow melt)
    // drives the sub-sphere presence — same signal the rest of the engine
    // sparkles to, so the whole scene agrees on what the hats are doing.
    mat.uniforms.uSubAmount!.value = m.shimmer;
    mat.uniforms.uBarPhase!.value = m.barPhase;
    mat.uniforms.uDrop!.value = m.dropEvent;
    mat.uniforms.uSilence!.value = m.silence;
    mat.uniforms.uGather!.value = gatherSmooth.current;
    mat.uniforms.uEcho!.value = echoVis;
    mat.uniforms.uEchoTravel!.value = echoTravel.current;
    mat.uniforms.uKick!.value = kickSmooth.current;
    mat.uniforms.uSnare!.value = snareSmooth.current;
    // With an environment behind us, ray misses go transparent so the sky
    // shows through and the blob reads as an object IN the world.
    mat.uniforms.uBgAlpha!.value = backdrop ? 0 : 1;
    (mat.uniforms.uColorBass!.value as THREE.Color).set(palette.bass);
    (mat.uniforms.uColorMid!.value as THREE.Color).set(palette.mid);
    (mat.uniforms.uColorHigh!.value as THREE.Color).set(palette.high);
    if (analyser) analyser.getFrequencyData(freqBuf.current);
  });

  // Fullscreen triangle (clip-space, no matrices). Disable depth so the
  // post-process Bloom in SceneRig still picks up bright pixels. Transparent
  // + renderOrder 1 so, when a BackgroundLayer sky is active behind us, the
  // triangle composites over it instead of erasing it.
  return (
    <mesh frustumCulled={false} renderOrder={1}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3]}
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

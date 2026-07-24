'use client';

/**
 * Tidal Sanctuary — original clean-room ocean height-field on a fullscreen
 * clip-space triangle. Musical anatomy:
 *  - bass / bassActivity → broad swells / deep movement
 *  - kick → outward crest pulse (forward-only travel)
 *  - snare → short lateral whitecap crack (foam/spray shear along crest)
 *  - mids / swell → surface roll
 *  - high / shimmer / hat → foam + micro-crests
 *  - gather → calms / draws the sea inward before a hit
 *  - release / drop → surges the sea
 *  - silence / holdBreath → glassy resting surface
 *  - afterglow → restrained horizon / foam warmth
 *
 * Controls (existing storage keys only):
 *  - turbulence → wave chop / detail
 *  - density → foam coverage
 *  - scale → ocean framing / camera zoom (clip-space bypasses model matrix)
 */

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';
import { useModulation } from '../modulation';
import { getTidalBudgets, type TidalTier } from './tidalSanctuaryData';

const FULLSCREEN_TRIANGLE = new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]);

function buildFragmentShader(traceSteps: number, refineSteps: number, waveOctaves: number): string {
  return /* glsl */ `
#define TRACE_STEPS ${traceSteps}
#define REFINE_STEPS ${refineSteps}
#define WAVE_OCTAVES ${waveOctaves}

uniform vec2 uResolution;
uniform float uTime;
uniform float uPhase;
uniform float uBass;
uniform float uBassAct;
uniform float uMid;
uniform float uHigh;
uniform float uSwell;
uniform float uShimmer;
uniform float uHat;
uniform float uKick;
uniform float uKickTravel;
uniform float uSnare;
uniform float uGather;
uniform float uSurge;
uniform float uStillness;
uniform float uAfterglow;
uniform float uEnergy;
uniform float uBarPhase;
uniform float uTurbulence;
uniform float uDensity;
uniform float uScale;
uniform float uBgAlpha;
uniform vec3 uColorBass;
uniform vec3 uColorMid;
uniform vec3 uColorHigh;

float clamp01(float v) {
  return clamp(v, 0.0, 1.0);
}

float safeDiv(float a, float b) {
  return a / max(abs(b), 1e-4) * sign(b + 1e-8);
}

vec3 safeNorm(vec3 v) {
  float L = max(length(v), 1e-4);
  return v / L;
}

vec2 clampXZ(vec2 p) {
  return clamp(p, vec2(-80.0), vec2(80.0));
}

// Hue-preserving brighten — never wash foam/specular to plain white.
vec3 tintHighlight(vec3 c, float amount) {
  float a = clamp(amount, 0.0, 0.72);
  return min(c * (1.0 + a) + c * c * (a * 0.28), vec3(1.65));
}

// Original directional wave trains — independent of any third-party seascape.
float dirWave(vec2 xz, vec2 dir, float freq, float amp, float speed, float sharp, float t) {
  vec2 d = safeNorm(vec3(dir, 0.0)).xy;
  float phase = dot(xz, d) * freq + t * speed;
  float s = sin(phase);
  // Soft sharpening toward crests without Gerstner copy constants.
  float crest = pow(0.5 + 0.5 * s, mix(1.0, 2.6, clamp01(sharp)));
  return amp * mix(s, crest * 2.0 - 1.0, clamp01(sharp) * 0.55);
}

float heightField(vec2 xz) {
  xz = clampXZ(xz);
  float t = uPhase;
  float stillness = clamp01(uStillness);
  float gather = clamp01(uGather);
  float surge = clamp01(uSurge);
  float chop = clamp(uTurbulence, 0.0, 2.0);
  float glass = mix(1.0, 0.08, stillness);

  // Gather draws wavelengths inward and calms amplitude before the hit.
  float pull = 1.0 + gather * 0.55;
  float ampScale = glass * (1.0 - gather * 0.62) * (1.0 + surge * 0.85);
  ampScale *= 0.55 + uSwell * 0.55 + uBass * 0.35 + uBassAct * 0.4;
  ampScale = clamp(ampScale, 0.08, 1.65);

  float h = 0.0;
  // Broad swells — deep movement from bass / bassActivity.
  h += dirWave(xz * pull, vec2(0.92, 0.28), 0.42, 0.38 * ampScale, 0.55, 0.25, t);
  h += dirWave(xz * pull, vec2(-0.35, 0.94), 0.31, 0.28 * ampScale, 0.41, 0.2, t * 0.92);
  h += dirWave(xz * pull, vec2(0.55, -0.72), 0.58, 0.16 * ampScale * (0.7 + uBassAct), 0.68, 0.3, t * 1.07);

  // Mid roll — surface body from mids / swell.
  float midAmp = ampScale * (0.45 + uMid * 0.55 + uSwell * 0.35);
  h += dirWave(xz * pull, vec2(0.78, 0.62), 1.15, 0.12 * midAmp, 0.95, 0.35, t * 1.15);
  h += dirWave(xz * pull, vec2(-0.66, 0.55), 1.55, 0.08 * midAmp, 1.22, 0.4, t * 1.28);

  // Chop / detail octaves — turbulence raises frequency content.
  float octAmp = 0.07 * ampScale * (0.35 + chop * 0.65);
  float octFreq = 2.1 + chop * 1.4;
  vec2 oDir = vec2(0.71, 0.41);
  for (int i = 0; i < WAVE_OCTAVES; i++) {
    float fi = float(i);
    float ang = fi * 1.37;
    vec2 d = vec2(cos(ang), sin(ang));
    // Keep secondary dirs independent of the primary swell set.
    d = normalize(d * 0.85 + oDir * 0.15);
    float f = octFreq * pow(1.72, fi);
    float a = octAmp * pow(0.52, fi);
    float sharp = clamp01(0.2 + chop * 0.25 + uHigh * 0.15);
    h += dirWave(xz * pull, d, f, a, 1.4 + fi * 0.35, sharp, t * (1.0 + fi * 0.08));
  }

  // Micro-crests from high / shimmer / hat.
  float sparkle =
    sin(dot(xz, vec2(3.7, 2.9)) * (2.4 + uHigh) + t * 2.6) *
    cos(dot(xz, vec2(-2.1, 3.3)) * (2.1 + uShimmer) - t * 2.1);
  h += sparkle * 0.035 * ampScale * (0.25 + uHigh * 0.55 + uShimmer * 0.7 + uHat * 0.45);

  // Kick: outward crest pulse traveling forward-only along +Z from the viewer.
  float travel = clamp(uKickTravel, 0.0, 28.0);
  float kickW = max(uKick, 0.0);
  if (kickW > 0.01 && travel < 27.5) {
    float radial = length(vec2(xz.x * 0.55, xz.y - travel));
    float ring = exp(-radial * radial * 1.8) * sin(radial * 6.5 - travel * 0.35);
    h += ring * kickW * 0.42 * glass;
  }

  // Snare: short lateral whitecap crack — foam ridge shearing along X on the
  // near crest line. Distinct from the kick's radial traveling ring.
  float snareW = max(uSnare, 0.0);
  if (snareW > 0.01) {
    float zBand = exp(-(xz.y - 1.55) * (xz.y - 1.55) * 0.9);
    float lateral =
      sin(xz.x * 6.8 + t * 0.35) * 0.55 + sin(xz.x * 13.2 - t * 0.85) * 0.45;
    float ridge = pow(0.5 + 0.5 * lateral, 3.4);
    // Sparse spray ticks along the crest — reads as foam flecks, not hat glitter.
    float sprayTick = step(0.6, fract(xz.x * 1.9 + 0.17));
    h += zBand * (ridge * 0.3 + sprayTick * ridge * 0.12) * snareW * glass;
  }

  // Bound height so extreme gain never floods the camera.
  return clamp(h, -1.35, 1.55);
}

vec3 heightNormal(vec2 xz) {
  // Finite-difference normal on the height field.
  float e = 0.045;
  float hL = heightField(xz + vec2(-e, 0.0));
  float hR = heightField(xz + vec2(e, 0.0));
  float hD = heightField(xz + vec2(0.0, -e));
  float hU = heightField(xz + vec2(0.0, e));
  return safeNorm(vec3(hL - hR, 2.0 * e, hD - hU));
}

float foamMask(vec2 xz, vec3 n, float h) {
  float slope = 1.0 - clamp01(n.y);
  float crest = clamp01((h - 0.08) * 1.6);
  float micro =
    0.5 + 0.5 * sin(dot(xz, vec2(7.2, 5.1)) + uPhase * 3.2 + uHat * 4.0);
  float dens = clamp(uDensity, 0.05, 1.0);
  // Density lowers the foam threshold → more coverage at high density.
  float thresh = mix(0.78, 0.54, dens);
  thresh -= clamp(uHigh * 0.01 + uShimmer * 0.025 + uHat * 0.015, 0.0, 0.06);
  float raw =
    slope * 0.18 +
    crest * 0.48 +
    micro * 0.06 * (0.35 + uShimmer * 0.5 + uHat * 0.3);
  // Snare boosts foam along a lateral crest shear — short whitecap crack.
  float snareCrack =
    clamp01(uSnare) *
    crest *
    (0.35 + 0.65 * abs(sin(xz.x * 5.4 + uPhase * 0.2)));
  raw += snareCrack * 0.4;
  raw *= 0.48 + dens * 0.52;
  float foam = smoothstep(thresh, thresh + 0.22, raw);
  foam *= 1.0 - clamp01(uStillness) * 0.85;
  foam *= 1.0 - clamp01(uGather) * 0.45;
  return clamp01(foam);
}

vec3 skyColor(vec2 uv, float lookY) {
  // Subtle palette-driven sky / horizon — original, not a stock gradient.
  float h = clamp01(lookY * 0.85 + 0.35);
  vec3 zenith = uColorBass * 0.22;
  vec3 belt = mix(uColorMid * 0.55, uColorBass * 0.4, 0.35);
  vec3 rim = mix(uColorHigh, uColorMid, 0.35) * (0.45 + uAfterglow * 0.35);
  vec3 col = mix(belt, zenith, smoothstep(0.0, 0.85, h));
  float horiz = exp(-abs(lookY + 0.02) * 14.0);
  col = mix(col, rim, horiz * (0.55 + uAfterglow * 0.4));
  // Soft side warmth so the frame isn't flat.
  col += uColorMid * 0.04 * (0.5 + 0.5 * uv.x);
  col = min(col, vec3(1.15));
  return col;
}

bool intersectOcean(vec3 ro, vec3 rd, out float tHit, out vec3 pHit) {
  tHit = 0.0;
  pHit = ro;

  // Camera must stay above the water — if somehow inside, fail soft.
  float h0 = heightField(ro.xz);
  if (ro.y < h0 + 0.02) {
    return false;
  }

  // Only downward-ish rays can meet the sea; upward rays are sky.
  if (rd.y > 0.02) {
    return false;
  }

  float tNear = 0.15;
  float tFar = 42.0;
  float t = tNear;
  float prevH = ro.y - heightField((ro + rd * tNear).xz);
  bool bracket = false;
  float tA = tNear;
  float tB = tNear;

  for (int i = 0; i < TRACE_STEPS; i++) {
    // Bounded progressive step — never unbounded raymarch.
    float stepSize = mix(0.18, 1.35, float(i) / float(max(TRACE_STEPS - 1, 1)));
    stepSize *= 0.85 + 0.25 * clamp01(-rd.y);
    t += stepSize;
    if (t > tFar) break;

    vec3 p = ro + rd * t;
    // Clamp world XZ so warped lookups stay finite.
    p.xz = clampXZ(p.xz);
    float h = p.y - heightField(p.xz);

    if (h != h) {
      return false;
    }

    if (prevH > 0.0 && h <= 0.0) {
      bracket = true;
      tA = t - stepSize;
      tB = t;
      break;
    }
    prevH = h;
    tA = t;
  }

  if (!bracket) {
    // Soft far-plane graze near the horizon when the ray skims low.
    float tHoriz = safeDiv(-(ro.y - 0.02), min(rd.y, -1e-4));
    if (tHoriz > tNear && tHoriz < tFar) {
      vec3 p = ro + rd * tHoriz;
      p.xz = clampXZ(p.xz);
      float h = p.y - heightField(p.xz);
      if (abs(h) < 0.35) {
        tHit = tHoriz;
        pHit = p;
        return true;
      }
    }
    return false;
  }

  // Binary refine inside the bracket — fixed iteration count.
  for (int r = 0; r < REFINE_STEPS; r++) {
    float tm = 0.5 * (tA + tB);
    vec3 p = ro + rd * tm;
    p.xz = clampXZ(p.xz);
    float h = p.y - heightField(p.xz);
    if (h > 0.0) tA = tm;
    else tB = tm;
  }

  tHit = 0.5 * (tA + tB);
  if (tHit != tHit || tHit < 0.0 || tHit > tFar) {
    return false;
  }
  pHit = ro + rd * tHit;
  pHit.xz = clampXZ(pHit.xz);
  return true;
}

void main() {
  vec2 res = max(uResolution, vec2(1.0));
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / res.y;

  // Perspective ocean camera of our own design — readable horizon, scale as zoom.
  float s = clamp(uScale, 0.35, 2.4);
  float zoom = mix(1.55, 0.72, clamp01((s - 0.35) / 2.05));
  float eyeH = 1.15 + zoom * 0.55;
  float eyeZ = -3.2 - zoom * 1.1;
  vec3 ro = vec3(0.0, eyeH, eyeZ);

  // Look toward the sanctuary horizon (+Z), slight downward pitch.
  vec3 lookAt = vec3(0.0, 0.12 + (1.0 - zoom) * 0.08, 6.5);
  vec3 ww = safeNorm(lookAt - ro);
  vec3 uu = safeNorm(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  float fov = mix(1.05, 0.78, clamp01((s - 0.35) / 2.05));
  vec3 rd = safeNorm(uu * uv.x * fov + vv * uv.y * fov + ww);

  float tHit;
  vec3 pHit;
  bool hit = intersectOcean(ro, rd, tHit, pHit);

  vec3 col = vec3(0.0);
  float alpha = 0.0;

  if (hit) {
    vec3 n = heightNormal(pHit.xz);
    float h = heightField(pHit.xz);
    vec3 V = safeNorm(-rd);

    // Depth attenuation along the view — far / troughs read as deep bass water.
    float viewDepth = clamp01((tHit - 1.5) / 22.0);
    float trough = clamp01((-h) * 0.85 + (1.0 - n.y) * 0.2);
    float deepAmt = clamp01(viewDepth * 0.75 + trough * 0.55);

    vec3 deepCol = uColorBass * (0.55 + uBass * 0.2);
    vec3 bodyCol = uColorMid * (0.75 + uMid * 0.15);
    vec3 water = mix(bodyCol, deepCol, deepAmt);

    // Colored Fresnel-like reflection (palette-tinted, not plain white sky).
    float ndv = clamp01(dot(n, V));
    float fres = pow(1.0 - ndv, 3.2);
    vec3 reflDir = reflect(rd, n);
    vec3 reflSky = skyColor(uv, reflDir.y);
    vec3 fresCol = mix(mix(uColorMid, uColorHigh, 0.35), reflSky, 0.55);
    water = mix(water, fresCol, fres * (0.18 + uAfterglow * 0.08));

    // Soft key light for readability without bloom flood.
    vec3 L = safeNorm(vec3(0.35, 0.82, 0.4));
    float diff = 0.35 + 0.65 * clamp01(dot(n, L));
    water *= diff;

    // Colored contour glints make the moving height field legible even when
    // the chosen palette has similar low/mid luminance.
    float slopeLight = clamp01((1.0 - n.y) * 3.2);
    float contourPhase =
      h * 15.0 + dot(pHit.xz, vec2(0.18, 0.09)) - uPhase * (0.55 + uMid * 0.12);
    float contour = pow(0.5 + 0.5 * sin(contourPhase), 6.0);
    float contourAccent =
      contour *
      (0.12 + slopeLight * 0.88) *
      (1.0 - clamp01(uStillness) * 0.85) *
      (0.45 + uEnergy * 0.2);
    water += mix(uColorMid, uColorHigh, 0.58) * contourAccent * 0.22;

    float foam = foamMask(pHit.xz, n, h);
    vec3 foamCol = tintHighlight(uColorHigh, 0.12 + uShimmer * 0.08 + uHat * 0.06);
    foamCol = mix(foamCol, mix(uColorHigh, uColorMid, 0.2), 0.12);
    // Cap foam brightness — hue-preserving, never plain white wash.
    foamCol = min(foamCol, uColorHigh * 1.12 + vec3(0.02));
    water = mix(water, foamCol, foam * (0.42 + uDensity * 0.2));

    // Snare spray flash: lateral flank brighten along crest foam (not kick pop).
    float snareFlash =
      clamp01(uSnare) *
      foam *
      (0.3 + 0.7 * abs(n.x)) *
      (1.0 - clamp01(uStillness) * 0.9);
    water = mix(water, tintHighlight(foamCol, 0.16), snareFlash * 0.52);
    water += uColorHigh * snareFlash * 0.2;

    // Small specular accents in the high band.
    vec3 R = reflect(-L, n);
    float spec = pow(clamp01(dot(R, V)), 48.0);
    water += uColorHigh * spec * (0.18 + uShimmer * 0.15) * (1.0 - clamp01(uStillness) * 0.7);

    // Afterglow leaves restrained horizon/foam warmth — not a fill bloom.
    water += mix(uColorMid, uColorHigh, 0.45) * uAfterglow * (0.06 + foam * 0.08);

    float barFlash = pow(1.0 - clamp01(uBarPhase), 9.0);
    water += uColorHigh * barFlash * 0.05 * (0.3 + foam);

    // Horizon soft-fade so the sea meets sky cleanly.
    float horizFade = 1.0 - smoothstep(18.0, 36.0, tHit);
    vec3 sky = skyColor(uv, rd.y);
    if (uBgAlpha < 0.5) {
      // With BackgroundLayer: keep water solid; do not paint sky into misses.
      col = water;
      alpha = mix(0.88, 1.0, horizFade);
    } else {
      col = mix(sky, water, horizFade);
      alpha = 1.0;
    }

    // Bound peak brightness at max gain / controls.
    col = min(col, vec3(1.75));
    alpha = clamp01(alpha);
  } else {
    if (uBgAlpha > 0.5) {
      col = skyColor(uv, rd.y);
      alpha = 1.0;
    } else {
      // Transparent miss so BackgroundLayer shows through.
      col = vec3(0.0);
      alpha = 0.0;
    }
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

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

export function TidalSanctuaryScene({
  palette,
  tier,
  scale = 1,
  speed = 1,
  turbulence = 1,
  density = 1,
  backdrop = false,
}: VisualizerSceneProps) {
  const mods = useModulation();
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const metricsRef = useMetricsRef();
  const { size, viewport } = useThree();

  const phaseRef = useRef(0);
  const stillnessSmooth = useRef(0);
  const gatherSmooth = useRef(0);
  const swellSmooth = useRef(0.15);
  const surgeSmooth = useRef(0);
  const afterglowSmooth = useRef(0);
  const kickSmooth = useRef(0);
  const snareSmooth = useRef(0);
  const hatSmooth = useRef(0);
  const kickTravel = useRef(28);
  const kickArmed = useRef(true);
  const prevKick = useRef(0);

  const budgets = useMemo(() => getTidalBudgets(tier as TidalTier), [tier]);
  const fragmentShader = useMemo(
    () => buildFragmentShader(budgets.traceSteps, budgets.refineSteps, budgets.waveOctaves),
    [budgets.traceSteps, budgets.refineSteps, budgets.waveOctaves],
  );
  const kitAmp = tier === 'low' ? 0.78 : tier === 'mid' ? 0.9 : 1;

  const uniforms = useMemo(
    () => ({
      uResolution: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uPhase: { value: 0 },
      uBass: { value: 0 },
      uBassAct: { value: 0 },
      uMid: { value: 0 },
      uHigh: { value: 0 },
      uSwell: { value: 0.15 },
      uShimmer: { value: 0 },
      uHat: { value: 0 },
      uKick: { value: 0 },
      uKickTravel: { value: 28 },
      uSnare: { value: 0 },
      uGather: { value: 0 },
      uSurge: { value: 0 },
      uStillness: { value: 0 },
      uAfterglow: { value: 0 },
      uEnergy: { value: 0 },
      uBarPhase: { value: 0 },
      uTurbulence: { value: 1 },
      uDensity: { value: 1 },
      uScale: { value: 1 },
      uBgAlpha: { value: 1 },
      uColorBass: { value: new THREE.Color(1, 1, 1) },
      uColorMid: { value: new THREE.Color(1, 1, 1) },
      uColorHigh: { value: new THREE.Color(1, 1, 1) },
    }),
    // Colors rewritten every frame from the living palette.
    [],
  );

  useFrame((_state, delta) => {
    const mat = matRef.current;
    if (!mat) return;
    const m = metricsRef.current;
    const dt = Math.min(delta, 0.08);
    const mv = mods.current;
    const pace = Math.max(0.05, mv.speed ?? speed);

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
    const motionMul = 1 - stillness * 0.9;

    const sectionPace = 0.75 + m.sectionLevel * 0.45;
    // Forward-only accumulated phase — never reverses when energy drops.
    const phaseRate =
      (0.22 +
        Math.min(m.energy, 1.5) * 0.12 +
        Math.min(m.bassActivity, 1) * 0.1 +
        Math.min(m.swell, 1) * 0.08) *
      pace *
      sectionPace *
      motionMul;
    phaseRef.current += dt * Math.max(phaseRate, 0.02 * pace * (1 - stillness * 0.85));

    gatherSmooth.current = smoothToward(gatherSmooth.current, m.gather, dt, 0.04, 0.14);
    swellSmooth.current = smoothToward(swellSmooth.current, m.swell, dt, 0.12, 0.45);
    surgeSmooth.current = smoothToward(
      surgeSmooth.current,
      Math.min(1.25, m.release * 0.95 + m.dropEvent * 1.1 + m.impact * 0.35) * kitAmp,
      dt,
      0.03,
      0.18,
    );
    afterglowSmooth.current = smoothToward(afterglowSmooth.current, m.afterglow, dt, 0.18, 0.85);
    kickSmooth.current = smoothToward(
      kickSmooth.current,
      Math.min(1.2, m.kick) * kitAmp,
      dt,
      0.028,
      0.12,
    );
    snareSmooth.current = smoothToward(
      snareSmooth.current,
      Math.min(1.2, m.snare) * kitAmp,
      dt,
      0.02,
      0.12,
    );
    hatSmooth.current = smoothToward(
      hatSmooth.current,
      Math.min(1.2, m.hat) * kitAmp,
      dt,
      0.02,
      0.09,
    );

    // Forward-only kick crest pulse — launches outward, never contracts.
    const kickNow = kickSmooth.current;
    if (kickNow < 0.08) kickArmed.current = true;
    if (kickArmed.current && kickNow > 0.22 && prevKick.current <= 0.22) {
      kickTravel.current = 0;
      kickArmed.current = false;
    }
    prevKick.current = kickNow;
    if (kickTravel.current < 28) {
      const bpm = m.bpm && m.bpm > 30 ? m.bpm : 120;
      kickTravel.current = Math.min(
        28,
        kickTravel.current + dt * pace * (2.8 + bpm / 90) * (0.85 + kickNow * 0.4),
      );
    }

    mat.uniforms.uResolution!.value.set(size.width * viewport.dpr, size.height * viewport.dpr);
    mat.uniforms.uTime!.value = phaseRef.current;
    mat.uniforms.uPhase!.value = phaseRef.current;
    mat.uniforms.uBass!.value = clamp(m.bass, 0, 2);
    mat.uniforms.uBassAct!.value = clamp(m.bassActivity, 0, 1.5);
    mat.uniforms.uMid!.value = clamp(m.mid, 0, 2);
    mat.uniforms.uHigh!.value = clamp(m.high, 0, 2);
    mat.uniforms.uSwell!.value = swellSmooth.current;
    mat.uniforms.uShimmer!.value = clamp(m.shimmer, 0, 1.5) * kitAmp;
    mat.uniforms.uHat!.value = hatSmooth.current;
    mat.uniforms.uKick!.value = kickSmooth.current;
    mat.uniforms.uKickTravel!.value = kickTravel.current;
    mat.uniforms.uSnare!.value = snareSmooth.current;
    mat.uniforms.uGather!.value = gatherSmooth.current;
    mat.uniforms.uSurge!.value = surgeSmooth.current;
    mat.uniforms.uStillness!.value = stillness;
    mat.uniforms.uAfterglow!.value = afterglowSmooth.current;
    mat.uniforms.uEnergy!.value = clamp(m.energy + afterglowSmooth.current * 0.25, 0, 2);
    // Phase 0 is a real downbeat only when BPM tracking is valid. Use the
    // no-flash end of the phase range while timing is unavailable.
    mat.uniforms.uBarPhase!.value = m.bpm && m.bpm > 30 ? clamp(m.barPhase, 0, 1) : 1;
    mat.uniforms.uTurbulence!.value = clamp(mv.turbulence ?? turbulence, 0, 2);
    mat.uniforms.uDensity!.value = clamp(mv.density ?? density, 0.05, 1);
    mat.uniforms.uScale!.value = clamp(mv.scale ?? scale, 0.35, 2.4);
    mat.uniforms.uBgAlpha!.value = backdrop ? 0 : 1;
    (mat.uniforms.uColorBass!.value as THREE.Color).set(palette.bass);
    (mat.uniforms.uColorMid!.value as THREE.Color).set(palette.mid);
    (mat.uniforms.uColorHigh!.value as THREE.Color).set(palette.high);
  });

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

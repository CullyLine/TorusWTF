'use client';

/**
 * Alien Planet — original raymarched height-field canopy world on a
 * fullscreen clip-space triangle. Clean-room build: techniques (fbm terrain,
 * grid-jittered crown domes, height fog) are standard, the implementation,
 * constants, and composition are ours. Born as the first "Rainforest
 * Reverie"; renamed once the licensed iq Rainforest port took that slot —
 * under non-green palettes this one reads like a canopy on another world.
 * Musical anatomy:
 *  - bass / bassActivity → valley mist swells and breathes upward
 *  - kick → ring of light rolling outward across the canopy
 *  - snare → brief lateral mist/canopy shear ripple (backbeat brush)
 *  - mids / swell → wind swaying the crown tops
 *  - high / shimmer / hat → wet-leaf sparkle on sunlit crowns
 *  - gather → mist thickens, wind stills before the hit
 *  - release / drop → fog burns off, the sun surges through
 *  - silence / holdBreath → windless, mist-heavy held breath
 *  - afterglow → warm light lingering on slopes and haze
 *
 * Controls (existing storage keys only):
 *  - turbulence → wind strength in the canopy
 *  - density → tree coverage + mist body
 *  - scale → flight altitude / framing (clip-space bypasses model matrix)
 */

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';
import { useModulation } from '../modulation';
import {
  getAlienPlanetBudgets,
  type AlienPlanetBudgets,
  type AlienPlanetTier,
} from './alienPlanetData';

const FULLSCREEN_TRIANGLE = new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]);

function buildFragmentShader(budgets: AlienPlanetBudgets): string {
  return /* glsl */ `
#define TRACE_STEPS ${budgets.traceSteps}
#define REFINE_STEPS ${budgets.refineSteps}
#define HILL_OCTAVES ${budgets.hillOctaves}
#define DETAIL_OCTAVES ${budgets.detailOctaves}
#define SHADOW_STEPS ${budgets.shadowSteps}
#define MIST_SAMPLES ${budgets.mistSamples}
#define CLOUD_OCTAVES ${budgets.cloudOctaves}

uniform vec2 uResolution;
uniform float uPhase;
uniform float uCamDist;
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
uniform float uTurbulence;
uniform float uDensity;
uniform float uScale;
uniform float uBgAlpha;
uniform vec3 uColorBass;
uniform vec3 uColorMid;
uniform vec3 uColorHigh;

// Highest possible terrain + crown; rays above this going up are sky.
#define MAX_WORLD_Y 7.3
#define T_FAR 72.0

float clamp01(float v) {
  return clamp(v, 0.0, 1.0);
}

vec3 safeNorm(vec3 v) {
  float L = max(length(v), 1e-4);
  return v / L;
}

float hash12(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

vec2 hash22(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy);
}

// Value noise in -1..1 with smooth interpolation.
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 2.0 - 1.0;
}

// Our own lattice rotation (~31 deg) so octaves never align.
const mat2 kRot = mat2(0.857, 0.515, -0.515, 0.857);

float hillsFbm(vec2 p) {
  float sum = 0.0;
  float amp = 1.0;
  float norm = 0.0;
  for (int i = 0; i < HILL_OCTAVES; i++) {
    sum += amp * vnoise(p);
    norm += amp;
    amp *= 0.48;
    p = kRot * p * 2.15 + vec2(31.7, 11.3);
  }
  return sum / max(norm, 1e-4);
}

// Broad ridges with a soft valley channel along +Z — the signature shot and
// a guaranteed-safe flight corridor for the camera.
float hillsHeight(vec2 xz) {
  float h = hillsFbm(xz * 0.042) * 3.1;
  // NOTE: no pow() here — pow(negative, y) is undefined in GLSL.
  float vx = xz.x * 0.13;
  float valley = exp(-vx * vx);
  return mix(h + 2.0, h * 0.32 - 1.2, valley);
}

// Tree coverage mask — density opens clearings instead of shrinking trees.
float treeCover(vec2 xz) {
  float n = vnoise(xz * 0.055 + vec2(17.0, -9.0));
  float dens = clamp(uDensity, 0.05, 1.0);
  float lift = (1.0 - dens) * 1.1;
  return smoothstep(-0.8 + lift, -0.25 + lift, n);
}

// Jittered crown domes on a unit grid (nearest four cells).
// Returns (height, treeId, apex01) — apex01 is 0 at the crown top, 1 at rim.
vec3 crownField(vec2 xz) {
  float windAmp = 0.05 * clamp(uTurbulence, 0.0, 2.0) *
    (0.25 + clamp01(uSwell) * 0.6 + clamp01(uMid * 0.5) * 0.5) *
    (1.0 - clamp01(uStillness) * 0.85);
  // Low-frequency warp breaks the grid so crowns never form rows.
  vec2 warp = 0.38 * vec2(vnoise(xz * 0.21), vnoise(xz * 0.19 + 5.0));
  // Snare: brief lateral shear through the canopy (not the kick's radial ring).
  float snare = clamp(uSnare, 0.0, 1.2);
  float snareRipple = 0.55 + 0.45 * vnoise(xz * 0.42 + vec2(uPhase * 0.8, -3.1));
  vec2 snareShear = snare * snareRipple * vec2(0.72, -0.28);
  vec2 p = xz * 1.45 + warp + snareShear + windAmp * vec2(
    sin(uPhase * 1.35 + xz.y * 0.4),
    cos(uPhase * 1.12 + xz.x * 0.33));
  vec2 cell = floor(p);
  vec2 f = p - cell;
  float best = 0.0;
  float id = 0.5;
  float apex = 1.0;
  for (int j = 0; j <= 1; j++) {
    for (int i = 0; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j)) - step(f, vec2(0.5));
      vec2 cid = cell + g;
      vec2 rnd = hash22(cid);
      vec2 toCenter = g + 0.22 + rnd * 0.56 - f;
      float radius = 0.34 + rnd.x * 0.3;
      float tall = (0.45 + rnd.y * 0.72) * (1.0 + clamp01(uBass) * 0.1);
      // Occasional emergent giants poking above the canopy roof.
      tall *= 1.0 + step(0.93, rnd.x) * 0.45;
      float d2 = dot(toCenter, toCenter) / (radius * radius);
      if (d2 < 1.0) {
        float dome = tall * sqrt(1.0 - d2);
        if (dome > best) {
          best = dome;
          id = hash12(cid + vec2(7.31, 3.77));
          apex = d2;
        }
      }
    }
  }
  // Foliage clumps: fine geometric crenellation that keeps the dome shape.
  best *= 0.90 + 0.14 * vnoise(p * 7.5);
  return vec3(best, id, apex);
}

float terrainHeight(vec2 xz) {
  float h = hillsHeight(xz);
  float cover = treeCover(xz);
  if (cover > 0.003) {
    h += crownField(xz).x * cover;
  }
  return h;
}

bool marchForest(vec3 ro, vec3 rd, out float tHit) {
  tHit = -1.0;
  if (ro.y > MAX_WORLD_Y && rd.y > 0.0) return false;
  float t = 0.3;
  float prevT = t;
  float prevD = ro.y + rd.y * t - terrainHeight((ro + rd * t).xz);
  if (prevD < 0.0) {
    tHit = t;
    return true;
  }
  bool bracket = false;
  for (int i = 0; i < TRACE_STEPS; i++) {
    // Height-adaptive step, capped so steep crown rims can't be skipped.
    float stepSize = clamp(prevD * 0.5, 0.05, 1.35) * (1.0 + t * 0.012);
    t += stepSize;
    if (t > T_FAR) return false;
    vec3 p = ro + rd * t;
    if (p.y > MAX_WORLD_Y && rd.y > 0.0) return false;
    float d = p.y - terrainHeight(p.xz);
    if (d != d) return false;
    if (d < 0.0) {
      bracket = true;
      break;
    }
    prevT = t;
    prevD = d;
  }
  if (!bracket) return false;
  float tA = prevT;
  float tB = t;
  for (int r = 0; r < REFINE_STEPS; r++) {
    float tm = 0.5 * (tA + tB);
    vec3 p = ro + rd * tm;
    float d = p.y - terrainHeight(p.xz);
    if (d > 0.0) tA = tm;
    else tB = tm;
  }
  tHit = 0.5 * (tA + tB);
  return tHit == tHit && tHit > 0.0 && tHit <= T_FAR;
}

vec3 terrainNormal(vec2 xz, float t) {
  float e = 0.008 + t * 0.0016;
  float hL = terrainHeight(xz - vec2(e, 0.0));
  float hR = terrainHeight(xz + vec2(e, 0.0));
  float hD = terrainHeight(xz - vec2(0.0, e));
  float hU = terrainHeight(xz + vec2(0.0, e));
  return safeNorm(vec3(hL - hR, 2.0 * e, hD - hU));
}

// Leafy micro-relief: bend the normal by a high-frequency noise gradient.
vec3 leafBump(vec2 xz, vec3 n, float t, float amt) {
  float fade = amt * (1.0 - smoothstep(18.0, 55.0, t));
  if (fade < 0.015) return n;
  vec2 q = xz * 8.5;
  vec2 grad = vec2(0.0);
  float w = 1.0;
  float e = 0.09;
  for (int i = 0; i < DETAIL_OCTAVES; i++) {
    grad += w * vec2(
      vnoise(q + vec2(e, 0.0)) - vnoise(q - vec2(e, 0.0)),
      vnoise(q + vec2(0.0, e)) - vnoise(q - vec2(0.0, e)));
    q = q * 2.3 + 13.1;
    w *= 0.55;
  }
  return safeNorm(n - vec3(grad.x, 0.0, grad.y) * 0.8 * fade);
}

float sunShadow(vec3 p, vec3 sunDir) {
#if SHADOW_STEPS > 0
  float res = 1.0;
  float t = 0.35;
  for (int i = 0; i < SHADOW_STEPS; i++) {
    vec3 q = p + sunDir * t;
    if (q.y > MAX_WORLD_Y) break;
    float d = q.y - terrainHeight(q.xz);
    res = min(res, clamp01(0.12 + d * 3.2 / t));
    if (res < 0.04) break;
    t += clamp(d, 0.4, 2.6);
  }
  return clamp01(res);
#else
  return 1.0;
#endif
}

vec3 skyColor(vec3 ro, vec3 rd, vec3 sunDir, vec3 sunCol) {
  float up = clamp01(rd.y * 1.35 + 0.28);
  vec3 zen = mix(vec3(0.30, 0.42, 0.66), mix(uColorBass, uColorMid, 0.5), 0.42);
  vec3 hor = mix(vec3(0.66, 0.66, 0.68), mix(uColorMid, uColorHigh, 0.35), 0.34);
  hor *= 0.9 + clamp01(uAfterglow) * 0.25;
  vec3 col = mix(hor, zen, pow(up, 0.8));
  // Drifting cloud sheet high above the valley.
  if (rd.y > 0.02) {
    float tc = (16.0 - ro.y) / rd.y;
    vec2 cuv = (ro + rd * tc).xz * 0.02 + vec2(uPhase * 0.016, uPhase * 0.009);
    float cl = 0.0;
    float w = 1.0;
    float norm = 0.0;
    for (int i = 0; i < CLOUD_OCTAVES; i++) {
      cl += w * vnoise(cuv);
      norm += w;
      w *= 0.5;
      cuv = kRot * cuv * 2.1 + 4.7;
    }
    cl /= max(norm, 1e-4);
    float dl = smoothstep(-0.15, 0.55, cl);
    col = mix(col, hor * 1.18 + vec3(0.05), dl * 0.55 * clamp01(rd.y * 3.0));
  }
  float sunAmt = clamp01(dot(rd, sunDir));
  col += sunCol * 0.32 * pow(sunAmt, 22.0);
  col += sunCol * 0.11 * pow(sunAmt, 4.0) * (1.0 + clamp01(uSurge) * 0.5);
  return col;
}

// Mist banks hugging the valley floor, sampled sparsely along the view ray.
float valleyMist(vec3 ro, vec3 rd, float tEnd, float mistFloor) {
  float acc = 0.0;
  float seg = max(tEnd - 1.5, 0.0) / float(MIST_SAMPLES);
  for (int i = 0; i < MIST_SAMPLES; i++) {
    float tm = 1.5 + seg * (float(i) + 0.5);
    vec3 mp = ro + rd * tm;
    float band = exp(-max(mp.y - mistFloor, 0.0) * 1.15);
    // Snare shears valley mist sideways so the backbeat brushes the haze.
    float snareM = clamp(uSnare, 0.0, 1.2);
    vec2 mistUv = mp.xz * 0.13 + vec2(uPhase * 0.2, -uPhase * 0.12) +
      snareM * vec2(0.55, -0.22);
    float puff = 0.55 + 0.45 * vnoise(mistUv);
    puff *= 1.0 + snareM * 0.35 * (0.4 + 0.6 * abs(vnoise(mp.xz * 0.55)));
    acc += band * puff * seg;
  }
  float density = 0.030 +
    clamp01(uBass) * 0.018 +
    clamp01(uBassAct) * 0.008 +
    clamp01(uGather) * 0.035 +
    clamp01(uStillness) * 0.030;
  density *= 1.0 - clamp01(uSurge) * 0.55;
  density *= 0.75 + clamp(uDensity, 0.05, 1.0) * 0.4;
  return min(1.0 - exp(-acc * density), 0.85);
}

void main() {
  vec2 res = max(uResolution, vec2(1.0));
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / res.y;

  float s = clamp(uScale, 0.35, 2.4);
  float zoomT = clamp01((s - 0.35) / 2.05);

  // Glide down the valley corridor; scale sinks toward the canopy.
  float travel = uCamDist;
  vec3 ro = vec3(sin(travel * 0.045) * 1.7, 0.0, travel);
  ro.y = hillsHeight(ro.xz) + mix(3.6, 2.2, zoomT);
  vec3 ta = vec3(
    sin((travel + 9.0) * 0.045) * 1.35,
    ro.y - mix(0.85, 0.55, zoomT),
    travel + 9.0);
  vec3 ww = safeNorm(ta - ro);
  vec3 uu = safeNorm(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  float fov = mix(1.16, 0.86, zoomT);
  vec3 rd = safeNorm(uu * uv.x * fov + vv * uv.y * fov + ww);

  // Warm key light high left-forward: lateral enough to model the crowns,
  // forward enough that mist and ridges still glow against it.
  vec3 sunDir = safeNorm(vec3(-0.62, 0.52, 0.42));
  vec3 sunCol = mix(vec3(1.22, 1.05, 0.82), uColorHigh, 0.3);
  sunCol *= 1.0 + clamp01(uSurge) * 0.28 + clamp01(uKick) * 0.1;

  float mistFloor = ro.y - mix(3.6, 2.2, zoomT) + 0.4 +
    clamp01(uBass) * 0.5 +
    clamp01(uGather) * 0.4 -
    clamp01(uSurge) * 0.55;

  float sunAmt = clamp01(dot(rd, sunDir));
  vec3 hazeCol = mix(vec3(0.52, 0.54, 0.60), mix(uColorBass, uColorMid, 0.55), 0.42);
  hazeCol *= 0.95 + clamp01(uAfterglow) * 0.22;
  hazeCol += sunCol * pow(sunAmt, 3.0) * (0.12 + clamp01(uSurge) * 0.16);
  vec3 mistCol = hazeCol * 1.1 + sunCol * pow(sunAmt, 5.0) * 0.2;

  float tHit;
  bool hit = marchForest(ro, rd, tHit);

  vec3 col = vec3(0.0);
  float alpha = 0.0;

  if (hit) {
    vec3 pHit = ro + rd * tHit;
    vec2 xz = pHit.xz;

    float cover = treeCover(xz);
    vec3 crown = cover > 0.003 ? crownField(xz) : vec3(0.0, 0.5, 1.0);
    // How tree-ish this sample reads (crown height above the ground).
    float crownAmt = clamp01(crown.x * cover * 2.2);

    vec3 n = terrainNormal(xz, tHit);
    n = leafBump(xz, n, tHit, 0.12 + 0.5 * crownAmt);

    // Palette albedo: ground → bass, canopy body → mid (per-tree variation).
    float treeTone = crown.y;
    vec3 canopyAlbedo = mix(uColorMid * 0.42, uColorMid * 1.3, treeTone);
    float moss = smoothstep(0.15, 0.5, vnoise(xz * 0.11 + 3.7));
    canopyAlbedo = mix(canopyAlbedo, mix(uColorMid, uColorBass, 0.55), moss * 0.35);
    // Leaf-scale mottling keeps close crowns from reading as smooth shells.
    float leafTex = vnoise(xz * 9.0 + treeTone * 31.0);
    canopyAlbedo *= 0.82 + 0.18 * leafTex;
    // Some trees lean toward the bass hue for canopy variety.
    canopyAlbedo = mix(canopyAlbedo, uColorBass * 0.85, smoothstep(0.75, 0.95, treeTone) * 0.4);
    vec3 groundAlbedo = uColorBass * (0.3 + 0.16 * clamp01(n.y));
    vec3 albedo = mix(groundAlbedo, canopyAlbedo, crownAmt);

    // Crown rims and gaps sink into shade; bare gaps sit under the canopy.
    float occ = mix(0.62, 1.0 - pow(clamp01(crown.z), 0.75) * 0.72, crownAmt);

    float sha = sunShadow(pHit + vec3(0.0, 0.05, 0.0), sunDir);
    float dif = clamp01(0.08 + 0.92 * dot(n, sunDir)) * sha;
    float dome = clamp01(0.5 + 0.5 * n.y);
    vec3 backDir = safeNorm(vec3(-sunDir.x, 0.0, -sunDir.z));
    float bac = clamp01(0.5 + 0.5 * dot(n, backDir));
    float rim = pow(clamp01(1.0 + dot(n, rd)), 4.0) * (1.0 - smoothstep(20.0, 45.0, tHit));

    vec3 skyAmb = mix(vec3(0.5, 0.62, 0.78), mix(uColorBass, uColorMid, 0.6), 0.45);
    vec3 lin = sunCol * (3.1 * dif) +
      skyAmb * (0.48 * dome) +
      mix(uColorMid, uColorHigh, 0.3) * (0.16 * bac) +
      mix(uColorHigh, vec3(1.0), 0.35) * (rim * 0.5);
    lin *= occ * (0.92 + clamp(uEnergy, 0.0, 2.0) * 0.08);
    col = albedo * lin;

    // Wet-leaf sparkle on the high band — per-tree twinkle phase.
    vec3 R = reflect(rd, n);
    float spec = pow(clamp01(dot(R, sunDir)), 20.0);
    float twinkle = 0.5 + 0.5 * sin(uPhase * 7.0 + treeTone * 61.0);
    float glint = spec * sha * (0.25 + pow(twinkle, 6.0) * 1.2) * crownAmt *
      (clamp01(uHigh) * 0.5 + clamp01(uShimmer) * 0.8 + clamp01(uHat) * 0.5);
    col += mix(uColorHigh, vec3(1.0), 0.25) * glint * 1.4;

    // Kick: a ring of light rolling outward across the canopy.
    float ringTravel = clamp(uKickTravel, 0.0, 30.0);
    if (uKick > 0.01 && ringTravel < 29.5) {
      vec2 ringC = ro.xz + safeNorm(vec3(ww.x, 0.0, ww.z)).xz * 7.0;
      float ringD = length(xz - ringC) - ringTravel;
      float ring = exp(-ringD * ringD * 0.5) * clamp01(uKick);
      col += mix(uColorHigh, uColorMid, 0.3) * ring * 0.5 * (0.3 + crownAmt);
    }

    // Snare: brief lateral flank flash on crowns — shear, not a traveling ring.
    float snareFlash = clamp01(uSnare) * crownAmt *
      (0.28 + 0.72 * abs(n.x)) *
      (0.45 + 0.55 * abs(vnoise(xz * 1.1 + vec2(uPhase * 2.4, 0.0))));
    col += mix(uColorHigh, uColorMid, 0.45) * snareFlash * 0.38;
    col += mistCol * clamp01(uSnare) * 0.06 * (0.35 + 0.65 * abs(n.x));

    // Afterglow leaves warm light on sun-facing slopes.
    col += sunCol * clamp01(uAfterglow) * 0.08 * dif;

    // Wavelength-dependent haze — distant ridges dissolve toward the mist.
    float fogMul = 0.8 +
      clamp01(uBass) * 0.25 +
      clamp01(uGather) * 0.5 +
      clamp01(uStillness) * 0.4;
    fogMul *= 1.0 - clamp01(uSurge) * 0.3;
    vec3 ext = exp(-tHit * fogMul * vec3(0.016, 0.023, 0.038));
    col = col * ext + (1.0 - ext) * hazeCol;

    float mist = valleyMist(ro, rd, min(tHit, 48.0), mistFloor);
    col = mix(col, mistCol, clamp01(mist));

    alpha = 1.0;
  } else {
    float mist = valleyMist(ro, rd, 48.0, mistFloor);
    float horizonMist = clamp01(mist) * (1.0 - clamp01(rd.y * 2.4));
    if (uBgAlpha > 0.5) {
      col = skyColor(ro, rd, sunDir, sunCol);
      col = mix(col, mistCol, horizonMist);
      alpha = 1.0;
    } else {
      // Transparent sky so BackgroundLayer shows through; keep the mist.
      col = mistCol;
      alpha = horizonMist * 0.85;
    }
  }

  // Soft filmic-ish finish: compress peaks, gentle S-curve, hue-preserving.
  col *= 1.06;
  col = col / (1.0 + max(max(col.r, col.g), col.b) * 0.18);
  vec3 cc = clamp(col, 0.0, 1.0);
  col = mix(col, cc * cc * (3.0 - 2.0 * cc), 0.3);
  col = min(col, vec3(1.75));

  gl_FragColor = vec4(col, clamp01(alpha));
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

export function AlienPlanetScene({
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
  const camDistRef = useRef(0);
  const stillnessSmooth = useRef(0);
  const gatherSmooth = useRef(0);
  const swellSmooth = useRef(0.15);
  const surgeSmooth = useRef(0);
  const afterglowSmooth = useRef(0);
  const kickSmooth = useRef(0);
  const snareSmooth = useRef(0);
  const hatSmooth = useRef(0);
  const kickTravel = useRef(30);
  const kickArmed = useRef(true);
  const prevKick = useRef(0);

  const budgets = useMemo(() => getAlienPlanetBudgets(tier as AlienPlanetTier), [tier]);
  const fragmentShader = useMemo(() => buildFragmentShader(budgets), [budgets]);
  const kitAmp = tier === 'low' ? 0.78 : tier === 'mid' ? 0.9 : 1;

  const uniforms = useMemo(
    () => ({
      uResolution: { value: new THREE.Vector2(1, 1) },
      uPhase: { value: 0 },
      uCamDist: { value: 0 },
      uBass: { value: 0 },
      uBassAct: { value: 0 },
      uMid: { value: 0 },
      uHigh: { value: 0 },
      uSwell: { value: 0.15 },
      uShimmer: { value: 0 },
      uHat: { value: 0 },
      uKick: { value: 0 },
      uKickTravel: { value: 30 },
      uSnare: { value: 0 },
      uGather: { value: 0 },
      uSurge: { value: 0 },
      uStillness: { value: 0 },
      uAfterglow: { value: 0 },
      uEnergy: { value: 0 },
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
    // Forward-only wind/mist clock — never reverses when energy drops.
    const phaseRate =
      (0.28 + Math.min(m.energy, 1.5) * 0.14 + Math.min(m.swell, 1) * 0.1) *
      pace *
      sectionPace *
      motionMul;
    phaseRef.current += dt * Math.max(phaseRate, 0.02 * pace * (1 - stillness * 0.85));

    // Forward-only glide down the valley.
    const glideRate =
      (0.5 +
        Math.min(m.energy, 1.5) * 0.22 +
        Math.min(m.swell, 1) * 0.16 +
        Math.min(m.bassActivity, 1) * 0.1) *
      pace *
      sectionPace *
      motionMul;
    camDistRef.current += dt * Math.max(glideRate, 0.04 * pace);

    gatherSmooth.current = smoothToward(gatherSmooth.current, m.gather, dt, 0.04, 0.14);
    swellSmooth.current = smoothToward(swellSmooth.current, m.swell, dt, 0.12, 0.45);
    surgeSmooth.current = smoothToward(
      surgeSmooth.current,
      Math.min(1.25, m.release * 0.95 + m.dropEvent * 1.1 + m.impact * 0.35) * kitAmp,
      dt,
      0.03,
      0.22,
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

    // Forward-only kick light-ring — launches outward, never contracts.
    const kickNow = kickSmooth.current;
    if (kickNow < 0.08) kickArmed.current = true;
    if (kickArmed.current && kickNow > 0.22 && prevKick.current <= 0.22) {
      kickTravel.current = 0;
      kickArmed.current = false;
    }
    prevKick.current = kickNow;
    if (kickTravel.current < 30) {
      const bpm = m.bpm && m.bpm > 30 ? m.bpm : 120;
      kickTravel.current = Math.min(
        30,
        kickTravel.current + dt * pace * (3.2 + bpm / 80) * (0.85 + kickNow * 0.4),
      );
    }

    mat.uniforms.uResolution!.value.set(size.width * viewport.dpr, size.height * viewport.dpr);
    mat.uniforms.uPhase!.value = phaseRef.current;
    mat.uniforms.uCamDist!.value = camDistRef.current;
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

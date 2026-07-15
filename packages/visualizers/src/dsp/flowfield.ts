/**
 * Flow-field math core — the "Flow Field Update" engine.
 *
 * Divergence-free 3D flow built from the curl of value noise with analytic
 * gradients (no finite differences, 3 noise evaluations per curl sample).
 * Curl fields never compress or pile particles up: they loop, spiral and
 * river together — local chaos, global coherence.
 *
 * This is the CPU twin of `flowGlsl.ts`. Both implement the same math so a
 * JS-advected preset and a GPU-simulated preset read the same currents.
 * Keep them in sync.
 *
 * Everything here is allocation-free per sample: callers pass an `out`
 * vector. Designed to be called thousands of times per frame.
 */

import type { AudioMetrics } from '../metrics';

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

// ---------------------------------------------------------------------------
// Hash + value noise with analytic gradient
// ---------------------------------------------------------------------------

/** Deterministic integer-lattice hash → 0..1. Mirrors ffHash in flowGlsl. */
function hash(ix: number, iy: number, iz: number, seed: number): number {
  // sin-dot hash, same constants as the GLSL twin so fields match.
  const d = ix * 127.1 + iy * 311.7 + iz * 74.7 + seed * 19.19;
  const s = Math.sin(d) * 43758.5453123;
  return s - Math.floor(s);
}

/** Scratch for noised() — avoids allocation in hot loops. */
interface NoiseGrad {
  v: number;
  gx: number;
  gy: number;
  gz: number;
}

const ng1: NoiseGrad = { v: 0, gx: 0, gy: 0, gz: 0 };
const ng2: NoiseGrad = { v: 0, gx: 0, gy: 0, gz: 0 };
const ng3: NoiseGrad = { v: 0, gx: 0, gy: 0, gz: 0 };

/**
 * Value noise + analytic gradient (iq's k-coefficient formulation).
 * Quintic fade keeps second derivatives continuous so curl is smooth.
 */
function noised(x: number, y: number, z: number, seed: number, out: NoiseGrad): void {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;

  // Quintic fade + derivative.
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const dux = 30 * fx * fx * (fx * (fx - 2) + 1);
  const duy = 30 * fy * fy * (fy * (fy - 2) + 1);
  const duz = 30 * fz * fz * (fz * (fz - 2) + 1);

  const a = hash(ix, iy, iz, seed);
  const b = hash(ix + 1, iy, iz, seed);
  const c = hash(ix, iy + 1, iz, seed);
  const d = hash(ix + 1, iy + 1, iz, seed);
  const e = hash(ix, iy, iz + 1, seed);
  const f = hash(ix + 1, iy, iz + 1, seed);
  const g = hash(ix, iy + 1, iz + 1, seed);
  const h = hash(ix + 1, iy + 1, iz + 1, seed);

  const k0 = a;
  const k1 = b - a;
  const k2 = c - a;
  const k3 = e - a;
  const k4 = a - b - c + d;
  const k5 = a - c - e + g;
  const k6 = a - b - e + f;
  const k7 = -a + b + c - d + e - f - g + h;

  out.v = k0 + k1 * ux + k2 * uy + k3 * uz + k4 * ux * uy + k5 * uy * uz + k6 * uz * ux + k7 * ux * uy * uz;
  out.gx = dux * (k1 + k4 * uy + k6 * uz + k7 * uy * uz);
  out.gy = duy * (k2 + k4 * ux + k5 * uz + k7 * uz * ux);
  out.gz = duz * (k3 + k5 * uy + k6 * ux + k7 * ux * uy);
}

// ---------------------------------------------------------------------------
// Curl noise — the divergence-free heart
// ---------------------------------------------------------------------------

// Domain offsets decorrelate the three potential components.
const OFF2 = 31.341;
const OFF3 = -47.853;

/**
 * curl of a 3-component noise potential, computed from analytic gradients:
 *   F = (N1, N2, N3),  curl F = (dN3/dy - dN2/dz, dN1/dz - dN3/dx, dN2/dx - dN1/dy)
 * Output magnitude is O(1). Writes into `out`.
 */
export function curlNoise(out: Vec3Like, x: number, y: number, z: number, seed: number): void {
  noised(x, y, z, seed, ng1);
  noised(x + OFF2, y + OFF2, z + OFF2, seed, ng2);
  noised(x + OFF3, y + OFF3, z + OFF3, seed, ng3);
  out.x = ng3.gy - ng2.gz;
  out.y = ng1.gz - ng3.gx;
  out.z = ng2.gx - ng1.gy;
}

// ---------------------------------------------------------------------------
// Flow primitives
// ---------------------------------------------------------------------------

/**
 * Vortex around the Y axis through the origin: tangential swirl + gentle
 * inward pull + lift that strengthens toward the funnel core. The Roblox
 * block-tornado, generalized. Adds into `out`.
 */
export function addVortex(out: Vec3Like, x: number, y: number, z: number, strength: number): void {
  if (strength <= 0) return;
  const r2 = x * x + z * z;
  const r = Math.sqrt(r2) + 1e-5;
  // Rankine-ish profile: solid-body core, 1/r tail. Peak near r=0.7.
  const profile = r / (0.5 + r2);
  const tangX = -z / r;
  const tangZ = x / r;
  const inward = 0.35 * profile;
  out.x += strength * (tangX * profile - (x / r) * inward);
  out.z += strength * (tangZ * profile - (z / r) * inward);
  out.y += strength * 0.45 * profile;
}

/**
 * Attractor/repulsor well — your FlowField Magnet, generalized. Positive
 * strength pulls, negative flings. Smooth falloff, no singularity.
 */
export function addWell(
  out: Vec3Like,
  x: number,
  y: number,
  z: number,
  cx: number,
  cy: number,
  cz: number,
  strength: number,
  radius: number,
): void {
  if (strength === 0) return;
  const dx = cx - x;
  const dy = cy - y;
  const dz = cz - z;
  const d2 = dx * dx + dy * dy + dz * dz;
  const falloff = radius * radius / (radius * radius + d2);
  const inv = 1 / (Math.sqrt(d2) + 0.12);
  const s = strength * falloff * inv;
  out.x += dx * s;
  out.y += dy * s;
  out.z += dz * s;
}

// ---------------------------------------------------------------------------
// Audio-driven flow parameters
// ---------------------------------------------------------------------------

export interface FlowParams {
  /** Monotonic accumulated time — never tie this to raw energy. */
  time: number;
  /** Spatial frequency. Lower = big slow eddies, higher = tight vortices. */
  fieldScale: number;
  /** Second-octave gain 0..1 — fine turbulent detail. */
  turbulence: number;
  /** Overall field velocity multiplier. */
  swirl: number;
  /** Per-band domain shift magnitude. 0 = all bands share one field. */
  bandSpread: number;
  /** Vortex strength 0..N. */
  vortex: number;
  /** Vertical buoyancy bias (warm tracks rise, cold tracks sink). */
  buoyancy: number;
  /** Field seed — rotates on drops so the current reorganizes. */
  seed: number;
}

export const DEFAULT_FLOW_PARAMS: FlowParams = {
  time: 0,
  fieldScale: 0.55,
  turbulence: 0.5,
  swirl: 1,
  bandSpread: 0,
  vortex: 0,
  buoyancy: 0,
  seed: 0,
};

/**
 * Map live audio metrics onto flow parameters. Mutates and returns `out` so
 * presets can keep one params object per component. `time` and `seed` are
 * owned by the caller (accumulate time from deltas; bump seed on drops).
 */
export function flowParamsFromMetrics(
  m: AudioMetrics,
  out: FlowParams,
  opts?: { turbulence?: number; vortex?: number },
): FlowParams {
  const userTurb = opts?.turbulence ?? 1;
  const userVortex = opts?.vortex ?? 0;
  // Bass widens the eddies (lower spatial frequency); highs tighten detail.
  out.fieldScale = 0.65 - Math.min(m.bass, 1.5) * 0.18 + Math.min(m.high, 1.5) * 0.1;
  out.turbulence = Math.min(1, (0.3 + m.high * 0.5 + m.arousal * 0.35) * userTurb);
  out.swirl = 0.55 + Math.min(m.mid, 2) * 0.6 + m.beat * 0.5 + m.dropEvent * 0.9;
  out.swirl *= 0.85 + m.sectionLevel * 0.3;
  // Convergence collapses the three band-fields into one shared current.
  out.bandSpread = (1 - (m.convergence ?? 0)) * 0.9;
  out.vortex = userVortex * (0.4 + m.bassActivity * 0.8 + m.dropEvent * 1.2);
  out.buoyancy = m.valence * 0.22 * m.moodConfidence + m.vocalActivity * 0.08;
  out.turbulence *= 0.9 + m.afterglow * 0.25;
  return out;
}

const curlScratch: Vec3Like = { x: 0, y: 0, z: 0 };

/**
 * Full composed flow sample: multi-octave curl + vortex + buoyancy, with
 * per-band domain offsets. `band` is 0 (bass), 1 (mid), 2 (high) — particles
 * in different bands ride different currents until convergence pulls
 * bandSpread → 0 and the swarm moves as one.
 *
 * Writes the velocity into `out`. Magnitude is O(swirl).
 */
export function sampleFlow(
  out: Vec3Like,
  x: number,
  y: number,
  z: number,
  band: number,
  p: FlowParams,
): void {
  const bandOff = band * 13.7 * p.bandSpread;
  const t = p.time * 0.18;
  const sx = (x + bandOff) * p.fieldScale + t;
  const sy = (y - bandOff * 0.6) * p.fieldScale + t * 0.83;
  const sz = (z + bandOff * 0.3) * p.fieldScale - t * 0.71;

  curlNoise(out, sx, sy, sz, p.seed);

  if (p.turbulence > 0.01) {
    curlNoise(curlScratch, sx * 2.3 + 7.7, sy * 2.3 - 3.1, sz * 2.3 + 5.9, p.seed);
    out.x += curlScratch.x * 0.5 * p.turbulence;
    out.y += curlScratch.y * 0.5 * p.turbulence;
    out.z += curlScratch.z * 0.5 * p.turbulence;
  }

  out.x *= p.swirl;
  out.y *= p.swirl;
  out.z *= p.swirl;

  addVortex(out, x, y, z, p.vortex);
  out.y += p.buoyancy;
}

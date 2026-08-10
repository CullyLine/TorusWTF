'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';
import { useModulation } from '../modulation';
import { getDotTexture } from '../dotTexture';

/**
 * Plasma Globe — the novelty-shop plasma ball, filaments reaching from a hot
 * electrode to the inside of the glass.
 *
 * Built to a performance budget rather than to a look. Everything here is
 * line segments and a handful of sprites updated on the CPU: no raymarching,
 * no per-pixel noise, no fullscreen pass. The whole scene is a few hundred
 * vertices, so it holds a smooth frame rate on machines with no usable GPU,
 * where the raymarched visualizers fall to single digits.
 *
 * Musical anatomy:
 *  - bass → electrode swell and overall filament brightness
 *  - kick → filaments snap to new landing points, contact flares
 *  - snare → lateral whip across the arcs
 *  - mid → jitter amplitude, the restless crackle
 *  - high / shimmer → fine sparkle along the filaments
 *  - gather → arcs converge to one side, the inhale before a hit
 *  - tension → filaments pull taut and straighten
 *  - dropEvent → every arc re-strikes at once
 *  - holdBreath / silence → the globe settles and dims, still alive
 */

const ARCS_HIGH = 10;
const ARCS_MID = 8;
const ARCS_LOW = 6;

const POINTS_HIGH = 26;
const POINTS_MID = 20;
const POINTS_LOW = 14;

/** Inner radius of the glass the filaments land on. */
const GLOBE_R = 1.05;
/** Radius of the electrode the filaments leave from. */
const CORE_R = 0.11;

function smoothToward(
  current: number,
  target: number,
  dt: number,
  riseTau: number,
  fallTau: number,
): number {
  const tau = target > current ? riseTau : fallTau;
  const a = 1 - Math.exp(-dt / Math.max(1e-4, tau));
  return current + (target - current) * a;
}

/** Cheap deterministic hash so arcs keep their identity across frames. */
function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

interface Arc {
  /** Current landing point on the glass. */
  dir: THREE.Vector3;
  /** Where it is travelling to after a re-strike. */
  target: THREE.Vector3;
  seed: number;
  /** 0..1 flare that decays after a strike. */
  flare: number;
  /** Per-arc brightness so they do not all pulse in lockstep. */
  life: number;
}

function randomDir(seed: number, out: THREE.Vector3): THREE.Vector3 {
  // Even distribution over the sphere; the poles matter because a plasma
  // ball's filaments reach everywhere, not just the equator.
  const u = hash(seed) * 2 - 1;
  const theta = hash(seed + 17.3) * Math.PI * 2;
  const r = Math.sqrt(Math.max(0, 1 - u * u));
  return out.set(r * Math.cos(theta), u, r * Math.sin(theta));
}

export function PlasmaGlobeScene({ palette, tier, speed = 1 }: VisualizerSceneProps) {
  const metricsRef = useMetricsRef();
  const mods = useModulation();

  const arcCount = tier === 'high' ? ARCS_HIGH : tier === 'mid' ? ARCS_MID : ARCS_LOW;
  const arcPoints = tier === 'high' ? POINTS_HIGH : tier === 'mid' ? POINTS_MID : POINTS_LOW;
  const segsPerArc = arcPoints - 1;

  const linesRef = useRef<THREE.LineSegments>(null);
  const contactsRef = useRef<THREE.Points>(null);
  const glowRef = useRef<THREE.Points>(null);
  const coreRef = useRef<THREE.Points>(null);
  const shellRef = useRef<THREE.LineSegments>(null);

  const timeRef = useRef(0);
  const kickSmooth = useRef(0);
  const snareSmooth = useRef(0);
  const midSmooth = useRef(0);
  const highSmooth = useRef(0);
  const gatherSmooth = useRef(0);
  const tensionSmooth = useRef(0);
  const stillSmooth = useRef(0);
  const prevKick = useRef(0);
  const prevDrop = useRef(0);

  const arcs = useMemo<Arc[]>(
    () =>
      Array.from({ length: arcCount }, (_, i) => ({
        dir: randomDir(i * 3.77 + 1, new THREE.Vector3()),
        target: randomDir(i * 3.77 + 1, new THREE.Vector3()),
        seed: i * 9.13 + 2.5,
        flare: 0,
        life: 0.6 + hash(i * 5.1) * 0.4,
      })),
    [arcCount],
  );

  const { geometry, positions, colors } = useMemo(() => {
    const vertexCount = arcCount * segsPerArc * 2;
    const positions = new Float32Array(vertexCount * 3);
    const colors = new Float32Array(vertexCount * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return { geometry, positions, colors };
  }, [arcCount, segsPerArc]);

  const glowGeometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = arcCount * arcPoints;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    return g;
  }, [arcCount, arcPoints]);

  const contactGeometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arcCount * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(arcCount * 3), 3));
    return g;
  }, [arcCount]);

  const coreGeometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
    return g;
  }, []);

  // A sparse latitude/longitude cage reads as glass without costing anything
  // like a real transparent sphere would.
  const shellGeometry = useMemo(() => {
    const pts: number[] = [];
    const rings = tier === 'low' ? 4 : 6;
    const meridians = tier === 'low' ? 6 : 8;
    const seg = tier === 'low' ? 20 : 28;
    for (let r = 1; r < rings; r++) {
      const phi = (r / rings) * Math.PI;
      const y = Math.cos(phi) * GLOBE_R;
      const rad = Math.sin(phi) * GLOBE_R;
      for (let s = 0; s < seg; s++) {
        const a0 = (s / seg) * Math.PI * 2;
        const a1 = ((s + 1) / seg) * Math.PI * 2;
        pts.push(Math.cos(a0) * rad, y, Math.sin(a0) * rad);
        pts.push(Math.cos(a1) * rad, y, Math.sin(a1) * rad);
      }
    }
    for (let mIdx = 0; mIdx < meridians; mIdx++) {
      const lon = (mIdx / meridians) * Math.PI * 2;
      const cx = Math.cos(lon);
      const cz = Math.sin(lon);
      for (let s = 0; s < seg; s++) {
        const p0 = (s / seg) * Math.PI;
        const p1 = ((s + 1) / seg) * Math.PI;
        pts.push(Math.sin(p0) * cx * GLOBE_R, Math.cos(p0) * GLOBE_R, Math.sin(p0) * cz * GLOBE_R);
        pts.push(Math.sin(p1) * cx * GLOBE_R, Math.cos(p1) * GLOBE_R, Math.sin(p1) * cz * GLOBE_R);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [tier]);

  const dot = useMemo(() => getDotTexture(), []);

  useEffect(
    () => () => {
      geometry.dispose();
      glowGeometry.dispose();
      contactGeometry.dispose();
      coreGeometry.dispose();
      shellGeometry.dispose();
    },
    [geometry, glowGeometry, contactGeometry, coreGeometry, shellGeometry],
  );

  const scratchA = useMemo(() => new THREE.Vector3(), []);
  const scratchB = useMemo(() => new THREE.Vector3(), []);
  const scratchP = useMemo(() => new THREE.Vector3(), []);
  const colBass = useMemo(() => new THREE.Color(), []);
  const colMid = useMemo(() => new THREE.Color(), []);
  const colHigh = useMemo(() => new THREE.Color(), []);

  useFrame((_state, delta) => {
    const m = metricsRef.current;
    const dt = Math.min(delta, 0.1);
    const spd = Math.max(0.05, mods.current.speed ?? speed);

    const still = smoothToward(
      stillSmooth.current,
      Math.min(1, Math.max(m.holdBreath, m.silence * 0.9)),
      dt,
      0.14,
      0.09,
    );
    stillSmooth.current = still;
    const motion = 1 - still * 0.85;

    kickSmooth.current = smoothToward(kickSmooth.current, Math.min(1.2, m.kick), dt, 0.02, 0.13);
    snareSmooth.current = smoothToward(snareSmooth.current, Math.min(1.2, m.snare), dt, 0.02, 0.12);
    midSmooth.current = smoothToward(midSmooth.current, m.mid, dt, 0.05, 0.18);
    highSmooth.current = smoothToward(
      highSmooth.current,
      m.high * 0.7 + m.shimmer * 0.5,
      dt,
      0.02,
      0.1,
    );
    gatherSmooth.current = smoothToward(gatherSmooth.current, m.gather, dt, 0.04, 0.15);
    tensionSmooth.current = smoothToward(tensionSmooth.current, m.tension, dt, 0.1, 0.3);

    timeRef.current += dt * spd * (0.6 + m.energy * 0.5) * motion;
    const t = timeRef.current;

    // Re-strike: a kick sends every arc looking for a new landing point, a
    // drop re-strikes the whole globe at once. Between hits they drift.
    const kickEdge = m.kick > 0.32 && prevKick.current <= 0.32;
    const dropEdge = m.dropEvent > 0.7 && prevDrop.current <= 0.7;
    prevKick.current = m.kick;
    prevDrop.current = m.dropEvent;

    const gather = gatherSmooth.current;
    const tension = tensionSmooth.current;
    const jitter = (0.06 + midSmooth.current * 0.16 + highSmooth.current * 0.05) * (1 - tension * 0.55);

    colBass.set(palette.bass);
    colMid.set(palette.mid);
    colHigh.set(palette.high);

    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = geometry.getAttribute('color') as THREE.BufferAttribute;
    const glowPos = glowGeometry.getAttribute('position') as THREE.BufferAttribute;
    const glowCol = glowGeometry.getAttribute('color') as THREE.BufferAttribute;
    const contactPos = contactGeometry.getAttribute('position') as THREE.BufferAttribute;
    const contactCol = contactGeometry.getAttribute('color') as THREE.BufferAttribute;

    let w = 0;
    for (let i = 0; i < arcs.length; i++) {
      const arc = arcs[i]!;

      // Arcs re-target on a stagger so a kick reads as a cascade rather than
      // every filament teleporting in the same frame.
      if (dropEdge || (kickEdge && hash(arc.seed + Math.floor(t * 7)) > 0.45)) {
        randomDir(arc.seed + Math.floor(t * 31.7) * 13.1, arc.target);
        arc.flare = 1;
      }
      arc.flare *= Math.exp(-dt / 0.22);

      // Ease toward the target instead of snapping, so filaments sweep.
      const chase = 1 - Math.exp(-dt / (0.05 + 0.12 * (1 - kickSmooth.current)));
      arc.dir.lerp(arc.target, chase).normalize();

      // Gather pulls every landing point toward a shared side of the glass.
      scratchB.set(0.55, 0.25, 0.8).normalize();
      scratchA.copy(arc.dir).lerp(scratchB, gather * 0.45).normalize();

      // Snare whips the arcs sideways.
      const whip = snareSmooth.current * 0.22 * (i % 2 === 0 ? 1 : -1);
      scratchA.x += whip;
      scratchA.normalize();

      const endX = scratchA.x * GLOBE_R;
      const endY = scratchA.y * GLOBE_R;
      const endZ = scratchA.z * GLOBE_R;
      const startX = scratchA.x * CORE_R;
      const startY = scratchA.y * CORE_R;
      const startZ = scratchA.z * CORE_R;

      // Two perpendiculars to displace along, so the filament wanders in the
      // plane across its own direction rather than only up and down.
      scratchP.set(-scratchA.z, 0, scratchA.x);
      if (scratchP.lengthSq() < 1e-5) scratchP.set(1, 0, 0);
      scratchP.normalize();
      const px = scratchP.x;
      const py = scratchP.y;
      const pz = scratchP.z;
      const qx = scratchA.y * pz - scratchA.z * py;
      const qy = scratchA.z * px - scratchA.x * pz;
      const qz = scratchA.x * py - scratchA.y * px;

      const bright =
        arc.life *
        (1.5 + m.bass * 1.5 + kickSmooth.current * 1.2 + arc.flare * 1.8) *
        (1 - still * 0.55);

      let prevX = startX;
      let prevY = startY;
      let prevZ = startZ;
      let glowIdx = i * arcPoints;
      glowPos.setXYZ(glowIdx, startX, startY, startZ);
      glowCol.setXYZ(glowIdx, colBass.r * bright, colBass.g * bright, colBass.b * bright);
      glowIdx++;

      for (let s = 1; s < arcPoints; s++) {
        const f = s / segsPerArc;
        // Displacement swells in the middle and pins at both ends, so the
        // filament stays attached to the electrode and to the glass.
        const envelope = Math.sin(f * Math.PI);
        // Keep every term well under the Nyquist limit of the point count,
        // or the filament aliases into hard zig-zags instead of an arc.
        const wob =
          Math.sin(f * 4.2 + t * 3.4 + arc.seed) * 0.75 +
          Math.sin(f * 8.6 - t * 5.1 + arc.seed * 2.1) * 0.26 +
          Math.sin(f * 15.0 + t * 7.7 + arc.seed * 3.7) * 0.09;
        const wob2 =
          Math.cos(f * 5.1 - t * 3.9 + arc.seed * 1.7) * 0.62 +
          Math.cos(f * 10.4 + t * 6.2 + arc.seed * 2.9) * 0.2;
        const amp = jitter * envelope * motion;

        const bx = startX + (endX - startX) * f;
        const by = startY + (endY - startY) * f;
        const bz = startZ + (endZ - startZ) * f;
        const cx = bx + (px * wob + qx * wob2) * amp;
        const cy = by + (py * wob + qy * wob2) * amp;
        const cz = bz + (pz * wob + qz * wob2) * amp;

        posAttr.setXYZ(w, prevX, prevY, prevZ);
        posAttr.setXYZ(w + 1, cx, cy, cz);

        // Hot at the electrode, cooling toward the glass, so the filament
        // has direction rather than being a uniform stroke.
        const heat = 1 - f;
        const r =
          (colBass.r * heat + colMid.r * (1 - heat) * 0.85 + colHigh.r * highSmooth.current * 0.3) *
          bright;
        const g =
          (colBass.g * heat + colMid.g * (1 - heat) * 0.85 + colHigh.g * highSmooth.current * 0.3) *
          bright;
        const b =
          (colBass.b * heat + colMid.b * (1 - heat) * 0.85 + colHigh.b * highSmooth.current * 0.3) *
          bright;
        colAttr.setXYZ(w, r, g, b);
        colAttr.setXYZ(w + 1, r * 0.92, g * 0.92, b * 0.92);

        glowPos.setXYZ(glowIdx, cx, cy, cz);
        glowCol.setXYZ(glowIdx, r * 0.85, g * 0.85, b * 0.85);
        glowIdx++;

        prevX = cx;
        prevY = cy;
        prevZ = cz;
        w += 2;
      }

      contactPos.setXYZ(i, prevX, prevY, prevZ);
      const flareCol = 0.5 + arc.flare * 1.5 + kickSmooth.current * 0.4;
      contactCol.setXYZ(
        i,
        colHigh.r * flareCol * bright,
        colHigh.g * flareCol * bright,
        colHigh.b * flareCol * bright,
      );
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    glowPos.needsUpdate = true;
    glowCol.needsUpdate = true;
    contactPos.needsUpdate = true;
    contactCol.needsUpdate = true;

    const lines = linesRef.current;
    if (lines) {
      const mat = lines.material as THREE.LineBasicMaterial;
      mat.opacity = Math.min(1, 0.55 + m.energy * 0.3 + kickSmooth.current * 0.2) * (1 - still * 0.5);
    }

    const glow = glowRef.current;
    if (glow) {
      const mat = glow.material as THREE.PointsMaterial;
      mat.size = 0.125 + m.bass * 0.05 + kickSmooth.current * 0.04;
      mat.opacity = (0.26 + m.energy * 0.14 + kickSmooth.current * 0.12) * (1 - still * 0.55);
    }

    const contacts = contactsRef.current;
    if (contacts) {
      const mat = contacts.material as THREE.PointsMaterial;
      mat.size = 0.075 + kickSmooth.current * 0.06 + m.bass * 0.03;
      mat.opacity = 0.55 + highSmooth.current * 0.3;
    }

    const core = coreRef.current;
    if (core) {
      const mat = core.material as THREE.PointsMaterial;
      mat.size = 0.34 + m.bass * 0.26 + kickSmooth.current * 0.22 + m.dropEvent * 0.26;
      mat.color.copy(colBass).lerp(colHigh, 0.25 + highSmooth.current * 0.3);
      mat.opacity = (0.7 + m.bass * 0.3) * (1 - still * 0.35);
    }

    const shell = shellRef.current;
    if (shell) {
      const mat = shell.material as THREE.LineBasicMaterial;
      mat.color.copy(colMid);
      mat.opacity = 0.09 + m.high * 0.08 + tension * 0.05;
      shell.rotation.y += dt * 0.05 * spd * motion;
    }
  });

  return (
    <group>
      <lineSegments ref={shellRef} geometry={shellGeometry} frustumCulled={false}>
        <lineBasicMaterial
          transparent
          opacity={0.06}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>

      <lineSegments ref={linesRef} geometry={geometry} frustumCulled={false}>
        <lineBasicMaterial
          vertexColors
          transparent
          opacity={0.8}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>

      <points ref={glowRef} geometry={glowGeometry} frustumCulled={false}>
        <pointsMaterial
          vertexColors
          map={dot}
          size={0.125}
          sizeAttenuation
          transparent
          opacity={0.3}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      <points ref={contactsRef} geometry={contactGeometry} frustumCulled={false}>
        <pointsMaterial
          vertexColors
          map={dot}
          size={0.08}
          sizeAttenuation
          transparent
          opacity={0.6}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      <points ref={coreRef} geometry={coreGeometry} frustumCulled={false}>
        <pointsMaterial
          map={dot}
          size={0.5}
          sizeAttenuation
          transparent
          opacity={0.85}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}

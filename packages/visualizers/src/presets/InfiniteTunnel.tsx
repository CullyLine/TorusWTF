'use client';

/**
 * Infinite Tunnel — descendant of the original TunnelVisualizer (Three.js,
 * pre-AI era): segments of plane walls rushing toward the viewer with
 * pyramids on the inside faces. Rebuilt for torus.wtf with the Flow Field
 * Update systems:
 *
 *  - BASS  → wall "explosion" (walls fly outward from the axis) + speed punch
 *  - MID   → pyramid teeth bite inward, segment roll rate
 *  - HIGH  → corner rail glow + particle twinkle
 *  - speed → the audio IS the throttle (near-still in silence)
 *  - echo  → glowing rings replay the phrase memory down the tunnel
 *  - gather→ pre-beat inward squeeze (the tunnel inhales)
 *  - drop  → warp surge: speed spike + white flash
 *  - kick  → radial wall punch (distinct from sustained bass explode)
 *  - snare → lateral X warp / shear
 *  - hat   → corner-rail sparkle ticks
 *  - holdBreath / deep silence → nearly freeze rush + ease wall punch
 *    so the tunnel listens, then resumes when the music returns
 *
 * Plus ~3k "existential particles" advected by the shared curl-noise flow
 * field while the conveyor sweeps them past the camera.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';
import { useModulation } from '../modulation';
import {
  DEFAULT_FLOW_PARAMS,
  flowParamsFromMetrics,
  sampleFlow,
  type FlowParams,
  type Vec3Like,
} from '../dsp/flowfield';

/**
 * Smooth toward a target with asymmetric rise/fall (seconds).
 * Keeps kit accents and holdBreath stillness fluid — no linear snaps.
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

// Tunnel dimensions (scene units; camera sits at z≈4 inside the mouth).
const HALF = 2.2; // half width/height of the square bore
const DEPTH = 3; // depth of one segment
const RESET_Z = 8; // recycle plane behind the camera

// ---------------------------------------------------------------------------
// Tunnel segment shader — one template geometry shared by every segment.
// Per-vertex attributes let one draw call carry walls + pyramids:
//   aWallDir : outward direction of the vertex's wall in segment-local xy
//   aApex    : 1 on pyramid apex vertices (they extend inward with uTeeth)
//   aKind    : 0 = wall quad, 1 = pyramid face
// ---------------------------------------------------------------------------

const tunnelVertex = /* glsl */ `
attribute vec2 aWallDir;
attribute float aApex;
attribute float aKind;

uniform float uExplode;
uniform float uTeeth;
uniform float uGather;
uniform float uKick;
uniform float uSnare;

varying float vKind;
varying float vViewZ;
varying vec2 vWallDir;
varying float vApex;
varying float vKick;

void main() {
  vec3 pos = position;
  // Bass explosion pushes walls outward; gather squeezes them inward
  // just before the beat lands (the inhale). Kick adds a sharper radial
  // punch on the same axis so drums answer without washing the bore.
  pos.xy += aWallDir * (uExplode - uGather * 0.35 + uKick * 0.28);
  // Mid teeth: pyramid apexes extend further into the bore.
  pos.xy -= aWallDir * aApex * uTeeth;
  // Snare: lateral X shear — floor/ceiling slide, side walls skew with depth.
  // Distinct axis from the kick's radial wall punch.
  float depthWave = sin(pos.z * 1.15);
  pos.x += uSnare * (aWallDir.y * 0.22 + aWallDir.x * depthWave * 0.12);

  vKind = aKind;
  vWallDir = aWallDir;
  vApex = aApex;
  vKick = uKick;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vViewZ = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const tunnelFragment = /* glsl */ `
uniform vec3 uWallColor;
uniform vec3 uPyrColor;
uniform vec3 uAccentColor;
uniform float uHigh;
uniform float uFlash;
uniform float uFar;
uniform float uSnare;

varying float vKind;
varying float vViewZ;
varying vec2 vWallDir;
varying float vApex;
varying float vKick;

void main() {
  vec3 col = mix(uWallColor, uPyrColor, vKind);

  // Side walls read darker than floor/ceiling — fake form shading.
  col *= 0.6 + 0.4 * abs(vWallDir.y);

  // High band makes the pyramid faces glint toward the accent color.
  col += uAccentColor * (uHigh * uHigh) * vKind * 0.5;

  // Kick wall punch: brief brightness on the walls (not a full-frame strobe).
  col += uWallColor * vKick * (1.0 - vKind) * 0.35;
  // Snare: thin lateral crack glint on pyramids toward accent.
  col += uAccentColor * uSnare * vKind * 0.4;

  // Drop warp: white flash, strongest deep in the tunnel so it reads as a
  // shockwave arriving from the far end.
  float depthBias = smoothstep(4.0, 24.0, vViewZ);
  col += vec3(1.0) * uFlash * (0.12 + depthBias * 0.5);

  // Depth fog into black — the infinite throat.
  float fog = 1.0 - smoothstep(10.0, uFar, vViewZ);
  // Near fade: walls dim as they sweep past the camera so the closest
  // segment doesn't dominate the frame as a flat bright slab.
  float nearFade = smoothstep(0.4, 5.0, vViewZ);
  col *= fog * (0.25 + 0.75 * nearFade);

  gl_FragColor = vec4(col, 1.0);
}
`;

// ---------------------------------------------------------------------------
// Existential particles — soft sprites riding the shared flow field while
// the conveyor sweeps them down the bore.
// ---------------------------------------------------------------------------

const particleVertex = /* glsl */ `
attribute float aBand;
attribute float aPhase;

uniform float uTime;
uniform float uHigh;
uniform float uBeat;
uniform float uHat;
uniform vec3 uColorBass;
uniform vec3 uColorMid;
uniform vec3 uColorHigh;

varying vec3 vColor;
varying float vAlpha;

void main() {
  vec3 col = aBand < 0.5 ? uColorBass : (aBand < 1.5 ? uColorMid : uColorHigh);
  float twinkle = sin(uTime * (2.0 + aPhase * 6.0) + aPhase * 43.0) * 0.5 + 0.5;
  twinkle *= 0.3 + uHigh * 0.7;
  // Hat ticks: sparse high-band particles glitter without washing the bore.
  float hatSelect = step(0.62, fract(aPhase * 47.13));
  float hatTick = hatSelect * uHat * (0.7 + fract(aPhase * 13.7) * 0.5);
  vColor = col * (0.8 + twinkle * 0.6) + mix(col, uColorHigh, 0.7) * hatTick * 0.85;
  vAlpha = 0.35 + twinkle * 0.4 + hatTick * 0.35;

  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float pz = max(0.9, -mv.z);
  gl_PointSize = min((2.2 + uBeat * 2.0 + aPhase * 1.6 + hatTick * 1.4) * (16.0 / pz), 22.0);
  gl_Position = projectionMatrix * mv;
}
`;

const particleFragment = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;
  float soft = smoothstep(0.5, 0.0, d);
  // Extra-hot core so they read as little souls, not dust.
  float core = smoothstep(0.18, 0.0, d) * 0.6;
  gl_FragColor = vec4(vColor * (soft + core), vAlpha * soft);
}
`;

/** Build the shared segment template: 4 walls + 4 inward pyramids. */
function buildSegmentGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const wallDirs: number[] = [];
  const apexes: number[] = [];
  const kinds: number[] = [];

  // Outward direction + perpendicular for each wall.
  const walls: Array<{ d: [number, number]; p: [number, number] }> = [
    { d: [0, 1], p: [1, 0] }, // top
    { d: [0, -1], p: [1, 0] }, // bottom
    { d: [-1, 0], p: [0, 1] }, // left
    { d: [1, 0], p: [0, 1] }, // right
  ];

  const push = (x: number, y: number, z: number, d: [number, number], apex: number, kind: number) => {
    positions.push(x, y, z);
    wallDirs.push(d[0], d[1]);
    apexes.push(apex);
    kinds.push(kind);
  };

  for (const { d, p } of walls) {
    // Wall plane corners: along d at distance HALF, spanning ±HALF on p,
    // z from 0 (front) to -DEPTH (back).
    const corner = (s: number, z: number): [number, number, number] => [
      d[0] * HALF + p[0] * s * HALF,
      d[1] * HALF + p[1] * s * HALF,
      z,
    ];
    const a = corner(-1, 0);
    const b = corner(1, 0);
    const c = corner(1, -DEPTH);
    const e = corner(-1, -DEPTH);

    // Wall quad (two triangles).
    push(...a, d, 0, 0);
    push(...b, d, 0, 0);
    push(...c, d, 0, 0);
    push(...a, d, 0, 0);
    push(...c, d, 0, 0);
    push(...e, d, 0, 0);

    // Pyramid: 4 faces from the wall edges to an apex at the wall center,
    // pulled into the bore (your original GeneratePyramids construction).
    const apex: [number, number, number] = [
      d[0] * (HALF - 0.55),
      d[1] * (HALF - 0.55),
      -DEPTH / 2,
    ];
    const faces: Array<[[number, number, number], [number, number, number]]> = [
      [a, b],
      [b, c],
      [c, e],
      [e, a],
    ];
    for (const [v1, v2] of faces) {
      push(...v1, d, 0, 1);
      push(...v2, d, 0, 1);
      push(...apex, d, 1, 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('aWallDir', new THREE.Float32BufferAttribute(wallDirs, 2));
  geo.setAttribute('aApex', new THREE.Float32BufferAttribute(apexes, 1));
  geo.setAttribute('aKind', new THREE.Float32BufferAttribute(kinds, 1));
  return geo;
}

/** Corner rails: 4 lines along the bore edges (the optionShowEdges homage). */
function buildRailGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const corners: Array<[number, number]> = [
    [-HALF, -HALF],
    [HALF, -HALF],
    [-HALF, HALF],
    [HALF, HALF],
  ];
  for (const [x, y] of corners) {
    positions.push(x, y, 0, x, y, -DEPTH);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geo;
}

/** Square echo ring outline, slightly inset from the walls. */
function buildRingGeometry(): THREE.BufferGeometry {
  const s = HALF - 0.18;
  const positions = new Float32Array([-s, -s, 0, s, -s, 0, s, s, 0, -s, s, 0]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geo;
}

const ECHO_POOL = 8;

export function InfiniteTunnelScene({
  analyser,
  palette,
  tier,
  speed = 1,
  turbulence = 1,
  density = 1,
  vortexAmount = 0.25,
}: VisualizerSceneProps) {
  const metricsRef = useMetricsRef();
  const mods = useModulation();
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));

  const segmentCount = tier === 'high' ? 26 : tier === 'mid' ? 18 : 12;
  const particleCount = tier === 'high' ? 3000 : tier === 'mid' ? 1500 : 600;
  const tunnelLength = segmentCount * DEPTH;

  // Shared flow state for the particle stream.
  const flowParamsRef = useRef<FlowParams>({ ...DEFAULT_FLOW_PARAMS });
  const flowTimeRef = useRef(0);
  const flowScratch = useRef<Vec3Like>({ x: 0, y: 0, z: 0 });

  // Smoothed effect drivers (avoid frame-to-frame jitter).
  const explodeRef = useRef(0);
  const teethRef = useRef(0);
  const flashRef = useRef(0);
  const prevEchoRef = useRef(0);
  const kickSmooth = useRef(0);
  const snareSmooth = useRef(0);
  const hatSmooth = useRef(0);
  // Hold-breath / deep-silence listen gate — freeze/thaw without pops.
  const stillnessSmooth = useRef(0);

  const kitAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;

  // ---- Tunnel materials (even/odd alternating two-tone) ----
  const evenMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: tunnelVertex,
        fragmentShader: tunnelFragment,
        side: THREE.DoubleSide,
        uniforms: {
          uExplode: { value: 0 },
          uTeeth: { value: 0 },
          uGather: { value: 0 },
          uKick: { value: 0 },
          uSnare: { value: 0 },
          uHigh: { value: 0 },
          uFlash: { value: 0 },
          uFar: { value: tunnelLength * 0.9 },
          uWallColor: { value: new THREE.Color(palette.bass) },
          uPyrColor: { value: new THREE.Color(palette.mid) },
          uAccentColor: { value: new THREE.Color(palette.high) },
        },
      }),
    // Palette and length are re-set every frame in useFrame.
    [],
  );
  const oddMaterial = useMemo(() => {
    const m = evenMaterial.clone();
    return m;
  }, [evenMaterial]);

  const railMaterial = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: new THREE.Color(palette.high),
        transparent: true,
        opacity: 0.25,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    // Color/opacity are re-set every frame in useFrame.
    [],
  );

  // ---- Build the tunnel: segment groups sharing one template geometry ----
  const tunnel = useMemo(() => {
    const segGeo = buildSegmentGeometry();
    const railGeo = buildRailGeometry();
    const root = new THREE.Group();
    const segments: THREE.Group[] = [];

    for (let i = 0; i < segmentCount; i++) {
      const g = new THREE.Group();
      const mesh = new THREE.Mesh(segGeo, i % 2 === 0 ? evenMaterial : oddMaterial);
      const rails = new THREE.LineSegments(railGeo, railMaterial);
      g.add(mesh);
      g.add(rails);
      // Front face of segment i starts at z = RESET_Z - (i+1) * DEPTH so the
      // newest segment is just behind the recycle plane.
      g.position.z = RESET_Z - (i + 1) * DEPTH;
      root.add(g);
      segments.push(g);
    }

    return { root, segments, segGeo, railGeo };
  }, [segmentCount, evenMaterial, oddMaterial, railMaterial]);

  // ---- Echo ring pool ----
  const echoRings = useMemo(() => {
    const geo = buildRingGeometry();
    const rings: Array<{ obj: THREE.LineLoop; mat: THREE.LineBasicMaterial; active: boolean; life: number }> = [];
    const root = new THREE.Group();
    for (let i = 0; i < ECHO_POOL; i++) {
      const mat = new THREE.LineBasicMaterial({
        color: new THREE.Color(palette.high),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const obj = new THREE.LineLoop(geo, mat);
      obj.visible = false;
      root.add(obj);
      rings.push({ obj, mat, active: false, life: 0 });
    }
    return { root, rings, geo };
    // Ring colors are re-set on spawn each time from the live palette.
  }, []);

  // ---- Particles ----
  const particles = useMemo(() => {
    const positions = new Float32Array(particleCount * 3);
    const bands = new Float32Array(particleCount);
    const phases = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() * 2 - 1) * (HALF - 0.3);
      positions[i * 3 + 1] = (Math.random() * 2 - 1) * (HALF - 0.3);
      positions[i * 3 + 2] = RESET_Z - Math.random() * tunnelLength;
      bands[i] = i % 3;
      phases[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aBand', new THREE.BufferAttribute(bands, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: particleVertex,
      fragmentShader: particleFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uHigh: { value: 0 },
        uBeat: { value: 0 },
        uHat: { value: 0 },
        uColorBass: { value: new THREE.Color(palette.bass) },
        uColorMid: { value: new THREE.Color(palette.mid) },
        uColorHigh: { value: new THREE.Color(palette.high) },
      },
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    return { points, geo, mat, positions };
    // Palette colors are re-set every frame in useFrame.
  }, [particleCount, tunnelLength]);

  // Dispose GPU resources on unmount / tier change.
  useEffect(() => {
    return () => {
      tunnel.segGeo.dispose();
      tunnel.railGeo.dispose();
      echoRings.geo.dispose();
      echoRings.rings.forEach((r) => r.mat.dispose());
      particles.geo.dispose();
      particles.mat.dispose();
      evenMaterial.dispose();
      oddMaterial.dispose();
      railMaterial.dispose();
    };
  }, [tunnel, echoRings, particles, evenMaterial, oddMaterial, railMaterial]);

  const colorScratch = useRef({
    bass: new THREE.Color(),
    mid: new THREE.Color(),
    high: new THREE.Color(),
    dim: new THREE.Color(),
  });

  useFrame((state, delta) => {
    const m = metricsRef.current;
    const dt = Math.min(delta, 0.05);
    const t = state.clock.elapsedTime;
    // Modulation-matrix values (fall back to slider props when unrouted).
    const mv = mods.current;
    const spd = mv.speed ?? speed;
    const turbulenceNow = mv.turbulence ?? turbulence;
    const densityNow = mv.density ?? density;
    const vortexNow = mv.vortexAmount ?? vortexAmount;

    // ---- Hold-breath stillness: the tunnel listens instead of hurtling ----
    // Rise a touch slower than fall so the freeze feels attentive; thaw
    // promptly when music returns so kit accents + echo rings still fire.
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
    // Nearly freeze forward rush; leave a whisper so the bore never dies.
    const rushMul = 1 - stillness * 0.94;
    // Ease sustained wall punch / kick punch while listening.
    const punchMul = 1 - stillness * 0.88;

    // ---- The throttle: audio drives the conveyor (the original's soul) ----
    const silenceDamp = 1 - m.silence * 0.88;
    const tunnelSpeed =
      ((0.55 + m.energy * 4.2 + m.impact * 2.6 + m.dropEvent * 7.0) * silenceDamp * rushMul +
        0.12 * (1 - stillness * 0.9)) *
      spd;

    // ---- Kit accents: kick wall punch / snare lateral / hat rail sparkle ----
    // punchMul softens kick during listen; targets stay zero in quiet so
    // thaw + kit rise still read as distinct accents when drums return.
    kickSmooth.current = smoothToward(
      kickSmooth.current,
      Math.min(1.2, m.kick) * kitAmp * punchMul,
      dt,
      0.028,
      0.14,
    );
    snareSmooth.current = smoothToward(
      snareSmooth.current,
      Math.min(1.2, m.snare) * kitAmp,
      dt,
      0.032,
      0.16,
    );
    hatSmooth.current = smoothToward(
      hatSmooth.current,
      Math.min(1.2, m.hat) * kitAmp,
      dt,
      0.022,
      0.09,
    );

    // ---- Segment conveyor + counter-roll ----
    const rollRate = (0.03 + m.mid * 0.5 + tunnelSpeed * 0.012) * dt * (1 - stillness * 0.7);
    for (let i = 0; i < tunnel.segments.length; i++) {
      const seg = tunnel.segments[i]!;
      seg.position.z += tunnelSpeed * dt;
      if (seg.position.z > RESET_Z) {
        // Teleport behind the whole train — spacing stays exact.
        seg.position.z -= tunnelLength;
      }
      // Alternating segments counter-rotate (optionRotate homage).
      seg.rotation.z += i % 2 === 0 ? rollRate : -rollRate;
      // Snare: brief lateral offset (absolute, not accumulating) so the bore
      // cracks sideways without tumbling the ride over time.
      seg.position.x = (i % 2 === 0 ? 1 : -1) * snareSmooth.current * 0.07;
    }

    // ---- Band-driven uniforms ----
    // Transient-driven so the bore stays intact between hits — sustained
    // bass only swells it slightly; beats and drops blow it open.
    // punchMul eases the bore open during holdBreath so walls listen too.
    const explodeTarget =
      Math.min(1.3, m.bass * 0.18 + m.impact * 0.55 + m.dropEvent * 0.9) * punchMul;
    explodeRef.current += (explodeTarget - explodeRef.current) * Math.min(1, dt * 10);
    // Teeth bite hardest when the drum section is actually playing — the
    // heuristic drum-activity signal, not just any mid-band energy.
    const teethTarget = Math.min(1.4, m.mid * 0.9 + m.impact * 0.4 + m.drumActivity * 0.3);
    teethRef.current += (teethTarget - teethRef.current) * Math.min(1, dt * 8);
    flashRef.current = Math.max(0, flashRef.current - dt * 1.6);
    if (m.dropEvent > 0.6) flashRef.current = Math.min(1, m.dropEvent);

    const cs = colorScratch.current;
    cs.bass.set(palette.bass);
    cs.mid.set(palette.mid);
    cs.high.set(palette.high);

    const eu = evenMaterial.uniforms;
    const ou = oddMaterial.uniforms;
    for (const u of [eu, ou]) {
      u.uExplode!.value = explodeRef.current;
      u.uTeeth!.value = teethRef.current;
      u.uGather!.value = m.gather * 0.5;
      u.uKick!.value = kickSmooth.current;
      u.uSnare!.value = snareSmooth.current;
      u.uHigh!.value = m.high;
      u.uFlash!.value = flashRef.current;
      u.uFar!.value = tunnelLength * 0.9;
      (u.uAccentColor!.value as THREE.Color).copy(cs.high);
    }
    // Even segments: dim wall in the bass color (brightness breathes with
    // the bass), pyramids in mid.
    const wallPulse = 0.16 + m.bass * 0.14;
    (eu.uWallColor!.value as THREE.Color).copy(cs.bass).multiplyScalar(wallPulse);
    (eu.uPyrColor!.value as THREE.Color).copy(cs.mid).multiplyScalar(0.45);
    // Odd segments: near-black walls (your hsl(278,5%,5%)), bass-tinted pyramids.
    (ou.uWallColor!.value as THREE.Color).copy(cs.bass).multiplyScalar(0.045);
    (ou.uPyrColor!.value as THREE.Color).copy(cs.bass).multiplyScalar(0.2);

    // High band lights the corner rails; hats glitter them with sharp ticks
    // distinct from the slower shimmer wash and from bass wall explode.
    railMaterial.color.copy(cs.high);
    railMaterial.opacity = Math.min(
      1,
      0.1 + m.high * 0.55 + m.shimmer * 0.25 + hatSmooth.current * 0.7,
    );

    // ---- Echo rings: phrase memory rushing back up the tunnel ----
    if (m.echo > 0.45 && prevEchoRef.current <= 0.45) {
      const ring = echoRings.rings.find((r) => !r.active);
      if (ring) {
        ring.active = true;
        ring.life = 0;
        ring.obj.visible = true;
        ring.obj.position.z = RESET_Z - tunnelLength + 2;
        ring.mat.color.copy(cs.high);
      }
    }
    prevEchoRef.current = m.echo;
    for (const ring of echoRings.rings) {
      if (!ring.active) continue;
      ring.life += dt;
      ring.obj.position.z += (tunnelSpeed * 2.2 + 10) * dt;
      const fadeIn = Math.min(1, ring.life * 3);
      ring.mat.opacity = fadeIn * 0.8;
      if (ring.obj.position.z > RESET_Z - 1) {
        ring.active = false;
        ring.obj.visible = false;
        ring.mat.opacity = 0;
      }
    }

    // ---- Existential particles: flow advection + conveyor sweep ----
    flowTimeRef.current += dt * (0.4 + Math.min(m.energy, 1.5) * 0.4);
    const fp = flowParamsFromMetrics(m, flowParamsRef.current);
    fp.time = flowTimeRef.current;
    fp.turbulence *= turbulenceNow;
    const drift = dt * (0.35 + m.energy * 0.65 + m.dropEvent * 1.2);
    const swirl = vortexNow * dt * (0.6 + m.mid * 1.2);
    const sweep = tunnelSpeed * dt * 0.85;
    const fv = flowScratch.current;
    const arr = particles.positions;
    const visible = Math.max(
      1,
      Math.floor(particleCount * Math.min(1, Math.max(0.05, densityNow))),
    );
    for (let i = 0; i < visible; i++) {
      const i3 = i * 3;
      let x = arr[i3]!;
      let y = arr[i3 + 1]!;
      let z = arr[i3 + 2]!;

      sampleFlow(fv, x, y, z, i % 3, fp);
      x += fv.x * drift;
      y += fv.y * drift;
      z += fv.z * drift * 0.5 + sweep;

      // z-axis swirl (the tunnel's own vortex — y-axis tornado math doesn't
      // fit a bore, so the swirl lives here on the CPU).
      const r = Math.hypot(x, y) + 1e-4;
      x += (-y / r) * swirl;
      y += (x / r) * swirl;

      // Soft containment inside the bore.
      const lim = HALF - 0.18;
      if (x > lim) x = lim - (x - lim) * 0.5;
      else if (x < -lim) x = -lim - (x + lim) * 0.5;
      if (y > lim) y = lim - (y - lim) * 0.5;
      else if (y < -lim) y = -lim - (y + lim) * 0.5;

      // Past the camera → respawn at the far end.
      if (z > 5.5) {
        z -= tunnelLength * 0.95;
        x = (Math.random() * 2 - 1) * (HALF - 0.4);
        y = (Math.random() * 2 - 1) * (HALF - 0.4);
      }

      arr[i3] = x;
      arr[i3 + 1] = y;
      arr[i3 + 2] = z;
    }
    particles.geo.setDrawRange(0, visible);
    (particles.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;

    const pu = particles.mat.uniforms;
    pu.uTime!.value = t;
    pu.uHigh!.value = m.high;
    pu.uBeat!.value = m.impact;
    pu.uHat!.value = hatSmooth.current;
    (pu.uColorBass!.value as THREE.Color).copy(cs.bass);
    (pu.uColorMid!.value as THREE.Color).copy(cs.mid);
    (pu.uColorHigh!.value as THREE.Color).copy(cs.high);

    if (analyser) analyser.getFrequencyData(freqBuf.current);
  });

  return (
    <>
      <primitive object={tunnel.root} />
      <primitive object={echoRings.root} />
      <primitive object={particles.points} />
    </>
  );
}

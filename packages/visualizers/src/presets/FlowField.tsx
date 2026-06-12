'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';
import { FLOW_GLSL } from '../dsp/flowGlsl';
import {
  DEFAULT_FLOW_PARAMS,
  flowParamsFromMetrics,
  type FlowParams,
} from '../dsp/flowfield';

/**
 * Flow Field — the flagship of the Flow Field Update.
 *
 * A GPGPU particle sim advected through divergence-free curl noise: local
 * chaos that rivers together into collective motion. Three band-assigned
 * fields (bass/mid/high particles ride different currents) that BLEND INTO
 * ONE as the music's bands converge — drops and choruses visibly unify the
 * swarm, breakdowns fracture it.
 *
 * Call and response: pre-beat `gather` pulls particles inward (the inhale),
 * the hit releases them; in gaps after a phrase, `echo` replays the recorded
 * rhythm as radial ripples — the visual answering the music.
 *
 * Homages to the original FlowField Saga (2019-2021):
 *  - wandering magnet wells that capture and fling particles (Magnet build)
 *  - pointer stirring — the cursor directs the field (mouse lookAt build)
 */

// Simulation texture sides per tier. Particle count = side².
const TEX_SIDE_HIGH = 512; // 262,144 particles
const TEX_SIDE_MID = 256; // 65,536
const TEX_SIDE_LOW = 128; // 16,384

// Sized to the default camera framing (z≈4, fov 50) like the other presets —
// the swarm must live in front of the camera, not around it.
const BOUNDS_RADIUS = 2.6;

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------

const simVertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const simFragmentShader = /* glsl */ `
${FLOW_GLSL}

uniform sampler2D uPositions;
uniform float uTexSize;
uniform float uDelta;
uniform float uTime;
uniform float uSeed;
uniform float uFieldScale;
uniform float uTurbulence;
uniform float uSwirl;
uniform float uBandSpread;
uniform float uVortex;
uniform float uBuoyancy;
uniform float uBeat;
uniform float uGather;
uniform float uEcho;
uniform float uRelease;
uniform float uDrop;
uniform vec4 uWellA;   // xyz center, w strength
uniform vec4 uWellB;
uniform vec4 uPointer; // xyz world point, w strength

varying vec2 vUv;

void main() {
  vec4 data = texture2D(uPositions, vUv);
  vec3 p = data.xyz;
  float pSeed = data.w;

  float idx = floor(vUv.x * uTexSize) + floor(vUv.y * uTexSize) * uTexSize;
  float band = mod(idx, 3.0);

  // The current: per-band curl field, blending into one as bandSpread -> 0.
  vec3 v = ffFlow(p, band, uTime, uFieldScale, uTurbulence, uSwirl, uBandSpread, uSeed);

  // Tornado, magnets, and the user's hand.
  v += ffVortex(p, uVortex);
  v += ffWell(p, uWellA.xyz, uWellA.w, 0.9);
  v += ffWell(p, uWellB.xyz, uWellB.w, 0.9);
  v += ffWell(p, uPointer.xyz, uPointer.w, 1.1);

  vec3 dir = p / (length(p) + 1e-4);

  // Call and response: gather inhales toward center pre-beat, the hit and
  // the drop release outward; echo replays the phrase as radial ripples.
  v -= p * (uGather * 1.1);
  v += dir * (uBeat * 0.5 + uRelease * 0.35 + uDrop * 1.4);
  float wave = sin(length(p) * 5.0 - uTime * 7.0);
  v += dir * wave * uEcho * 1.6;

  // Mood buoyancy (warm rises, cold sinks).
  v.y += uBuoyancy;

  // Per-particle speed character so the swarm has individuals in it.
  float character = 0.65 + pSeed * 0.7;
  p += v * uDelta * character;

  // Soft containment, then hard respawn at the shell if truly escaped.
  float r = length(p);
  p -= dir * smoothstep(${(BOUNDS_RADIUS * 0.75).toFixed(2)}, ${(BOUNDS_RADIUS * 1.15).toFixed(2)}, r) * uDelta * 2.2;

  float h = ffHash(vec3(vUv * 913.37, fract(uTime) * 100.0), uSeed);
  if (r > ${(BOUNDS_RADIUS * 1.25).toFixed(2)} || h > 0.99935) {
    float h1 = ffHash(vec3(vUv * 117.3, 1.7 + fract(uTime)), uSeed);
    float h2 = ffHash(vec3(vUv * 311.9, 5.1 + fract(uTime)), uSeed);
    float h3 = ffHash(vec3(vUv * 73.7, 9.3 + fract(uTime)), uSeed);
    vec3 rnd = normalize(vec3(h1, h2, h3) * 2.0 - 1.0 + vec3(1e-4));
    p = rnd * (0.4 + h1 * ${(BOUNDS_RADIUS * 0.8).toFixed(2)});
  }

  gl_FragColor = vec4(p, pSeed);
}
`;

// Trails: 2 chained segments per particle (head→mid, mid→tail), the tail
// positions re-derived from the same flow function so trails bend WITH the
// current instead of being straight streaks.
const trailVertexShader = /* glsl */ `
${FLOW_GLSL}

uniform sampler2D uPositions;
uniform float uTexSize;
uniform float uTime;
uniform float uSeed;
uniform float uFieldScale;
uniform float uTurbulence;
uniform float uSwirl;
uniform float uBandSpread;
uniform float uTrailLen;
uniform float uDensity;
uniform vec3 uColorBass;
uniform vec3 uColorMid;
uniform vec3 uColorHigh;

attribute vec2 aUv;
attribute float aOffset; // 0 = head, 1 = mid, 2 = tail

varying vec3 vColor;
varying float vFade;

void main() {
  vec4 data = texture2D(uPositions, aUv);
  vec3 p = data.xyz;
  float pSeed = data.w;

  float idx = floor(aUv.x * uTexSize) + floor(aUv.y * uTexSize) * uTexSize;
  float band = mod(idx, 3.0);

  // Walk backward along the field for trail joints.
  float step1 = uTrailLen * (0.6 + pSeed * 0.5);
  if (aOffset > 0.5) {
    vec3 v1 = ffFlow(p, band, uTime, uFieldScale, uTurbulence, uSwirl, uBandSpread, uSeed);
    p -= normalize(v1 + vec3(1e-5)) * step1;
    if (aOffset > 1.5) {
      vec3 v2 = ffFlow(p, band, uTime, uFieldScale, uTurbulence, uSwirl, uBandSpread, uSeed);
      p -= normalize(v2 + vec3(1e-5)) * step1 * 1.4;
    }
  }

  vec3 bandColor = band < 0.5 ? uColorBass : (band < 1.5 ? uColorMid : uColorHigh);
  vColor = mix(bandColor, uColorBass, aOffset * 0.32);
  vFade = 1.0 - aOffset * 0.42;

  // Density culling: kill the whole trail by collapsing it to a point
  // behind the camera.
  if (pSeed > uDensity) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    vFade = 0.0;
    return;
  }

  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const trailFragmentShader = /* glsl */ `
uniform float uOpacity;
varying vec3 vColor;
varying float vFade;

void main() {
  gl_FragColor = vec4(vColor * vFade * uOpacity, 1.0);
}
`;

// Bright particle heads.
const headVertexShader = /* glsl */ `
uniform sampler2D uPositions;
uniform float uTexSize;
uniform float uDensity;
uniform float uHeadSize;
uniform vec3 uColorBass;
uniform vec3 uColorMid;
uniform vec3 uColorHigh;
uniform float uHigh;

attribute vec2 aUv;

varying vec3 vColor;

void main() {
  vec4 data = texture2D(uPositions, aUv);
  vec3 p = data.xyz;
  float pSeed = data.w;

  float idx = floor(aUv.x * uTexSize) + floor(aUv.y * uTexSize) * uTexSize;
  float band = mod(idx, 3.0);
  vec3 bandColor = band < 0.5 ? uColorBass : (band < 1.5 ? uColorMid : uColorHigh);
  // Highs make the high-band heads sparkle hotter.
  float boost = band > 1.5 ? 1.0 + uHigh * 0.9 : 1.0;
  vColor = bandColor * boost;

  if (pSeed > uDensity) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uHeadSize * (0.7 + pSeed * 0.6) / max(1.0, -mv.z * 0.25);
}
`;

const headFragmentShader = /* glsl */ `
uniform float uOpacity;
varying vec3 vColor;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c);
  if (d > 0.25) discard;
  float glow = 1.0 - smoothstep(0.0, 0.25, d);
  gl_FragColor = vec4(vColor * glow * uOpacity, 1.0);
}
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deterministic PRNG so exports reproduce the same swarm. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeTarget(side: number, type: THREE.TextureDataType): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(side, side, {
    type,
    format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: false,
    stencilBuffer: false,
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FlowFieldScene({
  analyser,
  palette,
  tier,
  turbulence = 1,
  trailLength = 1,
  density = 1,
  vortexAmount = 0.25,
  interactStrength = 1,
}: VisualizerSceneProps) {
  const metricsRef = useMetricsRef();
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const { gl, camera } = useThree();

  const texSide = tier === 'high' ? TEX_SIDE_HIGH : tier === 'mid' ? TEX_SIDE_MID : TEX_SIDE_LOW;
  const count = texSide * texSide;

  // Monotonic field-evolution time and seed (rotates on drops).
  const timeRef = useRef(0);
  const seedRef = useRef(0);
  const prevDropRef = useRef(0);

  // Magnet wells: positions hop on bar boundaries, eased between.
  const wellsRef = useRef({
    a: new THREE.Vector3(1.2, 0.5, 0),
    b: new THREE.Vector3(-1.2, -0.5, 0.3),
    aTarget: new THREE.Vector3(1.2, 0.5, 0),
    bTarget: new THREE.Vector3(-1.2, -0.5, 0.3),
    prevBarPhase: 0,
    rng: mulberry32(0xf10f1e1d),
  });

  // Pointer stirring (live only — pointer events never fire offscreen).
  // `movement` is a decaying energy fed by actual cursor motion: a stationary
  // cursor must NOT become a permanent attractor that swallows the swarm.
  const pointerRef = useRef({
    world: new THREE.Vector3(0, 0, 0),
    prevWorld: new THREE.Vector3(0, 0, 0),
    movement: 0,
    strength: 0,
    plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
    raycaster: new THREE.Raycaster(),
    ndc: new THREE.Vector2(),
  });

  // CPU flow params — smoothed twin of the GPU field uniforms.
  const cpuParamsRef = useRef<FlowParams>({ ...DEFAULT_FLOW_PARAMS });

  // ---- GPGPU resources ----
  const gpu = useMemo(() => {
    const floatOk = gl.capabilities.isWebGL2 && gl.extensions.has('EXT_color_buffer_float');
    const texType = floatOk ? THREE.FloatType : THREE.HalfFloatType;

    const targetA = makeTarget(texSide, texType);
    const targetB = makeTarget(texSide, texType);

    // Seeded initial positions in a thick shell + personal seeds in w.
    const rng = mulberry32(0x70f05fed);
    const init = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const u = rng() * 2 - 1;
      const theta = rng() * Math.PI * 2;
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      const radius = 0.4 + rng() * BOUNDS_RADIUS * 0.8;
      init[i * 4] = s * Math.cos(theta) * radius;
      init[i * 4 + 1] = u * radius * 0.85;
      init[i * 4 + 2] = s * Math.sin(theta) * radius;
      init[i * 4 + 3] = rng();
    }
    const initTexture = new THREE.DataTexture(init, texSide, texSide, THREE.RGBAFormat, THREE.FloatType);
    initTexture.needsUpdate = true;

    const simMaterial = new THREE.ShaderMaterial({
      vertexShader: simVertexShader,
      fragmentShader: simFragmentShader,
      uniforms: {
        uPositions: { value: initTexture },
        uTexSize: { value: texSide },
        uDelta: { value: 0 },
        uTime: { value: 0 },
        uSeed: { value: 0 },
        uFieldScale: { value: 0.55 },
        uTurbulence: { value: 0.5 },
        uSwirl: { value: 1 },
        uBandSpread: { value: 0.9 },
        uVortex: { value: 0 },
        uBuoyancy: { value: 0 },
        uBeat: { value: 0 },
        uGather: { value: 0 },
        uEcho: { value: 0 },
        uRelease: { value: 0 },
        uDrop: { value: 0 },
        uWellA: { value: new THREE.Vector4(1.2, 0.5, 0, 0) },
        uWellB: { value: new THREE.Vector4(-1.2, -0.5, 0.3, 0) },
        uPointer: { value: new THREE.Vector4(0, 0, 0, 0) },
      },
      depthTest: false,
      depthWrite: false,
    });

    const simScene = new THREE.Scene();
    const simCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const simGeo = new THREE.BufferGeometry();
    simGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
    );
    simGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
    const simMesh = new THREE.Mesh(simGeo, simMaterial);
    simMesh.frustumCulled = false;
    simScene.add(simMesh);

    return { targetA, targetB, simMaterial, simScene, simCamera, simGeo, initTexture, swapped: false };
  }, [gl, texSide, count]);

  // ---- Render geometries: trails (4 verts / particle) + heads ----
  const trailGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const uvs = new Float32Array(count * 4 * 2);
    const offsets = new Float32Array(count * 4);
    const positions = new Float32Array(count * 4 * 3); // dummy, real pos from texture
    for (let i = 0; i < count; i++) {
      const u = ((i % texSide) + 0.5) / texSide;
      const v = (Math.floor(i / texSide) + 0.5) / texSide;
      for (let j = 0; j < 4; j++) {
        uvs[(i * 4 + j) * 2] = u;
        uvs[(i * 4 + j) * 2 + 1] = v;
      }
      // LineSegments pairs: (head, mid), (mid, tail)
      offsets[i * 4] = 0;
      offsets[i * 4 + 1] = 1;
      offsets[i * 4 + 2] = 1;
      offsets[i * 4 + 3] = 2;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aUv', new THREE.BufferAttribute(uvs, 2));
    geo.setAttribute('aOffset', new THREE.BufferAttribute(offsets, 1));
    return geo;
  }, [count, texSide]);

  const headGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const uvs = new Float32Array(count * 2);
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      uvs[i * 2] = ((i % texSide) + 0.5) / texSide;
      uvs[i * 2 + 1] = (Math.floor(i / texSide) + 0.5) / texSide;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aUv', new THREE.BufferAttribute(uvs, 2));
    return geo;
  }, [count, texSide]);

  const sharedRenderUniforms = useMemo(
    () => ({
      uPositions: { value: gpu.initTexture as THREE.Texture },
      uTexSize: { value: texSide },
      uTime: { value: 0 },
      uSeed: { value: 0 },
      uFieldScale: { value: 0.55 },
      uTurbulence: { value: 0.5 },
      uSwirl: { value: 1 },
      uBandSpread: { value: 0.9 },
      uTrailLen: { value: 0.16 },
      uDensity: { value: 1 },
      uOpacity: { value: 0.55 },
      uColorBass: { value: new THREE.Color(palette.bass) },
      uColorMid: { value: new THREE.Color(palette.mid) },
      uColorHigh: { value: new THREE.Color(palette.high) },
    }),
    // Palette intentionally omitted: colors are re-set every frame.
    [gpu, texSide],
  );

  const trailMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: trailVertexShader,
        fragmentShader: trailFragmentShader,
        uniforms: sharedRenderUniforms,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    [sharedRenderUniforms],
  );

  const headUniforms = useMemo(
    () => ({
      uPositions: { value: gpu.initTexture as THREE.Texture },
      uTexSize: { value: texSide },
      uDensity: { value: 1 },
      uHeadSize: { value: tier === 'low' ? 9 : 6 },
      uOpacity: { value: 0.85 },
      uHigh: { value: 0 },
      uColorBass: { value: new THREE.Color(palette.bass) },
      uColorMid: { value: new THREE.Color(palette.mid) },
      uColorHigh: { value: new THREE.Color(palette.high) },
    }),
    // Palette intentionally omitted: colors are re-set every frame.
    [gpu, texSide, tier],
  );

  const headMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: headVertexShader,
        fragmentShader: headFragmentShader,
        uniforms: headUniforms,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    [headUniforms],
  );

  const trailRef = useRef<THREE.LineSegments>(null);
  const headRef = useRef<THREE.Points>(null);

  // ---- Pointer stirring listeners ----
  useEffect(() => {
    const el = gl.domElement;
    const ptr = pointerRef.current;
    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      ptr.ndc.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      ptr.raycaster.setFromCamera(ptr.ndc, camera);
      const hit = new THREE.Vector3();
      if (ptr.raycaster.ray.intersectPlane(ptr.plane, hit)) {
        ptr.movement = Math.min(1.5, ptr.movement + ptr.world.distanceTo(hit) * 0.8);
        ptr.prevWorld.copy(ptr.world);
        ptr.world.copy(hit);
      }
    };
    const onLeave = () => {
      ptr.movement = 0;
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [gl, camera]);

  // ---- Resource cleanup ----
  useEffect(() => {
    return () => {
      gpu.targetA.dispose();
      gpu.targetB.dispose();
      gpu.simMaterial.dispose();
      gpu.simGeo.dispose();
      gpu.initTexture.dispose();
      trailGeometry.dispose();
      headGeometry.dispose();
      trailMaterial.dispose();
      headMaterial.dispose();
    };
  }, [gpu, trailGeometry, headGeometry, trailMaterial, headMaterial]);

  // ---- Frame loop ----
  useFrame((_state, delta) => {
    const m = metricsRef.current;
    const dt = Math.min(delta, 0.05);

    // Field-evolution time: monotonic, music-paced.
    timeRef.current += dt * (0.5 + Math.min(m.energy, 1.5) * 0.45 + m.beat * 0.3);

    // Drop → the field reorganizes into a new pattern.
    if (m.dropEvent > 0.9 && prevDropRef.current <= 0.9) {
      seedRef.current = (seedRef.current + 17.23) % 1000;
    }
    prevDropRef.current = m.dropEvent;

    // Audio → flow params (CPU twin drives GPU field uniforms).
    const fp = flowParamsFromMetrics(m, cpuParamsRef.current, {
      turbulence,
      vortex: vortexAmount,
    });
    fp.time = timeRef.current;
    fp.seed = seedRef.current;

    // Magnet wells hop on bar boundaries (when the grid is known).
    const wells = wellsRef.current;
    if (m.barPhase < wells.prevBarPhase - 0.5) {
      const r = wells.rng;
      wells.aTarget.set((r() - 0.5) * 3.6, (r() - 0.5) * 2.4, (r() - 0.5) * 1.6);
      wells.bTarget.set((r() - 0.5) * 3.6, (r() - 0.5) * 2.4, (r() - 0.5) * 1.6);
    }
    wells.prevBarPhase = m.barPhase;
    const ease = Math.min(1, dt * 2.2);
    wells.a.lerp(wells.aTarget, ease);
    wells.b.lerp(wells.bTarget, ease);
    // Capture strength rides the groove; drops fling (negative = repulse).
    // Kept gentle — wells should bend the current, not swallow the swarm.
    const wellStrength =
      (0.06 + m.bassActivity * 0.18 + m.beat * 0.2) * (m.dropEvent > 0.5 ? -2.2 : 1);

    // Pointer strength follows stirring MOTION — eases in while the cursor
    // moves, decays within ~0.6s of stillness so a parked cursor lets go.
    const ptr = pointerRef.current;
    ptr.movement = Math.max(0, ptr.movement - dt * 1.8);
    const ptrTarget = Math.min(1, ptr.movement) * 0.8 * interactStrength;
    ptr.strength += (ptrTarget - ptr.strength) * Math.min(1, dt * 8);

    // ---- Sim pass (ping-pong) ----
    const su = gpu.simMaterial.uniforms;
    const readTarget = gpu.swapped ? gpu.targetB : gpu.targetA;
    const writeTarget = gpu.swapped ? gpu.targetA : gpu.targetB;
    const firstFrame = su.uDelta!.value === 0 && timeRef.current < 0.2;
    su.uPositions!.value = firstFrame ? gpu.initTexture : readTarget.texture;
    su.uDelta!.value = dt;
    su.uTime!.value = timeRef.current;
    su.uSeed!.value = seedRef.current;
    su.uFieldScale!.value = fp.fieldScale;
    su.uTurbulence!.value = fp.turbulence;
    su.uSwirl!.value = fp.swirl;
    su.uBandSpread!.value = fp.bandSpread;
    su.uVortex!.value = fp.vortex;
    su.uBuoyancy!.value = fp.buoyancy;
    su.uBeat!.value = m.beat;
    su.uGather!.value = m.gather;
    su.uEcho!.value = m.echo;
    su.uRelease!.value = m.release;
    su.uDrop!.value = m.dropEvent;
    (su.uWellA!.value as THREE.Vector4).set(wells.a.x, wells.a.y, wells.a.z, wellStrength);
    (su.uWellB!.value as THREE.Vector4).set(wells.b.x, wells.b.y, wells.b.z, wellStrength * 0.8);
    (su.uPointer!.value as THREE.Vector4).set(ptr.world.x, ptr.world.y, ptr.world.z, ptr.strength);

    const prevTarget = gl.getRenderTarget();
    gl.setRenderTarget(writeTarget);
    gl.render(gpu.simScene, gpu.simCamera);
    gl.setRenderTarget(prevTarget);
    gpu.swapped = !gpu.swapped;

    // ---- Render uniforms ----
    const ru = sharedRenderUniforms;
    ru.uPositions.value = writeTarget.texture;
    ru.uTime.value = timeRef.current;
    ru.uSeed.value = seedRef.current;
    ru.uFieldScale.value = fp.fieldScale;
    ru.uTurbulence.value = fp.turbulence;
    ru.uSwirl.value = fp.swirl;
    ru.uBandSpread.value = fp.bandSpread;
    ru.uTrailLen.value = 0.04 + trailLength * 0.07 * (1 + m.energy * 0.5);
    ru.uDensity.value = Math.max(0.02, Math.min(1, density));
    // Additive overdraw normalization: a quarter-million translucent lines
    // saturate to white unless per-line alpha shrinks with the swarm size.
    const alphaNorm = Math.min(1, Math.max(0.15, 70000 / count));
    ru.uOpacity.value = (0.3 + m.flow * 0.22) * (1 - m.silence * 0.55) * alphaNorm;
    (ru.uColorBass.value as THREE.Color).set(palette.bass);
    (ru.uColorMid.value as THREE.Color).set(palette.mid);
    (ru.uColorHigh.value as THREE.Color).set(palette.high);

    const hu = headUniforms;
    hu.uPositions.value = writeTarget.texture;
    hu.uDensity.value = Math.max(0.02, Math.min(1, density));
    hu.uOpacity.value =
      (0.45 + m.energy * 0.3) * (1 - m.silence * 0.5) * Math.min(1, Math.max(0.15, 60000 / count));
    hu.uHigh.value = m.high;
    (hu.uColorBass.value as THREE.Color).set(palette.bass);
    (hu.uColorMid.value as THREE.Color).set(palette.mid);
    (hu.uColorHigh.value as THREE.Color).set(palette.high);

    if (analyser) analyser.getFrequencyData(freqBuf.current);
  });

  return (
    <group>
      <lineSegments ref={trailRef} geometry={trailGeometry} material={trailMaterial} frustumCulled={false} />
      <points ref={headRef} geometry={headGeometry} material={headMaterial} frustumCulled={false} />
    </group>
  );
}

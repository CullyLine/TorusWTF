'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';
import { useModulation } from '../modulation';

/**
 * Mandelbulb — a true 3D fractal, raymarched inside a bounding-sphere mesh.
 *
 * Unlike a fullscreen-quad raymarcher, the march happens inside a REAL
 * sphere proxy sitting at the origin: the rasterizer only shades pixels the
 * bulb could occupy, and the shader writes a correct per-fragment depth
 * (gl_FragDepth) from the ray hit point. That makes the bulb a first-class
 * 3D citizen — SceneRig aura particles drift in front of and behind it,
 * background skies wrap around it, and every rig camera mode (orbit /
 * cinematic / flow) parallaxes it like any other mesh.
 *
 * Musical anatomy:
 *  - `swell` grows the fractal power (6 → ~9.5): choruses literally grow
 *    more ornate geometry, verses relax back to smoother lobes
 *  - drops kick the power an extra step — a visible "the world just
 *    changed shape" morph
 *  - `snare` shears the fractal domain laterally (X←Y) — a brief sideways
 *    crack distinct from any radial kick/impact dive
 *  - `echo` fires a one-shot ghost orbit reverse in phrase gaps, then
 *    tumble resumes forward
 *  - orbit-trap coloring rides the living palette; mids scroll the ramp
 *  - `impact` flashes the surface glow, `shimmer` lights the rim
 *  - `afterglow` holds a warm emissive floor for seconds after a peak
 *  - the whole domain slowly tumbles so even a still camera sees it evolve
 */

/** Ease a value toward a target with asymmetric rise/fall time constants. */
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

/** DE-space radius that encloses the bulb at any power ≥ 2. */
const BULB_BOUND = 1.35;

function buildFragmentShader(marchSteps: number, deIters: number): string {
  return /* glsl */ `
#define MARCH_STEPS ${marchSteps}
#define DE_ITERS ${deIters}

uniform mat4 uProj;        // camera projection (for gl_FragDepth)
uniform float uPower;
uniform float uScale;
uniform float uYaw;
uniform float uPitch;
uniform float uPaletteShift;
uniform float uGlow;       // impact-driven surface flash
uniform float uRim;        // shimmer-driven fresnel rim
uniform float uAfterglow;  // lingering emissive floor
uniform float uSnareShear; // snare lateral domain crack (X sheared by Y)
uniform vec3 uBassColor;
uniform vec3 uMidColor;
uniform vec3 uHighColor;
varying vec3 vWorldPos;

// Three-stop palette ramp scrolled by uPaletteShift (audio-driven, [0,1)).
vec3 paletteRamp(float t) {
  t = fract(t + uPaletteShift);
  if (t < 1.0 / 3.0) {
    return mix(uBassColor, uMidColor, smoothstep(0.0, 1.0, t * 3.0));
  } else if (t < 2.0 / 3.0) {
    return mix(uMidColor, uHighColor, smoothstep(0.0, 1.0, (t - 1.0 / 3.0) * 3.0));
  } else {
    return mix(uHighColor, uBassColor, smoothstep(0.0, 1.0, (t - 2.0 / 3.0) * 3.0));
  }
}

mat3 rotY(float a) {
  float c = cos(a); float s = sin(a);
  return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
}
mat3 rotX(float a) {
  float c = cos(a); float s = sin(a);
  return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c);
}

// Distance estimator for the power-N Mandelbulb. "trap" records the
// closest orbit approach — the classic fractal coloring signal.
float mandelbulbDE(vec3 pos, out float trap) {
  vec3 z = pos;
  float dr = 1.0;
  float r = 0.0;
  trap = 1e10;
  for (int i = 0; i < DE_ITERS; i++) {
    r = length(z);
    trap = min(trap, r);
    if (r > 2.0) break;
    float theta = acos(clamp(z.z / r, -1.0, 1.0)) * uPower;
    float phi = atan(z.y, z.x) * uPower;
    float zr = pow(r, uPower);
    dr = pow(r, uPower - 1.0) * uPower * dr + 1.0;
    z = zr * vec3(sin(theta) * cos(phi), sin(phi) * sin(theta), cos(theta)) + pos;
  }
  return 0.5 * log(r) * r / dr;
}

// World-space scene distance: rotate + scale the domain, evaluate the bulb.
// Snare shear is applied in fractal space after rotation so the crack reads
// as a sideways split rather than a camera tilt or radial zoom.
float sceneDE(vec3 p, out float trap) {
  vec3 q = rotX(uPitch) * rotY(uYaw) * (p / uScale);
  q.x += q.y * uSnareShear;
  return mandelbulbDE(q, trap) * uScale;
}

vec3 calcNormal(vec3 p) {
  float t0;
  vec2 e = vec2(1.0, -1.0) * 0.0007 * uScale;
  return normalize(
    e.xyy * sceneDE(p + e.xyy, t0) +
    e.yyx * sceneDE(p + e.yyx, t0) +
    e.yxy * sceneDE(p + e.yxy, t0) +
    e.xxx * sceneDE(p + e.xxx, t0));
}

// Ray / bounding-sphere intersection (the bulb lives inside r = ${BULB_BOUND}).
vec2 sphereBounds(vec3 ro, vec3 rd, float radius) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - radius * radius;
  float h = b * b - c;
  if (h < 0.0) return vec2(-1.0);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

void main() {
  // March along the eye ray through this fragment of the proxy sphere.
  // cameraPosition / viewMatrix are three.js built-ins, valid in world space.
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vWorldPos - cameraPosition);

  float bound = ${BULB_BOUND} * uScale;
  vec2 bs = sphereBounds(ro, rd, bound);
  if (bs.y < 0.0) discard;

  float t = max(bs.x, 0.0);
  float tMax = bs.y;
  float trap = 1e10;
  float hitTrap = 1e10;
  bool hit = false;
  int steps = 0;
  for (int i = 0; i < MARCH_STEPS; i++) {
    steps = i;
    vec3 p = ro + rd * t;
    float d = sceneDE(p, trap);
    if (d < max(0.0006, t * 0.0012) * uScale) {
      hit = true;
      hitTrap = trap;
      break;
    }
    t += d * 0.9;
    if (t > tMax) break;
  }

  // Miss: leave color AND depth untouched so the sky / other objects show.
  if (!hit) discard;

  vec3 p = ro + rd * t;
  vec3 n = calcNormal(p);

  // True depth of the ray hit (not the proxy surface) — this is what lets
  // particles and wisps weave in front of and behind the fractal.
  vec4 clipPos = uProj * viewMatrix * vec4(p, 1.0);
  gl_FragDepth = clamp((clipPos.z / clipPos.w) * 0.5 + 0.5, 0.0, 1.0);

  // Orbit-trap palette: crevices (small trap) take the deep end of the
  // ramp, outer lobes the bright end. Scaled so the surface spans the
  // whole bass→mid→high ramp instead of clustering at one stop.
  float trapT = clamp(hitTrap * 0.62, 0.0, 1.0);
  vec3 albedo = paletteRamp(trapT);

  // Two colored lights that agree with the SceneRig point lights.
  vec3 keyDir = normalize(vec3(0.55, 0.65, 0.5));
  vec3 fillDir = normalize(vec3(-0.6, -0.15, -0.35));
  float key = max(dot(n, keyDir), 0.0);
  float fill = max(dot(n, fillDir), 0.0) * 0.45;
  vec3 halfV = normalize(keyDir - rd);
  float spec = pow(max(dot(n, halfV), 0.0), 24.0);

  // Iteration-count AO: deep crevices stay shadowed, tips catch light.
  float ao = 1.0 - float(steps) / float(MARCH_STEPS);
  ao = 0.25 + 0.75 * ao * ao;

  float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);

  vec3 col =
    albedo * (0.22 + key * 0.95 + fill) * ao +
    uHighColor * spec * 0.7 +
    albedo * uGlow * 0.85 +
    uHighColor * fresnel * uRim +
    albedo * uAfterglow * 0.22;

  gl_FragColor = vec4(col, 1.0);
}
`;
}

const vertexShader = /* glsl */ `
varying vec3 vWorldPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export function MandelbrotZoomScene({ palette, tier, scale = 1, speed = 1 }: VisualizerSceneProps) {
  const mods = useModulation();
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const metricsRef = useMetricsRef();
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const powerWanderRef = useRef(0);
  const paletteShiftRef = useRef(0);
  const snareSmooth = useRef(0);
  const echoSmooth = useRef(0);
  const echoTravel = useRef(1); // 0..1 traveling; >=1 idle
  const echoArmed = useRef(true);
  const prevEcho = useRef(0);
  const worldScale = useRef(new THREE.Vector3());

  const reducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // Low tier still gets the crack + reverse; mid/high just read deeper.
  const kitAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  const echoAmp = tier === 'low' ? 0.7 : tier === 'mid' ? 0.9 : 1;

  const [marchSteps, deIters] =
    tier === 'high' ? [96, 9] : tier === 'mid' ? [72, 8] : [48, 7];
  const fragmentShader = useMemo(
    () => buildFragmentShader(marchSteps, deIters),
    [marchSteps, deIters],
  );

  const uniforms = useMemo(
    () => ({
      uProj: { value: new THREE.Matrix4() },
      uPower: { value: 8 },
      uScale: { value: 1 },
      uYaw: { value: 0 },
      uPitch: { value: 0 },
      uPaletteShift: { value: 0 },
      uGlow: { value: 0 },
      uRim: { value: 0.3 },
      uAfterglow: { value: 0 },
      uSnareShear: { value: 0 },
      uBassColor: { value: new THREE.Color(palette.bass) },
      uMidColor: { value: new THREE.Color(palette.mid) },
      uHighColor: { value: new THREE.Color(palette.high) },
    }),
    // Intentionally empty: colors are re-set every frame from the living
    // palette inside useFrame, so the uniform objects must stay stable.
    [],
  );

  useFrame((state, delta) => {
    const mat = matRef.current;
    const mesh = meshRef.current;
    if (!mat || !mesh) return;
    const m = metricsRef.current;
    const dt = Math.min(delta, 0.1);
    const pace = reducedMotion ? 0.25 : 1;
    const spd = mods.current.speed ?? speed;

    // Snare: fast attack, short fall — a crack, not a sustained warp.
    snareSmooth.current = smoothToward(
      snareSmooth.current,
      Math.min(1.2, m.snare) * kitAmp,
      dt,
      0.028,
      0.14,
    );

    // Phrase-echo: arm on quiet, fire once on the rise so the orbit
    // answers a gap instead of strobing through sustained silence.
    echoSmooth.current = smoothToward(echoSmooth.current, m.echo * echoAmp, dt, 0.05, 0.3);
    const echoNow = echoSmooth.current;
    if (echoNow < 0.08) echoArmed.current = true;
    if (echoArmed.current && echoNow > 0.22 && prevEcho.current <= 0.22) {
      echoTravel.current = 0;
      echoArmed.current = false;
    }
    prevEcho.current = echoNow;
    if (echoTravel.current < 1) {
      const bpm = m.bpm ?? 120;
      echoTravel.current = Math.min(1, echoTravel.current + dt * (0.85 + bpm / 180));
    }
    const reverseAmt =
      echoTravel.current < 1 ? echoSmooth.current * (1 - echoTravel.current) : 0;
    // Full reverse at peak travel envelope, then ease back to forward tumble.
    const orbitDir = 1 - reverseAmt * 2;

    // Slow tumble so the fractal evolves even under a still camera;
    // energy leans into the spin, quiet valleys nearly freeze it.
    // Phrase-echo briefly flips yaw so the bulb ghosts backward once.
    yawRef.current +=
      dt * spd * pace * (0.05 + m.energy * 0.07 + m.sectionLevel * 0.04) * orbitDir;
    pitchRef.current += dt * spd * pace * 0.017;

    // Power morph: an autonomous slow wander + the musical swell. The
    // bulb grows more ornate as the music opens up; drops kick an extra
    // step of complexity that eases back with the envelope.
    powerWanderRef.current += dt * spd * pace * 0.11;
    const power =
      7.0 +
      Math.sin(powerWanderRef.current) * 0.8 +
      m.swell * 1.6 +
      m.dropEvent * 0.7;

    // Vocals gently accelerate the color ramp — sung passages iridesce.
    paletteShiftRef.current =
      (paletteShiftRef.current + dt * (0.03 + m.mid * 0.14 + m.vocalActivity * 0.05) * pace) % 1;

    // The fractal domain tracks the proxy mesh's real world scale, so both
    // the user Scale slider AND the modulation matrix (via the modulated
    // scale group upstream) resize the bulb and its bounds together.
    const s = Math.max(0.2, mesh.getWorldScale(worldScale.current).x);
    (mat.uniforms.uProj!.value as THREE.Matrix4).copy(state.camera.projectionMatrix);
    mat.uniforms.uPower!.value = power;
    mat.uniforms.uScale!.value = s;
    mat.uniforms.uYaw!.value = yawRef.current;
    mat.uniforms.uPitch!.value = 0.35 + Math.sin(pitchRef.current) * 0.25;
    mat.uniforms.uPaletteShift!.value = paletteShiftRef.current;
    mat.uniforms.uGlow!.value = Math.min(1.2, m.impact * 0.7 + m.kick * 0.35) * (1 - m.silence * 0.6);
    mat.uniforms.uRim!.value = 0.25 + m.shimmer * 0.9 + m.hat * 0.25;
    mat.uniforms.uAfterglow!.value = m.afterglow;
    // Peak shear ~0.28 — readable crack without collapsing the DE.
    mat.uniforms.uSnareShear!.value = snareSmooth.current * 0.28 * pace;
    (mat.uniforms.uBassColor!.value as THREE.Color).set(palette.bass);
    (mat.uniforms.uMidColor!.value as THREE.Color).set(palette.mid);
    (mat.uniforms.uHighColor!.value as THREE.Color).set(palette.high);
  });

  // Proxy sphere at the DE bound: BackSide so the march still runs when the
  // camera flies INSIDE the bound; depth comes from gl_FragDepth per pixel.
  // NOTE: `scale` reaches this mesh through the modulated scale group that
  // wraps every preset, so we don't re-apply it here.
  return (
    <mesh ref={meshRef} frustumCulled={false}>
      <sphereGeometry args={[BULB_BOUND, 48, 32]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        side={THREE.BackSide}
        depthWrite
        depthTest
      />
    </mesh>
  );
}

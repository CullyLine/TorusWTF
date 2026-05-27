'use client';

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';

/**
 * Liquid Blob — raymarched metaballs with smooth-minimum fusion.
 *
 * Distinct from Liquid Chrome (which is a vertex-displaced icosahedron and
 * can become spiky at high gain): this preset renders a soft amorphous mass
 * by raymarching a signed distance field made of N spheres blended with
 * `smin`. The whole thing is a single fullscreen quad — there is no surface
 * mesh that can spike, so high-gain audio just inflates and warps the blob
 * instead of producing pointy artifacts.
 */

const RAY_STEPS_HIGH = 96;
const RAY_STEPS_MID = 64;
const RAY_STEPS_LOW = 40;

function buildFragmentShader(steps: number): string {
  return /* glsl */ `
#define RAY_STEPS ${steps}

uniform vec2 uResolution;
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uHigh;
uniform float uEnergy;
uniform float uBeat;
uniform float uScale;
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

// 5-blob field: one anchor + four orbiting satellites that fuse and split.
// Sized small at uScale=1 so the default render is intimate rather than
// screen-filling; the Scale slider multiplies the whole field uniformly.
float sceneInner(vec3 p) {
  float t = uTime * (0.35 + uEnergy * 0.25);

  float r0 = 0.42 + uBass * 0.28 + uBeat * 0.12;
  float d = sdSphere(p, r0);

  float k = 0.32 + uMid * 0.18 + uHigh * 0.1;

  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float a = t * (0.55 + fi * 0.12) + fi * 1.7;
    float b = t * (0.31 + fi * 0.08) + fi * 0.9;
    float c = t * (0.42 + fi * 0.05) + fi * 2.3;
    float orbit = 0.55 + 0.16 * sin(t * 0.7 + fi);
    vec3 center = vec3(
      cos(a) * orbit,
      sin(b) * orbit * 0.8,
      sin(c) * orbit * 0.9
    );
    float rr = 0.20 + uMid * 0.12 + uHigh * 0.08 + 0.05 * sin(t * 1.4 + fi * 2.1);
    d = smin(d, sdSphere(p - center, rr), k);
  }

  d += 0.012 * sin(p.x * 5.0 + t) * cos(p.y * 4.4 + t * 1.1) * sin(p.z * 4.7 + t * 0.8);

  return d;
}

// Standard SDF uniform scaling: shrink/grow space, then rescale the distance.
float scene(vec3 p) {
  float s = max(uScale, 0.05);
  return sceneInner(p / s) * s;
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

    // Beat injection — entire blob brightens momentarily.
    col += uColorHigh * (uBeat * 0.35 + uEnergy * 0.12);

    // Soft AO via distance to the next hit (cheap fake).
    float ao = clamp(0.6 + 0.4 * dot(n, V), 0.0, 1.0);
    col *= ao;
  } else {
    col = background(uv);
  }

  gl_FragColor = vec4(col, 1.0);
}
`;
}

const vertexShader = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export function LiquidBlobScene({ analyser, palette, tier, scale = 1 }: VisualizerSceneProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const metricsRef = useMetricsRef();
  const { size } = useThree();

  const steps = tier === 'high' ? RAY_STEPS_HIGH : tier === 'mid' ? RAY_STEPS_MID : RAY_STEPS_LOW;
  const fragmentShader = useMemo(() => buildFragmentShader(steps), [steps]);

  const uniforms = useMemo(
    () => ({
      uResolution: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uHigh: { value: 0 },
      uEnergy: { value: 0 },
      uBeat: { value: 0 },
      uScale: { value: 1 },
      uColorBass: { value: new THREE.Color(palette.bass) },
      uColorMid: { value: new THREE.Color(palette.mid) },
      uColorHigh: { value: new THREE.Color(palette.high) },
    }),
    [palette.bass, palette.mid, palette.high],
  );

  useFrame((state) => {
    const mat = matRef.current;
    if (!mat) return;
    const m = metricsRef.current;
    mat.uniforms.uResolution!.value.set(size.width, size.height);
    mat.uniforms.uTime!.value = state.clock.elapsedTime;
    mat.uniforms.uBass!.value = m.bass;
    mat.uniforms.uMid!.value = m.mid;
    mat.uniforms.uHigh!.value = m.high;
    mat.uniforms.uEnergy!.value = m.energy;
    mat.uniforms.uBeat!.value = m.beat;
    mat.uniforms.uScale!.value = scale;
    (mat.uniforms.uColorBass!.value as THREE.Color).set(palette.bass);
    (mat.uniforms.uColorMid!.value as THREE.Color).set(palette.mid);
    (mat.uniforms.uColorHigh!.value as THREE.Color).set(palette.high);
    if (analyser) analyser.getFrequencyData(freqBuf.current);
  });

  // Fullscreen triangle (clip-space, no matrices). Disable depth so the
  // post-process Bloom in SceneRig still picks up bright pixels.
  return (
    <mesh frustumCulled={false}>
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
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}

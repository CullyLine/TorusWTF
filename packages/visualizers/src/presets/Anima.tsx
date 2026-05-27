'use client';

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';

/**
 * Anima — the showcase preset for the living visualizer.
 *
 * Three layers fused in a single fullscreen fragment shader:
 *  - SOUL CORE: a central glowing orb that breathes with heartbeat + bass
 *  - AURORA CURTAINS: drifting horizontal ribbons of palette color
 *  - WISP ORBITS: small bright motes orbiting the core on bar-locked paths
 *
 * Reacts heavily to the Choreography layer:
 *  - leanIn: zooms slightly toward the core (anticipation)
 *  - release: explosive flash + core inflates (the exhale)
 *  - holdBreath: all motion eases (the listener)
 *  - tenderness: aurora curtains glow warmer + softer
 *  - moodValence: shifts dominant palette stop
 */

const fragmentShader = /* glsl */ `
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uHigh;
uniform float uEnergy;
uniform float uBeat;
uniform float uBarPhase;
uniform float uBeatPhase;
uniform float uLeanIn;
uniform float uRelease;
uniform float uHoldBreath;
uniform float uTenderness;
uniform float uMoodValence;
uniform float uSilence;
uniform float uTension;
uniform vec3 uColorBass;
uniform vec3 uColorMid;
uniform vec3 uColorHigh;

// Smooth pseudo-noise via summed sines.
float noise(vec2 p) {
  return 0.5 + 0.5 * (
    sin(p.x * 1.7 + p.y * 2.3) * 0.5 +
    sin(p.x * 2.9 - p.y * 1.1) * 0.3 +
    sin(p.x * 0.4 + p.y * 4.7) * 0.2
  );
}

// HSV-ish brightness curve.
vec3 grade(vec3 c, float gain) {
  return c * gain;
}

void main() {
  vec2 res = uResolution;
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / min(res.x, res.y);

  // ===== ZOOM (leanIn pulls toward center; release pushes outward) =====
  float zoom = 1.0 - uLeanIn * 0.25 + uRelease * 0.4;
  uv *= zoom;

  // ===== STILLNESS (holdBreath dampens all motion) =====
  float liveTime = uTime * (1.0 - uHoldBreath * 0.85);

  // ===== SOUL CORE =====
  // A central glow that breathes; bass + barFlash punch it.
  float r = length(uv);
  float coreSize = 0.18 + uBass * 0.12 + uRelease * 0.25;
  float core = exp(-pow(r / coreSize, 2.2)) * (1.0 + uBeat * 0.6);

  // ===== AURORA CURTAINS =====
  // Three drifting wave ribbons stacked vertically; phase walks with time.
  float aurora = 0.0;
  vec3 auroraColor = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float yBase = (fi - 1.0) * 0.45;
    // Each ribbon wobbles on a slightly different wavelength.
    float wave =
      sin(uv.x * (1.5 + fi * 0.5) + liveTime * (0.25 + fi * 0.07)) * 0.22 +
      sin(uv.x * (3.2 + fi * 0.3) - liveTime * 0.12) * 0.06;
    float dy = uv.y - yBase - wave;
    // Ribbon thickness pulses with mid + tension (creature wakes up).
    float thickness = 0.06 + 0.04 * uTension + 0.02 * uMid;
    float ribbon = exp(-pow(dy / thickness, 2.0));
    aurora += ribbon * (0.4 + 0.6 * noise(vec2(uv.x * 4.0 + fi, liveTime * 0.2)));
    // Per-ribbon color: low ribbon = bass, middle = mid, top = high.
    vec3 ribCol = fi < 0.5 ? uColorBass : fi < 1.5 ? uColorMid : uColorHigh;
    auroraColor += ribCol * ribbon;
  }
  aurora *= 0.65;

  // ===== WISP ORBITS =====
  // Bar-phase locked orbits — wisps complete one orbit per bar.
  float wisp = 0.0;
  for (int k = 0; k < 6; k++) {
    float fk = float(k);
    float phase = uBarPhase * 6.2831853 + fk * (6.2831853 / 6.0);
    float orbitR = 0.4 + fk * 0.04 + uTenderness * 0.1;
    vec2 wp = vec2(cos(phase), sin(phase)) * orbitR;
    float d = length(uv - wp);
    wisp += exp(-d * d * 220.0) * (0.5 + 0.5 * sin(liveTime * 2.0 + fk));
  }

  // ===== COLOR ASSEMBLY =====
  // Warm/cool tilt from moodValence + tenderness.
  float warmth = 0.5 + uMoodValence * 0.35 + uTenderness * 0.25;
  vec3 coreCol = mix(uColorBass, uColorMid * 1.2 + uColorHigh * 0.2, clamp(warmth, 0.0, 1.0));
  vec3 wispCol = uColorHigh;

  vec3 col = vec3(0.0);
  col += coreCol * core * (1.0 + uRelease * 1.6);
  col += auroraColor * aurora * (0.7 + uTenderness * 0.6);
  col += wispCol * wisp * (0.8 + uHigh * 1.2);

  // ===== EFFECTS =====
  // Drop punch — momentary fullscreen wash.
  col += uColorHigh * uRelease * 0.5;
  // Silence mute — fade overall brightness.
  col *= 1.0 - uSilence * 0.55;
  // Tension halo — outer rim warmth so the creature looks worried.
  float rim = smoothstep(0.55, 1.2, r);
  col += mix(vec3(0.0), uColorBass, rim) * uTension * 0.35;

  // Soft vignette so the core feels enclosed.
  float vignette = 1.0 - smoothstep(0.7, 1.3, r);
  col *= 0.4 + 0.6 * vignette;

  gl_FragColor = vec4(grade(col, 1.0), 1.0);
}
`;

const vertexShader = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export function AnimaScene({ analyser, palette }: VisualizerSceneProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const metricsRef = useMetricsRef();
  const { size } = useThree();

  const uniforms = useMemo(
    () => ({
      uResolution: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uHigh: { value: 0 },
      uEnergy: { value: 0 },
      uBeat: { value: 0 },
      uBarPhase: { value: 0 },
      uBeatPhase: { value: 0 },
      uLeanIn: { value: 0 },
      uRelease: { value: 0 },
      uHoldBreath: { value: 0 },
      uTenderness: { value: 0 },
      uMoodValence: { value: 0 },
      uSilence: { value: 0 },
      uTension: { value: 0 },
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
    mat.uniforms.uBarPhase!.value = m.barPhase;
    mat.uniforms.uBeatPhase!.value = m.beatPhase;
    mat.uniforms.uLeanIn!.value = m.leanIn;
    mat.uniforms.uRelease!.value = m.release;
    mat.uniforms.uHoldBreath!.value = m.holdBreath;
    mat.uniforms.uTenderness!.value = m.tenderness;
    mat.uniforms.uMoodValence!.value = m.moodValence;
    mat.uniforms.uSilence!.value = m.silence;
    mat.uniforms.uTension!.value = m.tension;
    (mat.uniforms.uColorBass!.value as THREE.Color).set(palette.bass);
    (mat.uniforms.uColorMid!.value as THREE.Color).set(palette.mid);
    (mat.uniforms.uColorHigh!.value as THREE.Color).set(palette.high);

    if (analyser) analyser.getFrequencyData(freqBuf.current);
  });

  // Fullscreen triangle in clip space — no model/view matrices needed.
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
        depthWrite={false}
      />
    </mesh>
  );
}

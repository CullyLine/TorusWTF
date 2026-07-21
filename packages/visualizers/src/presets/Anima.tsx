'use client';

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';
import { useModulation } from '../modulation';

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
 *
 * Kit soul accents (on top of choreography):
 *  - kick: core brightness / size punch
 *  - snare: mid-radius ring crack
 *  - hat: outer halo glitter ticks
 *  - echo: one-shot soul reply — brief core brighten + aurora counter-sweep
 *    in phrase gaps (answers when the music opens space)
 */

/**
 * Smooth toward a target with asymmetric rise/fall (seconds).
 * Keeps kit accents and phrase-echo envelopes fluid — no linear snaps.
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
// Heuristic stem activity + song structure (0..1 each).
uniform float uVocal;
uniform float uSection;
uniform float uAfterglow;
// Drum-kit soul accents (smoothed envelopes).
uniform float uKick;
uniform float uSnare;
uniform float uHat;
// Phrase-echo soul reply (one-shot envelope + travel 0..1; 1 = idle).
uniform float uEcho;
uniform float uEchoTravel;
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

  // Phrase-echo reply envelope: peaks early, fades as the sweep travels.
  float echoPulse = uEcho * (1.0 - uEchoTravel * 0.85);
  // Counter-sweep: reverse aurora drift while the reply is active.
  float echoFlip = 1.0 - clamp(uEcho, 0.0, 1.0) * 2.0;

  // ===== SOUL CORE =====
  // A central glow that breathes; bass + barFlash punch it. Section level
  // grows the core through choruses; afterglow keeps it warm after them.
  // Kick: brief brightness/size punch — drums the creature without a
  // fullscreen strobe (gain is local to the core falloff).
  // Echo reply: brief local brighten/size — answers in gaps, not a wash.
  float r = length(uv);
  float coreSize = 0.18 + uBass * 0.12 + uRelease * 0.25 + uSection * 0.06 + uAfterglow * 0.04 + uKick * 0.07 + echoPulse * 0.06;
  float core = exp(-pow(r / coreSize, 2.2)) * (1.0 + uBeat * 0.6 + uKick * 0.85 + echoPulse * 0.95);

  // ===== AURORA CURTAINS =====
  // Three drifting wave ribbons stacked vertically; phase walks with time.
  // On echo, wave time flips so the curtains counter-sweep once per gap.
  float aurora = 0.0;
  vec3 auroraColor = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float yBase = (fi - 1.0) * 0.45;
    // Each ribbon wobbles on a slightly different wavelength.
    float wave =
      sin(uv.x * (1.5 + fi * 0.5) + liveTime * (0.25 + fi * 0.07) * echoFlip) * 0.22 +
      sin(uv.x * (3.2 + fi * 0.3) - liveTime * 0.12 * echoFlip) * 0.06;
    float dy = uv.y - yBase - wave;
    // Ribbon thickness pulses with mid + tension (creature wakes up).
    float thickness = 0.06 + 0.04 * uTension + 0.02 * uMid + echoPulse * 0.015;
    float ribbon = exp(-pow(dy / thickness, 2.0));
    aurora += ribbon * (0.4 + 0.6 * noise(vec2(uv.x * 4.0 + fi, liveTime * 0.2)));
    // Per-ribbon color: low ribbon = bass, middle = mid, top = high.
    vec3 ribCol = fi < 0.5 ? uColorBass : fi < 1.5 ? uColorMid : uColorHigh;
    auroraColor += ribCol * ribbon;
  }
  aurora *= 0.65;

  // Traveling reply crest: a soft bright band sweeps across the aurora
  // opposite the usual drift — one pass per phrase-echo fire.
  float crestX = mix(-1.15, 1.15, clamp(uEchoTravel, 0.0, 1.0));
  float crest =
    exp(-pow((uv.x - crestX) / 0.14, 2.0)) *
    uEcho *
    (1.0 - uEchoTravel * 0.35) *
    (0.55 + 0.45 * aurora);

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

  // ===== SNARE MID RING =====
  // Annular crack at mid radius — distinct from core kick punch.
  float snareBand = abs(r - (0.32 + uSnare * 0.04));
  float snareRing = exp(-pow(snareBand / (0.028 + uSnare * 0.012), 2.0)) * uSnare;

  // ===== HAT OUTER HALO =====
  // Sparse angular glitter on the outer rim — ticks, doesn't wash the frame.
  float haloR = smoothstep(0.48, 0.72, r) * (1.0 - smoothstep(0.95, 1.35, r));
  float hatSparkle =
    haloR *
    uHat *
    (0.55 + 0.45 * noise(vec2(atan(uv.y, uv.x) * 4.5 + liveTime * 9.0, r * 6.0)));

  // ===== COLOR ASSEMBLY =====
  // Warm/cool tilt from moodValence + tenderness.
  float warmth = 0.5 + uMoodValence * 0.35 + uTenderness * 0.25;
  vec3 coreCol = mix(uColorBass, uColorMid * 1.2 + uColorHigh * 0.2, clamp(warmth, 0.0, 1.0));
  vec3 wispCol = uColorHigh;

  vec3 col = vec3(0.0);
  col += coreCol * core * (1.0 + uRelease * 1.6 + uAfterglow * 0.35 + uKick * 0.45 + echoPulse * 0.55);
  // Vocals literally light the curtains: when a voice is present the aurora
  // breathes brighter, so singing passages read differently from drops.
  col += auroraColor * aurora * (0.7 + uTenderness * 0.6 + uVocal * 0.55 + echoPulse * 0.35);
  col += wispCol * wisp * (0.8 + uHigh * 1.2 + uVocal * 0.5);
  // Echo crest rides mid→high so the reply reads as a soul answer, not a kit hit.
  col += mix(uColorMid, uColorHigh, 0.45) * crest * 1.25;
  // Snare: mid-ring flash toward mid/high palette (crack, not wash).
  col += mix(uColorMid, uColorHigh, 0.35) * snareRing * 1.35;
  // Hats: outer halo sparkle toward high color.
  col += mix(coreCol, uColorHigh, 0.7) * hatSparkle * 1.1;

  // ===== EFFECTS =====
  // Drop punch — momentary fullscreen wash.
  col += uColorHigh * uRelease * 0.5;
  // Silence mute — fade overall brightness.
  col *= 1.0 - uSilence * 0.55;
  // Tension halo — outer rim warmth so the creature looks worried.
  float rim = smoothstep(0.55, 1.2, r);
  col += mix(vec3(0.0), uColorBass, rim) * uTension * 0.35;
  // Hat also ticks the existing tension rim slightly so the halo reads.
  col += mix(vec3(0.0), uColorHigh, rim) * uHat * 0.22;

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

export function AnimaScene({
  analyser,
  palette,
  tier,
  speed = 1,
  backdrop = false,
}: VisualizerSceneProps) {
  const mods = useModulation();
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const metricsRef = useMetricsRef();
  const { size } = useThree();
  const timeRef = useRef(0);
  const kickSmooth = useRef(0);
  const snareSmooth = useRef(0);
  const hatSmooth = useRef(0);
  const echoSmooth = useRef(0);
  const echoTravel = useRef(1);
  const echoArmed = useRef(true);
  const prevEcho = useRef(0);

  // Low tier: slightly softer kit/reply so the fullscreen shader doesn't strobe;
  // mid/high keep full readable accents and a readable counter-sweep.
  const kitAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  const echoAmp = tier === 'low' ? 0.7 : tier === 'mid' ? 0.9 : 1;

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
      uVocal: { value: 0 },
      uSection: { value: 0 },
      uAfterglow: { value: 0 },
      uKick: { value: 0 },
      uSnare: { value: 0 },
      uHat: { value: 0 },
      uEcho: { value: 0 },
      uEchoTravel: { value: 1 },
      uColorBass: { value: new THREE.Color(palette.bass) },
      uColorMid: { value: new THREE.Color(palette.mid) },
      uColorHigh: { value: new THREE.Color(palette.high) },
    }),
    [palette.bass, palette.mid, palette.high],
  );

  useFrame((_state, delta) => {
    const mat = matRef.current;
    if (!mat) return;
    const m = metricsRef.current;
    const dt = Math.min(delta, 0.05);

    timeRef.current += dt * (mods.current.speed ?? speed);
    mat.uniforms.uResolution!.value.set(size.width, size.height);
    mat.uniforms.uTime!.value = timeRef.current;
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
    mat.uniforms.uVocal!.value = m.vocalActivity;
    mat.uniforms.uSection!.value = m.sectionLevel;
    mat.uniforms.uAfterglow!.value = m.afterglow;
    (mat.uniforms.uColorBass!.value as THREE.Color).set(palette.bass);
    (mat.uniforms.uColorMid!.value as THREE.Color).set(palette.mid);
    (mat.uniforms.uColorHigh!.value as THREE.Color).set(palette.high);

    // Kit soul accents: kick punches the core (fast rise, slightly longer
    // ring); snare cracks a mid ring; hats glitter the outer halo.
    kickSmooth.current = smoothToward(
      kickSmooth.current,
      Math.min(1.2, m.kick) * kitAmp,
      dt,
      0.032,
      0.13,
    );
    snareSmooth.current = smoothToward(
      snareSmooth.current,
      Math.min(1.2, m.snare) * kitAmp,
      dt,
      0.028,
      0.1,
    );
    hatSmooth.current = smoothToward(
      hatSmooth.current,
      Math.min(1.2, m.hat) * kitAmp,
      dt,
      0.025,
      0.085,
    );
    mat.uniforms.uKick!.value = kickSmooth.current;
    mat.uniforms.uSnare!.value = snareSmooth.current;
    mat.uniforms.uHat!.value = hatSmooth.current;

    // Phrase-echo soul reply: arm on quiet, fire one travel per echo rise
    // so the creature answers once in the gap instead of strobing.
    echoSmooth.current = smoothToward(
      echoSmooth.current,
      m.echo * echoAmp,
      dt,
      0.05,
      0.28,
    );
    const echoNow = echoSmooth.current;
    if (echoNow < 0.08) echoArmed.current = true;
    if (echoArmed.current && echoNow > 0.22 && prevEcho.current <= 0.22) {
      echoTravel.current = 0;
      echoArmed.current = false;
    }
    prevEcho.current = echoNow;

    if (echoTravel.current < 1) {
      const bpm = Math.max(60, Math.min(180, m.bpm || 120));
      const pace = 0.9 + (mods.current.speed ?? speed) * 0.15;
      echoTravel.current = Math.min(1, echoTravel.current + dt * pace * (0.85 + bpm / 180));
    }

    const traveling = echoTravel.current < 1;
    // Idle: nearly silent so speaking passages never show a sticky reply glow.
    const echoVis = traveling
      ? echoSmooth.current * (1 - echoTravel.current * 0.3)
      : echoSmooth.current * 0.04;
    mat.uniforms.uEcho!.value = echoVis;
    mat.uniforms.uEchoTravel!.value = echoTravel.current;

    if (analyser) analyser.getFrequencyData(freqBuf.current);
  });

  // Fullscreen triangle in clip space — no model/view matrices needed.
  // With a BackgroundLayer sky active, switch to additive compositing so
  // Anima's black regions become windows onto the environment instead of
  // painting over it.
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
        transparent={backdrop}
        blending={backdrop ? THREE.AdditiveBlending : THREE.NormalBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

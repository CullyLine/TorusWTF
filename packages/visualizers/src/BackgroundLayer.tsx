'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useMetricsRef } from './metrics';
import { getDotTexture } from './dotTexture';

/**
 * BackgroundLayer — the always-subtle reactive backdrop.
 *
 * Every mode is a true 360° environment (sky spheres / spherical star
 * shells), not a flat card: whichever way the camera flies — orbit,
 * cinematic sweeps, flow-riding — the backdrop is there. Shader modes
 * compute color from the per-pixel WORLD DIRECTION on an inward-facing
 * sphere, so there are no seams, no edges, and no "back of the set".
 *
 * Driven mostly by SLOW signals (`breath`, `flow`, `moodValence`,
 * `dropEvent`, `afterglow`, `tension`) so the background drifts and
 * swells rather than strobing. Pre-beat `gather` eases the sky inward /
 * dim (musical inhale); `leanIn` pulls the shell slightly toward the
 * camera (anticipation, distinct from gather). `shimmer`/`hat` add a
 * faint glitter distinct from bass swell. `vocalActivity` soft-warms
 * sky tint on voice-led passages; while `afterglow` decays,
 * nebula/aurora/glow bias toward a warmer amber mix on top — intensity
 * afterglow stays; this is the color-temperature residue of a big
 * moment. During `holdBreath` / deep `silence` the sky hush eases
 * nebula/aurora drift and dims glitter so every backdrop listens,
 * thawing when music returns — distinct from gather inhale, leanIn
 * pull, and afterglow warmth. On `tenderness`, nebula/aurora/glow
 * drift eases (still breathes) and the sky warm-dims so tender vocals
 * gentle the backdrop without the hush freeze — re-brightening on
 * release. Kit accents: `kick` sends a deep pulse from the nebula/glow
 * core and `snare` a brief lateral aurora shear so the sky answers the
 * drums under every preset — subtle, never fighting the foreground;
 * gather / leanIn / holdBreath / afterglow / tenderness stay distinct.
 * On `convergence`, the sky organizes into coherence — aurora curtains
 * align into parallel bands, nebula billows ease into one slow shared
 * drift, glow steadies and brightens faintly, star shell spin coheres —
 * dissolving back into free drift as the lock fades. Sibling to
 * livingPalette chord lock, SceneRig plant, and Aura shared orbit.
 * On `echo`, replay the last phrase as a one-shot train of cool silver
 * glints sweeping the backdrop — aurora curtains flickering in sequence,
 * nebula billows pulsing faintly, glow halo chasing a cool pulse, star
 * shells glinting — fading as the music returns. The sky's last missing
 * voice; sibling to Aura phrase-echo (#107). Gather / leanIn / holdBreath /
 * afterglow / tenderness / kit / convergence stay distinct.
 * Honors `prefers-reduced-motion` by freezing the drift. Contrast-capped
 * so it never competes with the foreground preset.
 */

export type BackgroundMode = 'none' | 'nebula' | 'starfield' | 'aurora' | 'glow';

export const BACKGROUND_MODES: BackgroundMode[] = [
  'none',
  'nebula',
  'starfield',
  'aurora',
  'glow',
];

export interface BackgroundLayerProps {
  mode: BackgroundMode;
  /** Master visibility 0..1. Default 0.6. Always contrast-capped on top. */
  intensity?: number;
  palette: { bass: string; mid: string; high: string };
  tier: 'high' | 'mid' | 'low';
}

// Contrast caps per mode — the hard ceiling on how loud the background can
// ever get, so it stays a background no matter the intensity slider.
// (Raised slightly vs the old flat-card versions: the same energy budget
// spread across a full sky sphere reads dimmer per pixel.)
const NEBULA_CAP = 0.42;
const AURORA_CAP = 0.5;
const GLOW_CAP = 0.42;
const STAR_OPACITY_CAP = 0.68;

/**
 * Amber residue mixed into sky colors while afterglow decays.
 * Max mix at afterglow=1 — visible warmth, not a full wash.
 */
const AFTERGLOW_AMBER = new THREE.Color(1.0, 0.58, 0.28);
const AFTERGLOW_WARMTH_MIX = 0.42;
/** Ease tau for color-temperature linger (fluid, not stair-stepped). */
const AFTERGLOW_WARMTH_TAU = 0.35;

/**
 * Softer rose-warm voice tint — sits under afterglow amber so peaks still
 * read as the big-moment residue, while vocal verses warm vs instrumental.
 */
const VOCAL_WARM = new THREE.Color(1.0, 0.7, 0.55);
const VOCAL_WARMTH_MIX = 0.24;
const VOCAL_WARMTH_TAU = 0.22;

/** Lean-in: eager rise, slower settle so anticipation lingers into the drop. */
const LEAN_RISE_TAU = 0.08;
const LEAN_FALL_TAU = 0.2;
/** Max sky-shell scale reduction — pulls nebula/aurora/glow toward camera. */
const LEAN_SKY_PULL = 0.06;
/** Star shell pull — slightly stronger so the approach reads on points. */
const LEAN_STAR_PULL = 0.08;

/**
 * Hold-breath sky hush: rise a touch slower than thaw so the freeze feels
 * attentive; thaw resumes promptly when music returns.
 */
const STILLNESS_RISE_TAU = 0.14;
const STILLNESS_FALL_TAU = 0.08;
/** Nearly freeze nebula/aurora/glow drift + star spin at full hush. */
const DRIFT_HUSH = 0.92;
/** Dim hat/shimmer glitter while listening — not gather dim, not lean. */
const GLITTER_HUSH = 0.88;

/**
 * Tenderness sky soften: ease drift (still breathes — not holdBreath freeze)
 * and warm-dim glow under tender vocals; re-brightens on release.
 */
const TENDER_RISE_TAU = 0.12;
const TENDER_FALL_TAU = 0.22;
/** Drift ease at full tenderness — far softer than DRIFT_HUSH (0.92). */
const DRIFT_TENDER = 0.42;
/** Warm-dim intensity notch — sky gentles without going dark. */
const TENDER_DIM = 0.24;
/** Soft milk-amber; cooler/milkier than afterglow amber so peaks stay distinct. */
const TENDER_WARM = new THREE.Color(1.0, 0.74, 0.58);
const TENDER_WARMTH_MIX = 0.2;
/** Soften glitter under tenderness — less than holdBreath hush. */
const GLITTER_TENDER = 0.35;

/**
 * Kit accents: fast attack / medium fall so kick depth-pulse and snare
 * lateral flick read as struck bells, not band swell. Hat glitter stays
 * on its own path above.
 */
const KIT_KICK_RISE_TAU = 0.025;
const KIT_KICK_FALL_TAU = 0.14;
const KIT_SNARE_RISE_TAU = 0.02;
const KIT_SNARE_FALL_TAU = 0.12;

/**
 * Convergence lock: eager into the chord (~0.1s), softer release (~0.18s)
 * so aligned curtains / shared drift dissolve without a snap. Soft under
 * stillness so holdBreath hush still owns quiet (lock ≠ freeze).
 */
const LOCK_RISE_TAU = 0.1;
const LOCK_FALL_TAU = 0.18;
/** Faint intensity lift while bands lock — coherence, not a swell punch. */
const LOCK_BRIGHTEN = 0.1;

/**
 * Phrase-echo one-shot: arm on quiet, fire one cool silver glint train per
 * gap. Eager rise, soft fall; travel is BPM-paced. Soft under hush so
 * holdBreath still owns quiet (echo = memory, not freeze).
 */
const ECHO_RISE_TAU = 0.05;
const ECHO_FALL_TAU = 0.18;
/** Cool silver after-image — cooler than afterglow amber / tender milk. */
const ECHO_SILVER = new THREE.Color(0.58, 0.78, 0.98);

/** Sky sphere radius: far outside every camera path (max ~12 world units). */
const SKY_RADIUS = 50;

function kitAmpForTier(tier: 'high' | 'mid' | 'low'): number {
  return tier === 'high' ? 1 : tier === 'mid' ? 0.9 : 0.7;
}

function lockAmpForTier(tier: 'high' | 'mid' | 'low'): number {
  return tier === 'high' ? 1 : tier === 'mid' ? 0.9 : 0.75;
}

function echoAmpForTier(tier: 'high' | 'mid' | 'low'): number {
  return tier === 'high' ? 1 : tier === 'mid' ? 0.9 : 0.7;
}

function smoothToward(
  current: number,
  target: number,
  dt: number,
  riseTau: number,
  fallTau: number,
): number {
  const tau = target > current ? riseTau : fallTau;
  return current + (target - current) * (1 - Math.exp(-dt / tau));
}

/** holdBreath + deep silence → sky listens (same blend as Aura / presets). */
function stillnessFromMetrics(holdBreath: number, silence: number): number {
  return Math.min(
    1,
    Math.max(holdBreath, silence * 0.92) + Math.min(holdBreath, silence) * 0.15,
  );
}

/** Bias a sky color toward amber by eased afterglow; quiet (0) is a no-op. */
function applyAfterglowWarmth(
  color: THREE.Color,
  warmthLinger: number,
  scratchAmber: THREE.Color,
): void {
  const t = Math.max(0, Math.min(1, warmthLinger)) * AFTERGLOW_WARMTH_MIX;
  if (t < 0.001) return;
  color.lerp(scratchAmber.copy(AFTERGLOW_AMBER), t);
}

/** Soft voice-warm tint; apply before afterglow so amber linger still wins. */
function applyVocalWarmth(
  color: THREE.Color,
  vocalLinger: number,
  scratchWarm: THREE.Color,
): void {
  const t = Math.max(0, Math.min(1, vocalLinger)) * VOCAL_WARMTH_MIX;
  if (t < 0.001) return;
  color.lerp(scratchWarm.copy(VOCAL_WARM), t);
}

/**
 * Milk-amber tenderness tint; apply after vocal, before afterglow so big-moment
 * amber linger still owns peaks and vocal warmth stays a separate cue.
 */
function applyTenderWarmth(
  color: THREE.Color,
  tender: number,
  scratchWarm: THREE.Color,
): void {
  const t = Math.max(0, Math.min(1, tender)) * TENDER_WARMTH_MIX;
  if (t < 0.001) return;
  color.lerp(scratchWarm.copy(TENDER_WARM), t);
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);
  return reduced;
}

export function BackgroundLayer({ mode, intensity = 0.6, palette, tier }: BackgroundLayerProps) {
  const reducedMotion = usePrefersReducedMotion();
  if (mode === 'none') return null;
  const common = { intensity, palette, tier, reducedMotion };
  switch (mode) {
    case 'nebula':
      return <Nebula {...common} />;
    case 'starfield':
      return <Starfield {...common} />;
    case 'aurora':
      return <Aurora {...common} />;
    case 'glow':
      return <Glow {...common} />;
    default:
      return null;
  }
}

interface ModeProps {
  intensity: number;
  palette: { bass: string; mid: string; high: string };
  tier: 'high' | 'mid' | 'low';
  reducedMotion: boolean;
}

// Shared GLSL: 2D fbm noise + a seamless direction-domain fbm that blends
// three axis projections (triplanar-on-the-sphere), so sky patterns have
// no pole pinching and no wrap seam anywhere.
const NOISE_GLSL = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0; float a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
    return v;
  }
  float fbmDir(vec3 d, float s, vec2 drift) {
    vec3 w = abs(d);
    w /= (w.x + w.y + w.z);
    return fbm(d.yz * s + drift) * w.x
         + fbm(d.xz * s + drift * 1.13) * w.y
         + fbm(d.xy * s + drift * 0.87) * w.z;
  }
`;

// Sky vertex shader: pass the world-space view direction for this fragment.
// The sphere is camera-agnostic — direction is (worldPos - cameraPos), so
// turning or flying the camera reveals the rest of a coherent sky.
const SKY_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vDir = normalize(wp.xyz - cameraPosition);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

interface SkySphereProps {
  matRef: React.RefObject<THREE.ShaderMaterial | null>;
  fragment: string;
  uniforms: Record<string, THREE.IUniform>;
}

/** Inward-facing sphere shared by all shader sky modes. */
function SkySphere({ matRef, fragment, uniforms }: SkySphereProps) {
  return (
    <mesh renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[SKY_RADIUS, 48, 32]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={SKY_VERTEX}
        fragmentShader={fragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        depthTest
        side={THREE.BackSide}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Nebula — drifting fbm fog wrapped around the whole sky.
// ---------------------------------------------------------------------------

const NEBULA_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uIntensity;
  uniform float uInhale;
  uniform float uGlitter;
  uniform float uLean;
  uniform float uKick;
  uniform float uSnare;
  uniform float uLock;
  uniform float uEcho;
  uniform float uEchoTravel;
  uniform vec3 uEchoColor;
  varying vec3 vDir;
  ${NOISE_GLSL}
  void main() {
    vec3 d = normalize(vDir);
    float kick = clamp(uKick, 0.0, 1.2);
    float snare = clamp(uSnare, 0.0, 1.2);
    float lock = clamp(uLock, 0.0, 1.0);
    float lockSnap = lock * lock;
    float echo = clamp(uEcho, 0.0, 1.0);
    float travel = clamp(uEchoTravel, 0.0, 1.0);
    // Lean zooms features (sky approaches) — distinct from gather's density inhale.
    // Kick briefly opens the domain (depth pulse from the fog core).
    float zoom = 1.0 - uLean * 0.28 + kick * 0.07;
    // Snare: brief lateral shear of the fog field (backbeat flick).
    // Lock softens shear so free billows yield to one shared drift.
    vec2 shear = vec2(snare * 0.055 * (1.0 - lock * 0.7) * sign(d.x + 1e-4), 0.0);
    // Free: two opposing drift clocks. Locked: both layers share one slow
    // advect so the fog reads as one coherent billow (not frozen — hush owns that).
    vec2 sharedDrift = vec2(uTime * 0.011, uTime * 0.0085);
    vec2 free1 = vec2(uTime * 0.020, uTime * 0.015) + shear;
    vec2 free2 = vec2(-uTime * 0.012, uTime * 0.008) + shear * 1.2;
    vec2 drift1 = mix(free1, sharedDrift, lock * 0.88);
    vec2 drift2 = mix(free2, sharedDrift * vec2(1.04, 0.96), lock * 0.88);
    // Lock eases the dual-scale chaos toward one slower frequency band.
    float n1 = fbmDir(d, mix(2.6, 2.05, lock) * zoom, drift1);
    float n2 = fbmDir(d, mix(4.4, 2.35, lockSnap) * zoom, drift2);
    // Gather raises the density floor so fog thins / pulls toward denser
    // pockets — a pre-beat inhale instead of a flat dim.
    // Kick drops the floor so dense cores surge outward (depth pulse).
    float lo = 0.28 + uInhale * 0.16 - kick * 0.1;
    float hi = 0.95 + uInhale * 0.04;
    // Lock blends toward a single coherent density field (n1-led).
    float mixN = mix(0.62, 0.82, lockSnap);
    float density = smoothstep(lo, hi, n1 * mixN + n2 * (1.0 - mixN));
    vec3 col = mix(uColorA, uColorB, mix(n2, n1 * 0.55 + n2 * 0.45, lock));
    // Slightly thinner straight overhead/underfoot so the fog reads as a
    // horizon-hugging cloudscape instead of a uniform wash.
    float band = 1.0 - 0.35 * abs(d.y) - uInhale * 0.18 * (1.0 - abs(d.y));
    // Hat/shimmer glitter: brief high-frequency sparkle, not bass swell.
    float sparkle = noise(d.xy * 38.0 + vec2(uTime * 9.0, uTime * 6.5));
    float glitter = 1.0 + uGlitter * (0.25 + 0.75 * sparkle);
    // Phrase-echo: cool silver billow pulses sweeping azimuth — memory, not kit.
    float azN = atan(d.z, d.x) / 6.2831853 + 0.5;
    float train = abs(azN - travel);
    train = min(train, 1.0 - train);
    float beatPulse = 0.5 + 0.5 * sin(travel * 3.14159265 * 8.0 + density * 14.0);
    float echoGlint = echo * (1.0 - travel * 0.85) * smoothstep(0.11, 0.0, train)
                    * (0.4 + 0.6 * beatPulse) * density;
    col = mix(col, uEchoColor, clamp(echoGlint * 0.78, 0.0, 0.85));
    // Lean slightly brightens (anticipation), gather dims (inhale).
    // Kick core pulse + snare flank flash stay under the contrast cap.
    // Lock faint brighten — coherence glow, not kit punch or tension swell.
    float corePulse = 1.0 + kick * 0.14 * density;
    float flank = smoothstep(0.15, 0.85, abs(d.x)) * (1.0 - abs(d.y) * 0.55);
    float a = density * band * uIntensity * (1.0 - uInhale * 0.28) * (1.0 + uLean * 0.08)
            * glitter * corePulse * (1.0 + snare * 0.1 * flank) * (1.0 + lock * 0.1)
            * (1.0 + echoGlint * 0.22);
    gl_FragColor = vec4(col, a);
  }
`;

function Nebula({ intensity, palette, tier, reducedMotion }: ModeProps) {
  const groupRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const metricsRef = useMetricsRef();
  const scratchMid = useRef(new THREE.Color());
  const scratchHigh = useRef(new THREE.Color());
  const scratchAmber = useRef(new THREE.Color());
  const scratchVocal = useRef(new THREE.Color());
  const scratchTender = useRef(new THREE.Color());
  const scratchEcho = useRef(new THREE.Color().copy(ECHO_SILVER));
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color(palette.bass) },
      uColorB: { value: new THREE.Color(palette.mid) },
      uIntensity: { value: 0 },
      uInhale: { value: 0 },
      uGlitter: { value: 0 },
      uLean: { value: 0 },
      uKick: { value: 0 },
      uSnare: { value: 0 },
      uLock: { value: 0 },
      uEcho: { value: 0 },
      uEchoTravel: { value: 1 },
      uEchoColor: { value: new THREE.Color().copy(ECHO_SILVER) },
    }),
    [palette.bass, palette.mid],
  );
  const timeRef = useRef(0);
  const inhaleRef = useRef(0);
  const glitterRef = useRef(0);
  const leanRef = useRef(0);
  const kickRef = useRef(0);
  const snareRef = useRef(0);
  const lockRef = useRef(0);
  const echoSmooth = useRef(0);
  const echoTravel = useRef(1);
  const echoArmed = useRef(true);
  const prevEcho = useRef(0);
  const stillnessRef = useRef(0);
  const tenderRef = useRef(0);
  const warmthLingerRef = useRef(0);
  const vocalLingerRef = useRef(0);

  useFrame((_s, delta) => {
    const m = metricsRef.current;
    const dt = Math.min(delta, 0.1);
    const kitAmp = kitAmpForTier(tier);
    const lockAmp = lockAmpForTier(tier);
    const echoAmp = echoAmpForTier(tier);
    // Hold-breath hush: freeze drift clock; gather/lean/afterglow stay on full dt.
    stillnessRef.current = smoothToward(
      stillnessRef.current,
      stillnessFromMetrics(m.holdBreath, m.silence),
      dt,
      STILLNESS_RISE_TAU,
      STILLNESS_FALL_TAU,
    );
    tenderRef.current = smoothToward(
      tenderRef.current,
      Math.min(1, m.tenderness),
      dt,
      TENDER_RISE_TAU,
      TENDER_FALL_TAU,
    );
    const stillness = stillnessRef.current;
    const tender = tenderRef.current;
    // Convergence lock: eager into chord, soft release; soft under hush.
    lockRef.current = smoothToward(
      lockRef.current,
      Math.min(1, Math.max(0, m.convergence ?? 0)) * lockAmp,
      dt,
      LOCK_RISE_TAU,
      LOCK_FALL_TAU,
    );
    const lock = lockRef.current * (1 - stillness * 0.3);
    // Steadier shared clock when locked — not frozen (holdBreath owns that).
    const lockPace = 1 - lock * 0.38;
    // Phrase-echo: arm on quiet, fire one cool silver billow-pulse train per gap.
    echoSmooth.current = smoothToward(
      echoSmooth.current,
      Math.min(1, m.echo) * echoAmp,
      dt,
      ECHO_RISE_TAU,
      ECHO_FALL_TAU,
    );
    const echoNow = echoSmooth.current;
    if (echoNow < 0.08) echoArmed.current = true;
    if (echoArmed.current && echoNow > 0.22 && prevEcho.current <= 0.22) {
      echoTravel.current = 0;
      echoArmed.current = false;
    }
    prevEcho.current = echoNow;
    if (echoTravel.current < 1) {
      const bpmEcho = m.bpm && m.bpm > 30 ? m.bpm : 120;
      echoTravel.current = Math.min(
        1,
        echoTravel.current + dt * 0.88 * (0.85 + bpmEcho / 180),
      );
    }
    const traveling = echoTravel.current < 1;
    const echoVis = traveling
      ? echoSmooth.current * (1 - echoTravel.current * 0.3)
      : echoSmooth.current * 0.04;
    const echoMul = 1 - stillness * 0.55;
    // Tenderness eases drift without the hush freeze — stack under stillness.
    const motionMul =
      (1 - stillness * DRIFT_HUSH) * (1 - tender * DRIFT_TENDER) * lockPace;
    timeRef.current += reducedMotion ? 0 : dt * motionMul;
    const mat = matRef.current;
    if (!mat) return;
    mat.uniforms.uTime!.value = timeRef.current;
    // Slow swell: breath + flow + build tension + lingering afterglow.
    const swell =
      0.4 +
      m.breath * 0.5 +
      m.flow * 0.35 +
      m.tension * 0.42 +
      m.dropEvent * 0.25 +
      m.afterglow * 0.2;
    // Warm-dim under tenderness — re-brightens on release; not gather dim.
    // Lock faint brighten — coherence, not tension swell.
    const tenderDim = 1 - tender * TENDER_DIM;
    mat.uniforms.uIntensity!.value = Math.min(
      NEBULA_CAP,
      swell * intensity * NEBULA_CAP * tenderDim * (1 + lock * LOCK_BRIGHTEN),
    );
    // Ease gather/glitter so the sky inhales and sparkles fluidly.
    inhaleRef.current += (m.gather - inhaleRef.current) * (1 - Math.exp(-dt / 0.12));
    const glitterTarget = Math.min(1, m.shimmer * 0.9 + m.hat * 0.55);
    const glitterTau = glitterTarget > glitterRef.current ? 0.05 : 0.22;
    glitterRef.current +=
      (glitterTarget - glitterRef.current) * (1 - Math.exp(-dt / glitterTau));
    leanRef.current = smoothToward(leanRef.current, m.leanIn, dt, LEAN_RISE_TAU, LEAN_FALL_TAU);
    // Kit accents stay on full dt so kick/snare still fire through holdBreath thaw.
    kickRef.current = smoothToward(
      kickRef.current,
      Math.min(1.2, m.kick) * kitAmp,
      dt,
      KIT_KICK_RISE_TAU,
      KIT_KICK_FALL_TAU,
    );
    snareRef.current = smoothToward(
      snareRef.current,
      Math.min(1.2, m.snare) * kitAmp,
      dt,
      KIT_SNARE_RISE_TAU,
      KIT_SNARE_FALL_TAU,
    );
    // Color-temperature linger tracks afterglow (intensity path unchanged).
    warmthLingerRef.current +=
      (m.afterglow - warmthLingerRef.current) * (1 - Math.exp(-dt / AFTERGLOW_WARMTH_TAU));
    vocalLingerRef.current +=
      (Math.min(1, m.vocalActivity) - vocalLingerRef.current) *
      (1 - Math.exp(-dt / VOCAL_WARMTH_TAU));
    mat.uniforms.uInhale!.value = inhaleRef.current;
    // Dim glitter while listening; soft tenderness soften — distinct from hush.
    mat.uniforms.uGlitter!.value =
      glitterRef.current * (1 - stillness * GLITTER_HUSH) * (1 - tender * GLITTER_TENDER);
    mat.uniforms.uLean!.value = leanRef.current;
    mat.uniforms.uKick!.value = kickRef.current;
    mat.uniforms.uSnare!.value = snareRef.current;
    mat.uniforms.uLock!.value = lock;
    mat.uniforms.uEcho!.value = echoVis * echoMul;
    mat.uniforms.uEchoTravel!.value = traveling ? echoTravel.current : 1;
    (mat.uniforms.uEchoColor!.value as THREE.Color).copy(scratchEcho.current);
    if (groupRef.current) {
      groupRef.current.scale.setScalar(1 - leanRef.current * LEAN_SKY_PULL);
    }
    // Live palette: both fog colors track the (mutating) palette per frame.
    const colorA = mat.uniforms.uColorA!.value as THREE.Color;
    colorA.set(palette.bass);
    // Warm/cool drift toward the high color on positive valence.
    const warmth = Math.max(0, Math.min(1, 0.5 + m.moodValence * 0.4));
    const colorB = mat.uniforms.uColorB!.value as THREE.Color;
    colorB.lerpColors(
      scratchMid.current.set(palette.mid),
      scratchHigh.current.set(palette.high),
      warmth * 0.6,
    );
    // Voice → tenderness milk → afterglow amber (peaks still win).
    applyVocalWarmth(colorA, vocalLingerRef.current, scratchVocal.current);
    applyVocalWarmth(colorB, vocalLingerRef.current, scratchVocal.current);
    applyTenderWarmth(colorA, tender, scratchTender.current);
    applyTenderWarmth(colorB, tender, scratchTender.current);
    applyAfterglowWarmth(colorA, warmthLingerRef.current, scratchAmber.current);
    applyAfterglowWarmth(colorB, warmthLingerRef.current, scratchAmber.current);
  });

  return (
    <group ref={groupRef}>
      <SkySphere matRef={matRef} fragment={NEBULA_FRAGMENT} uniforms={uniforms} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Starfield — full spherical shell of stars, twinkle on highs.
// ---------------------------------------------------------------------------

const STAR_COUNT_HIGH = 1400;
const STAR_COUNT_MID = 700;
const STAR_COUNT_LOW = 280;

function Starfield({ intensity, palette, tier, reducedMotion }: ModeProps) {
  const groupRef = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.PointsMaterial>(null);
  const metricsRef = useMetricsRef();
  const scratchMid = useRef(new THREE.Color());
  const scratchHigh = useRef(new THREE.Color());
  const scratchVocal = useRef(new THREE.Color());
  const scratchTender = useRef(new THREE.Color());
  const scratchEcho = useRef(new THREE.Color().copy(ECHO_SILVER));
  const inhaleRef = useRef(0);
  const glitterRef = useRef(0);
  const leanRef = useRef(0);
  const lockRef = useRef(0);
  const echoSmooth = useRef(0);
  const echoTravel = useRef(1);
  const echoArmed = useRef(true);
  const prevEcho = useRef(0);
  const stillnessRef = useRef(0);
  const tenderRef = useRef(0);
  const vocalLingerRef = useRef(0);
  const sprite = useMemo(() => getDotTexture(), []);
  const count = tier === 'high' ? STAR_COUNT_HIGH : tier === 'mid' ? STAR_COUNT_MID : STAR_COUNT_LOW;
  const lockAmp = lockAmpForTier(tier);
  const echoAmp = echoAmpForTier(tier);

  const { positions, colors, starBand, starVariance } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const band = new Uint8Array(count);
    const variance = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // Uniform random direction (normalized gaussian) × a deep shell
      // radius — stars surround the camera in every direction.
      let x = 0;
      let y = 0;
      let z = 0;
      let len = 0;
      do {
        x = Math.random() * 2 - 1;
        y = Math.random() * 2 - 1;
        z = Math.random() * 2 - 1;
        len = Math.hypot(x, y, z);
      } while (len < 0.05 || len > 1);
      const r = 26 + Math.random() * 16;
      pos[i * 3] = (x / len) * r;
      pos[i * 3 + 1] = (y / len) * r;
      pos[i * 3 + 2] = (z / len) * r;
      band[i] = Math.random() < 0.7 ? 1 : 0;
      // Slight per-star brightness variance, applied at tint time.
      variance[i] = 0.5 + Math.random() * 0.5;
    }
    return { positions: pos, colors: col, starBand: band, starVariance: variance };
  }, [count]);

  useFrame((_s, delta) => {
    const m = metricsRef.current;
    const dt = Math.min(delta, 0.1);
    const g = groupRef.current;
    stillnessRef.current = smoothToward(
      stillnessRef.current,
      stillnessFromMetrics(m.holdBreath, m.silence),
      dt,
      STILLNESS_RISE_TAU,
      STILLNESS_FALL_TAU,
    );
    tenderRef.current = smoothToward(
      tenderRef.current,
      Math.min(1, m.tenderness),
      dt,
      TENDER_RISE_TAU,
      TENDER_FALL_TAU,
    );
    const stillness = stillnessRef.current;
    const tender = tenderRef.current;
    // Convergence: shell spin coheres into one shared axis; soft under hush.
    lockRef.current = smoothToward(
      lockRef.current,
      Math.min(1, Math.max(0, m.convergence ?? 0)) * lockAmp,
      dt,
      LOCK_RISE_TAU,
      LOCK_FALL_TAU,
    );
    const lock = lockRef.current * (1 - stillness * 0.3);
    const lockPace = 1 - lock * 0.38;
    // Phrase-echo: arm on quiet, fire one cool silver shell-glint train per gap.
    echoSmooth.current = smoothToward(
      echoSmooth.current,
      Math.min(1, m.echo) * echoAmp,
      dt,
      ECHO_RISE_TAU,
      ECHO_FALL_TAU,
    );
    const echoNow = echoSmooth.current;
    if (echoNow < 0.08) echoArmed.current = true;
    if (echoArmed.current && echoNow > 0.22 && prevEcho.current <= 0.22) {
      echoTravel.current = 0;
      echoArmed.current = false;
    }
    prevEcho.current = echoNow;
    if (echoTravel.current < 1) {
      const bpmEcho = m.bpm && m.bpm > 30 ? m.bpm : 120;
      echoTravel.current = Math.min(
        1,
        echoTravel.current + dt * 0.88 * (0.85 + bpmEcho / 180),
      );
    }
    const traveling = echoTravel.current < 1;
    const echoVis = traveling
      ? echoSmooth.current * (1 - echoTravel.current * 0.3)
      : echoSmooth.current * 0.04;
    const echoMul = 1 - stillness * 0.55;
    const motionMul =
      (1 - stillness * DRIFT_HUSH) * (1 - tender * DRIFT_TENDER) * lockPace;
    const glitterLive = (1 - stillness * GLITTER_HUSH) * (1 - tender * GLITTER_TENDER);
    const tenderDim = 1 - tender * TENDER_DIM;
    leanRef.current = smoothToward(leanRef.current, m.leanIn, dt, LEAN_RISE_TAU, LEAN_FALL_TAU);
    vocalLingerRef.current +=
      (Math.min(1, m.vocalActivity) - vocalLingerRef.current) *
      (1 - Math.exp(-dt / VOCAL_WARMTH_TAU));
    if (g && !reducedMotion) {
      // Very slow whole-sky rotation — hushes with holdBreath; eases on tenderness.
      // Lock collapses Z tumble into one coherent Y drift (shared sky axis).
      g.rotation.y += delta * 0.004 * motionMul * (1 + lock * 0.15);
      g.rotation.z += delta * 0.002 * motionMul * (1 - lock * 0.92);
    }
    if (g) {
      // Lean pulls the star shell toward the camera (anticipation).
      g.scale.setScalar(1 - leanRef.current * LEAN_STAR_PULL);
    }
    inhaleRef.current += (m.gather - inhaleRef.current) * (1 - Math.exp(-dt / 0.12));
    const glitterTarget = Math.min(1, m.shimmer * 0.95 + m.hat * 0.6);
    const glitterTau = glitterTarget > glitterRef.current ? 0.04 : 0.18;
    glitterRef.current +=
      (glitterTarget - glitterRef.current) * (1 - Math.exp(-dt / glitterTau));
    const glitter = glitterRef.current * glitterLive;
    const mat = matRef.current;
    if (mat) {
      // Twinkle: base size + high-frequency sparkle. Opacity capped.
      // Sized up ~4x vs the old near-slab because the shell sits ~30
      // units out (point size attenuates with distance).
      // Gather dims the field; tension swells through builds; shimmer/hat
      // glitter is a sharp tick distinct from bass flow. HoldBreath dims
      // glitter further so the shell listens without killing gather dim.
      // Tenderness warm-dims opacity while stars keep breathing.
      const gatherDim = 1 - inhaleRef.current * 0.32;
      mat.size = 0.26 + m.high * 0.45 + glitter * 0.38;
      mat.opacity = Math.min(
        STAR_OPACITY_CAP,
        (0.3 + m.high * 0.35 + m.flow * 0.15 + m.tension * 0.22 + glitter * 0.28) *
          intensity *
          gatherDim *
          tenderDim *
          (1 + lock * LOCK_BRIGHTEN),
      );
    }
    // Live palette: stars re-tint per frame so they follow color life.
    if (g) {
      const cAttr = g.geometry.getAttribute('color') as THREE.BufferAttribute;
      const cArr = cAttr.array as Float32Array;
      const pAttr = g.geometry.getAttribute('position') as THREE.BufferAttribute;
      const pArr = pAttr.array as Float32Array;
      const midC = scratchMid.current.set(palette.mid);
      const highC = scratchHigh.current.set(palette.high);
      const vocalT =
        Math.max(0, Math.min(1, vocalLingerRef.current)) * VOCAL_WARMTH_MIX;
      if (vocalT >= 0.001) {
        const warm = scratchVocal.current.copy(VOCAL_WARM);
        midC.lerp(warm, vocalT);
        highC.lerp(warm, vocalT);
      }
      const tenderT = Math.max(0, Math.min(1, tender)) * TENDER_WARMTH_MIX;
      if (tenderT >= 0.001) {
        const milk = scratchTender.current.copy(TENDER_WARM);
        midC.lerp(milk, tenderT);
        highC.lerp(milk, tenderT);
      }
      const echoC = scratchEcho.current;
      const travel = traveling ? echoTravel.current : 1;
      const echoAmt = echoVis * echoMul;
      for (let i = 0; i < count; i++) {
        const c = starBand[i] === 1 ? highC : midC;
        const v = starVariance[i]!;
        let r = c.r * v;
        let gch = c.g * v;
        let b = c.b * v;
        // Phrase-echo: cool silver shell glints sweeping azimuth (memory, not hat tick).
        if (echoAmt > 0.02) {
          const x = pArr[i * 3]!;
          const z = pArr[i * 3 + 2]!;
          const azN = Math.atan2(z, x) / (Math.PI * 2) + 0.5;
          let dist = Math.abs(azN - travel);
          dist = Math.min(dist, 1 - dist);
          const beat =
            0.45 +
            0.55 *
              Math.max(
                0,
                Math.sin(travel * Math.PI * 8 + (starVariance[i] ?? 0.5) * 14),
              );
          const glint =
            (traveling ? echoAmt * (1 - travel * 0.85) : echoAmt * 0.35) *
            Math.max(0, 1 - dist / 0.1) *
            beat;
          if (glint > 0.02) {
            const t = Math.min(0.85, glint * 0.9);
            r = r + (echoC.r - r) * t;
            gch = gch + (echoC.g - gch) * t;
            b = b + (echoC.b - b) * t;
          }
        }
        cArr[i * 3] = r;
        cArr[i * 3 + 1] = gch;
        cArr[i * 3 + 2] = b;
      }
      cAttr.needsUpdate = true;
    }
  });

  return (
    <points ref={groupRef} renderOrder={-10} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} count={count} itemSize={3} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} count={count} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        ref={matRef}
        size={0.3}
        map={sprite}
        sizeAttenuation
        transparent
        opacity={0.4}
        vertexColors
        depthWrite={false}
        depthTest
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// ---------------------------------------------------------------------------
// Aurora — shimmering curtains wrapping the full horizon, bass-driven.
// ---------------------------------------------------------------------------

const AURORA_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uIntensity;
  uniform float uInhale;
  uniform float uGlitter;
  uniform float uLean;
  uniform float uKick;
  uniform float uSnare;
  uniform float uLock;
  uniform float uEcho;
  uniform float uEchoTravel;
  uniform vec3 uEchoColor;
  varying vec3 vDir;
  ${NOISE_GLSL}
  void main() {
    vec3 d = normalize(vDir);
    float kick = clamp(uKick, 0.0, 1.2);
    float snare = clamp(uSnare, 0.0, 1.2);
    float lock = clamp(uLock, 0.0, 1.0);
    float lockSnap = lock * lock;
    float echo = clamp(uEcho, 0.0, 1.0);
    float travel = clamp(uEchoTravel, 0.0, 1.0);
    // Horizontal domain (seam-free): the direction's x/z components,
    // ignoring elevation — curtains wrap 360° around the viewer.
    // Snare shears the horizon domain laterally (aurora backbeat flick).
    // Lock softens shear so free billow yields to aligned parallel bands.
    vec3 flat3 = normalize(vec3(d.x + snare * 0.08 * (1.0 - lock * 0.75) * sign(d.x + 1e-4), 0.0, d.z) + 1e-4);
    float az = atan(flat3.z, flat3.x);
    // Lean zooms curtain detail (approach); gather drops the top edge.
    // Kick briefly opens the domain (depth pulse through the curtain).
    float leanZoom = 1.0 - uLean * 0.22 + kick * 0.06;
    float waveFree = fbmDir(flat3, 2.4 * leanZoom, vec2(uTime * 0.05 + snare * 0.12 * (1.0 - lock * 0.7) * sign(d.x + 1e-4), 0.0));
    // Locked: even azimuth spacing + slow shared scroll = parallel curtains.
    float bandWave = 0.5 + 0.5 * sin(az * 6.0 + uTime * 0.09);
    float wave = mix(waveFree, bandWave * 0.55 + 0.22, lockSnap);
    // Gather drops the curtain edge toward the horizon (inward inhale).
    // Kick lifts the ribbon slightly from depth (distinct from gather drop).
    // Lock flattens the top edge so bands read as one aligned train.
    float topEdge = 0.16 + mix(0.34, 0.14, lockSnap) * wave - uInhale * 0.14 + kick * 0.05;
    // Curtain: bright ribbon below its wavy top edge, fading out toward
    // the nadir so it hugs the horizon like the real thing.
    float curtain = smoothstep(topEdge, topEdge - mix(0.55, 0.42, lock), d.y) * smoothstep(-0.75, -0.25, d.y);
    // Free: noisy shimmer. Locked: vertical parallel striations, shared scroll.
    float shimmerFree = 0.55 + 0.45 * fbmDir(d, 7.0 * leanZoom, vec2(uTime * 0.18, uTime * 0.06));
    float striation = 0.55 + 0.45 * sin(d.y * 22.0 + uTime * 0.14 + az * 0.15);
    float shimmer = mix(shimmerFree, striation, lock * 0.82);
    // Hat glitter: sharp sparkle ticks on the curtain, not bass billow.
    float sparkle = noise(d.xz * 52.0 + vec2(uTime * 11.0, -uTime * 7.0));
    shimmer += uGlitter * (0.35 + 0.65 * sparkle) * (1.0 - lock * 0.35);
    float hueBand = clamp(d.y * 1.3 + 0.55, 0.0, 1.0);
    vec3 col = mix(uColorA, uColorB, hueBand + 0.2 * wave);
    // Phrase-echo: curtains flicker in sequence around the horizon (cool silver).
    float azN = az / 6.2831853 + 0.5;
    float curtainSlot = floor(azN * 6.0) / 6.0 + 1.0 / 12.0;
    float seq = abs(curtainSlot - travel);
    seq = min(seq, 1.0 - seq);
    float flicker = max(0.0, sin(travel * 3.14159265 * 10.0 + az * 3.0));
    float echoGlint = echo * (1.0 - travel * 0.85) * smoothstep(0.12, 0.0, seq)
                    * (0.45 + 0.55 * flicker) * curtain;
    col = mix(col, uEchoColor, clamp(echoGlint * 0.82, 0.0, 0.88));
    shimmer += echoGlint * 0.55;
    // Kick core pulse along denser curtain; snare flank flash at the sides.
    // Lock faint brighten — aligned bands glow together, not a kit punch.
    float corePulse = 1.0 + kick * 0.12 * curtain;
    float flank = smoothstep(0.2, 0.9, abs(d.x)) * (1.0 - abs(d.y) * 0.4);
    float a = curtain * shimmer * uIntensity * (1.0 - uInhale * 0.38) * (1.0 + uLean * 0.07)
            * corePulse * (1.0 + snare * 0.14 * flank) * (1.0 + lock * 0.12)
            * (1.0 + echoGlint * 0.28);
    gl_FragColor = vec4(col, a);
  }
`;

function Aurora({ intensity, palette, tier, reducedMotion }: ModeProps) {
  const groupRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const metricsRef = useMetricsRef();
  const scratchAmber = useRef(new THREE.Color());
  const scratchVocal = useRef(new THREE.Color());
  const scratchTender = useRef(new THREE.Color());
  const scratchEcho = useRef(new THREE.Color().copy(ECHO_SILVER));
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color(palette.bass) },
      uColorB: { value: new THREE.Color(palette.high) },
      uIntensity: { value: 0 },
      uInhale: { value: 0 },
      uGlitter: { value: 0 },
      uLean: { value: 0 },
      uKick: { value: 0 },
      uSnare: { value: 0 },
      uLock: { value: 0 },
      uEcho: { value: 0 },
      uEchoTravel: { value: 1 },
      uEchoColor: { value: new THREE.Color().copy(ECHO_SILVER) },
    }),
    [palette.bass, palette.high],
  );
  const timeRef = useRef(0);
  const levelRef = useRef(0);
  const inhaleRef = useRef(0);
  const glitterRef = useRef(0);
  const leanRef = useRef(0);
  const kickRef = useRef(0);
  const snareRef = useRef(0);
  const lockRef = useRef(0);
  const echoSmooth = useRef(0);
  const echoTravel = useRef(1);
  const echoArmed = useRef(true);
  const prevEcho = useRef(0);
  const stillnessRef = useRef(0);
  const tenderRef = useRef(0);
  const warmthLingerRef = useRef(0);
  const vocalLingerRef = useRef(0);

  useFrame((_s, delta) => {
    const m = metricsRef.current;
    const dt = Math.min(delta, 0.1);
    const kitAmp = kitAmpForTier(tier);
    const lockAmp = lockAmpForTier(tier);
    const echoAmp = echoAmpForTier(tier);
    stillnessRef.current = smoothToward(
      stillnessRef.current,
      stillnessFromMetrics(m.holdBreath, m.silence),
      dt,
      STILLNESS_RISE_TAU,
      STILLNESS_FALL_TAU,
    );
    tenderRef.current = smoothToward(
      tenderRef.current,
      Math.min(1, m.tenderness),
      dt,
      TENDER_RISE_TAU,
      TENDER_FALL_TAU,
    );
    const stillness = stillnessRef.current;
    const tender = tenderRef.current;
    // Convergence: curtains align into parallel bands; soft under hush.
    lockRef.current = smoothToward(
      lockRef.current,
      Math.min(1, Math.max(0, m.convergence ?? 0)) * lockAmp,
      dt,
      LOCK_RISE_TAU,
      LOCK_FALL_TAU,
    );
    const lock = lockRef.current * (1 - stillness * 0.3);
    const lockPace = 1 - lock * 0.38;
    // Phrase-echo: arm on quiet, fire one sequential curtain-flicker train per gap.
    echoSmooth.current = smoothToward(
      echoSmooth.current,
      Math.min(1, m.echo) * echoAmp,
      dt,
      ECHO_RISE_TAU,
      ECHO_FALL_TAU,
    );
    const echoNow = echoSmooth.current;
    if (echoNow < 0.08) echoArmed.current = true;
    if (echoArmed.current && echoNow > 0.22 && prevEcho.current <= 0.22) {
      echoTravel.current = 0;
      echoArmed.current = false;
    }
    prevEcho.current = echoNow;
    if (echoTravel.current < 1) {
      const bpmEcho = m.bpm && m.bpm > 30 ? m.bpm : 120;
      echoTravel.current = Math.min(
        1,
        echoTravel.current + dt * 0.88 * (0.85 + bpmEcho / 180),
      );
    }
    const traveling = echoTravel.current < 1;
    const echoVis = traveling
      ? echoSmooth.current * (1 - echoTravel.current * 0.3)
      : echoSmooth.current * 0.04;
    const echoMul = 1 - stillness * 0.55;
    const motionMul =
      (1 - stillness * DRIFT_HUSH) * (1 - tender * DRIFT_TENDER) * lockPace;
    timeRef.current += reducedMotion ? 0 : dt * motionMul;
    // Smooth the bass drive so curtains billow rather than flicker.
    // Tension swells through builds on top of the slow breath.
    const target =
      0.35 +
      m.bass * 0.6 +
      m.breath * 0.4 +
      m.tension * 0.48 +
      m.dropEvent * 0.3 +
      m.afterglow * 0.25;
    levelRef.current += (target - levelRef.current) * (1 - Math.exp(-dt / 0.4));
    inhaleRef.current += (m.gather - inhaleRef.current) * (1 - Math.exp(-dt / 0.12));
    const glitterTarget = Math.min(1, m.shimmer * 0.9 + m.hat * 0.55);
    const glitterTau = glitterTarget > glitterRef.current ? 0.05 : 0.2;
    glitterRef.current +=
      (glitterTarget - glitterRef.current) * (1 - Math.exp(-dt / glitterTau));
    leanRef.current = smoothToward(leanRef.current, m.leanIn, dt, LEAN_RISE_TAU, LEAN_FALL_TAU);
    // Kit accents stay on full dt so kick/snare still fire through holdBreath thaw.
    kickRef.current = smoothToward(
      kickRef.current,
      Math.min(1.2, m.kick) * kitAmp,
      dt,
      KIT_KICK_RISE_TAU,
      KIT_KICK_FALL_TAU,
    );
    snareRef.current = smoothToward(
      snareRef.current,
      Math.min(1.2, m.snare) * kitAmp,
      dt,
      KIT_SNARE_RISE_TAU,
      KIT_SNARE_FALL_TAU,
    );
    warmthLingerRef.current +=
      (m.afterglow - warmthLingerRef.current) * (1 - Math.exp(-dt / AFTERGLOW_WARMTH_TAU));
    vocalLingerRef.current +=
      (Math.min(1, m.vocalActivity) - vocalLingerRef.current) *
      (1 - Math.exp(-dt / VOCAL_WARMTH_TAU));
    const mat = matRef.current;
    if (!mat) return;
    mat.uniforms.uTime!.value = timeRef.current;
    const tenderDim = 1 - tender * TENDER_DIM;
    mat.uniforms.uIntensity!.value = Math.min(
      AURORA_CAP,
      levelRef.current * intensity * AURORA_CAP * tenderDim * (1 + lock * LOCK_BRIGHTEN),
    );
    mat.uniforms.uInhale!.value = inhaleRef.current;
    mat.uniforms.uGlitter!.value =
      glitterRef.current * (1 - stillness * GLITTER_HUSH) * (1 - tender * GLITTER_TENDER);
    mat.uniforms.uLean!.value = leanRef.current;
    mat.uniforms.uKick!.value = kickRef.current;
    mat.uniforms.uSnare!.value = snareRef.current;
    mat.uniforms.uLock!.value = lock;
    mat.uniforms.uEcho!.value = echoVis * echoMul;
    mat.uniforms.uEchoTravel!.value = traveling ? echoTravel.current : 1;
    (mat.uniforms.uEchoColor!.value as THREE.Color).copy(scratchEcho.current);
    if (groupRef.current) {
      groupRef.current.scale.setScalar(1 - leanRef.current * LEAN_SKY_PULL);
    }
    // Live palette: curtain colors track the (mutating) palette per frame.
    const colorA = mat.uniforms.uColorA!.value as THREE.Color;
    const colorB = mat.uniforms.uColorB!.value as THREE.Color;
    colorA.set(palette.bass);
    colorB.set(palette.high);
    applyVocalWarmth(colorA, vocalLingerRef.current, scratchVocal.current);
    applyVocalWarmth(colorB, vocalLingerRef.current, scratchVocal.current);
    applyTenderWarmth(colorA, tender, scratchTender.current);
    applyTenderWarmth(colorB, tender, scratchTender.current);
    applyAfterglowWarmth(colorA, warmthLingerRef.current, scratchAmber.current);
    applyAfterglowWarmth(colorB, warmthLingerRef.current, scratchAmber.current);
  });

  return (
    <group ref={groupRef}>
      <SkySphere matRef={matRef} fragment={AURORA_FRAGMENT} uniforms={uniforms} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Glow — a soft energy source that slowly orbits the sky and breathes.
// ---------------------------------------------------------------------------

const GLOW_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uSunDir;
  uniform float uIntensity;
  uniform float uInhale;
  uniform float uGlitter;
  uniform float uLean;
  uniform float uKick;
  uniform float uSnare;
  uniform float uLock;
  uniform float uEcho;
  uniform float uEchoTravel;
  uniform vec3 uEchoColor;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float kick = clamp(uKick, 0.0, 1.2);
    float snare = clamp(uSnare, 0.0, 1.2);
    float lock = clamp(uLock, 0.0, 1.0);
    float echo = clamp(uEcho, 0.0, 1.0);
    float travel = clamp(uEchoTravel, 0.0, 1.0);
    // Snare flicks the sample direction sideways so the halo cracks laterally.
    // Lock softens shear so the source steadies into one coherent disc.
    vec3 dSample = normalize(d + vec3(snare * 0.07 * (1.0 - lock * 0.7) * sign(d.x + 1e-4), 0.0, 0.0));
    // Wide soft halo around the drifting energy source...
    // Gather tightens the core (inward inhale); lean gently focuses it.
    // Kick softens the falloff (depth pulse from the glow core).
    // Lock steadies the falloff (slightly tighter, not gather's inhale pinch).
    float core = pow(max(dot(dSample, uSunDir), 0.0), 3.0 + uInhale * 2.2 + uLean * 0.9 - kick * 0.85 + lock * 0.55);
    // ...plus a faint horizon glow so the rest of the sky isn't dead.
    float horizon = (1.0 - abs(d.y)) * 0.18 * (1.0 - uInhale * 0.35) * (1.0 + lock * 0.12);
    float sparkle = fract(sin(dot(d.xy, vec2(12.9898, 78.233))) * 43758.5453);
    float glitter = 1.0 + uGlitter * (0.2 + 0.8 * sparkle) * (1.0 - lock * 0.4);
    float flank = smoothstep(0.2, 0.95, abs(d.x)) * (1.0 - abs(d.y) * 0.5);
    // Phrase-echo: cool silver pulse chasing around the sky (memory, not kick).
    float azN = atan(d.z, d.x) / 6.2831853 + 0.5;
    float train = abs(azN - travel);
    train = min(train, 1.0 - train);
    float beatPulse = 0.5 + 0.5 * sin(travel * 3.14159265 * 8.0 + core * 10.0);
    float echoGlint = echo * (1.0 - travel * 0.85) * smoothstep(0.1, 0.0, train)
                    * (0.4 + 0.6 * beatPulse);
    vec3 col = mix(uColor, uEchoColor, clamp(echoGlint * 0.75, 0.0, 0.85));
    float a = (core + horizon) * uIntensity * (1.0 - uInhale * 0.3) * (1.0 + uLean * 0.06)
            * glitter * (1.0 + kick * 0.16 * core) * (1.0 + snare * 0.12 * flank)
            * (1.0 + lock * 0.1) * (1.0 + echoGlint * 0.24);
    gl_FragColor = vec4(col, a);
  }
`;

function Glow({ intensity, palette, tier, reducedMotion }: ModeProps) {
  const groupRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const metricsRef = useMetricsRef();
  const scratchBass = useRef(new THREE.Color());
  const scratchMid = useRef(new THREE.Color());
  const scratchAmber = useRef(new THREE.Color());
  const scratchVocal = useRef(new THREE.Color());
  const scratchTender = useRef(new THREE.Color());
  const scratchEcho = useRef(new THREE.Color().copy(ECHO_SILVER));
  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color(palette.mid) },
      uSunDir: { value: new THREE.Vector3(0, 0.2, -1).normalize() },
      uIntensity: { value: 0 },
      uInhale: { value: 0 },
      uGlitter: { value: 0 },
      uLean: { value: 0 },
      uKick: { value: 0 },
      uSnare: { value: 0 },
      uLock: { value: 0 },
      uEcho: { value: 0 },
      uEchoTravel: { value: 1 },
      uEchoColor: { value: new THREE.Color().copy(ECHO_SILVER) },
    }),
    [palette.mid],
  );
  const tRef = useRef(0);
  const inhaleRef = useRef(0);
  const glitterRef = useRef(0);
  const leanRef = useRef(0);
  const kickRef = useRef(0);
  const snareRef = useRef(0);
  const lockRef = useRef(0);
  const echoSmooth = useRef(0);
  const echoTravel = useRef(1);
  const echoArmed = useRef(true);
  const prevEcho = useRef(0);
  const stillnessRef = useRef(0);
  const tenderRef = useRef(0);
  const warmthLingerRef = useRef(0);
  const vocalLingerRef = useRef(0);

  useFrame((_s, delta) => {
    const m = metricsRef.current;
    const dt = Math.min(delta, 0.1);
    const kitAmp = kitAmpForTier(tier);
    const lockAmp = lockAmpForTier(tier);
    const echoAmp = echoAmpForTier(tier);
    stillnessRef.current = smoothToward(
      stillnessRef.current,
      stillnessFromMetrics(m.holdBreath, m.silence),
      dt,
      STILLNESS_RISE_TAU,
      STILLNESS_FALL_TAU,
    );
    tenderRef.current = smoothToward(
      tenderRef.current,
      Math.min(1, m.tenderness),
      dt,
      TENDER_RISE_TAU,
      TENDER_FALL_TAU,
    );
    const stillness = stillnessRef.current;
    const tender = tenderRef.current;
    // Convergence: glow steadies into one coherent disc; soft under hush.
    lockRef.current = smoothToward(
      lockRef.current,
      Math.min(1, Math.max(0, m.convergence ?? 0)) * lockAmp,
      dt,
      LOCK_RISE_TAU,
      LOCK_FALL_TAU,
    );
    const lock = lockRef.current * (1 - stillness * 0.3);
    const lockPace = 1 - lock * 0.38;
    // Phrase-echo: arm on quiet, fire one cool silver halo-chase train per gap.
    echoSmooth.current = smoothToward(
      echoSmooth.current,
      Math.min(1, m.echo) * echoAmp,
      dt,
      ECHO_RISE_TAU,
      ECHO_FALL_TAU,
    );
    const echoNow = echoSmooth.current;
    if (echoNow < 0.08) echoArmed.current = true;
    if (echoArmed.current && echoNow > 0.22 && prevEcho.current <= 0.22) {
      echoTravel.current = 0;
      echoArmed.current = false;
    }
    prevEcho.current = echoNow;
    if (echoTravel.current < 1) {
      const bpmEcho = m.bpm && m.bpm > 30 ? m.bpm : 120;
      echoTravel.current = Math.min(
        1,
        echoTravel.current + dt * 0.88 * (0.85 + bpmEcho / 180),
      );
    }
    const traveling = echoTravel.current < 1;
    const echoVis = traveling
      ? echoSmooth.current * (1 - echoTravel.current * 0.3)
      : echoSmooth.current * 0.04;
    const echoMul = 1 - stillness * 0.55;
    const motionMul =
      (1 - stillness * DRIFT_HUSH) * (1 - tender * DRIFT_TENDER) * lockPace;
    tRef.current += reducedMotion ? 0 : dt * motionMul;
    const mat = matRef.current;
    if (!mat) return;
    // The energy source drifts around the sky over ~4 minutes and bobs
    // gently in elevation — walking around it (orbit/flow cameras) works.
    // HoldBreath nearly freezes the orbit so the glow listens with the sky.
    // Tenderness eases the orbit without freezing — still breathes.
    // Lock steadies azimuth crawl + elevation bob (coherent disc, not hush freeze).
    const az = tRef.current * 0.026;
    const elBob = Math.sin(tRef.current * 0.05) * 0.25 * (1 - lock * 0.78);
    const el = 0.15 + elBob;
    (mat.uniforms.uSunDir!.value as THREE.Vector3)
      .set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el))
      .normalize();
    // Slow autonomous breath plus energy swell; tension builds; drops punch.
    // Lock damps autonomous wobble so the disc steadies while bands lock.
    const autoBreath = 0.45 + 0.12 * Math.sin(tRef.current * 0.4) * (1 - lock * 0.7);
    const swell =
      autoBreath +
      m.flow * 0.5 +
      m.bass * 0.3 +
      m.tension * 0.4 +
      m.dropEvent * 0.4 +
      m.afterglow * 0.3;
    const silenceMute = 1 - m.silence * 0.5;
    const tenderDim = 1 - tender * TENDER_DIM;
    inhaleRef.current += (m.gather - inhaleRef.current) * (1 - Math.exp(-dt / 0.12));
    const glitterTarget = Math.min(1, m.shimmer * 0.85 + m.hat * 0.5);
    const glitterTau = glitterTarget > glitterRef.current ? 0.05 : 0.22;
    glitterRef.current +=
      (glitterTarget - glitterRef.current) * (1 - Math.exp(-dt / glitterTau));
    leanRef.current = smoothToward(leanRef.current, m.leanIn, dt, LEAN_RISE_TAU, LEAN_FALL_TAU);
    // Kit accents stay on full dt so kick/snare still fire through holdBreath thaw.
    kickRef.current = smoothToward(
      kickRef.current,
      Math.min(1.2, m.kick) * kitAmp,
      dt,
      KIT_KICK_RISE_TAU,
      KIT_KICK_FALL_TAU,
    );
    snareRef.current = smoothToward(
      snareRef.current,
      Math.min(1.2, m.snare) * kitAmp,
      dt,
      KIT_SNARE_RISE_TAU,
      KIT_SNARE_FALL_TAU,
    );
    warmthLingerRef.current +=
      (m.afterglow - warmthLingerRef.current) * (1 - Math.exp(-dt / AFTERGLOW_WARMTH_TAU));
    vocalLingerRef.current +=
      (Math.min(1, m.vocalActivity) - vocalLingerRef.current) *
      (1 - Math.exp(-dt / VOCAL_WARMTH_TAU));
    mat.uniforms.uIntensity!.value = Math.min(
      GLOW_CAP,
      swell * silenceMute * intensity * GLOW_CAP * tenderDim * (1 + lock * LOCK_BRIGHTEN),
    );
    mat.uniforms.uInhale!.value = inhaleRef.current;
    mat.uniforms.uGlitter!.value =
      glitterRef.current * (1 - stillness * GLITTER_HUSH) * (1 - tender * GLITTER_TENDER);
    mat.uniforms.uLean!.value = leanRef.current;
    mat.uniforms.uKick!.value = kickRef.current;
    mat.uniforms.uSnare!.value = snareRef.current;
    mat.uniforms.uLock!.value = lock;
    mat.uniforms.uEcho!.value = echoVis * echoMul;
    mat.uniforms.uEchoTravel!.value = traveling ? echoTravel.current : 1;
    (mat.uniforms.uEchoColor!.value as THREE.Color).copy(scratchEcho.current);
    if (groupRef.current) {
      groupRef.current.scale.setScalar(1 - leanRef.current * LEAN_SKY_PULL);
    }
    // Warm vs cool target color follows mood valence.
    const warmth = Math.max(0, Math.min(1, 0.5 + m.moodValence * 0.4));
    const color = mat.uniforms.uColor!.value as THREE.Color;
    color.lerpColors(
      scratchBass.current.set(palette.bass),
      scratchMid.current.set(palette.mid),
      warmth,
    );
    applyVocalWarmth(color, vocalLingerRef.current, scratchVocal.current);
    applyTenderWarmth(color, tender, scratchTender.current);
    applyAfterglowWarmth(color, warmthLingerRef.current, scratchAmber.current);
  });

  return (
    <group ref={groupRef}>
      <SkySphere matRef={matRef} fragment={GLOW_FRAGMENT} uniforms={uniforms} />
    </group>
  );
}

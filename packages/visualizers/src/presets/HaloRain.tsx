'use client';

/**
 * Halo Rain — fullscreen concentric luminous rings between Star Field dust
 * and Cosmic Mandala geometry. Musical anatomy:
 *  - idle → rings drift downward like celestial rain
 *  - gather → reverse-inhale: drift flips upward and radii tighten to center
 *  - leanIn → tighten ring spacing + drift nearer (pre-drop anticipation; not gather inhale)
 *  - tension → storm coil: denser spacing + darken + inward-accelerating drift (not lean zoom)
 *  - dropEvent → one full-field outward ring wave — every ring flares, then calms
 *  - impact → rings flare bright (soft flash, not a strobe)
 *  - kick → center-born ring pulse (radial outward surge + bass-warm core)
 *  - snare → lateral ring shear + flank flash (backbeat crack)
 *  - hat → sparse ring brightness ticks (distinct from impact flare)
 *  - echo → one-shot upward rain reverse + ring after-image in phrase gaps
 *  - holdBreath / deep silence → suspend ring fall mid-air + dim to still glow
 *  - tenderness → warm candlelit hush (softer rings, honey light) — gentling, not a freeze
 */

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';
import { useModulation } from '../modulation';

const RINGS_HIGH = 14;
const RINGS_MID = 10;
const RINGS_LOW = 6;

function buildFragmentShader(ringCount: number): string {
  return /* glsl */ `
#define RING_COUNT ${ringCount}

uniform vec2 uResolution;
uniform float uTime;
uniform float uDrift;
uniform float uGather;
uniform float uImpact;
uniform float uKick;
uniform float uSnare;
uniform float uHat;
uniform float uBass;
uniform float uMid;
uniform float uHigh;
uniform float uSwell;
uniform float uAfterglow;
uniform float uEnergy;
uniform float uBarPhase;
uniform float uBgAlpha;
uniform float uEcho;
uniform float uEchoTravel;
uniform float uStillness;
uniform float uTenderness;
uniform float uLean;
uniform float uTension;
uniform float uDrop;
uniform float uDropTravel;
uniform vec3 uColorBass;
uniform vec3 uColorMid;
uniform vec3 uColorHigh;

float hash11(float n) {
  return fract(sin(n * 127.1) * 43758.5453);
}

// Soft luminous ring profile around a target radius.
float ringLine(float r, float target, float width) {
  float d = abs(r - target);
  return exp(-d * d / max(width * width, 1e-5));
}

vec3 skyWash(vec2 uv, float r) {
  vec3 deep = uColorBass * 0.18;
  vec3 mid = uColorMid * 0.38;
  vec3 rim = mix(uColorHigh, vec3(1.0), 0.12) * 0.5;
  vec3 col = mix(deep, mid, smoothstep(0.0, 0.9, r));
  col = mix(col, rim, smoothstep(0.5, 1.4, r) * 0.5);
  // Gentle vertical rain gradient — darker above, luminous below.
  col *= 0.85 + 0.2 * smoothstep(-1.1, 0.9, uv.y);
  return col;
}

void main() {
  vec2 res = max(uResolution, vec2(1.0));
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / min(res.x, res.y);

  float kick = clamp(uKick, 0.0, 1.2);
  float snare = clamp(uSnare, 0.0, 1.2);
  float soft = clamp(uTenderness, 0.0, 1.0);
  float stillness = clamp(uStillness, 0.0, 1.0);
  float lean = clamp(uLean, 0.0, 1.0);
  float tension = clamp(uTension, 0.0, 1.0);
  float drop = clamp(uDrop, 0.0, 1.4);
  float dropTravel = clamp(uDropTravel, 0.0, 1.0);
  // Half-sine travel envelope — one outward wave crest, then settles.
  float dropPulse = drop * sin(min(dropTravel, 1.0) * 3.14159265)
    * step(dropTravel, 0.999);

  // Gather reverse-inhale: pull space toward center before the beat.
  float fold = uGather * 0.62;
  float r0 = length(uv) + 1e-4;
  // Kick: brief radial zoom punch so a new ring is born at the core.
  uv *= 1.0 - fold * (0.5 + 0.5 * smoothstep(0.12, 1.15, r0)) + kick * 0.055;
  // LeanIn: isotropic approach zoom — rings drift nearer (not gather's radial fold).
  // Tension stays in-place (no lean zoom); dropPulse briefly opens the field.
  uv *= 1.0 - lean * 0.12 + dropPulse * 0.035;
  // Snare: lateral ring shear before radius sampling (backbeat crack).
  uv.x += snare * 0.048 * sign(uv.x + 1e-4);

  float r = length(uv);
  float ang = atan(uv.y, uv.x);
  // Snare also twists ring phase slightly so ellipses crack sideways.
  ang += snare * 0.1 * sign(sin(ang * 2.0 + 0.35));

  // Soft elliptical breathe so rings feel alive, not compass-perfect.
  // holdBreath gates uTime advance in JS so oval nearly freezes.
  // Tension hardens the oval (storm bite); dropPulse softens for the wash.
  float oval = 1.0 + sin(ang * 2.0 + uTime * 0.35) * (0.03 + uMid * 0.04)
    * mix(1.0, 0.12, stillness)
    * (1.0 - tension * 0.55 + dropPulse * 0.25);
  r *= oval;

  // Phrase-echo reply envelope: peaks early, fades as the ghost travels.
  float echoPulse = uEcho * (1.0 - uEchoTravel * 0.85);

  // Downward rain = positive drift; gather flips sign and slows the fall.
  // Echo reverse is applied in JS to uDrift itself (brief upward reply).
  // Tension accelerates inward (faster scroll, denser fall) — not gather reverse.
  float rain = uDrift * (1.0 - uGather * 1.35) * (1.0 + tension * 0.85);
  // LeanIn tightens ring spacing — denser field, expectant (not gather fold).
  // Tension densifies further (storm coil); dropPulse briefly opens spacing.
  float spacing = (0.115 + uSwell * 0.018)
    * (1.0 - lean * 0.42)
    * (1.0 - tension * 0.58)
    * (1.0 + dropPulse * 0.28);
  // Kick thickens the ring line at the core; impact width path stays separate.
  // Tenderness widens rings (softer candle edge); kit width paths stay intact.
  // Tension sharpens lines; dropPulse flares them wide for the full-field wave.
  float width = 0.012 + uBass * 0.006 + uImpact * 0.01 + kick * 0.008
    + dropPulse * 0.022;
  width *= mix(1.0, 1.38, soft);
  width *= mix(1.0, 0.72, tension);

  float rings = 0.0;
  float hatTick = 0.0;
  float ghostRings = 0.0;
  float phase = rain;
  // Ghost field scrolls opposite the live rain — after-image, not a second gather.
  float ghostPhase = -uEchoTravel * 1.55;
  // Drop wave crest rides core→rim once — full-field, not kick's local core.
  float dropCrestR = mix(0.06, 1.38, dropTravel);

  for (int i = 0; i < RING_COUNT; i++) {
    float fi = float(i);
    float seed = hash11(fi * 17.13 + 3.7);
    // Staggered radii scroll through the frame — rain falling past the lens.
    // Kick pushes targets outward from center (center-born pulse).
    // Drop surges ALL rings outward together (full-field wave, bigger than kick).
    float target = fract(fi * spacing + phase * 0.55 + seed * 0.08) * 1.45;
    target *= 1.0 + kick * 0.12 * (1.0 - smoothstep(0.05, 0.85, target));
    target *= 1.0 + dropPulse * 0.28;
    // Tension pulls targets slightly inward (storm gathering) without gather fold.
    target *= 1.0 - tension * 0.12 * smoothstep(0.2, 1.2, target);
    float line = ringLine(r, target, width * (0.85 + seed * 0.4));
    // Outer rings slightly thinner so the core owns the frame;
    // leanIn hugs weight toward the nearer core (presence, not gather reverse).
    // Tension weights the denser mid field; dropPulse lifts every ring equally.
    float weight = mix(1.15 + lean * 0.18, 0.55 - lean * 0.1, smoothstep(0.15, 1.25, target));
    weight *= 1.0 + tension * 0.22 + dropPulse * 0.55;
    rings += line * weight;

    // Hat ticks sparse rings (every ~3rd) — sparkle without washing the flare.
    float tickSelect = step(0.62, fract(seed * 5.17 + fi * 0.31));
    hatTick += line * tickSelect * weight;

    // Ghost rings: cooler after-image field, offset reverse of live rain.
    float ghostTarget = fract(fi * spacing + ghostPhase * 0.55 + seed * 0.11) * 1.45;
    float ghostLine = ringLine(r, ghostTarget, width * (1.05 + seed * 0.35));
    ghostRings += ghostLine * weight;
  }

  // Tenderness softens ring bite; holdBreath eases field contrast toward still glow.
  // Tension hardens contrast (storm bite) before the drop wash softens it.
  float contrast = mix(1.0, 0.58, stillness);
  contrast *= 1.0 + tension * 0.28 - dropPulse * 0.12;
  rings = clamp(rings * contrast, 0.0, 2.6);
  hatTick = clamp(hatTick * mix(1.0, 0.72, stillness), 0.0, 1.6);
  ghostRings = clamp(ghostRings, 0.0, 2.0);
  // Soft crest rides core→rim so the reply reads as a traveling after-image.
  float crestR = mix(0.1, 1.32, clamp(uEchoTravel, 0.0, 1.0));
  float ghostCrest = exp(-pow((r - crestR) * 6.5, 2.0));
  // Drop crest: luminous expanding ring wave across the whole field.
  float dropCrest = exp(-pow((r - dropCrestR) * 4.2, 2.0)) * dropPulse;

  // Impact flare: brighten + slight radial bloom of the ring field.
  float flare = uImpact * (0.85 + rings * 0.55);
  rings *= 0.7 + uSwell * 0.45 + flare * 0.9 + uEnergy * 0.12 + kick * 0.18
    + dropPulse * 0.55;
  rings += flare * 0.35 * exp(-r * r * 2.2);
  // Kick: soft center-born ring pulse (local core surge, not a fullscreen wash).
  rings += kick * 0.42 * exp(-r * r * 3.4);
  // Drop: full-field outward wave — crest + sheet lift, clearly bigger than kick.
  rings += dropCrest * 1.35 + dropPulse * 0.55 * (0.45 + 0.55 * (1.0 - smoothstep(0.1, 1.35, r)));

  vec3 body = skyWash(uv, r);
  body *= 0.55 + uEnergy * 0.22 + uAfterglow * 0.28;
  // Tension storm-darkens the sky (value only); dropPulse briefly lifts it.
  body *= mix(1.0, 0.38, tension);
  body = mix(body, body * 1.45, dropPulse * 0.5);

  // Palette ride: bass core → mid body → high outer glitter.
  float tCol = clamp(r * 0.85 + rings * 0.15, 0.0, 1.0);
  vec3 ringCol = mix(uColorBass, uColorMid, smoothstep(0.0, 0.55, tCol));
  ringCol = mix(ringCol, uColorHigh, smoothstep(0.4, 1.1, tCol));
  vec3 warm = mix(uColorBass, vec3(1.0, 0.78, 0.48), 0.5);
  ringCol = mix(ringCol, warm, uAfterglow * 0.4);
  // Kick bass-warms the core; snare cracks toward cooler mid/white.
  ringCol = mix(ringCol, mix(uColorBass, vec3(0.95, 0.88, 0.78), 0.35), kick * 0.36);
  ringCol = mix(ringCol, mix(uColorMid, vec3(0.96, 0.98, 1.0), 0.48), snare * 0.3);
  // Tension cools toward deep storm bass (not tenderness honey / hush glow).
  ringCol = mix(ringCol, uColorBass * 0.55, tension * 0.55 * (0.35 + rings * 0.35));
  // Drop flashes cool-white across the field (bigger than kick warm core).
  ringCol = mix(ringCol, vec3(0.92, 0.97, 1.0), dropPulse * 0.58);
  // Tenderness: candlelit honey soften — warm pale wash, distinct from holdBreath hush.
  vec3 candleHoney = mix(warm, vec3(1.0, 0.9, 0.72), 0.55);
  ringCol = mix(ringCol, candleHoney, soft * 0.48);
  body = mix(body, mix(body, candleHoney * 0.5, 0.45), soft * 0.38);
  // holdBreath cools contrast toward a quiet still glow (not tenderness warmth).
  vec3 hushGlow = mix(uColorBass, vec3(0.28, 0.3, 0.42), 0.4) * 0.55;
  ringCol = mix(ringCol, mix(ringCol, hushGlow, 0.35), stillness * 0.42);
  body *= mix(1.0, 0.72, stillness);

  vec3 col = body;
  col += ringCol * rings * (0.55 + flare * 0.55 + kick * 0.2 + dropPulse * 0.85);
  col += mix(uColorHigh, vec3(0.9, 0.95, 1.0), 0.45) * dropCrest * 1.15;
  // Snare flank flash along the ring sides (distinct from kick core / hat ticks).
  float flank = smoothstep(0.25, 0.95, abs(uv.x)) * exp(-r * r * 1.15);
  col += mix(uColorMid, vec3(0.94, 0.97, 1.0), 0.4) * flank * snare * 0.55;
  // Hat ticks: cool high-band glitter on selected rings; hangs during holdBreath.
  col += mix(uColorHigh, vec3(1.0), 0.25) * hatTick * uHat * 1.15 * mix(1.0, 0.85, soft);
  // Residual ring hang glow while listening (visible without hat ticks).
  col += mix(uColorHigh, warm, 0.35) * rings * stillness * 0.18;
  col += warm * uAfterglow * (0.1 + rings * 0.12) * mix(1.0, 1.1, soft);

  // Ghost reply: cooler ring after-image + traveling crest — distinct from
  // gather inhale (fold), impact flare, kit accents, and hat ticks.
  vec3 ghostCol = mix(uColorHigh, vec3(0.82, 0.9, 1.0), 0.55);
  col += ghostCol * (ghostRings * 0.5 + ghostCrest * 0.75) * echoPulse;

  // Soft downbeat wink — never a hard strobe.
  float barFlash = pow(1.0 - uBarPhase, 9.0) * (0.06 + uImpact * 0.1);
  col += uColorHigh * barFlash;

  float vig = 1.0 - smoothstep(0.8, 1.55, r);
  col *= 0.58 + 0.42 * vig;

  float alpha = mix(0.7 + rings * 0.25 + uAfterglow * 0.1, 1.0, uBgAlpha);
  alpha = clamp(alpha, 0.0, 1.0);
  if (uBgAlpha < 0.5) {
    float edge = smoothstep(1.3, 0.3, r);
    alpha *= 0.32 + edge * 0.68;
    col *= 0.88 + rings * 0.28;
  }

  gl_FragColor = vec4(col, alpha);
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

export function HaloRainScene({
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
  const driftRef = useRef(0);
  const gatherSmooth = useRef(0);
  const impactSmooth = useRef(0);
  const kickSmooth = useRef(0);
  const snareSmooth = useRef(0);
  const hatSmooth = useRef(0);
  const swellSmooth = useRef(0.15);
  const afterglowSmooth = useRef(0);
  const echoSmooth = useRef(0);
  const echoTravel = useRef(1); // 0..1 traveling; >=1 idle
  const echoArmed = useRef(true);
  const prevEcho = useRef(0);
  // Hold-breath / deep-silence listen gate — freeze/thaw without pops.
  const stillnessSmooth = useRef(0);
  // Tenderness hush — candlelit softens ring bite on gentle vocals.
  const tenderSmooth = useRef(0);
  // LeanIn anticipation — approach + ring-spacing tighten before the drop.
  const leanSmooth = useRef(0);
  // Tension coil — denser/darker inward storm; spring-loose on drop/release.
  const tensionSmooth = useRef(0);
  // Drop envelope + one-shot full-field outward ring wave travel.
  const dropSmooth = useRef(0);
  const dropTravel = useRef(1); // 0..1 traveling; >=1 idle

  const reducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const ringCount = tier === 'high' ? RINGS_HIGH : tier === 'mid' ? RINGS_MID : RINGS_LOW;
  const kitAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  const echoAmp = tier === 'low' ? 0.7 : tier === 'mid' ? 0.9 : 1;
  // Soft-metric amps: full on high, gentle mid, restrained low.
  const stillAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  const tenderAmp = tier === 'low' ? 0.7 : tier === 'mid' ? 0.9 : 1;
  const leanAmp = tier === 'low' ? 0.7 : tier === 'mid' ? 0.9 : 1;
  const tensionAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  const dropAmp = tier === 'low' ? 0.7 : tier === 'mid' ? 0.9 : 1;
  const fragmentShader = useMemo(() => buildFragmentShader(ringCount), [ringCount]);

  const uniforms = useMemo(
    () => ({
      uResolution: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uDrift: { value: 0 },
      uGather: { value: 0 },
      uImpact: { value: 0 },
      uKick: { value: 0 },
      uSnare: { value: 0 },
      uHat: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uHigh: { value: 0 },
      uSwell: { value: 0.15 },
      uAfterglow: { value: 0 },
      uEnergy: { value: 0 },
      uBarPhase: { value: 0 },
      uBgAlpha: { value: 1 },
      uEcho: { value: 0 },
      uEchoTravel: { value: 1 },
      uStillness: { value: 0 },
      uTenderness: { value: 0 },
      uLean: { value: 0 },
      uTension: { value: 0 },
      uDrop: { value: 0 },
      uDropTravel: { value: 1 },
      uColorBass: { value: new THREE.Color(palette.bass) },
      uColorMid: { value: new THREE.Color(palette.mid) },
      uColorHigh: { value: new THREE.Color(palette.high) },
    }),
    // Colors rewritten every frame from the living palette.
    [],
  );

  useFrame((_state, delta) => {
    const mat = matRef.current;
    if (!mat) return;
    const m = metricsRef.current;
    const dt = Math.min(delta, 0.1);
    const pace = Math.max(0.05, mods.current.speed ?? speed);
    const calm = reducedMotion ? 0.35 : 1;

    // Hold-breath stillness: the rain listens instead of falling through quiet.
    // Rise a touch slower than fall so the freeze feels attentive; thaw
    // promptly when music returns so gather/kit accents still fire.
    const stillnessTarget = Math.min(
      1,
      Math.max(m.holdBreath, m.silence * 0.92) + Math.min(m.holdBreath, m.silence) * 0.15,
    );
    stillnessSmooth.current = smoothToward(
      stillnessSmooth.current,
      stillnessTarget * stillAmp,
      dt,
      0.14,
      0.08,
    );
    const stillness = stillnessSmooth.current;
    // Nearly freeze continuous rain; leave a whisper so thaw never pops.
    const motionMul = 1 - stillness * 0.92;

    // Tenderness hush — soft rise/fall so rings ease into candlelit soft.
    tenderSmooth.current = smoothToward(
      tenderSmooth.current,
      Math.min(1, m.tenderness) * tenderAmp,
      dt,
      0.12,
      0.22,
    );

    // Tension early so rain pace can accelerate during the build.
    // Sustained storm coil — spring-loose on drop/release. Distinct from leanIn
    // approach zoom (densify + darken + inward drift in place).
    let tensionTarget = Math.min(1, m.tension) * tensionAmp;
    if (m.dropEvent > 0.45 || m.release > 0.55) tensionTarget = 0;
    tensionSmooth.current = smoothToward(
      tensionSmooth.current,
      tensionTarget,
      dt,
      0.1,
      0.22,
    );
    if (m.dropEvent > 0.45) {
      tensionSmooth.current = smoothToward(tensionSmooth.current, 0, dt, 0.04, 0.04);
    }
    const tension = tensionSmooth.current * (1 - stillness * 0.3);

    // Drop envelope — one-shot travel fires when the drop crest hits.
    dropSmooth.current = smoothToward(
      dropSmooth.current,
      Math.min(1.35, m.dropEvent * 1.05 + m.impact * 0.2 + m.release * 0.12) * dropAmp,
      dt,
      0.03,
      0.55,
    );
    const drop = dropSmooth.current;
    if (drop > 0.45 && dropTravel.current >= 1) {
      dropTravel.current = 0;
    }
    if (dropTravel.current < 1) {
      const bpm = m.bpm && m.bpm > 30 ? m.bpm : 120;
      const dropPace = 0.9 + pace * 0.15;
      dropTravel.current = Math.min(
        1,
        dropTravel.current + dt * dropPace * (0.9 + bpm / 200),
      );
    }

    // LeanIn: fast climb into anticipation, slower release into the drop.
    // Soften only a little under holdBreath so approach still reads through hush.
    leanSmooth.current = smoothToward(
      leanSmooth.current,
      Math.min(1, m.leanIn) * leanAmp,
      dt,
      0.06,
      0.18,
    );
    const lean = leanSmooth.current * (1 - stillness * 0.35);

    // Tenderness eases section pace so intimate moments feel held, not torn.
    // Tension slightly strains the clock (storm gathering); drop does not freeze it.
    const sectionPace =
      (0.75 + m.sectionLevel * 0.45) *
      (1 - tenderSmooth.current * 0.28) *
      (1 - tension * 0.18);

    // holdBreath gates oval / rain clocks; kit envelopes stay on full dt.
    timeRef.current +=
      dt * pace * sectionPace * calm * motionMul * (0.5 + m.swell * 0.65 + m.impact * 0.2);

    // Gather / impact / kit stay on full dt so replies still fire on thaw.
    gatherSmooth.current = smoothToward(gatherSmooth.current, m.gather, dt, 0.04, 0.14);
    swellSmooth.current = smoothToward(swellSmooth.current, m.swell, dt, 0.12, 0.45);
    impactSmooth.current = smoothToward(
      impactSmooth.current,
      Math.min(1.2, m.impact * 0.95 + m.release * 0.15) * kitAmp,
      dt,
      0.03,
      0.16,
    );
    // Kit accents: kick pulses fast / falls medium; snare shears fast;
    // hat ticks stay on the sparse ring path below.
    kickSmooth.current = smoothToward(
      kickSmooth.current,
      Math.min(1.2, m.kick) * kitAmp,
      dt,
      0.025,
      0.14,
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
      Math.min(1.2, m.hat * 0.95 + m.shimmer * 0.25) * kitAmp,
      dt,
      0.025,
      0.1,
    );
    afterglowSmooth.current = smoothToward(afterglowSmooth.current, m.afterglow, dt, 0.18, 0.8);

    // Phrase-echo reverse rain: arm on quiet, fire one travel per echo rise
    // so the halos answer once in a gap — not while the drums keep speaking.
    echoSmooth.current = smoothToward(
      echoSmooth.current,
      m.echo * echoAmp,
      dt,
      0.05,
      0.3,
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
      const echoPace = 0.9 + pace * 0.15;
      echoTravel.current = Math.min(
        1,
        echoTravel.current + dt * echoPace * (0.85 + bpm / 180),
      );
    }
    const traveling = echoTravel.current < 1;
    const echoVis = traveling
      ? echoSmooth.current * (1 - echoTravel.current * 0.3)
      : echoSmooth.current * 0.04;
    // Brief upward reverse while the ghost travels — call-response, not a scrub.
    const reverseAmt = traveling ? echoSmooth.current * (1 - echoTravel.current) : 0;
    const scrollDir = 1 - reverseAmt * 2;

    // Rain velocity: steady fall, bass thickens the pace, gather reverses in
    // the shader; echo briefly flips accumulation for the upward reply.
    // holdBreath nearly freezes rain scroll; echo reverse + kit stay ungated above.
    // Tension accelerates inward drift (storm rush) without gather's reverse flip.
    const fallSpeed =
      (0.55 +
        swellSmooth.current * 0.85 +
        m.bass * 0.35 +
        m.energy * 0.2 +
        tension * 0.95) *
      pace *
      sectionPace *
      calm *
      motionMul;
    driftRef.current += dt * fallSpeed * scrollDir;

    mat.uniforms.uResolution!.value.set(size.width, size.height);
    mat.uniforms.uTime!.value = timeRef.current;
    mat.uniforms.uDrift!.value = driftRef.current;
    mat.uniforms.uGather!.value = gatherSmooth.current;
    mat.uniforms.uImpact!.value = impactSmooth.current;
    mat.uniforms.uKick!.value = kickSmooth.current;
    mat.uniforms.uSnare!.value = snareSmooth.current;
    mat.uniforms.uHat!.value = hatSmooth.current;
    mat.uniforms.uBass!.value = m.bass;
    mat.uniforms.uMid!.value = m.mid;
    mat.uniforms.uHigh!.value = m.high;
    mat.uniforms.uSwell!.value = swellSmooth.current;
    mat.uniforms.uAfterglow!.value = afterglowSmooth.current;
    mat.uniforms.uEnergy!.value = m.energy + afterglowSmooth.current * 0.25;
    mat.uniforms.uBarPhase!.value = m.barPhase;
    mat.uniforms.uBgAlpha!.value = backdrop ? 0 : 1;
    mat.uniforms.uEcho!.value = echoVis;
    mat.uniforms.uEchoTravel!.value = echoTravel.current;
    mat.uniforms.uStillness!.value = stillness;
    mat.uniforms.uTenderness!.value = tenderSmooth.current;
    mat.uniforms.uLean!.value = lean;
    mat.uniforms.uTension!.value = tension;
    mat.uniforms.uDrop!.value = drop;
    mat.uniforms.uDropTravel!.value = dropTravel.current;
    (mat.uniforms.uColorBass!.value as THREE.Color).set(palette.bass);
    (mat.uniforms.uColorMid!.value as THREE.Color).set(palette.mid);
    (mat.uniforms.uColorHigh!.value as THREE.Color).set(palette.high);

    if (analyser) analyser.getFrequencyData(freqBuf.current);
  });

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
        transparent
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}

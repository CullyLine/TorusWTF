'use client';

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';
import { useModulation } from '../modulation';

/**
 * Outrun Grid — synthwave drive with build-and-drop cinema + kit road ticks
 * + phrase-echo ghost road + holdBreath stillness + leanIn approach
 * + tenderness dusk hush + vocal sun-rim + barPhase road pulse
 * + convergence grid lock:
 *  - tension → sun swells + stretches (charges the horizon)
 *  - gather → horizon dips (pre-drop inhale)
 *  - drop / afterglow → grid heat wash that eases back
 *  - hat → sparse dash-line ticks on the road grid
 *  - kick → sun-core punch (local, not a sky wash)
 *  - snare → roadside shoulder flash (left/right of the valley)
 *  - echo → one-shot ghost dash/lane shimmer + brief road reverse in phrase gaps
 *  - holdBreath / deep silence → ease road rush to a crawl, dim the sun a
 *    notch, and hold dash ticks; thaw when the music returns
 *  - leanIn → pull horizon/sun nearer + isotropic sun swell + tighten road
 *    perspective (approach, not tension's stretch deformation)
 *  - tenderness → rose dusk hush: sun melts toward rose, grid glow softens,
 *    road speed relaxes (still moves — not holdBreath's crawl/freeze)
 *  - vocalActivity → warm rim of light around the sun core that breathes
 *    with the voice (alive, distinct from kick core punch)
 *  - barPhase → continuous bar-locked pulse rolling down lane dashes + grid
 *    lines (highway as the song's ruler; no stepping)
 *  - convergence → grid jitter steadies, sun rays cohere, road flattens
 *    dead-straight; soft scatter as the lock fades
 */

const terrainVertex = /* glsl */ `
uniform float uTime;
uniform float uScroll;
uniform float uBass;
uniform float uEnergy;
uniform float uLock;

varying vec2 vUv;
varying float vHeight;
varying float vDist;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

void main() {
  vUv = uv;
  vec3 pos = position;
  float lock = clamp(uLock, 0.0, 1.0);
  float lockSnap = lock * lock;
  vec2 sampleUv = uv * 8.0 + vec2(0.0, uScroll);
  float h = fbm(sampleUv) * 2.2;
  h += fbm(sampleUv * 2.5 + 4.0) * 0.8;
  // Convergence: flatten terrain chatter so the highway reads dead-straight
  // (organization, not holdBreath freeze / leanIn perspective coil).
  h *= mix(1.0, 0.22, lockSnap);
  // Slightly wider, cleaner valley under lock — ruler road, not a canyon.
  float valleyWidth = mix(3.2, 2.55, lockSnap);
  float valley = exp(-pow((uv.x - 0.5) * valleyWidth, 2.0)) * mix(1.4, 1.55, lockSnap);
  h -= valley;
  h *= 0.35 + uBass * 1.1;
  pos.y += h;
  vHeight = h;
  vDist = length(pos.xz);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const terrainFragment = /* glsl */ `
uniform float uTime;
uniform float uMid;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uBloom;
uniform float uHeat;
uniform vec3 uHeatColor;
uniform float uHat;
uniform float uSnare;
uniform float uEcho;
uniform float uEchoTravel;
uniform float uStillness;
uniform float uLean;
uniform float uTenderness;
uniform float uBarPhase;
uniform float uBarAmp;
uniform float uLock;

varying vec2 vUv;
varying float vHeight;
varying float vDist;

void main() {
  float stillness = clamp(uStillness, 0.0, 1.0);
  float lean = clamp(uLean, 0.0, 1.0);
  float tender = clamp(uTenderness, 0.0, 1.0);
  float lock = clamp(uLock, 0.0, 1.0);
  float lockSnap = lock * lock;
  // LeanIn tightens lane spacing toward the valley — perspective coils
  // expectant without changing scroll / heat / kit language.
  vec2 gUv = vUv;
  gUv.x = mix(vUv.x, 0.5, lean * 0.14);
  // Soft organic lane wobble that steadies under convergence (not lean coil).
  float laneJitter =
    sin(vUv.y * 31.0 + uTime * 1.7) * 0.0045 +
    sin(vUv.y * 53.0 - uTime * 2.3) * 0.0025;
  gUv.x += laneJitter * (1.0 - lockSnap);
  vec2 grid = abs(fract(gUv * 40.0) - 0.5);
  // Crisp neon lines: a tight core stroke plus a faint halo. The previous
  // wide smoothstep made every cell glow edge-to-edge and the whole floor
  // washed out into a white carpet on loud passages.
  float d = min(grid.x, grid.y);
  float line = smoothstep(0.1, 0.0, d) + smoothstep(0.3, 0.0, d) * 0.25;
  float glow = exp(-vDist * 0.11);
  // Color crawl slows + aligns under lock so lanes cohere as one ruler.
  float colorCrawl = mix(uTime, uTime * 0.12, lockSnap);
  vec3 gridCol = mix(uColorA, uColorB, sin(gUv.y * 12.0 + colorCrawl) * 0.5 + 0.5);
  // Tenderness: milk neon toward rose dusk + soften floor glow — gentling,
  // not holdBreath's hush-dim freeze.
  vec3 roseDusk = vec3(1.0, 0.48, 0.42);
  gridCol = mix(gridCol, roseDusk, tender * 0.55);
  glow *= mix(1.0, 0.72, tender);
  // Drop heat wash: afterglow + impact bleed warm magenta into the grid,
  // then ease back — cinema after the drop, not a permanent tint.
  float heat = clamp(uHeat, 0.0, 1.4);
  gridCol = mix(gridCol, uHeatColor, heat * 0.72);

  // Hat dash ticks: short segments on the depth-axis grid lines only —
  // sparse so hats glitter the road dashes instead of flooding the floor.
  // holdBreath nearly freezes dash scroll (uTime crawls) and gates uHat.
  float dashCell = fract(gUv.y * 22.0 + uTime * 0.35);
  float dashMask = step(0.52, dashCell) * step(dashCell, 0.78);
  float depthLine = smoothstep(0.12, 0.0, grid.x);
  float hatTick = dashMask * depthLine * clamp(uHat, 0.0, 1.2) * (1.0 - stillness * 0.92);
  line += hatTick * 0.85;

  // Bar-locked road pulse: continuous wave down lane dashes + grid lines.
  // uBarPhase < 0 when BPM unknown so cos(0) never leaves glow stuck bright.
  float barOn = step(0.0, uBarPhase) * clamp(uBarAmp, 0.0, 1.0);
  float barWave = 0.5 + 0.5 * cos(gUv.y * 6.2831853 - uBarPhase * 6.2831853);
  float barBreath = 0.5 + 0.5 * cos(uBarPhase * 6.2831853);
  float barPulse = (barWave * 0.72 + barBreath * 0.28) * barOn;
  line += depthLine * barPulse * 0.55;
  glow *= 1.0 + barPulse * 0.22;

  // Phrase-echo ghost road: one-shot after-image lanes that travel down
  // the valley — answers in gaps, never a kit strobe.
  float echoPulse = uEcho * (1.0 - uEchoTravel * 0.85);
  float ghostScroll = uEchoTravel * 2.6;
  vec2 ghostUv = vUv + vec2(
    0.014 * sin(uTime * 7.5 + vUv.y * 9.0) * echoPulse,
    -ghostScroll * 0.09
  );
  vec2 ghostGrid = abs(fract(ghostUv * 40.0) - 0.5);
  float ghostD = min(ghostGrid.x, ghostGrid.y);
  float ghostLine = smoothstep(0.09, 0.0, ghostD) + smoothstep(0.22, 0.0, ghostD) * 0.3;
  float ghostDash = fract(vUv.y * 18.0 - ghostScroll * 3.2);
  float ghostDashMask = step(0.38, ghostDash) * step(ghostDash, 0.68);
  float ghostDepth = smoothstep(0.11, 0.0, ghostGrid.x);
  float ghostLane = ghostDashMask * ghostDepth;
  // Soft crest rides mid→far so the reply reads as a traveling after-image.
  float ghostCrest = exp(-pow((vUv.y - mix(0.08, 0.92, clamp(uEchoTravel, 0.0, 1.0))) * 9.0, 2.0));

  vec3 col = gridCol * line * glow * (0.4 + uMid * 0.5 + vHeight * 0.3);
  // Tenderness eases bloom so the road reads as soft dusk, not neon glare.
  col *= 1.0 + uBloom * 0.4 * mix(1.0, 0.55, tender) + heat * 0.55;
  // Soft traveling crest so the wash feels like a wave over the floor.
  float crest = sin(vUv.y * 18.0 - uTime * 2.4 + heat * 4.0) * 0.5 + 0.5;
  col += uHeatColor * crest * heat * 0.35 * line * glow;
  col += mix(uColorB, vec3(1.0, 0.95, 0.85), 0.4) * hatTick * 1.15 * glow;
  // Bar pulse rides the neon — ongoing ruler glow, not a hat tick or echo crest.
  col += mix(uColorA, uColorB, 0.45) * barPulse * 0.55 * line * glow;
  // Convergence faintly brightens as lanes cohere (organization, not a hit).
  col *= 1.0 + lockSnap * 0.1;

  // Snare roadside flash: valley shoulders (not the sky, not the whole grid).
  float roadL = exp(-pow((vUv.x - 0.27) * 16.0, 2.0));
  float roadR = exp(-pow((vUv.x - 0.73) * 16.0, 2.0));
  float roadside = max(roadL, roadR) * smoothstep(0.05, 0.55, vUv.y);
  float snareFlash = roadside * clamp(uSnare, 0.0, 1.2);
  col += mix(uColorA, uHeatColor, 0.45) * snareFlash * 1.05 * glow;

  // Ghost reply: cooler lane shimmer + after-image grid, distinct from heat/kit.
  vec3 ghostCol = mix(uColorA, vec3(0.85, 0.92, 1.0), 0.55);
  col += ghostCol * (ghostLine * 0.45 + ghostLane * 1.05 + ghostCrest * 0.55) * echoPulse * glow;

  gl_FragColor = vec4(col, min(1.0, line + snareFlash * 0.35 + echoPulse * 0.25 + barPulse * 0.2) * glow);
}
`;

const skyVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const skyFragment = /* glsl */ `
uniform float uTime;
uniform float uBass;
uniform float uHigh;
uniform float uBeat;
uniform float uTension;
uniform float uGather;
uniform float uDropWash;
uniform float uKick;
uniform float uSnare;
uniform float uStillness;
uniform float uLean;
uniform float uTenderness;
uniform float uVocal;
uniform float uLock;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;

varying vec2 vUv;

void main() {
  vec2 uv = vUv;
  float stillness = clamp(uStillness, 0.0, 1.0);
  float lean = clamp(uLean, 0.0, 1.0);
  float tender = clamp(uTenderness, 0.0, 1.0);
  float vocal = clamp(uVocal, 0.0, 1.0);
  float lock = clamp(uLock, 0.0, 1.0);
  float lockSnap = lock * lock;
  // Horizon dips on gather — the whole dusk plane inhales before the drop.
  float horizonDip = uGather * 0.085;
  // LeanIn lifts the sun slightly as if approaching — not a gather dip.
  float sunY = 0.62 - horizonDip + lean * 0.035;
  // Tension charges: sun swells outward and stretches vertically.
  // Kick adds a short core punch — radius + brightness stay local to the disc.
  // LeanIn swells the disc isotropically (approach), never owns stretchX/Y.
  float kick = clamp(uKick, 0.0, 1.2);
  float sunRadius = 0.14 + uBass * 0.05 + uTension * 0.11 + kick * 0.05 + lean * 0.07;
  float stretchY = 1.0 + uTension * 0.55;
  float stretchX = 1.0 - uTension * 0.12;

  // Horizon gradient tinted by the bass color so the sky follows the palette.
  vec3 duskLow = uSkyColor * 0.08;
  vec3 duskHigh = uSkyColor * 0.55;
  float skyY = uv.y + horizonDip * 0.35 - lean * 0.04;
  vec3 sky = mix(duskLow, duskHigh, skyY);
  sky = mix(sky, uSkyColor * 0.16, smoothstep(0.0, 0.35, skyY));
  // Build heat in the lower sky as tension climbs.
  sky = mix(sky, uSunColor * 0.45, uTension * 0.28 * (1.0 - skyY));
  // Tenderness milks the sky toward rose dusk — honey hush, not holdBreath dim.
  vec3 roseSky = vec3(0.95, 0.42, 0.38);
  sky = mix(sky, mix(uSkyColor, roseSky, 0.7) * 0.22, tender * 0.55);
  // holdBreath dims the dusk a notch — listening sky, not a blackout.
  sky *= mix(1.0, 0.78, stillness);

  // Convergence steadies sun wander — rays cohere, not a lean approach.
  float sunWobble = sin(uTime * 0.15) * 0.02 * (1.0 - lockSnap);
  vec2 sunCenter = vec2(0.5 + sunWobble, sunY);
  vec2 sunUv = (uv - sunCenter) * vec2(stretchX, stretchY);
  float sunDist = length(sunUv);
  float sun = smoothstep(sunRadius, 0.0, sunDist);
  vec3 sunCol = mix(uSunColor, vec3(1.0, 0.9, 0.7), 0.25 + uBass * 0.3 + uTension * 0.2) * sun;
  sunCol *= 1.0 + uTension * 0.65 + kick * 0.75 + lean * 0.28;
  // Hotter inner core on kick — reads as a punch, not a fullscreen strobe.
  float sunCore = smoothstep(sunRadius * 0.42, 0.0, sunDist);
  sunCol += mix(uSunColor, vec3(1.0, 0.95, 0.82), 0.55) * sunCore * kick * 0.95;
  // Tenderness melts the disc toward rose and softens glare (still lit).
  vec3 roseSun = vec3(1.0, 0.52, 0.44);
  sunCol = mix(sunCol, roseSun * sun * (0.85 + uBass * 0.2), tender * 0.72);
  sunCol *= mix(1.0, 0.82, tender);
  // Dim the sun on holdBreath; tension stretch shape stays intact.
  sunCol *= mix(1.0, 0.52, stillness);

  // Sun bands: crawl slows + edges sharpen under lock so rays cohere.
  float bandCrawl = mix(0.5, 0.06, lockSnap);
  float bandEdge = mix(0.02, 0.012, lockSnap);
  float bandMask = smoothstep(bandEdge, 0.0, abs(fract((uv.y - sunY) * 28.0 + uTime * bandCrawl) - 0.5));
  sunCol *= 0.6 + bandMask * (0.8 + lockSnap * 0.25);

  float shimmer = sin(uv.x * 80.0 + uTime * 6.0) * uHigh * 0.015 * (1.0 - stillness * 0.85) * (1.0 - lockSnap * 0.7);
  uv.x += shimmer;

  vec3 col = sky + sunCol;
  // Vocal rim: warm annular glow around the disc that breathes with voice —
  // outside the core (kick owns the punch), inside a soft halo.
  float rimInner = sunRadius * (0.92 + vocal * 0.04);
  float rimPeak = sunRadius * (1.12 + vocal * 0.18);
  float rimOuter = sunRadius * (1.55 + vocal * 0.55);
  float vocalRim =
    smoothstep(rimInner, rimPeak, sunDist) * smoothstep(rimOuter, rimPeak, sunDist);
  vec3 rimCol = mix(uSunColor, mix(vec3(1.0, 0.72, 0.48), roseSun, tender * 0.45), 0.5);
  col += rimCol * vocalRim * vocal * (0.95 + tender * 0.25);

  col += uSunColor * (uBeat * 0.3 + uDropWash * 0.45);
  // Horizon climbs toward the viewer on leanIn — approach, not gather dip.
  float horizonY = 0.28 - horizonDip + lean * 0.055;
  float horizonLine = exp(-abs(uv.y - horizonY) * 48.0);
  col += uSunColor * horizonLine * (0.12 + uTension * 0.35 + uGather * 0.25 + lean * 0.22);
  // Soft lock brighten — coherence glow, not a drop wash.
  col *= 1.0 + lockSnap * 0.08;

  // Snare: thin roadside sky winks at the horizon flanks — never a full wash.
  float snare = clamp(uSnare, 0.0, 1.2);
  float flankL = exp(-pow((uv.x - 0.12) * 14.0, 2.0));
  float flankR = exp(-pow((uv.x - 0.88) * 14.0, 2.0));
  float flankY = exp(-pow((uv.y - horizonY) * 22.0, 2.0));
  col += uSunColor * max(flankL, flankR) * flankY * snare * 0.55;

  gl_FragColor = vec4(col, 1.0);
}
`;

function smoothToward(
  current: number,
  target: number,
  dt: number,
  riseTau: number,
  fallTau: number,
): number {
  const tau = target > current ? riseTau : fallTau;
  const k = 1 - Math.exp(-dt / Math.max(1e-4, tau));
  return current + (target - current) * k;
}

export function OutrunGridScene({ analyser, palette, tier, speed = 1 }: VisualizerSceneProps) {
  const mods = useModulation();
  const terrainMatRef = useRef<THREE.ShaderMaterial>(null);
  const skyMatRef = useRef<THREE.ShaderMaterial>(null);
  const terrainMeshRef = useRef<THREE.Mesh>(null);
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const metricsRef = useMetricsRef();
  const scrollRef = useRef(0);
  const beatDollyRef = useRef(0);
  const tensionSmooth = useRef(0);
  const gatherSmooth = useRef(0);
  const heatSmooth = useRef(0);
  const dropWashSmooth = useRef(0);
  const kickSmooth = useRef(0);
  const snareSmooth = useRef(0);
  const hatSmooth = useRef(0);
  const echoSmooth = useRef(0);
  const echoTravel = useRef(1); // 0..1 traveling; >=1 idle
  const echoArmed = useRef(true);
  const prevEcho = useRef(0);
  const stillnessSmooth = useRef(0);
  // LeanIn anticipation: horizon/sun approach — eager climb, slower release.
  const leanSmooth = useRef(0);
  // Tenderness dusk hush + vocal sun-rim — soft climb, slower fall.
  const tenderSmooth = useRef(0);
  const vocalSmooth = useRef(0);
  // Continuous bar unwrap for road pulse (no 0→1 step at bar boundaries).
  const barTurnsRef = useRef(0);
  const prevBarPhaseRef = useRef(0);
  const hadBpmRef = useRef(false);
  const barAmpSmooth = useRef(0);
  // Convergence lock: jitter steadies, rays cohere, road flattens.
  const lockSmooth = useRef(0);
  const timeRef = useRef(0);
  const heatColorScratch = useRef(new THREE.Color());
  const heatHighScratch = useRef(new THREE.Color());
  const roseScratch = useRef(new THREE.Color(1, 0.48, 0.42));
  const { camera } = useThree();

  const segments = tier === 'high' ? 160 : tier === 'mid' ? 96 : 64;
  const bloom = tier === 'high' ? 1 : tier === 'mid' ? 0.65 : 0.35;
  // Mid/low keep the same cinema language at slightly softer amplitude.
  const cinemaAmp = tier === 'high' ? 1 : tier === 'mid' ? 0.85 : 0.65;
  const kitAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  const echoAmp = tier === 'low' ? 0.7 : tier === 'mid' ? 0.9 : 1;
  // holdBreath crawl amp — low tier still crawls, just a touch softer.
  const stillAmp = tier === 'high' ? 1 : tier === 'mid' ? 0.9 : 0.75;
  const leanAmp = tier === 'low' ? 0.7 : tier === 'mid' ? 0.9 : 1;
  const tenderAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  const vocalAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  const barAmp = tier === 'low' ? 0.7 : tier === 'mid' ? 0.9 : 1;
  const lockAmp = tier === 'high' ? 1 : tier === 'mid' ? 0.9 : 0.75;

  const terrainUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uScroll: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uEnergy: { value: 0 },
      uColorA: { value: new THREE.Color(palette.mid) },
      uColorB: { value: new THREE.Color(palette.high) },
      uBloom: { value: bloom },
      uHeat: { value: 0 },
      uHeatColor: { value: new THREE.Color(palette.bass) },
      uHat: { value: 0 },
      uSnare: { value: 0 },
      uEcho: { value: 0 },
      uEchoTravel: { value: 1 },
      uStillness: { value: 0 },
      uLean: { value: 0 },
      uTenderness: { value: 0 },
      uBarPhase: { value: -1 },
      uBarAmp: { value: 0 },
      uLock: { value: 0 },
    }),
    [palette.mid, palette.high, palette.bass, bloom],
  );

  // Intentionally empty deps: uniform colors are re-set from the live
  // palette every frame in useFrame.
  const skyUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBass: { value: 0 },
      uHigh: { value: 0 },
      uBeat: { value: 0 },
      uTension: { value: 0 },
      uGather: { value: 0 },
      uDropWash: { value: 0 },
      uKick: { value: 0 },
      uSnare: { value: 0 },
      uStillness: { value: 0 },
      uLean: { value: 0 },
      uTenderness: { value: 0 },
      uVocal: { value: 0 },
      uLock: { value: 0 },
      uSunColor: { value: new THREE.Color(palette.bass) },
      uSkyColor: { value: new THREE.Color(palette.bass) },
    }),
    [],
  );

  useFrame((_state, delta) => {
    const terrainMat = terrainMatRef.current;
    const skyMat = skyMatRef.current;
    if (!terrainMat || !skyMat) return;

    const m = metricsRef.current;
    const spd = mods.current.speed ?? speed;
    const dt = Math.min(delta, 0.1);

    // Hold-breath stillness: the road listens instead of rushing through quiet.
    // Rise a touch slower than fall so the freeze feels attentive; thaw
    // promptly so tension/kit/echo still fire when music returns.
    const stillnessTarget =
      Math.min(
        1,
        Math.max(m.holdBreath, m.silence * 0.92) + Math.min(m.holdBreath, m.silence) * 0.15,
      ) * stillAmp;
    stillnessSmooth.current = smoothToward(
      stillnessSmooth.current,
      stillnessTarget,
      dt,
      0.14,
      0.08,
    );
    const stillness = stillnessSmooth.current;
    // Nearly freeze road rush; leave a whisper so the grid never dies.
    const rushMul = 1 - stillness * 0.94;

    // Convergence envelope early so lockPace can steady the shared clock.
    lockSmooth.current = smoothToward(
      lockSmooth.current,
      Math.min(1, Math.max(0, m.convergence ?? 0)) * lockAmp,
      dt,
      0.1,
      0.18,
    );
    const lock = lockSmooth.current * (1 - stillness * 0.3);
    const lockSnap = lock * lock;
    // Steadier continuous drive when locked — not frozen (holdBreath owns that).
    const lockPace = 1 - lock * 0.38;

    // Local clock crawls with stillness so dash ticks + sun bands hold;
    // lockPace steadies without freezing.
    timeRef.current += dt * (0.08 + rushMul * 0.92) * lockPace;

    // LeanIn: eager climb into anticipation, slower release into the drop.
    // Soft under stillness so the hang owns quiet bars (approach ≠ freeze).
    leanSmooth.current = smoothToward(
      leanSmooth.current,
      Math.min(1, m.leanIn) * leanAmp,
      dt,
      0.06,
      0.18,
    );
    const lean = leanSmooth.current * (1 - stillness * 0.35);

    // Tenderness: soft dusk hush — still rolls, just gentler. Rise/fall
    // matched to other tender presets; soft under stillness so hang owns quiet.
    tenderSmooth.current = smoothToward(
      tenderSmooth.current,
      Math.min(1, m.tenderness) * tenderAmp,
      dt,
      0.12,
      0.22,
    );
    const tender = tenderSmooth.current * (1 - stillness * 0.28);

    // Vocal rim: voice presence swells a warm halo around the sun core.
    vocalSmooth.current = smoothToward(
      vocalSmooth.current,
      Math.min(1, m.vocalActivity) * vocalAmp,
      dt,
      0.1,
      0.28,
    );
    // Soft under stillness so hush dim isn't fighting a bright rim.
    const vocal = vocalSmooth.current * (1 - stillness * 0.3);

    // Continuous bar unwrap for road pulse (no 0→1 step at bar boundaries).
    const bpmKnown = Boolean(m.bpm && m.bpm > 30);
    const barPhase = bpmKnown ? Math.min(1, Math.max(0, m.barPhase)) : 0;
    if (bpmKnown) {
      if (prevBarPhaseRef.current - barPhase > 0.5) {
        barTurnsRef.current += 1;
      }
      prevBarPhaseRef.current = barPhase;
      if (!hadBpmRef.current) {
        barTurnsRef.current = 0;
        hadBpmRef.current = true;
      }
    } else if (hadBpmRef.current) {
      hadBpmRef.current = false;
    }
    const continuousBar = bpmKnown ? barTurnsRef.current + barPhase : 0;
    // Soft amp follow so enter/exit BPM doesn't pop the pulse.
    barAmpSmooth.current = smoothToward(
      barAmpSmooth.current,
      bpmKnown ? barAmp * (1 - stillness * 0.4) : 0,
      dt,
      0.16,
      0.22,
    );
    const barAmpNow = barAmpSmooth.current;

    // Phrase-echo ghost road: arm on quiet, fire one travel per echo rise
    // so the road answers once in a gap — not while the drums keep speaking.
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
      const pace = 0.9 + (mods.current.speed ?? speed) * 0.15;
      echoTravel.current = Math.min(1, echoTravel.current + dt * pace * (0.85 + bpm / 180));
    }
    const traveling = echoTravel.current < 1;
    const echoVis = traveling
      ? echoSmooth.current * (1 - echoTravel.current * 0.3)
      : echoSmooth.current * 0.04;
    // Brief reverse while the ghost travels — call-response, not a scrub.
    const reverseAmt = traveling ? echoSmooth.current * (1 - echoTravel.current) : 0;
    const scrollDir = 1 - reverseAmt * 2;

    // Drive speed follows the song's arc: valleys cruise, peaks floor it.
    // Tension adds a cinematic charge (not only "scroll faster").
    // rushMul eases the conveyor to a crawl during holdBreath.
    // tenderPace relaxes road speed on gentle passages (still moves).
    // lockPace steadies the highway when bands lock (dead-straight drive).
    const sectionPace = 0.7 + m.sectionLevel * 0.55;
    const tensionPace = 1 + tensionSmooth.current * 0.22;
    const tenderPace = 1 - tender * 0.38;
    scrollRef.current +=
      dt *
      spd *
      (0.45 + m.energy * 1.4 + m.impact * 0.8) *
      sectionPace *
      tensionPace *
      tenderPace *
      lockPace *
      scrollDir *
      rushMul;
    beatDollyRef.current = Math.max(0, beatDollyRef.current - dt * 4);
    if (m.impact > 0.35 || m.dropEvent > 0.45) beatDollyRef.current = 1;

    tensionSmooth.current = smoothToward(
      tensionSmooth.current,
      m.tension * cinemaAmp,
      dt,
      0.12,
      0.45,
    );
    gatherSmooth.current = smoothToward(
      gatherSmooth.current,
      m.gather * cinemaAmp,
      dt,
      0.04,
      0.14,
    );
    // Heat peaks on drop/impact, then rides afterglow so the wash eases back.
    const heatTarget =
      Math.min(
        1.35,
        m.dropEvent * 1.05 + m.impact * 0.55 + m.afterglow * 0.75 + m.release * 0.2,
      ) * cinemaAmp;
    heatSmooth.current = smoothToward(heatSmooth.current, heatTarget, dt, 0.05, 0.85);
    dropWashSmooth.current = smoothToward(
      dropWashSmooth.current,
      Math.min(1.2, m.dropEvent * 0.9 + m.impact * 0.35 + m.afterglow * 0.4) * cinemaAmp,
      dt,
      0.04,
      0.7,
    );
    // Kit accents: kick punches rise fast / fall medium; snare cracks fast;
    // hats tick with a very short fall so dash glitter stays crisp.
    // Hats gate under stillness so dash ticks hold; kick/snare stay live for thaw.
    const hatMul = 1 - stillness * 0.95;
    kickSmooth.current = smoothToward(
      kickSmooth.current,
      Math.min(1.2, m.kick) * kitAmp,
      dt,
      0.03,
      0.14,
    );
    snareSmooth.current = smoothToward(
      snareSmooth.current,
      Math.min(1.2, m.snare) * kitAmp,
      dt,
      0.025,
      0.11,
    );
    hatSmooth.current = smoothToward(
      hatSmooth.current,
      Math.min(1.2, m.hat) * kitAmp * hatMul,
      dt,
      0.02,
      0.07,
    );

    const t = timeRef.current;
    terrainMat.uniforms.uTime!.value = t;
    terrainMat.uniforms.uScroll!.value = scrollRef.current;
    terrainMat.uniforms.uBass!.value = m.bass + m.impact * 0.4 + tensionSmooth.current * 0.15;
    terrainMat.uniforms.uMid!.value = m.mid + m.afterglow * 0.2;
    terrainMat.uniforms.uEnergy!.value = m.energy;
    terrainMat.uniforms.uHeat!.value = heatSmooth.current;
    terrainMat.uniforms.uHat!.value = hatSmooth.current;
    terrainMat.uniforms.uSnare!.value = snareSmooth.current;
    terrainMat.uniforms.uEcho!.value = echoVis;
    terrainMat.uniforms.uEchoTravel!.value = echoTravel.current;
    terrainMat.uniforms.uStillness!.value = stillness;
    terrainMat.uniforms.uLean!.value = lean;
    terrainMat.uniforms.uTenderness!.value = tender;
    // BPM unknown → -1 so shader gate keeps pulse off (never stuck at cos(0)).
    terrainMat.uniforms.uBarPhase!.value = bpmKnown ? continuousBar : -1;
    terrainMat.uniforms.uBarAmp!.value = barAmpNow;
    terrainMat.uniforms.uLock!.value = lock;
    (terrainMat.uniforms.uColorA!.value as THREE.Color).set(palette.mid);
    (terrainMat.uniforms.uColorB!.value as THREE.Color).set(palette.high);
    (terrainMat.uniforms.uHeatColor!.value as THREE.Color)
      .copy(heatColorScratch.current.set(palette.bass))
      .lerp(heatHighScratch.current.set(palette.high), 0.35);

    skyMat.uniforms.uTime!.value = t;
    skyMat.uniforms.uBass!.value = m.bass + tensionSmooth.current * 0.4 + m.afterglow * 0.15;
    skyMat.uniforms.uHigh!.value = m.high;
    skyMat.uniforms.uBeat!.value = m.impact + m.dropEvent * 0.6;
    skyMat.uniforms.uTension!.value = tensionSmooth.current;
    skyMat.uniforms.uGather!.value = gatherSmooth.current;
    skyMat.uniforms.uDropWash!.value = dropWashSmooth.current;
    skyMat.uniforms.uKick!.value = kickSmooth.current;
    skyMat.uniforms.uSnare!.value = snareSmooth.current;
    skyMat.uniforms.uStillness!.value = stillness;
    skyMat.uniforms.uLean!.value = lean;
    skyMat.uniforms.uTenderness!.value = tender;
    skyMat.uniforms.uVocal!.value = vocal;
    skyMat.uniforms.uLock!.value = lock;
    // Tenderness melts palette sun/sky toward rose on the CPU so the
    // shader's rose mix starts from an already-warmed base.
    const rose = roseScratch.current;
    (skyMat.uniforms.uSunColor!.value as THREE.Color)
      .set(palette.bass)
      .lerp(rose, tender * 0.62);
    (skyMat.uniforms.uSkyColor!.value as THREE.Color)
      .set(palette.bass)
      .lerp(rose, tender * 0.4);

    // Camera: slight dip on gather, push in on drop wash — cinema not snap.
    // LeanIn dollies toward the horizon (approach), distinct from drop wash.
    const gatherCam = gatherSmooth.current * 0.12;
    const washCam = dropWashSmooth.current * 0.18;
    const leanCam = lean * 0.48;
    camera.position.z = 3.2 + beatDollyRef.current * 0.35 - washCam - leanCam;
    camera.position.y = 1.4 + m.mid * 0.15 - gatherCam + tensionSmooth.current * 0.08;
    camera.lookAt(0, 0.2 - gatherCam * 0.5 + lean * 0.04, -6 + lean * 1.1);

    // Road mesh: tighten width + drift nearer — perspective coil, not scroll.
    // Convergence adds a touch more width settle (straight highway, not lean).
    const terrain = terrainMeshRef.current;
    if (terrain) {
      const roadNarrow = 1 - lean * 0.1 - lockSnap * 0.04;
      terrain.scale.set(roadNarrow, 1, 1);
      terrain.position.set(0, -0.8, -2 + lean * 0.55);
    }

    if (analyser) analyser.getFrequencyData(freqBuf.current);
  });

  return (
    <>
      <mesh position={[0, 1.5, -18]} scale={[40, 22, 1]}>
        <planeGeometry args={[1, 1]} />
        <shaderMaterial
          ref={skyMatRef}
          vertexShader={skyVertex}
          fragmentShader={skyFragment}
          uniforms={skyUniforms}
          depthWrite={false}
        />
      </mesh>
      <mesh
        ref={terrainMeshRef}
        rotation={[-Math.PI / 2.35, 0, 0]}
        position={[0, -0.8, -2]}
      >
        <planeGeometry args={[28, 36, segments, segments]} />
        <shaderMaterial
          ref={terrainMatRef}
          vertexShader={terrainVertex}
          fragmentShader={terrainFragment}
          uniforms={terrainUniforms}
          transparent
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </>
  );
}

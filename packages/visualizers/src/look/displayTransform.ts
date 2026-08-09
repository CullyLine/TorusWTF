/**
 * The display transform: how scene-referred light becomes screen pixels.
 *
 * Presets render additive, unbounded light into a half-float buffer, so a
 * kick can legitimately push a pixel to 20x "white". Something has to map
 * that open-ended range onto the 0..1 the display can show, and the choice
 * of mapping is what makes an image read as lit rather than painted.
 *
 * The previous stage (`effects/HighlightGuardEffect`) scaled every channel
 * by a shared factor once the peak passed 0.82, with an asymptote at 0.98.
 * That preserves hue exactly, but it means scene 2.0 and scene 40.0 land on
 * the same pixel: above roughly 2x, loud stops looking louder and the frame
 * can never reach white. Most of what the audio engine computes was being
 * thrown away here, at the very last step.
 *
 * This module applies the ACES filmic curve (Stephen Hill's RRT+ODT fit)
 * instead. It keeps climbing across the whole range, and it desaturates as
 * it approaches white, which is how the eye reads "bright" — a light source
 * blows out toward white rather than sitting at maximum colour.
 *
 * The GLSL below mirrors this TypeScript exactly so the maths can be unit
 * tested on the CPU; `LookEffect` compiles the string.
 */

export type Rgb = readonly [number, number, number];
export type MutableRgb = [number, number, number];

/**
 * Scene exposure applied before the curve.
 *
 * ACES places middle grey lower than a plain linear-to-sRGB encode, so it
 * needs compensating or every existing preset would suddenly look dim. 1.45
 * is the value that holds the old mid-tones almost exactly (scene 0.18 lands
 * on 117/255 where the legacy path gave 118, scene 0.5 on 189 where it gave
 * 188) while still deepening the shadows and leaving headroom up to about
 * scene 10 before the frame clips to white. Existing preset light levels stay
 * valid; only the ends of the range change.
 */
export const LOOK_EXPOSURE = 1.45;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const safe = (v: number): number => (Number.isFinite(v) ? v : 0);

// Row-major; the GLSL literals below are the transposes of these, because
// `mat3(...)` in GLSL takes columns.
const ACES_INPUT = [
  0.59719, 0.35458, 0.04823, 0.076, 0.90834, 0.01566, 0.0284, 0.13383, 0.83777,
] as const;

const ACES_OUTPUT = [
  1.60475, -0.53108, -0.07367, -0.10208, 1.10813, -0.00605, -0.00327, -0.07276, 1.07602,
] as const;

function transform(m: readonly number[], v: Rgb): MutableRgb {
  return [
    m[0]! * v[0] + m[1]! * v[1] + m[2]! * v[2],
    m[3]! * v[0] + m[4]! * v[1] + m[5]! * v[2],
    m[6]! * v[0] + m[7]! * v[1] + m[8]! * v[2],
  ];
}

/** The ACES RRT+ODT rational fit, applied per channel in ACES colour space. */
function rrtAndOdtFit(v: MutableRgb): MutableRgb {
  return v.map((x) => {
    const a = x * (x + 0.0245786) - 0.000090537;
    const b = x * (0.983729 * x + 0.432951) + 0.238081;
    return a / b;
  }) as MutableRgb;
}

/**
 * Maps open-ended scene-referred linear light to display-referred linear
 * 0..1. Feed it values that have already been exposed.
 */
export function acesFilmic(rgb: Rgb): MutableRgb {
  const input: MutableRgb = [
    Math.max(0, safe(rgb[0])),
    Math.max(0, safe(rgb[1])),
    Math.max(0, safe(rgb[2])),
  ];
  let c = transform(ACES_INPUT, input);
  c = rrtAndOdtFit(c);
  c = transform(ACES_OUTPUT, c);
  return [clamp01(c[0]), clamp01(c[1]), clamp01(c[2])];
}

/**
 * The legacy ratio-preserving knee, kept so the "highlight protection" toggle
 * can still express the old neutral rolloff, and so tests can compare the two
 * curves directly.
 */
export function neutralClamp(rgb: Rgb): MutableRgb {
  const c: MutableRgb = [safe(rgb[0]), safe(rgb[1]), safe(rgb[2])];
  const peak = Math.max(0, c[0], c[1], c[2]);
  if (peak <= 1) return [clamp01(c[0]), clamp01(c[1]), clamp01(c[2])];
  const s = 1 / peak;
  return [clamp01(c[0] * s), clamp01(c[1] * s), clamp01(c[2] * s)];
}

export interface LookParams {
  /** User "Light" level, multiplied by `LOOK_EXPOSURE` before the curve. */
  exposure: number;
  /** True for the ACES filmic shoulder, false for the neutral peak clamp. */
  filmic: boolean;
}

export const DEFAULT_LOOK: LookParams = { exposure: 1, filmic: true };

/** Full CPU reference for one pixel: exposure, then the chosen rolloff. */
export function applyLook(rgb: Rgb, params: LookParams = DEFAULT_LOOK): MutableRgb {
  const e = Math.max(0, safe(params.exposure)) * LOOK_EXPOSURE;
  const exposed: MutableRgb = [
    Math.max(0, safe(rgb[0])) * e,
    Math.max(0, safe(rgb[1])) * e,
    Math.max(0, safe(rgb[2])) * e,
  ];
  return params.filmic ? acesFilmic(exposed) : neutralClamp(exposed);
}

/**
 * GLSL mirror of the above. `mat3` literals are column-major, so each one is
 * the transpose of the row-major table used on the CPU side.
 */
export const DISPLAY_TRANSFORM_GLSL = /* glsl */ `
const mat3 TORUS_ACES_INPUT = mat3(
  0.59719, 0.07600, 0.02840,
  0.35458, 0.90834, 0.13383,
  0.04823, 0.01566, 0.83777
);

const mat3 TORUS_ACES_OUTPUT = mat3(
   1.60475, -0.10208, -0.00327,
  -0.53108,  1.10813, -0.07276,
  -0.07367, -0.00605,  1.07602
);

vec3 torusRrtAndOdtFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.432951) + 0.238081;
  return a / b;
}

vec3 torusAcesFilmic(vec3 color) {
  color = max(color, vec3(0.0));
  color = TORUS_ACES_INPUT * color;
  color = torusRrtAndOdtFit(color);
  color = TORUS_ACES_OUTPUT * color;
  return clamp(color, 0.0, 1.0);
}

vec3 torusNeutralClamp(vec3 color) {
  float peak = max(max(color.r, color.g), max(color.b, 0.0));
  if (peak <= 1.0) return clamp(color, 0.0, 1.0);
  return clamp(color / peak, 0.0, 1.0);
}
`;

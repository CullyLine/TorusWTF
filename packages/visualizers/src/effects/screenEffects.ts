/** Stable IDs for whole-frame post-processing styles. */
export const SCREEN_EFFECT_IDS = [
  'none',
  'matrix',
  'pixel8',
  'cartoon',
  'bubble_melt',
  'octagram_bloom',
  'pyramid_cathedral',
  'creation_well',
  'sea_glass',
  'firefly_hug',
  'velvet_aurora',
] as const;

export type ScreenEffectId = (typeof SCREEN_EFFECT_IDS)[number];

export interface ScreenEffectDefinition {
  id: ScreenEffectId;
  label: string;
  description: string;
  defaultMix: number;
  /** When true, SceneRig runs the 384px depth prepass for this style. */
  usesDepth: boolean;
}

export const SCREEN_EFFECT_REGISTRY = {
  none: {
    id: 'none',
    label: 'None',
    description: 'Unstyled frame',
    defaultMix: 1,
    usesDepth: false,
  },
  matrix: {
    id: 'matrix',
    label: 'Matrix',
    description: 'Green scan-grid wireframe remap',
    defaultMix: 1,
    usesDepth: true,
  },
  pixel8: {
    id: 'pixel8',
    label: 'Pixel 8',
    description: 'Block pixels, reduced colors, and ordered dithering',
    defaultMix: 1,
    usesDepth: false,
  },
  cartoon: {
    id: 'cartoon',
    label: 'Cartoon',
    description: 'Posterized color with scene outlines',
    defaultMix: 1,
    usesDepth: true,
  },
  bubble_melt: {
    id: 'bubble_melt',
    label: 'Bubble Melt',
    description: 'Glossy fused bubble-cell reconstruction with iridescent rims',
    defaultMix: 1,
    usesDepth: true,
  },
  octagram_bloom: {
    id: 'octagram_bloom',
    label: 'Octagram Bloom',
    description: 'Mirrored eightfold flower geometry with sparkling petal edges',
    defaultMix: 1,
    usesDepth: false,
  },
  pyramid_cathedral: {
    id: 'pyramid_cathedral',
    label: 'Pyramid Cathedral',
    description: 'Recursive triangular chambers and warm luminous facets',
    defaultMix: 1,
    usesDepth: false,
  },
  creation_well: {
    id: 'creation_well',
    label: 'Creation Well',
    description: 'Radial energy well with impact rings and palette channel phases',
    defaultMix: 1,
    usesDepth: false,
  },
  sea_glass: {
    id: 'sea_glass',
    label: 'Sea Glass',
    description: 'Refractive water-sheet distortion with caustic crests',
    defaultMix: 1,
    usesDepth: false,
  },
  firefly_hug: {
    id: 'firefly_hug',
    label: 'Firefly Hug',
    description: 'Edge-guided motes that gather around subjects, then release',
    defaultMix: 1,
    usesDepth: true,
  },
  velvet_aurora: {
    id: 'velvet_aurora',
    label: 'Velvet Aurora',
    description: 'Soft flow-warped ribbons with chromatic smears',
    defaultMix: 1,
    usesDepth: false,
  },
} as const satisfies Readonly<Record<ScreenEffectId, ScreenEffectDefinition>>;

export const SCREEN_EFFECT_OPTIONS: readonly ScreenEffectDefinition[] = SCREEN_EFFECT_IDS.map(
  (id) => SCREEN_EFFECT_REGISTRY[id],
);

export const CREATIVE_SCREEN_EFFECT_IDS = [
  'matrix',
  'pixel8',
  'cartoon',
  'bubble_melt',
  'octagram_bloom',
  'pyramid_cathedral',
  'creation_well',
  'sea_glass',
  'firefly_hug',
  'velvet_aurora',
] as const satisfies readonly ScreenEffectId[];

export type CreativeScreenEffectId = (typeof CREATIVE_SCREEN_EFFECT_IDS)[number];

export interface ScreenEffectSettings {
  id: ScreenEffectId;
  /** 0 = original frame, 1 = fully styled. */
  mix: number;
}

export const DEFAULT_SCREEN_EFFECT_SETTINGS: Readonly<ScreenEffectSettings> = Object.freeze({
  id: 'none',
  mix: 1,
});

export function isScreenEffectId(value: unknown): value is ScreenEffectId {
  return typeof value === 'string' && (SCREEN_EFFECT_IDS as readonly string[]).includes(value);
}

export function isCreativeScreenEffectId(value: unknown): value is CreativeScreenEffectId {
  return (
    typeof value === 'string' && (CREATIVE_SCREEN_EFFECT_IDS as readonly string[]).includes(value)
  );
}

export function clampScreenEffectMix(value: number): number {
  if (Number.isNaN(value) || value === Number.NEGATIVE_INFINITY) return 0;
  if (value === Number.POSITIVE_INFINITY) return 1;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Defensive parser for local storage, show files, and projector payloads. */
export function sanitizeScreenEffectSettings(value: unknown): ScreenEffectSettings {
  const source =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  return {
    id: isScreenEffectId(source.id) ? source.id : DEFAULT_SCREEN_EFFECT_SETTINGS.id,
    mix:
      typeof source.mix === 'number'
        ? clampScreenEffectMix(source.mix)
        : DEFAULT_SCREEN_EFFECT_SETTINGS.mix,
  };
}

/**
 * Picks an active style, never `none` and never the current style. The
 * injectable random source keeps trigger behavior deterministic in tests and
 * offline rendering when callers provide a seeded generator.
 */
export function pickRandomScreenEffect(
  current: ScreenEffectId = 'none',
  random: () => number = Math.random,
): Exclude<ScreenEffectId, 'none'> {
  const candidates = CREATIVE_SCREEN_EFFECT_IDS.filter((id) => id !== current);
  const sample = random();
  const unit = Number.isFinite(sample) ? Math.max(0, Math.min(1 - Number.EPSILON, sample)) : 0;
  return candidates[Math.floor(unit * candidates.length)]!;
}

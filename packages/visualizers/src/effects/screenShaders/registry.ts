import type { DeviceTier } from '../../tier';
import type { CreativeScreenEffectId } from '../screenEffects';
import { BUBBLE_MELT_SHADER_SOURCE } from './bubble_melt';
import { CARTOON_SHADER_SOURCE } from './cartoon';
import { CREATION_WELL_SHADER_SOURCE } from './creation_well';
import { FIREFLY_HUG_SHADER_SOURCE } from './firefly_hug';
import { MATRIX_SHADER_SOURCE } from './matrix';
import { OCTAGRAM_BLOOM_SHADER_SOURCE } from './octagram_bloom';
import { PIXEL8_SHADER_SOURCE } from './pixel8';
import { PYRAMID_CATHEDRAL_SHADER_SOURCE } from './pyramid_cathedral';
import { SEA_GLASS_SHADER_SOURCE } from './sea_glass';
import { SCREEN_SHADER_DECLARATIONS, SCREEN_SHADER_HELPERS } from './shared';
import { VELVET_AURORA_SHADER_SOURCE } from './velvet_aurora';

export interface ScreenShaderModule {
  id: CreativeScreenEffectId;
  /** Style-specific GLSL body that defines `mainImage`. */
  source: string;
}

export const SCREEN_SHADER_MODULES = {
  matrix: { id: 'matrix', source: MATRIX_SHADER_SOURCE },
  pixel8: { id: 'pixel8', source: PIXEL8_SHADER_SOURCE },
  cartoon: { id: 'cartoon', source: CARTOON_SHADER_SOURCE },
  bubble_melt: { id: 'bubble_melt', source: BUBBLE_MELT_SHADER_SOURCE },
  octagram_bloom: { id: 'octagram_bloom', source: OCTAGRAM_BLOOM_SHADER_SOURCE },
  pyramid_cathedral: { id: 'pyramid_cathedral', source: PYRAMID_CATHEDRAL_SHADER_SOURCE },
  creation_well: { id: 'creation_well', source: CREATION_WELL_SHADER_SOURCE },
  sea_glass: { id: 'sea_glass', source: SEA_GLASS_SHADER_SOURCE },
  firefly_hug: { id: 'firefly_hug', source: FIREFLY_HUG_SHADER_SOURCE },
  velvet_aurora: { id: 'velvet_aurora', source: VELVET_AURORA_SHADER_SOURCE },
} as const satisfies Readonly<Record<CreativeScreenEffectId, ScreenShaderModule>>;

function tierDefines(tier: DeviceTier): string {
  if (tier === 'low') return '#define TIER_LOW\n';
  if (tier === 'mid') return '#define TIER_MID\n';
  return '#define TIER_HIGH\n';
}

/**
 * Assemble one fragment shader for the selected style + tier.
 * Only this module's source is compiled into the Effect program.
 */
export function buildScreenFragmentShader(
  style: CreativeScreenEffectId,
  tier: DeviceTier,
): string {
  const module = SCREEN_SHADER_MODULES[style];
  return `${tierDefines(tier)}
${SCREEN_SHADER_DECLARATIONS}
${SCREEN_SHADER_HELPERS}
${module.source}
`;
}

export function getScreenShaderModule(style: CreativeScreenEffectId): ScreenShaderModule {
  return SCREEN_SHADER_MODULES[style];
}

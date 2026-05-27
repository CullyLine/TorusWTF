export interface CreaturePersonality {
  bassAffinity: number;
  midAffinity: number;
  highAffinity: number;
  warmthBias: number;
  tempoBias: number;
}

export interface Creature {
  id: string;
  born: string;
  seed: number;
  personality: CreaturePersonality;
}

export const NEUTRAL_PERSONALITY: CreaturePersonality = {
  bassAffinity: 0,
  midAffinity: 0,
  highAffinity: 0,
  warmthBias: 0,
  tempoBias: 0,
};

function xorshift32(seed: number): () => number {
  let s = seed | 0;
  if (s === 0) s = 0x9e3779b9 | 0;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 0xffffffff;
  };
}

function rand(rng: () => number, min: number, max: number): number {
  return min + (max - min) * rng();
}

export function createCreature(seed?: number): Creature {
  const finalSeed = seed ?? (Math.floor(Math.random() * 0xffffffff) >>> 0);
  const rng = xorshift32(finalSeed);
  const id = Array.from({ length: 8 }, () =>
    Math.floor(rng() * 36).toString(36),
  ).join('');
  return {
    id,
    born: new Date().toISOString(),
    seed: finalSeed,
    personality: {
      bassAffinity: rand(rng, -1, 1),
      midAffinity: rand(rng, -1, 1),
      highAffinity: rand(rng, -1, 1),
      warmthBias: rand(rng, -1, 1),
      tempoBias: rand(rng, -1, 1),
    },
  };
}

// Maximum ±15% bias applied to bass/mid/high reactivity. Subtle by design:
// the creature should feel like it has taste, not like the visualizer is broken.
export const CREATURE_BIAS_RANGE = 0.15;

export function applyCreatureBass(value: number, p: CreaturePersonality): number {
  return value * (1 + p.bassAffinity * CREATURE_BIAS_RANGE);
}

export function applyCreatureMid(value: number, p: CreaturePersonality): number {
  return value * (1 + p.midAffinity * CREATURE_BIAS_RANGE);
}

export function applyCreatureHigh(value: number, p: CreaturePersonality): number {
  return value * (1 + p.highAffinity * CREATURE_BIAS_RANGE);
}

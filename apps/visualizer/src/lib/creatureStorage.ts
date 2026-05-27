import { createCreature, type Creature } from '@torus/visualizers';

export const CREATURE_KEY = 'torus.wtf.creature.v1';

export function loadCreature(): Creature {
  if (typeof window === 'undefined') return createCreature(1);
  try {
    const raw = window.localStorage.getItem(CREATURE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Creature;
      if (
        parsed &&
        typeof parsed.id === 'string' &&
        parsed.personality &&
        typeof parsed.personality.bassAffinity === 'number'
      ) {
        return parsed;
      }
    }
  } catch {
    // fall through; we'll create a fresh creature
  }
  const fresh = createCreature();
  try {
    window.localStorage.setItem(CREATURE_KEY, JSON.stringify(fresh));
  } catch {
    // localStorage unavailable; runtime-only creature is fine
  }
  return fresh;
}

export function rerollCreature(): Creature {
  const fresh = createCreature();
  try {
    window.localStorage.setItem(CREATURE_KEY, JSON.stringify(fresh));
  } catch {
    // localStorage unavailable
  }
  return fresh;
}

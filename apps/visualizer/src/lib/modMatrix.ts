import { sanitizeModRoutings, type ModRouting } from '@torus/visualizers';

/**
 * Modulation-matrix persistence + factory. The data model, validation, and
 * per-frame runtime live in @torus/visualizers (`modulation.tsx`); this file
 * is just the app-side storage glue, mirroring `triggerActions.ts`.
 */

export const MOD_MATRIX_KEY = 'torus-visualizer-mod-matrix';

/** Sensible starter row: vocals gently brighten the frame. */
export function createModRouting(partial?: Partial<ModRouting>): ModRouting {
  return {
    id: crypto.randomUUID(),
    enabled: true,
    source: 'vocalActivity',
    target: 'bloomIntensity',
    amount: 0.25,
    curve: 'linear',
    glide: 0.4,
    ...partial,
  };
}

export function loadModMatrix(): ModRouting[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(MOD_MATRIX_KEY);
    if (!raw) return [];
    return sanitizeModRoutings(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function persistModMatrix(routings: ModRouting[]): void {
  try {
    localStorage.setItem(MOD_MATRIX_KEY, JSON.stringify(routings));
  } catch {
    // Storage full/unavailable — routings just don't survive the reload.
  }
}

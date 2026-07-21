import { describe, expect, it } from 'vitest';
import { createImpulses } from '@torus/visualizers';
import { applyProjectorImpulse } from './projectorSync';

describe('projector impulse delivery', () => {
  it('merges valid requests and bounds emitter bursts', () => {
    const impulses = createImpulses();

    expect(applyProjectorImpulse(impulses, 'emitterBurst', 5)).toBe(true);
    expect(impulses.emitterBurst).toBe(1);
    expect(applyProjectorImpulse(impulses, 'emitterBurst', 0.2)).toBe(true);
    expect(impulses.emitterBurst).toBe(1);
  });

  it('rejects malformed payloads and recovers non-finite current state', () => {
    const impulses = createImpulses();
    impulses.cinematicCut = Number.NaN;

    expect(applyProjectorImpulse(impulses, 'unknown', 1)).toBe(false);
    expect(applyProjectorImpulse(impulses, 'cinematicCut', Number.NaN)).toBe(false);
    expect(applyProjectorImpulse(impulses, 'cinematicCut', -1)).toBe(false);
    expect(applyProjectorImpulse(impulses, 'cinematicCut', 0.5)).toBe(true);
    expect(impulses.cinematicCut).toBe(0.5);
  });
});

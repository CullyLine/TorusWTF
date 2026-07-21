import { describe, expect, it } from 'vitest';
import { createImpulses } from '@torus/visualizers';
import {
  TRIGGER_ACTIONS,
  applyTriggerImpulse,
  triggerImpulseField,
} from './triggerActions';

describe('effect trigger actions', () => {
  it('exposes random shader, emitter burst, and cinematic cut actions', () => {
    expect(TRIGGER_ACTIONS).toEqual(
      expect.arrayContaining(['randomShader', 'emitParticles', 'nextCinematicCut']),
    );
    expect(triggerImpulseField('emitParticles')).toBe('emitterBurst');
    expect(triggerImpulseField('nextCinematicCut')).toBe('cinematicCut');
    expect(triggerImpulseField('randomShader')).toBeNull();
  });

  it('bounds emitter strength and keeps one-shot requests at their strongest value', () => {
    const impulses = createImpulses();
    expect(applyTriggerImpulse(impulses, 'emitParticles', 4)).toEqual({
      field: 'emitterBurst',
      strength: 1,
    });
    expect(impulses.emitterBurst).toBe(1);

    applyTriggerImpulse(impulses, 'emitParticles', 0.2);
    expect(impulses.emitterBurst).toBe(1);

    expect(applyTriggerImpulse(impulses, 'nextCinematicCut', 0.8)).toEqual({
      field: 'cinematicCut',
      strength: 0.8,
    });
    expect(impulses.cinematicCut).toBe(0.8);
  });

  it('recovers a poisoned impulse field without forwarding non-finite strength', () => {
    const impulses = createImpulses();
    impulses.emitterBurst = Number.NaN;

    expect(applyTriggerImpulse(impulses, 'emitParticles', Number.POSITIVE_INFINITY)).toEqual({
      field: 'emitterBurst',
      strength: 0,
    });
    expect(impulses.emitterBurst).toBe(0);

    applyTriggerImpulse(impulses, 'emitParticles', 0.4);
    expect(impulses.emitterBurst).toBe(0.4);
  });
});

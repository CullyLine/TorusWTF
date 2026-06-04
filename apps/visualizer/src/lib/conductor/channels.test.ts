import { describe, expect, it } from 'vitest';
import {
  conductorReducer,
  createDefaultProject,
  createTrack,
  nextFreeChannel,
  type ConductorProject,
} from './project';

describe('nextFreeChannel', () => {
  it('returns 0 for an empty project', () => {
    expect(nextFreeChannel([])).toBe(0);
  });

  it('picks the lowest unused channel', () => {
    const a = createTrack(0);
    a.channel = 0;
    const b = createTrack(1);
    b.channel = 2;
    expect(nextFreeChannel([a, b])).toBe(1);
  });
});

describe('insertTrack / addTrack channel assignment', () => {
  it('never reuses an existing channel (regression: chord track muted with original)', () => {
    let project: ConductorProject = createDefaultProject(); // 1 track on channel 0
    project = conductorReducer(project, { type: 'insertTrack', track: createTrack(99) });
    const channels = project.tracks.map((t) => t.channel);
    expect(new Set(channels).size).toBe(channels.length);
    expect(channels).toContain(0);
    expect(channels).toContain(1);
  });

  it('reclaims a freed channel after remove + add', () => {
    let project = createDefaultProject();
    project = conductorReducer(project, { type: 'addTrack' }); // ch 1
    const firstId = project.tracks[0]!.id;
    project = conductorReducer(project, { type: 'removeTrack', trackId: firstId }); // frees ch 0
    project = conductorReducer(project, { type: 'addTrack' }); // should take ch 0, not collide on 1
    const channels = project.tracks.map((t) => t.channel);
    expect(new Set(channels).size).toBe(channels.length);
  });
});

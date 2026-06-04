import { conductorEngine } from './engine';
import {
  audibleTrackIds,
  ticksToSeconds,
  secondsToTicks,
  type ConductorProject,
} from './project';

/**
 * Lookahead scheduler (Web Audio clock). Converts tick positions to absolute
 * AudioContext times and pre-schedules noteOn/noteOff a short horizon ahead,
 * the classic "A Tale of Two Clocks" pattern. Loop wrapping advances a moving
 * origin; the audible playhead is computed separately so the UI never jumps
 * ahead of what's actually sounding.
 */

const LOOKAHEAD_S = 0.15;
const INTERVAL_MS = 30;
const START_DELAY_S = 0.06;
const MAX_WRAPS_PER_TICK = 64;

interface SchedEvent {
  tick: number; // absolute song tick
  endTick: number;
  channel: number;
  pitch: number;
  velocity: number;
}

export interface LoopRegion {
  enabled: boolean;
  startTick: number;
  endTick: number;
}

function buildEvents(project: ConductorProject): SchedEvent[] {
  const audible = audibleTrackIds(project);
  const events: SchedEvent[] = [];
  for (const track of project.tracks) {
    if (!audible.has(track.id)) continue;
    for (const clip of track.clips) {
      for (const note of clip.notes) {
        const tick = clip.startTick + note.startTick;
        events.push({
          tick,
          endTick: tick + note.durationTick,
          channel: track.channel,
          pitch: note.pitch,
          velocity: note.velocity,
        });
      }
    }
  }
  events.sort((a, b) => a.tick - b.tick);
  return events;
}

export class ConductorScheduler {
  private project: ConductorProject | null = null;
  private events: SchedEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  private bpm = 120;
  private ppq = 480;

  private playStartCtx = 0; // ctx time when playback began
  private playStartTick = 0; // song tick at playStartCtx
  private loop: LoopRegion = { enabled: false, startTick: 0, endTick: 0 };

  // Scheduling origin (may run ahead of audible time across loop wraps).
  private originCtx = 0;
  private originTick = 0;
  private idx = 0;

  playing = false;

  start(project: ConductorProject, fromTick: number, loop: LoopRegion): void {
    const ctx = conductorEngine.getContext();
    if (!ctx) return;
    void conductorEngine.resume();

    this.stop();
    this.project = project;
    this.bpm = project.bpm;
    this.ppq = project.ppq;
    this.events = buildEvents(project);
    this.loop = loop.enabled && loop.endTick > loop.startTick ? loop : { ...loop, enabled: false };

    // Apply per-track instrument + volume so playback (and preview) sound right.
    for (const track of project.tracks) {
      conductorEngine.setChannelPreset(track.channel, track.preset);
      conductorEngine.setChannelVolume(track.channel, track.mute ? 0 : track.volume);
    }

    let start = fromTick;
    if (this.loop.enabled && (start < this.loop.startTick || start >= this.loop.endTick)) {
      start = this.loop.startTick;
    }

    this.playStartCtx = ctx.currentTime + START_DELAY_S;
    this.playStartTick = start;
    this.originCtx = this.playStartCtx;
    this.originTick = start;
    this.idx = this.firstEventAtOrAfter(start);
    this.playing = true;

    this.tick();
    this.timer = setInterval(() => this.tick(), INTERVAL_MS);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.playing) conductorEngine.stopAll();
    this.playing = false;
  }

  /** Audible song tick for the UI playhead. Accounts for looping. */
  getTick(): number {
    const ctx = conductorEngine.getContext();
    if (!ctx || !this.playing) return this.playStartTick;
    const elapsed = ctx.currentTime - this.playStartCtx;
    if (elapsed <= 0) return this.playStartTick;

    if (!this.loop.enabled) {
      return this.playStartTick + secondsToTicks(elapsed, this.bpm, this.ppq);
    }
    const firstSeg = ticksToSeconds(this.loop.endTick - this.playStartTick, this.bpm, this.ppq);
    if (elapsed < firstSeg) {
      return this.playStartTick + secondsToTicks(elapsed, this.bpm, this.ppq);
    }
    const loopSec = ticksToSeconds(this.loop.endTick - this.loop.startTick, this.bpm, this.ppq);
    const rem = (elapsed - firstSeg) % loopSec;
    return this.loop.startTick + secondsToTicks(rem, this.bpm, this.ppq);
  }

  /** True once the (non-looping) song has fully played past its last event. */
  isFinished(endTick: number): boolean {
    if (this.loop.enabled || !this.playing) return false;
    return this.getTick() >= endTick;
  }

  private firstEventAtOrAfter(tick: number): number {
    let lo = 0;
    let hi = this.events.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.events[mid]!.tick < tick) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  private tick(): void {
    const ctx = conductorEngine.getContext();
    if (!ctx || !this.playing) return;
    const horizon = ctx.currentTime + LOOKAHEAD_S;

    let wraps = 0;
    while (wraps < MAX_WRAPS_PER_TICK) {
      const segEndTick = this.loop.enabled ? this.loop.endTick : Infinity;
      let blocked = false;

      while (this.idx < this.events.length) {
        const ev = this.events[this.idx]!;
        if (ev.tick >= segEndTick) break;
        const onTime = this.originCtx + ticksToSeconds(ev.tick - this.originTick, this.bpm, this.ppq);
        if (onTime > horizon) {
          blocked = true;
          break;
        }
        const clampedEnd = this.loop.enabled ? Math.min(ev.endTick, this.loop.endTick) : ev.endTick;
        const offTime = this.originCtx + ticksToSeconds(clampedEnd - this.originTick, this.bpm, this.ppq);
        conductorEngine.noteOn(ev.channel, ev.pitch, ev.velocity, { time: Math.max(onTime, ctx.currentTime) });
        conductorEngine.noteOff(ev.channel, ev.pitch, { time: Math.max(offTime, onTime + 0.01) });
        this.idx++;
      }

      if (!this.loop.enabled) return;

      const reachedSegEnd = this.idx >= this.events.length || this.events[this.idx]!.tick >= segEndTick;
      if (blocked || !reachedSegEnd) return;

      // Wrap: advance origin to the loop start of the next pass.
      this.originCtx += ticksToSeconds(this.loop.endTick - this.originTick, this.bpm, this.ppq);
      this.originTick = this.loop.startTick;
      this.idx = this.firstEventAtOrAfter(this.loop.startTick);
      wraps++;
      if (this.originCtx > horizon) return;
    }
  }
}

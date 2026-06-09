import { WorkletSynthesizer } from 'spessasynth_lib';
import { MIDIControllers } from 'spessasynth_core';

/**
 * ConductorEngine — a module singleton wrapping a single spessasynth
 * WorkletSynthesizer (off the main thread). Mirrors the singleton style of
 * the visualizer's audio graph. It owns one AudioContext, the synth, and an
 * AnalyserNode tap so Conductor's output can later drive the visualizer.
 *
 * One synth = 16 MIDI channels, so v1 maps each track to a channel (0..15).
 */

const WORKLET_URL = '/conductor/spessasynth_processor.min.js';
const DEFAULT_SF_URL = '/conductor/soundfonts/old-school-runescape.sf2';

export const DEFAULT_SOUNDFONT_ID = 'osrs';
export const DEFAULT_SOUNDFONT_NAME = 'Old School RuneScape';

export interface PresetInfo {
  bankMSB: number;
  bankLSB: number;
  program: number;
  name: string;
  isDrum: boolean;
}

export interface SoundfontInfo {
  id: string;
  name: string;
  presets: PresetInfo[];
}

export interface SoundfontLoadProgress {
  loaded: number;
  total: number | null;
}

class ConductorEngine {
  private ctx: AudioContext | null = null;
  private synth: WorkletSynthesizer | null = null;
  private analyser: AnalyserNode | null = null;
  private initPromise: Promise<void> | null = null;
  private defaultPromise: Promise<SoundfontInfo> | null = null;
  private loaded = new Map<string, string>();

  get isInitialized(): boolean {
    return this.synth !== null;
  }

  /** Idempotent. Creates the AudioContext, worklet, synth and analyser tap. */
  async init(): Promise<void> {
    if (typeof window === 'undefined') return;
    if (this.synth) return;
    if (!this.initPromise) this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    const Ctx: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    await ctx.audioWorklet.addModule(WORKLET_URL);
    const synth = new WorkletSynthesizer(ctx);
    await synth.isReady;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;

    synth.connect(analyser);
    analyser.connect(ctx.destination);

    this.ctx = ctx;
    this.synth = synth;
    this.analyser = analyser;
  }

  resetDefaultSoundfont(): void {
    this.defaultPromise = null;
  }

  /** Fetches + registers the bundled default soundfont (once). */
  async ensureDefaultSoundfont(
    onProgress?: (progress: SoundfontLoadProgress) => void,
  ): Promise<SoundfontInfo> {
    await this.init();
    if (!this.defaultPromise) {
      this.defaultPromise = this.fetchDefaultSoundfont(onProgress);
    }
    return this.defaultPromise;
  }

  private async fetchDefaultSoundfont(
    onProgress?: (progress: SoundfontLoadProgress) => void,
  ): Promise<SoundfontInfo> {
    const res = await fetch(DEFAULT_SF_URL);
    if (!res.ok) throw new Error(`Failed to load default soundfont (${res.status})`);

    const totalHeader = res.headers.get('content-length');
    const total = totalHeader ? Number.parseInt(totalHeader, 10) : null;
    onProgress?.({ loaded: 0, total: Number.isFinite(total) ? total : null });

    let buf: ArrayBuffer;
    if (res.body) {
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let loaded = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.byteLength;
        onProgress?.({ loaded, total: Number.isFinite(total) ? total : null });
      }
      const merged = new Uint8Array(loaded);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
      }
      buf = merged.buffer;
    } else {
      buf = await res.arrayBuffer();
      onProgress?.({ loaded: buf.byteLength, total: buf.byteLength });
    }

    await this.synth!.soundBankManager.addSoundBank(buf, DEFAULT_SOUNDFONT_ID);
    this.loaded.set(DEFAULT_SOUNDFONT_ID, DEFAULT_SOUNDFONT_NAME);
    return { id: DEFAULT_SOUNDFONT_ID, name: DEFAULT_SOUNDFONT_NAME, presets: this.getPresets() };
  }

  /** Registers a user-uploaded soundfont (SF2/SF3/DLS). */
  async loadSoundfont(file: File): Promise<SoundfontInfo> {
    await this.init();
    const buf = await file.arrayBuffer();
    const id = `user-${Date.now()}`;
    await this.synth!.soundBankManager.addSoundBank(buf, id);
    const name = file.name.replace(/\.(sf2|sf3|dls|sfogg)$/i, '');
    this.loaded.set(id, name);
    return { id, name, presets: this.getPresets() };
  }

  /** Flattened list of every preset across the currently loaded soundbanks. */
  getPresets(): PresetInfo[] {
    if (!this.synth) return [];
    return this.synth.presetList.map((p) => ({
      bankMSB: p.bankMSB,
      bankLSB: p.bankLSB,
      program: p.program,
      name: p.name,
      isDrum: p.isDrum,
    }));
  }

  /** Selects bank + program on a channel (track). */
  setChannelPreset(channel: number, preset: { bankMSB: number; bankLSB: number; program: number }): void {
    if (!this.synth) return;
    this.synth.controllerChange(channel, MIDIControllers.bankSelect, preset.bankMSB);
    this.synth.controllerChange(channel, MIDIControllers.bankSelectLSB, preset.bankLSB);
    this.synth.programChange(channel, preset.program);
  }

  setChannelVolume(channel: number, volume0to1: number): void {
    if (!this.synth) return;
    const v = Math.max(0, Math.min(127, Math.round(volume0to1 * 127)));
    this.synth.controllerChange(channel, MIDIControllers.mainVolume, v);
  }

  noteOn(channel: number, midiNote: number, velocity = 100, options?: { time: number }): void {
    this.synth?.noteOn(channel, midiNote, velocity, options);
  }

  noteOff(channel: number, midiNote: number, options?: { time: number }): void {
    this.synth?.noteOff(channel, midiNote, options);
  }

  /** Panic: cut every voice immediately. */
  stopAll(): void {
    this.synth?.stopAll(true);
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  getContext(): AudioContext | null {
    return this.ctx;
  }

  get currentTime(): number {
    return this.ctx?.currentTime ?? 0;
  }

  async resume(): Promise<void> {
    await this.ctx?.resume();
  }
}

export const conductorEngine = new ConductorEngine();

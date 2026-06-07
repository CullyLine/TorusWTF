/**
 * Registry of Lab compute services. Single source of truth for pricing,
 * limits, and metadata — shared by the web app (cost display, validation,
 * public API, MCP server) and the worker (routing, execution).
 *
 * Pricing is in credits (1 credit = 1 US cent). Each service is priced to sit
 * comfortably above provider compute cost while undercutting competitors.
 */

export type ServiceId = 'stems';

export interface ServiceDef {
  id: ServiceId;
  label: string;
  /** One-line description for UI + API discovery. */
  description: string;
  /** Flat price per run, in credits. */
  creditCost: number;
  /** Max input file size accepted, in bytes. */
  maxInputBytes: number;
  /** Accepted input mime-type prefixes (e.g. "audio/"). */
  acceptMime: string[];
  /** Output artifacts a successful run produces. */
  outputs: string[];
}

export const MAX_AUDIO_BYTES = 50 * 1024 * 1024; // 50 MB

export const SERVICES: Record<ServiceId, ServiceDef> = {
  stems: {
    id: 'stems',
    label: 'Stem separation',
    description:
      'Split a song into isolated stems (vocals, drums, bass, other) using Demucs v4.',
    creditCost: 10, // ~$0.10; provider cost ~$0.02-0.03
    maxInputBytes: MAX_AUDIO_BYTES,
    acceptMime: ['audio/'],
    outputs: ['vocals', 'drums', 'bass', 'other'],
  },
};

export function getService(id: string): ServiceDef | undefined {
  return SERVICES[id as ServiceId];
}

export function isServiceId(id: string): id is ServiceId {
  return id in SERVICES;
}

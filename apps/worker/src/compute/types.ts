/**
 * Compute provider abstraction. Today the only backend is Replicate (rent GPUs
 * by the second). Later a `home3090` provider implementing the same interface
 * lets us migrate the same jobs onto a self-hosted RTX 3090 with zero changes to
 * the job pipeline — "rent now, own later".
 */

export interface StemSeparationInput {
  /** Presigned URL the provider can fetch the source audio from. */
  audioUrl: string;
}

export interface StemSeparationResult {
  /** Stem name -> audio bytes (mp3). e.g. { vocals, drums, bass, other }. */
  stems: Record<string, Buffer>;
  /** Remote prediction/job id for traceability, if any. */
  providerJobId?: string;
  /** Best-effort provider cost in USD, if the provider reports it. */
  costUsd?: number;
}

export interface ComputeProvider {
  /** Stable identifier persisted on jobs (e.g. "replicate", "home3090"). */
  readonly name: string;
  separateStems(input: StemSeparationInput): Promise<StemSeparationResult>;
}

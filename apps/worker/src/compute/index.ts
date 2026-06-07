import type { ComputeProvider } from './types.js';
import { replicateProvider } from './replicate.js';

export type { ComputeProvider, StemSeparationInput, StemSeparationResult } from './types.js';
export { replicateProvider } from './replicate.js';

const PROVIDERS: Record<string, ComputeProvider> = {
  replicate: replicateProvider,
  // home3090: home3090Provider,  // added when the self-hosted GPU comes online
};

/**
 * Resolve the compute provider for a service. For now everything routes to
 * Replicate; per-service overrides land here (e.g. via COMPUTE_PROVIDER_STEMS).
 */
export function getProviderFor(_service: string): ComputeProvider {
  const name = process.env.COMPUTE_PROVIDER ?? 'replicate';
  const provider = PROVIDERS[name];
  if (!provider) throw new Error(`Unknown compute provider: ${name}`);
  return provider;
}

import type { Storage, StorageConfig } from './types';
import { S3Storage } from './drivers/s3';
import { AzureStorage } from './drivers/azure';
import { GcsStorage } from './drivers/gcs';

/**
 * Build a Storage backend from runtime config.
 * MinIO and S3 share the same driver — MinIO simply requires path-style addressing
 * and a custom endpoint, which the S3 driver handles natively.
 */
export function createStorage(config?: Partial<StorageConfig>): Storage {
  const merged: StorageConfig = {
    driver: (config?.driver ?? (process.env.STORAGE_DRIVER as StorageConfig['driver'])) || 'minio',
    bucket: config?.bucket ?? process.env.STORAGE_BUCKET ?? 'torus-clips',
    region: config?.region ?? process.env.STORAGE_REGION ?? 'us-east-1',
    endpoint: config?.endpoint ?? process.env.STORAGE_ENDPOINT,
    accessKey: config?.accessKey ?? process.env.STORAGE_ACCESS_KEY,
    secretKey: config?.secretKey ?? process.env.STORAGE_SECRET_KEY,
    publicUrl: config?.publicUrl ?? process.env.STORAGE_PUBLIC_URL,
  };

  switch (merged.driver) {
    case 'minio':
    case 's3':
      return new S3Storage(merged);
    case 'azure':
      return new AzureStorage(merged);
    case 'gcs':
      return new GcsStorage(merged);
    default: {
      const _exhaustive: never = merged.driver;
      throw new Error(`Unknown STORAGE_DRIVER: ${_exhaustive}`);
    }
  }
}

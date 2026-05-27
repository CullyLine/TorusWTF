export type StorageDriver = 'minio' | 's3' | 'azure' | 'gcs';

export interface StorageConfig {
  driver: StorageDriver;
  bucket: string;
  region?: string;
  endpoint?: string;
  accessKey?: string;
  secretKey?: string;
  /** Public URL prefix where stored objects can be fetched. Caddy or CDN. */
  publicUrl?: string;
}

/**
 * Abstracts S3-compatible / Azure / GCS object storage behind one tiny surface.
 * Implementations live in `./drivers/*` and are picked by `createStorage()`.
 */
export interface Storage {
  /** Returns a presigned PUT URL the browser can upload directly to. */
  uploadPresignedUrl(key: string, contentType: string, expiresInSec?: number): Promise<string>;

  /** Returns a presigned GET URL for a private object. */
  downloadPresignedUrl(key: string, expiresInSec?: number): Promise<string>;

  /** Uploads bytes directly from the server (used by the worker for derived artifacts). */
  putObject(
    key: string,
    body: Uint8Array | Buffer,
    contentType?: string,
    cacheControl?: string,
  ): Promise<void>;

  /** Deletes a single object. Idempotent — no-throw if missing. */
  deleteObject(key: string): Promise<void>;

  /** Returns true if the object exists. */
  objectExists(key: string): Promise<boolean>;

  /** Public canonical URL (CDN-or-storage-fronted). */
  publicUrl(key: string): string;

  /** Returns total bytes stored in the bucket. Best-effort, may be expensive. */
  totalBytes?(): Promise<number>;
}

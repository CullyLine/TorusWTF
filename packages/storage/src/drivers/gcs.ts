import { Storage as GcsClient } from '@google-cloud/storage';
import type { Storage, StorageConfig } from '../types';

/**
 * Native Google Cloud Storage driver. Auth via STORAGE_ACCESS_KEY (project id) +
 * STORAGE_SECRET_KEY (raw service-account-json string), or via the standard
 * GOOGLE_APPLICATION_CREDENTIALS env var pointing at a key file.
 */
export class GcsStorage implements Storage {
  private readonly client: GcsClient;
  private readonly bucketName: string;
  private readonly publicUrlBase: string;

  constructor(config: StorageConfig) {
    this.bucketName = config.bucket;
    this.publicUrlBase =
      config.publicUrl?.replace(/\/$/, '') ?? `https://storage.googleapis.com/${config.bucket}`;

    let credentials: object | undefined;
    if (config.secretKey?.trim().startsWith('{')) {
      try {
        credentials = JSON.parse(config.secretKey);
      } catch {
        throw new Error('GCS driver: STORAGE_SECRET_KEY looks like JSON but failed to parse.');
      }
    }

    this.client = new GcsClient({
      projectId: config.accessKey,
      credentials,
    });
  }

  private bucket() {
    return this.client.bucket(this.bucketName);
  }

  async uploadPresignedUrl(key: string, contentType: string, expiresInSec = 900): Promise<string> {
    const [url] = await this.bucket().file(key).getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + expiresInSec * 1000,
      contentType,
    });
    return url;
  }

  async downloadPresignedUrl(key: string, expiresInSec = 3600): Promise<string> {
    const [url] = await this.bucket().file(key).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + expiresInSec * 1000,
    });
    return url;
  }

  async putObject(
    key: string,
    body: Uint8Array | Buffer,
    contentType?: string,
    cacheControl?: string,
  ): Promise<void> {
    await this.bucket().file(key).save(Buffer.from(body), {
      metadata: { contentType, cacheControl },
      resumable: false,
    });
  }

  async deleteObject(key: string): Promise<void> {
    await this.bucket().file(key).delete({ ignoreNotFound: true });
  }

  async objectExists(key: string): Promise<boolean> {
    const [exists] = await this.bucket().file(key).exists();
    return exists;
  }

  publicUrl(key: string): string {
    return `${this.publicUrlBase}/${key}`;
  }

  async totalBytes(): Promise<number> {
    let total = 0;
    const [files] = await this.bucket().getFiles();
    for (const f of files) {
      const size = Number(f.metadata.size ?? 0);
      total += Number.isFinite(size) ? size : 0;
    }
    return total;
  }
}

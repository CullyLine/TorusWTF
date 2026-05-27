import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Storage, StorageConfig } from '../types';

/**
 * S3-compatible driver. Works with AWS S3, MinIO, Cloudflare R2, Backblaze B2,
 * Wasabi, Hetzner, DigitalOcean Spaces — anything that speaks the S3 API.
 *
 * For MinIO and other on-prem S3-compat services, set a custom `endpoint`
 * (e.g. `http://localhost:9000`) and we enable path-style addressing automatically.
 */
export class S3Storage implements Storage {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrlBase: string;

  constructor(config: StorageConfig) {
    this.bucket = config.bucket;
    this.publicUrlBase =
      config.publicUrl?.replace(/\/$/, '') ??
      (config.endpoint
        ? `${config.endpoint.replace(/\/$/, '')}/${config.bucket}`
        : `https://${config.bucket}.s3.${config.region}.amazonaws.com`);

    this.client = new S3Client({
      region: config.region ?? 'us-east-1',
      endpoint: config.endpoint,
      forcePathStyle: Boolean(config.endpoint), // MinIO / R2 / etc.
      credentials:
        config.accessKey && config.secretKey
          ? { accessKeyId: config.accessKey, secretAccessKey: config.secretKey }
          : undefined,
    });
  }

  async uploadPresignedUrl(key: string, contentType: string, expiresInSec = 900): Promise<string> {
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(this.client, cmd, { expiresIn: expiresInSec });
  }

  async downloadPresignedUrl(key: string, expiresInSec = 3600): Promise<string> {
    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, cmd, { expiresIn: expiresInSec });
  }

  async putObject(
    key: string,
    body: Uint8Array | Buffer,
    contentType?: string,
    cacheControl?: string,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: cacheControl,
      }),
    );
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async objectExists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (err) {
      if ((err as { name?: string }).name === 'NotFound') return false;
      throw err;
    }
  }

  publicUrl(key: string): string {
    return `${this.publicUrlBase}/${key}`;
  }

  async totalBytes(): Promise<number> {
    let total = 0;
    let token: string | undefined;
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, ContinuationToken: token }),
      );
      for (const obj of res.Contents ?? []) total += obj.Size ?? 0;
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return total;
  }
}

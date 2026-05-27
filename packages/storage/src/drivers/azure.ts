import {
  BlobServiceClient,
  BlobSASPermissions,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
} from '@azure/storage-blob';
import type { ContainerClient } from '@azure/storage-blob';
import type { Storage, StorageConfig } from '../types';

/**
 * Native Azure Blob Storage driver. Requires accessKey + secretKey (account name + key).
 * STORAGE_ENDPOINT can override the default `https://<account>.blob.core.windows.net`.
 */
export class AzureStorage implements Storage {
  private readonly container: ContainerClient;
  private readonly credential: StorageSharedKeyCredential;
  private readonly publicUrlBase: string;
  private readonly accountName: string;
  private readonly containerName: string;

  constructor(config: StorageConfig) {
    if (!config.accessKey || !config.secretKey) {
      throw new Error('Azure driver requires STORAGE_ACCESS_KEY (account name) and STORAGE_SECRET_KEY (account key).');
    }
    this.accountName = config.accessKey;
    this.containerName = config.bucket;
    this.credential = new StorageSharedKeyCredential(config.accessKey, config.secretKey);
    const endpoint = config.endpoint ?? `https://${config.accessKey}.blob.core.windows.net`;
    const service = new BlobServiceClient(endpoint, this.credential);
    this.container = service.getContainerClient(config.bucket);
    this.publicUrlBase =
      config.publicUrl?.replace(/\/$/, '') ?? `${endpoint}/${config.bucket}`;
  }

  async uploadPresignedUrl(key: string, contentType: string, expiresInSec = 900): Promise<string> {
    const expiresOn = new Date(Date.now() + expiresInSec * 1000);
    const sas = generateBlobSASQueryParameters(
      {
        containerName: this.containerName,
        blobName: key,
        permissions: BlobSASPermissions.parse('cw'),
        expiresOn,
        contentType,
      },
      this.credential,
    ).toString();
    return `${this.container.getBlockBlobClient(key).url}?${sas}`;
  }

  async downloadPresignedUrl(key: string, expiresInSec = 3600): Promise<string> {
    const expiresOn = new Date(Date.now() + expiresInSec * 1000);
    const sas = generateBlobSASQueryParameters(
      {
        containerName: this.containerName,
        blobName: key,
        permissions: BlobSASPermissions.parse('r'),
        expiresOn,
      },
      this.credential,
    ).toString();
    return `${this.container.getBlockBlobClient(key).url}?${sas}`;
  }

  async putObject(
    key: string,
    body: Uint8Array | Buffer,
    contentType?: string,
    cacheControl?: string,
  ): Promise<void> {
    await this.container.getBlockBlobClient(key).uploadData(body, {
      blobHTTPHeaders: { blobContentType: contentType, blobCacheControl: cacheControl },
    });
  }

  async deleteObject(key: string): Promise<void> {
    await this.container.getBlockBlobClient(key).deleteIfExists();
  }

  async objectExists(key: string): Promise<boolean> {
    return this.container.getBlockBlobClient(key).exists();
  }

  publicUrl(key: string): string {
    return `${this.publicUrlBase}/${key}`;
  }

  async totalBytes(): Promise<number> {
    let total = 0;
    for await (const blob of this.container.listBlobsFlat()) {
      total += blob.properties.contentLength ?? 0;
    }
    return total;
  }
}

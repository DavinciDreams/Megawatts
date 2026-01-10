/**
 * S3/MinIO Object Storage Client
 *
 * Provides S3-compatible object storage operations for S3 and MinIO.
 * Features include compression, streaming, versioning, and retry logic.
 */

import { Logger } from '../../utils/logger';
import { StorageError, StorageErrorCode } from '../errors/storageError';
import { promisify } from 'util';
import * as zlib from 'zlib';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export interface S3Config {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  region?: string;
  bucket?: string;
  forcePathStyle?: boolean;
  useSSL?: boolean;
}

export interface UploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
  tags?: Record<string, string>;
  acl?: 'private' | 'public-read' | 'public-read-write';
  compress?: boolean;
}

export interface DownloadOptions {
  decompress?: boolean;
  versionId?: string;
}

export interface DeleteOptions {
  versionId?: string;
}

export interface ListOptions {
  prefix?: string;
  delimiter?: string;
  maxKeys?: number;
  continuationToken?: string;
  versionIdMarker?: string;
}

export interface ListResult {
  objects: S3Object[];
  versions: S3ObjectVersion[];
  isTruncated: boolean;
  nextContinuationToken?: string;
  nextVersionIdMarker?: string;
}

export interface S3Object {
  key: string;
  size: number;
  lastModified: Date;
  etag: string;
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface S3ObjectVersion {
  key: string;
  versionId: string;
  size: number;
  lastModified: Date;
  etag: string;
  isLatest: boolean;
}

export interface S3ClientStats {
  uploads: number;
  downloads: number;
  deletes: number;
  errors: number;
  bytesUploaded: number;
  bytesDownloaded: number;
}

// ============================================================================
// S3 CLIENT CLASS
// ============================================================================

// Type definitions for S3 response objects (since AWS SDK v3 is not installed)
interface PutObjectOutput {
  ETag?: string;
  VersionId?: string;
}

interface GetObjectOutput {
  Body: Buffer | NodeJS.ReadableStream;
  Metadata?: Record<string, string>;
  ContentLength?: number;
}

interface ListObjectsV2Output {
  Contents?: Array<{
    Key?: string;
    Size?: number;
    LastModified?: Date;
    ETag?: string;
    ContentType?: string;
  }>;
  IsTruncated?: boolean;
  NextContinuationToken?: string;
}

interface ListObjectVersionsOutput {
  Versions?: Array<{
    Key?: string;
    VersionId?: string;
    Size?: number;
    LastModified?: Date;
    ETag?: string;
    IsLatest?: boolean;
  }>;
  IsTruncated?: boolean;
  NextKeyMarker?: string;
  NextVersionIdMarker?: string;
}

interface HeadObjectOutput {
  Metadata?: Record<string, string>;
}

interface CopyObjectOutput {
  CopyObjectResult?: {
    ETag?: string;
  };
  VersionId?: string;
}

export class S3Client {
  private logger: Logger;
  private config: S3Config;
  private client: any; // AWS SDK S3 client
  private isConnected: boolean = false;
  private maxRetries: number = 3;
  private healthCheckInterval?: NodeJS.Timeout;
  private stats: S3ClientStats = {
    uploads: 0,
    downloads: 0,
    deletes: 0,
    errors: 0,
    bytesUploaded: 0,
    bytesDownloaded: 0
  };

  constructor(logger: Logger, config: S3Config) {
    this.logger = logger;
    this.config = config;
  }

  /**
   * Initialize S3 client connection
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing S3/MinIO client', {
        endpoint: this.config.endpoint,
        bucket: this.config.bucket,
        region: this.config.region
      });

      // Import AWS SDK v3 S3 client
      const { S3Client: AWSClient } = await import('@aws-sdk/client-s3');
      const {
        NodeHttpHandler,
        NodeHttp2Handler
      } = await import('@smithy/node-http-handler');

      const clientConfig: any = {
        endpoint: this.config.useSSL === false
          ? this.config.endpoint.replace('https://', 'http://').replace('http://', 'http://')
          : this.config.endpoint,
        credentials: {
          accessKeyId: this.config.accessKey,
          secretAccessKey: this.config.secretKey
        },
        region: this.config.region || 'us-east-1',
        forcePathStyle: this.config.forcePathStyle !== false,
        maxAttempts: this.maxRetries
      };

      // Use HTTP/2 handler if available for better performance
      try {
        clientConfig.requestHandler = new NodeHttp2Handler();
      } catch {
        clientConfig.requestHandler = new NodeHttpHandler();
      }

      this.client = new AWSClient(clientConfig);
      this.isConnected = true;

      this.logger.info('S3/MinIO client initialized successfully');

      // Start health check interval
      this.startHealthCheck();

      // Verify bucket exists, create if needed
      await this.ensureBucket();
    } catch (error: any) {
      this.isConnected = false;
      this.logger.error('Failed to initialize S3/MinIO client', error);
      throw new StorageError(
        StorageErrorCode.CONNECTION_FAILED,
        `Failed to initialize S3/MinIO client: ${error.message}`,
        { originalError: error }
      );
    }
  }

  /**
   * Upload object to S3/MinIO with optional compression
   */
  async upload(
    key: string,
    data: Buffer | string,
    options: UploadOptions = {}
  ): Promise<{ key: string; etag: string; versionId?: string; compressed: boolean }> {
    await this.ensureConnected();

    const startTime = Date.now();
    let compressed = false;
    let uploadData = data;

    try {
      // Apply compression if enabled
      if (options.compress !== false) {
        const dataBuffer = typeof data === 'string' ? Buffer.from(data) : data;
        const compressedBuffer = await gzip(dataBuffer);

        // Only use compression if it reduces size by at least 10%
        if (compressedBuffer.length < dataBuffer.length * 0.9) {
          uploadData = compressedBuffer;
          compressed = true;
          this.logger.debug(`Compressed ${key}: ${dataBuffer.length} -> ${compressedBuffer.length} bytes`);
        }
      }

      const dataSize = typeof uploadData === 'string' ? uploadData.length : uploadData.length;

      this.logger.info(`Uploading object: ${key}`, {
        size: dataSize,
        contentType: options.contentType,
        compressed
      });

      const uploadParams: any = {
        Bucket: this.config.bucket,
        Key: key,
        Body: uploadData,
        ContentType: options.contentType || 'application/octet-stream',
        Metadata: {
          ...options.metadata,
          'x-amz-compressed': compressed.toString(),
          'x-amz-original-size': (typeof data === 'string' ? data.length : data.length).toString()
        },
        Tagging: options.tags ? this.formatTags(options.tags) : undefined,
        ACL: options.acl || 'private'
      };

      const result = await this.executeWithRetry(
        () => this.client.putObject(uploadParams) as Promise<PutObjectOutput>
      ) as PutObjectOutput;

      const duration = Date.now() - startTime;

      // Update stats
      this.stats.uploads++;
      this.stats.bytesUploaded += dataSize;

      this.logger.info(`Object uploaded successfully: ${key}`, {
        etag: result.ETag,
        versionId: result.VersionId,
        compressed,
        duration: `${duration}ms`
      });

      return {
        key,
        etag: result.ETag || '',
        versionId: result.VersionId,
        compressed
      };
    } catch (error: any) {
      this.stats.errors++;
      this.logger.error('Failed to upload object', error);
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        `Failed to upload object ${key}: ${error.message}`,
        { key, originalError: error }
      );
    }
  }

  /**
   * Download object from S3/MinIO with optional decompression
   */
  async download(key: string, options: DownloadOptions = {}): Promise<Buffer> {
    await this.ensureConnected();

    const startTime = Date.now();

    try {
      this.logger.info(`Downloading object: ${key}`, {
        decompress: options.decompress,
        versionId: options.versionId
      });

      const downloadParams: any = {
        Bucket: this.config.bucket,
        Key: key
      };

      if (options.versionId) {
        downloadParams.VersionId = options.versionId;
      }

      const result = (await this.executeWithRetry(
        () => this.client.getObject(downloadParams)
      )) as GetObjectOutput;

      let data = result.Body as Buffer;
      const metadata = result.Metadata || {};
      const isCompressed = metadata['x-amz-compressed'] === 'true';

      // Apply decompression if needed
      if (options.decompress !== false && isCompressed) {
        data = await gunzip(data);
        this.logger.debug(`Decompressed ${key}: ${result.ContentLength} -> ${data.length} bytes`);
      }

      const duration = Date.now() - startTime;

      // Update stats
      this.stats.downloads++;
      this.stats.bytesDownloaded += data.length;

      this.logger.info(`Object downloaded successfully: ${key}`, {
        size: data.length,
        compressed: isCompressed,
        duration: `${duration}ms`
      });

      return data;
    } catch (error: any) {
      this.stats.errors++;
      this.logger.error('Failed to download object', error);
      throw new StorageError(
        StorageErrorCode.RESOURCE_NOT_FOUND,
        `Failed to download object ${key}: ${error.message}`,
        { key, originalError: error }
      );
    }
  }

  /**
   * Download object as stream for large files
   */
  async downloadStream(
    key: string,
    options: DownloadOptions = {}
  ): Promise<NodeJS.ReadableStream> {
    await this.ensureConnected();

    try {
      this.logger.info(`Downloading object as stream: ${key}`, {
        versionId: options.versionId
      });

      const downloadParams: any = {
        Bucket: this.config.bucket,
        Key: key
      };

      if (options.versionId) {
        downloadParams.VersionId = options.versionId;
      }

      const result = await this.executeWithRetry(
        () => this.client.getObject(downloadParams)
      ) as GetObjectOutput;

      this.logger.info(`Object stream created successfully: ${key}`);

      return result.Body as NodeJS.ReadableStream;
    } catch (error: any) {
      this.stats.errors++;
      this.logger.error('Failed to download object stream', error);
      throw new StorageError(
        StorageErrorCode.RESOURCE_NOT_FOUND,
        `Failed to download object stream ${key}: ${error.message}`,
        { key, originalError: error }
      );
    }
  }

  /**
   * Delete object from S3/MinIO with optional version support
   */
  async delete(key: string, options: DeleteOptions = {}): Promise<{ deleted: boolean; versionId?: string }> {
    await this.ensureConnected();

    try {
      this.logger.info(`Deleting object: ${key}`, {
        versionId: options.versionId
      });

      const deleteParams: any = {
        Bucket: this.config.bucket,
        Key: key
      };

      if (options.versionId) {
        deleteParams.VersionId = options.versionId;
      }

      await this.executeWithRetry(
        () => this.client.deleteObject(deleteParams)
      );

      // Update stats
      this.stats.deletes++;

      this.logger.info(`Object deleted successfully: ${key}`, {
        versionId: options.versionId
      });

      return {
        deleted: true,
        versionId: options.versionId
      };
    } catch (error: any) {
      this.stats.errors++;
      this.logger.error('Failed to delete object', error);
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        `Failed to delete object ${key}: ${error.message}`,
        { key, originalError: error }
      );
    }
  }

  /**
   * List objects in bucket with pagination support
   */
  async list(options: ListOptions = {}): Promise<ListResult> {
    await this.ensureConnected();

    try {
      this.logger.info('Listing objects', {
        prefix: options.prefix,
        maxKeys: options.maxKeys,
        versionIdMarker: options.versionIdMarker
      });

      const listParams: any = {
        Bucket: this.config.bucket,
        Prefix: options.prefix,
        Delimiter: options.delimiter,
        MaxKeys: options.maxKeys,
        ContinuationToken: options.continuationToken
      };

      const result = await this.executeWithRetry(
        () => this.client.listObjectsV2(listParams)
      ) as ListObjectsV2Output;

      const objects: S3Object[] = ((result as any).Contents || []).map(item => ({
        key: item.Key!,
        size: item.Size!,
        lastModified: item.LastModified!,
        etag: item.ETag!,
        contentType: item.ContentType
      }));

      this.logger.info(`Listed ${objects.length} objects`);

      return {
        objects,
        versions: [],
        isTruncated: (result as any).IsTruncated || false,
        nextContinuationToken: (result as any).NextContinuationToken
      };
    } catch (error: any) {
      this.logger.error('Failed to list objects', error);
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        `Failed to list objects: ${error.message}`,
        { originalError: error }
      );
    }
  }

  /**
   * List object versions with pagination support
   */
  async listVersions(options: ListOptions = {}): Promise<ListResult> {
    await this.ensureConnected();

    try {
      this.logger.info('Listing object versions', {
        prefix: options.prefix,
        maxKeys: options.maxKeys,
        versionIdMarker: options.versionIdMarker
      });

      const listParams: any = {
        Bucket: this.config.bucket,
        Prefix: options.prefix,
        Delimiter: options.delimiter,
        MaxKeys: options.maxKeys,
        KeyMarker: options.continuationToken,
        VersionIdMarker: options.versionIdMarker
      };

      const result = await this.executeWithRetry(
        () => this.client.listObjectVersions(listParams)
      );

      const versions: S3ObjectVersion[] = ((result as any).Versions || []).map(item => ({
        key: item.Key!,
        versionId: item.VersionId!,
        size: item.Size!,
        lastModified: item.LastModified!,
        etag: item.ETag!,
        isLatest: item.IsLatest!
      }));

      this.logger.info(`Listed ${versions.length} object versions`);

      return {
        objects: [],
        versions,
        isTruncated: (result as any).IsTruncated || false,
        nextContinuationToken: (result as any).NextKeyMarker,
        nextVersionIdMarker: (result as any).NextVersionIdMarker
      };
    } catch (error: any) {
      this.logger.error('Failed to list object versions', error);
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        `Failed to list object versions: ${error.message}`,
        { originalError: error }
      );
    }
  }

  /**
   * Check if object exists
   */
  async exists(key: string, versionId?: string): Promise<boolean> {
    await this.ensureConnected();

    try {
      const headParams: any = {
        Bucket: this.config.bucket,
        Key: key
      };

      if (versionId) {
        headParams.VersionId = versionId;
      }

      await this.executeWithRetry(
        () => this.client.headObject(headParams)
      );

      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get object metadata without downloading
   */
  async getMetadata(key: string, versionId?: string): Promise<Record<string, string>> {
    await this.ensureConnected();

    try {
      this.logger.info(`Getting metadata for object: ${key}`, { versionId });

      const headParams: any = {
        Bucket: this.config.bucket,
        Key: key
      };

      if (versionId) {
        headParams.VersionId = versionId;
      }

      const result = await this.executeWithRetry(
        () => this.client.headObject(headParams)
      ) as HeadObjectOutput;

      return (result as HeadObjectOutput).Metadata || {};
    } catch (error: any) {
      this.logger.error('Failed to get object metadata', error);
      throw new StorageError(
        StorageErrorCode.RESOURCE_NOT_FOUND,
        `Failed to get metadata for object ${key}: ${error.message}`,
        { key, originalError: error }
      );
    }
  }

  /**
   * Copy object within S3/MinIO
   */
  async copy(
    sourceKey: string,
    destinationKey: string,
    options: { versionId?: string; compress?: boolean } = {}
  ): Promise<{ etag: string; versionId?: string }> {
    await this.ensureConnected();

    try {
      this.logger.info(`Copying object: ${sourceKey} -> ${destinationKey}`, {
        versionId: options.versionId,
        compress: options.compress
      });

      const copySource = options.versionId
        ? `${this.config.bucket}/${sourceKey}?versionId=${options.versionId}`
        : `${this.config.bucket}/${sourceKey}`;

      const copyParams: any = {
        Bucket: this.config.bucket,
        CopySource: copySource,
        Key: destinationKey
      };

      const result = await this.executeWithRetry(
        () => this.client.copyObject(copyParams)
      ) as CopyObjectOutput;

      this.logger.info(`Object copied successfully: ${sourceKey} -> ${destinationKey}`, {
        etag: (result as CopyObjectOutput).CopyObjectResult?.ETag,
        versionId: (result as CopyObjectOutput).VersionId
      });

      return {
        etag: (result as CopyObjectOutput).CopyObjectResult?.ETag,
        versionId: (result as CopyObjectOutput).VersionId
      };
    } catch (error: any) {
      this.logger.error('Failed to copy object', error);
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        `Failed to copy object ${sourceKey} to ${destinationKey}: ${error.message}`,
        { sourceKey, destinationKey, originalError: error }
      );
    }
  }

  /**
   * Get client statistics
   */
  getStats(): S3ClientStats {
    return { ...this.stats };
  }

  /**
   * Reset client statistics
   */
  resetStats(): void {
    this.stats = {
      uploads: 0,
      downloads: 0,
      deletes: 0,
      errors: 0,
      bytesUploaded: 0,
      bytesDownloaded: 0
    };
  }

  /**
   * Start periodic health checks
   */
  private startHealthCheck(): void {
    // Check health every 30 seconds
    this.healthCheckInterval = setInterval(() => {
      this.checkHealth().catch(error => {
        this.logger.warn('Health check failed', error);
      });
    }, 30000);
  }

  /**
   * Stop health check interval
   */
  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }

  /**
   * Ensure bucket exists, create if needed
   */
  private async ensureBucket(): Promise<void> {
    try {
      if (!this.config.bucket) {
        this.logger.warn('No bucket configured, skipping bucket creation');
        return;
      }

      const exists = await this.bucketExists();
      if (!exists) {
        this.logger.info(`Bucket ${this.config.bucket} does not exist, creating...`);
        await this.createBucket();
      } else {
        this.logger.info(`Bucket ${this.config.bucket} exists`);
      }
    } catch (error: any) {
      this.logger.warn('Failed to ensure bucket exists', error);
    }
  }

  /**
   * Create bucket
   */
  private async createBucket(): Promise<void> {
    try {
      const createParams: any = {
        Bucket: this.config.bucket
      };

      // Add region constraint for non-us-east-1 regions
      if (this.config.region && this.config.region !== 'us-east-1') {
        createParams.CreateBucketConfiguration = {
          LocationConstraint: this.config.region
        };
      }

      await this.executeWithRetry(
        () => this.client.createBucket(createParams)
      );

      this.logger.info(`Bucket created successfully: ${this.config.bucket}`);
    } catch (error: any) {
      this.logger.error('Failed to create bucket', error);
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        `Failed to create bucket ${this.config.bucket}: ${error.message}`,
        { bucket: this.config.bucket, originalError: error }
      );
    }
  }

  /**
   * Check if bucket exists
   */
  private async bucketExists(): Promise<boolean> {
    try {
      await this.executeWithRetry(
        () => this.client.headBucket({
          Bucket: this.config.bucket
        })
      );

      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Check connection health
   */
  async checkHealth(): Promise<{ healthy: boolean; latency: number }> {
    const startTime = Date.now();

    try {
      await this.executeWithRetry(
        () => this.client.headBucket({
          Bucket: this.config.bucket
        })
      );

      const latency = Date.now() - startTime;

      this.logger.debug(`Health check passed`, { latency });
      return { healthy: true, latency };
    } catch (error: any) {
      const latency = Date.now() - startTime;
      this.logger.warn('Health check failed', { error, latency });
      return { healthy: false, latency };
    }
  }

  /**
   * Execute operation with retry logic
   */
  private async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;

        // Don't retry on certain errors
        if (this.shouldRetry(error)) {
          this.logger.warn(`Operation failed (attempt ${attempt}/${this.maxRetries}), retrying...`, {
            error: error.message,
            operation: operation.name || 'unknown'
          });

          // Exponential backoff: 100ms, 200ms, 400ms, 800ms
          const backoff = Math.min(100 * Math.pow(2, attempt - 1), 2000);
          await new Promise(resolve => setTimeout(resolve, backoff));
        } else {
          throw error;
        }
      }
    }

    // If we exhausted retries, throw the last error
    throw lastError || new Error('Operation failed after maximum retries');
  }

  /**
   * Determine if error should trigger retry
   */
  private shouldRetry(error: any): boolean {
    // Don't retry on authentication errors or not found
    if (error.name === 'NoSuchBucket' ||
        error.name === 'NotFound' ||
        error.name === 'AccessDenied' ||
        error.name === 'InvalidAccessKeyId' ||
        error.name === 'NoSuchKey') {
      return false;
    }

    // Retry on network errors and rate limits
    if (error.name === 'NetworkingError' ||
        error.name === 'TimeoutError' ||
        error.name === 'RequestTimeout' ||
        error.$metadata?.httpStatusCode === 429 || // Rate limit
        error.$metadata?.httpStatusCode === 503 || // Service unavailable
        error.$metadata?.httpStatusCode === 500 || // Internal server error
        error.$metadata?.httpStatusCode === 502 || // Bad gateway
        error.$metadata?.httpStatusCode === 504) { // Gateway timeout
      return true;
    }

    // Don't retry on other errors
    return false;
  }

  /**
   * Format tags for S3 API
   */
  private formatTags(tags: Record<string, string>): string {
    const tagPairs = Object.entries(tags)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');

    return tagPairs;
  }

  /**
   * Ensure client is connected
   */
  private ensureConnected(): void {
    if (!this.isConnected) {
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'S3/MinIO client is not initialized. Call initialize() first.',
        { operation: 'ensureConnected' }
      );
    }
  }

  /**
   * Close connection and cleanup
   */
  async close(): Promise<void> {
    try {
      this.stopHealthCheck();

      if (this.client) {
        // AWS SDK v3 doesn't have explicit close method
        // Just clear the reference
        this.client = null;
      }

      this.isConnected = false;
      this.logger.info('S3/MinIO client closed');
    } catch (error: any) {
      this.logger.error('Error closing S3/MinIO client', error);
      // Don't throw, just log
    }
  }

  /**
   * Get connection status
   */
  getStatus(): { connected: boolean; stats: S3ClientStats } {
    return {
      connected: this.isConnected,
      stats: { ...this.stats }
    };
  }
}

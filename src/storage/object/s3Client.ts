/**
 * S3/MinIO Object Storage Client
 *
 * Provides S3-compatible object storage operations for S3 and MinIO.
 * Supports connection management, health checks, and retry logic.
 */

import { Logger } from '../../utils/logger';
import { StorageError, StorageErrorCode } from '../errors/storageError';

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
  s3ForcePathStyle?: 'virtual' | 'path';
  signatureVersion?: 'v2' | 'v4';
}

export interface UploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
  tags?: Record<string, string>;
  acl?: 'private' | 'public-read' | 'public-read-write';
}

export interface ListOptions {
  prefix?: string;
  delimiter?: string;
  maxKeys?: number;
  continuationToken?: string;
}

export interface ListResult {
  objects: S3Object[];
  isTruncated: boolean;
  nextContinuationToken?: string;
}

export interface S3Object {
  key: string;
  size: number;
  lastModified: Date;
  etag: string;
  contentType?: string;
  metadata?: Record<string, string>;
}

// ============================================================================
// S3 CLIENT CLASS
// ============================================================================

export class S3Client {
  private logger: Logger;
  private config: S3Config;
  private client: any; // AWS SDK S3 client
  private isConnected: boolean = false;
  private connectionRetries: number = 0;
  private maxRetries: number = 3;
  private healthCheckInterval?: NodeJS.Timeout;

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
        bucket: this.config.bucket
      });

      // Import AWS SDK v3 S3 client
      const { S3Client } = await import('@aws-sdk/client-s3');
      
      const clientConfig: any = {
        endpoint: this.config.endpoint,
        credentials: {
          accessKeyId: this.config.accessKey,
          secretAccessKey: this.config.secretKey
        },
        region: this.config.region || 'us-east-1',
        forcePathStyle: this.config.forcePathStyle || false,
        s3ForcePathStyle: this.config.s3ForcePathStyle || 'virtual',
        signatureVersion: this.config.signatureVersion || 'v4',
        maxAttempts: this.maxRetries
      };

      this.client = new S3Client(clientConfig);
      this.isConnected = true;
      this.connectionRetries = 0;

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
   * Upload object to S3/MinIO
   */
  async upload(
    key: string,
    data: Buffer | string,
    options: UploadOptions = {}
  ): Promise<{ key: string; etag: string; location?: string }> {
    await this.ensureConnected();
    
    try {
      this.logger.info(`Uploading object: ${key}`, {
        size: typeof data === 'string' ? data.length : data.length,
        contentType: options.contentType
      });

      const uploadParams: any = {
        Bucket: this.config.bucket,
        Key: key,
        Body: data,
        ContentType: options.contentType || 'application/octet-stream',
        Metadata: options.metadata,
        Tagging: options.tags ? this.formatTags(options.tags) : undefined,
        ACL: options.acl || 'private'
      };

      const result = await this.executeWithRetry(
        () => this.client.putObject(uploadParams)
      ) as { ETag: string; Location?: string };

      const location = result.Location;

      this.logger.info(`Object uploaded successfully: ${key}`, {
        etag: result.ETag,
        location
      });

      return {
        key,
        etag: result.ETag,
        location
      };
    } catch (error: any) {
      this.logger.error('Failed to upload object', error);
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        `Failed to upload object ${key}: ${error.message}`,
        { key, originalError: error }
      );
    }
  }

  /**
   * Download object from S3/MinIO
   */
  async download(key: string): Promise<Buffer> {
    await this.ensureConnected();
    
    try {
      this.logger.info(`Downloading object: ${key}`);

      const result = await this.executeWithRetry(
        () => this.client.getObject({
          Bucket: this.config.bucket,
          Key: key
        })
      );

      // Type assertion for result as GetObjectOutput
      const getObjectResult = result as {
        ContentLength?: number;
        ContentType?: string;
        Body?: Buffer;
      };

      this.logger.info(`Object downloaded successfully: ${key}`, {
        size: getObjectResult.ContentLength,
        contentType: getObjectResult.ContentType
      });

      return getObjectResult.Body as Buffer;
    } catch (error: any) {
      this.logger.error('Failed to download object', error);
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        `Failed to download object ${key}: ${error.message}`,
        { key, originalError: error }
      );
    }
  }

  /**
   * Delete object from S3/MinIO
   */
  async delete(key: string): Promise<void> {
    await this.ensureConnected();
    
    try {
      this.logger.info(`Deleting object: ${key}`);

      await this.executeWithRetry(
        () => this.client.deleteObject({
          Bucket: this.config.bucket,
          Key: key
        })
      );

      this.logger.info(`Object deleted successfully: ${key}`);
    } catch (error: any) {
      this.logger.error('Failed to delete object', error);
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        `Failed to delete object ${key}: ${error.message}`,
        { key, originalError: error }
      );
    }
  }

  /**
   * List objects in bucket with optional prefix
   */
  async list(options: ListOptions = {}): Promise<ListResult> {
    await this.ensureConnected();
    
    try {
      this.logger.info('Listing objects', {
        prefix: options.prefix,
        maxKeys: options.maxKeys
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
      );

      const objects: S3Object[] = (result.Contents || []).map(item => ({
        key: item.Key!,
        size: item.Size!,
        lastModified: item.LastModified!,
        etag: item.ETag!,
        contentType: item.ContentType,
        metadata: item.Metadata
      }));

      this.logger.info(`Listed ${objects.length} objects`);

      return {
        objects,
        isTruncated: result.IsTruncated || false,
        nextContinuationToken: result.NextContinuationToken
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
   * Check if object exists
   */
  async exists(key: string): Promise<boolean> {
    await this.ensureConnected();
    
    try {
      const result = await this.executeWithRetry(
        () => this.client.headObject({
          Bucket: this.config.bucket,
          Key: key
        })
      );

      return !!result;
    } catch (error: any) {
      this.logger.error('Failed to check if object exists', error);
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        `Failed to check object existence ${key}: ${error.message}`,
        { key, originalError: error }
      );
    }
  }

  /**
   * Get object metadata without downloading
   */
  async getMetadata(key: string): Promise<Record<string, string>> {
    await this.ensureConnected();
    
    try {
      this.logger.info(`Getting metadata for object: ${key}`);

      const result = await this.executeWithRetry(
        () => this.client.headObject({
          Bucket: this.config.bucket,
          Key: key
        })
      );

      return result.Metadata || {};
    } catch (error: any) {
      this.logger.error('Failed to get object metadata', error);
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        `Failed to get metadata for object ${key}: ${error.message}`,
        { key, originalError: error }
      );
    }
  }

  /**
   * Copy object within S3/MinIO
   */
  async copy(sourceKey: string, destinationKey: string): Promise<void> {
    await this.ensureConnected();
    
    try {
      this.logger.info(`Copying object: ${sourceKey} -> ${destinationKey}`);

      await this.executeWithRetry(
        () => this.client.copyObject({
          Bucket: this.config.bucket,
          CopySource: `${this.config.bucket}/${sourceKey}`,
          Key: destinationKey
        })
      );

      this.logger.info(`Object copied successfully: ${sourceKey} -> ${destinationKey}`);
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
   * Get object URL (if public)
   */
  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    await this.ensureConnected();
    
    try {
      this.logger.info(`Getting signed URL for object: ${key}`, { expiresIn });

      const result = await this.executeWithRetry(
        () => this.client.getSignedUrlPromise('getObject', {
          Bucket: this.config.bucket,
          Key: key,
          Expires: expiresIn
        })
      );

      return result;
    } catch (error: any) {
      this.logger.error('Failed to get signed URL', error);
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        `Failed to get signed URL for object ${key}: ${error.message}`,
        { key, originalError: error }
      );
    }
  }

  /**
   * Create bucket
   */
  private async createBucket(): Promise<void> {
    try {
      await this.executeWithRetry(
        () => this.client.createBucket({
          Bucket: this.config.bucket
        })
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
        this.connectionRetries = attempt;
        return await operation();
      } catch (error: any) {
        lastError = error;
        
        // Don't retry on certain errors
        if (this.shouldNotRetry(error)) {
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
  private shouldNotRetry(error: any): boolean {
    // Don't retry on authentication errors or not found
    if (error.name === 'NoSuchBucket' || 
        error.name === 'NotFound' ||
        error.name === 'AccessDenied' ||
        error.name === 'InvalidAccessKeyId') {
      return true;
    }
    
    // Retry on network errors and rate limits
    if (error.name === 'NetworkingError' ||
        error.name === 'TimeoutError' ||
        error.name === 'RequestTimeout' ||
        error.$metadata?.httpStatusCode === 429 || // Rate limit
        error.$metadata?.httpStatusCode === 503) { // Service unavailable
      return false;
    }
    
    // Retry on other errors
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
        StorageErrorCode.CONNECTION_FAILED,
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
  getStatus(): { connected: boolean; retries: number } {
    return {
      connected: this.isConnected,
      retries: this.connectionRetries
    };
  }
}

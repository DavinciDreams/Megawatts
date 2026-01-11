/**
 * Object Storage Module
 *
 * Provides S3/MinIO compatible object storage functionality.
 */

import { S3Client, S3Config } from './s3Client';


// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create S3/MinIO client instance
 */
export function createObjectStorageClient(logger: any, config: S3Config): S3Client {
  return new S3Client(logger, config);
}

// ============================================================================
// EXPORTS
// ============================================================================

export { S3Client, S3Config };

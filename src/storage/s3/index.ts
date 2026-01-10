/**
 * S3/MinIO Object Storage Module
 *
 * Provides S3-compatible object storage functionality with compression,
 * streaming, versioning, and retry logic.
 */

export { S3Client, S3Config } from './s3Client';
export type {
  UploadOptions,
  DownloadOptions,
  DeleteOptions,
  ListOptions,
  ListResult,
  S3Object,
  S3ObjectVersion,
  S3ClientStats
} from './s3Client';

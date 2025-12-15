import { StorageError } from './storageError';

export enum CacheErrorCode {
  CONNECTION_FAILED = 'CACHE_CONNECTION_FAILED',
  DISCONNECTION_FAILED = 'CACHE_DISCONNECTION_FAILED',
  SET_FAILED = 'CACHE_SET_FAILED',
  GET_FAILED = 'CACHE_GET_FAILED',
  DELETE_FAILED = 'CACHE_DELETE_FAILED',
  INVALIDATION_FAILED = 'CACHE_INVALIDATION_FAILED',
  SERIALIZATION_FAILED = 'CACHE_SERIALIZATION_FAILED',
  DESERIALIZATION_FAILED = 'CACHE_DESERIALIZATION_FAILED',
  TTL_EXPIRED = 'CACHE_TTL_EXPIRED',
  KEY_NOT_FOUND = 'CACHE_KEY_NOT_FOUND',
}

export class CacheError extends StorageError {
  public readonly key: string | undefined;
  public readonly operation: string | undefined;

  constructor(
    code: CacheErrorCode,
    message: string,
    context?: Record<string, any>,
    key?: string,
    operation?: string
  ) {
    super(code as any, message, context, false);
    this.name = 'CacheError';
    this.key = key;
    this.operation = operation;
  }

  override toJSON() {
    return {
      ...super.toJSON(),
      key: this.key,
      operation: this.operation,
    };
  }
}
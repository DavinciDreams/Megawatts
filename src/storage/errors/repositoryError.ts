import { StorageError } from './storageError';

export enum RepositoryErrorCode {
  ENTITY_NOT_FOUND = 'ENTITY_NOT_FOUND',
  ENTITY_ALREADY_EXISTS = 'ENTITY_ALREADY_EXISTS',
  CREATE_FAILED = 'CREATE_FAILED',
  UPDATE_FAILED = 'UPDATE_FAILED',
  DELETE_FAILED = 'DELETE_FAILED',
  FIND_FAILED = 'FIND_FAILED',
  QUERY_FAILED = 'QUERY_FAILED',
  VALIDATION_FAILED = 'REPOSITORY_VALIDATION_FAILED',
  RELATION_NOT_FOUND = 'RELATION_NOT_FOUND',
  BATCH_OPERATION_FAILED = 'BATCH_OPERATION_FAILED',
}

export class RepositoryError extends StorageError {
  public readonly entityType: string | undefined;
  public readonly entityId: string | undefined;
  public readonly operation: string | undefined;

  constructor(
    code: RepositoryErrorCode,
    message: string,
    context?: Record<string, any>,
    entityType?: string,
    entityId?: string,
    operation?: string
  ) {
    super(code as any, message, context, false);
    this.name = 'RepositoryError';
    this.entityType = entityType;
    this.entityId = entityId;
    this.operation = operation;
  }

  override toJSON() {
    return {
      ...super.toJSON(),
      entityType: this.entityType,
      entityId: this.entityId,
      operation: this.operation,
    };
  }
}
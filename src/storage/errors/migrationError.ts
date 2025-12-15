import { StorageError } from './storageError';

export enum MigrationErrorCode {
  MIGRATION_NOT_FOUND = 'MIGRATION_NOT_FOUND',
  MIGRATION_ALREADY_APPLIED = 'MIGRATION_ALREADY_APPLIED',
  MIGRATION_FAILED = 'MIGRATION_FAILED',
  ROLLBACK_FAILED = 'ROLLBACK_FAILED',
  VALIDATION_FAILED = 'MIGRATION_VALIDATION_FAILED',
  VERSION_CONFLICT = 'MIGRATION_VERSION_CONFLICT',
  DEPENDENCY_NOT_MET = 'MIGRATION_DEPENDENCY_NOT_MET',
  LOCK_ACQUISITION_FAILED = 'MIGRATION_LOCK_ACQUISITION_FAILED',
}

export class MigrationError extends StorageError {
  public readonly migrationId: string | undefined;
  public readonly version: string | undefined;

  constructor(
    code: MigrationErrorCode,
    message: string,
    context?: Record<string, any>,
    migrationId?: string,
    version?: string
  ) {
    super(code as any, message, context, false);
    this.name = 'MigrationError';
    this.migrationId = migrationId;
    this.version = version;
  }

  override toJSON() {
    return {
      ...super.toJSON(),
      migrationId: this.migrationId,
      version: this.version,
    };
  }
}
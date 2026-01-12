import { Logger } from '../../utils/logger';
import { Backup, BackupMetadata } from '../../types/self-editing';

/**
 * Custom error class for bot operations
 * Extends native Error with additional properties
 */
export class BotError extends Error {
  code: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  context?: Record<string, any>;
  timestamp: Date;

  constructor(message: string, severity: 'low' | 'medium' | 'high' | 'critical' = 'medium', code?: string) {
    super(message);
    this.name = 'BotError';
    this.severity = severity;
    this.code = code || this.generateErrorCode();
    this.timestamp = new Date();
    
    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, BotError);
    }
  }

  private generateErrorCode(): string {
    return `ERR_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  }
}

/**
 * Manages version control and backup operations for self-editing
 */
export class VersionManager {
  private logger: Logger;
  private versions: Map<string, Backup> = new Map();
  private currentVersion: string;

  constructor(logger: Logger) {
    this.logger = logger;
    this.currentVersion = 'initial'; // Initialize with default value
  }

  /**
   * Create a new version backup
   */
  public async createVersion(
    description: string,
    changes: string[],
    metadata?: Partial<BackupMetadata>
  ): Promise<string> {
    const versionId = this.generateVersionId();
    
    try {
      this.logger.info(`Creating version ${versionId}: ${description}`);
      
      // Create backup
      const backup: Backup = {
        id: versionId,
        timestamp: new Date(),
        type: 'full',
        size: await this.calculateBackupSize(),
        location: `/backups/${versionId}`,
        checksum: await this.calculateChecksum(),
        metadata: {
          version: this.currentVersion,
          components: ['core', 'plugins', 'config'],
          configuration: {},
          environment: 'production',
          createdBy: 'self-editing-system',
          reason: description,
          ...metadata
        }
      };

      this.versions.set(versionId, backup);
      
      // Update current version
      this.currentVersion = versionId;
      
      this.logger.info(`Successfully created version ${versionId}`);
      return versionId;
    } catch (error) {
      this.logger.error(`Failed to create version ${versionId}:`, error as Error);
      throw new BotError(`Version creation failed: ${error}`, 'medium');
    }
  }

  /**
   * Restore to a specific version
   */
  public async restoreVersion(versionId: string): Promise<void> {
    const backup = this.versions.get(versionId);
    
    if (!backup) {
      throw new BotError(`Version ${versionId} not found`, 'medium');
    }

    try {
      this.logger.info(`Restoring to version ${versionId}`);
      
      // Validate backup integrity
      await this.validateBackup(backup);
      
      // Perform restoration
      await this.performRestore(backup);
      
      // Update current version
      this.currentVersion = versionId;
      
      this.logger.info(`Successfully restored to version ${versionId}`);
    } catch (error) {
      this.logger.error(`Failed to restore version ${versionId}:`, error as Error);
      throw new BotError(`Version restoration failed: ${error}`, 'high');
    }
  }

  /**
   * Get current version
   */
  public getCurrentVersion(): string {
    return this.currentVersion;
  }

  /**
   * Get all versions
   */
  public getVersions(): Backup[] {
    return Array.from(this.versions.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get version by ID
   */
  public getVersion(versionId: string): Backup | null {
    return this.versions.get(versionId) || null;
  }

  /**
   * Delete old versions
   */
  public async cleanupVersions(keepCount: number = 10): Promise<void> {
    const versions = this.getVersions();
    
    if (versions.length <= keepCount) {
      return;
    }

    const versionsToDelete = versions.slice(keepCount);
    
    this.logger.info(`Cleaning up ${versionsToDelete.length} old versions`);
    
    for (const version of versionsToDelete) {
      try {
        await this.deleteVersion(version.id);
        this.versions.delete(version.id);
      } catch (error) {
        this.logger.warn(`Failed to delete version ${version.id}:`, { error: error as Error });
      }
    }
  }

  /**
   * Compare two versions
   */
  public async compareVersions(
    versionId1: string,
    versionId2: string
  ): Promise<{
    added: string[];
    modified: string[];
    deleted: string[];
  }> {
    const version1 = this.versions.get(versionId1);
    const version2 = this.versions.get(versionId2);
    
    if (!version1 || !version2) {
      throw new BotError('One or both versions not found', 'medium');
    }

    // Mock comparison - would implement actual diff logic
    return {
      added: ['file1.ts', 'file2.ts'],
      modified: ['file3.ts'],
      deleted: ['file4.ts']
    };
  }

  private async calculateBackupSize(): Promise<number> {
    // Mock size calculation
    return Math.floor(Math.random() * 10000000) + 1000000; // 1MB - 11MB
  }

  private async calculateChecksum(): Promise<string> {
    // Mock checksum calculation
    return Math.random().toString(36).substring(2, 34);
  }

  private async validateBackup(backup: Backup): Promise<void> {
    // Mock validation - would implement actual integrity checks
    if (backup.checksum.length < 10) {
      throw new BotError('Invalid backup checksum', 'medium');
    }
  }

  private async performRestore(backup: Backup): Promise<void> {
    // Mock restoration - would implement actual restore logic
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  private async deleteVersion(versionId: string): Promise<void> {
    // Mock deletion - would implement actual file deletion
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  private generateVersionId(): string {
    return `v_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}
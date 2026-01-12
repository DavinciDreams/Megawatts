import { Logger } from '../../utils/logger';

/**
 * Permission management for self-editing operations
 */
export class PermissionManager {
  private logger: Logger;
  private permissions: Map<string, {
    allowed: boolean;
    reason?: string;
    grantedBy?: string;
    grantedAt?: Date;
    expiresAt?: Date;
  }> = new Map();

  constructor(logger: Logger) {
    this.logger = logger;
    this.initializeDefaultPermissions();
  }

  /**
   * Check if operation is permitted
   */
  public async checkPermission(
    operation: string,
    context: any = {}
  ): Promise<{
    allowed: boolean;
    reason?: string;
  }> {
    try {
      this.logger.debug(`Checking permission for operation: ${operation}`);
      
      const permission = this.permissions.get(operation);
      
      if (!permission) {
        return {
          allowed: false,
          reason: `No permission defined for operation: ${operation}`
        };
      }
      
      // Check if permission has expired
      if (permission.expiresAt && new Date() > permission.expiresAt) {
        return {
          allowed: false,
          reason: `Permission expired for operation: ${operation}`
        };
      }
      
      this.logger.debug(`Permission check for ${operation}: ${permission.allowed ? 'allowed' : 'denied'}`);
      return {
        allowed: permission.allowed,
        reason: permission.reason
      };
    } catch (error) {
      this.logger.error(`Permission check failed for ${operation}:`, error as Error);
      return {
        allowed: false,
        reason: `Permission check failed: ${error}`
      };
    }
  }

  /**
   * Grant permission for operation
   */
  public async grantPermission(
    operation: string,
    options: {
      reason?: string;
      grantedBy?: string;
      expiresAt?: Date;
    } = {}
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      this.logger.debug(`Granting permission for operation: ${operation}`);
      
      this.permissions.set(operation, {
        allowed: true,
        reason: options.reason,
        grantedBy: options.grantedBy,
        grantedAt: new Date(),
        expiresAt: options.expiresAt
      });
      
      this.logger.debug(`Permission granted for operation: ${operation}`);
      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to grant permission for ${operation}:`, error as Error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Revoke permission for operation
   */
  public async revokePermission(
    operation: string,
    reason?: string
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      this.logger.debug(`Revoking permission for operation: ${operation}`);
      
      this.permissions.set(operation, {
        allowed: false,
        reason: reason || 'Permission revoked'
      });
      
      this.logger.debug(`Permission revoked for operation: ${operation}`);
      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to revoke permission for ${operation}:`, error);
      return { success: false, error: error.toString() };
    }
  }

  /**
   * Get all permissions
   */
  public getPermissions(): Array<{
    operation: string;
    allowed: boolean;
    reason?: string;
    grantedBy?: string;
    grantedAt?: Date;
    expiresAt?: Date;
  }> {
    return Array.from(this.permissions.entries()).map(([operation, permission]) => ({
      operation,
      ...permission
    }));
  }

  /**
   * Initialize default permissions
   */
  private initializeDefaultPermissions(): void {
    // Read-only operations
    this.permissions.set('read-code', { allowed: true });
    this.permissions.set('analyze-code', { allowed: true });
    this.permissions.set('view-logs', { allowed: true });
    
    // Safe modification operations
    this.permissions.set('modify-logic', { allowed: true });
    this.permissions.set('optimize-performance', { allowed: true });
    this.permissions.set('fix-bugs', { allowed: true });
    
    // High-risk operations (require explicit approval)
    this.permissions.set('modify-core-systems', { allowed: false, reason: 'High-risk operation requires explicit approval' });
    this.permissions.set('access-external-resources', { allowed: false, reason: 'External resource access requires explicit approval' });
    this.permissions.set('modify-permissions', { allowed: false, reason: 'Permission modification requires explicit approval' });
    
    this.logger.debug('Default permissions initialized');
  }
}
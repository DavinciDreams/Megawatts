import { Logger } from '../../utils/logger';
import { StorageError, StorageErrorCode } from '../errors';
import { PostgresConnectionManager } from '../database/postgres';
import { DataType, StorageTier } from './tieredStorage';

/**
 * Interface for retention policy configuration
 */
export interface RetentionPolicy {
  id: string;
  name: string;
  dataType: DataType;
  tier: StorageTier;
  maxRetentionDays: number;
  maxAccessCount?: number;
  maxAgeDays?: number;
  enabled: boolean;
  priority: number; // Higher priority policies are evaluated first
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Interface for policy violation
 */
export interface PolicyViolation {
  id: string;
  policyId: string;
  policyName: string;
  dataKey: string;
  dataType: DataType;
  currentTier: StorageTier;
  violationType: 'retention_exceeded' | 'access_count_exceeded' | 'age_exceeded' | 'custom';
  currentValue: number;
  thresholdValue: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  detectedAt: Date;
  resolvedAt?: Date;
  actionTaken?: string;
}

/**
 * Interface for policy enforcement report
 */
export interface PolicyEnforcementReport {
  policyId: string;
  policyName: string;
  itemsChecked: number;
  violationsFound: number;
  itemsDeleted: number;
  itemsArchived: number;
  itemsMoved: number;
  executionTime: number;
  errors: string[];
}

/**
 * Interface for policy summary
 */
export interface PolicySummary {
  totalPolicies: number;
  enabledPolicies: number;
  activeViolations: number;
  resolvedViolations: number;
  lastEnforcementAt: Date;
  nextScheduledEnforcement: Date;
}

/**
 * Retention policy manager class
 * Manages configurable retention policies, enforces policies, and detects violations
 */
export class RetentionPolicyManager {
  private logger: Logger;
  private postgres: PostgresConnectionManager;
  private isInitialized = false;

  /**
   * Creates a new RetentionPolicyManager instance
   * @param postgres - PostgreSQL connection manager
   */
  constructor(postgres: PostgresConnectionManager) {
    this.logger = new Logger('RetentionPolicyManager');
    this.postgres = postgres;
  }

  /**
   * Initializes the retention policy manager
   * Creates necessary database tables and default policies
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing retention policy manager...');

      await this.createTables();
      await this.createDefaultPolicies();

      this.isInitialized = true;
      this.logger.info('Retention policy manager initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize retention policy manager:', error);
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Failed to initialize retention policy manager',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Creates a new retention policy
   * @param policy - Policy configuration
   * @returns Created policy
   */
  async createPolicy(policy: Omit<RetentionPolicy, 'id' | 'createdAt' | 'updatedAt'>): Promise<RetentionPolicy> {
    if (!this.isInitialized) {
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Retention policy manager is not initialized'
      );
    }

    try {
      const result = await this.postgres.query(
        `INSERT INTO retention_policies (
          name, data_type, tier, max_retention_days, max_access_count,
          max_age_days, enabled, priority, description, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        RETURNING *`,
        [
          policy.name,
          policy.dataType,
          policy.tier,
          policy.maxRetentionDays,
          policy.maxAccessCount,
          policy.maxAgeDays,
          policy.enabled,
          policy.priority,
          policy.description
        ]
      );

      const row = result.rows[0];
      const createdPolicy: RetentionPolicy = {
        id: row.id,
        name: row.name,
        dataType: row.data_type as DataType,
        tier: row.tier as StorageTier,
        maxRetentionDays: row.max_retention_days,
        maxAccessCount: row.max_access_count,
        maxAgeDays: row.max_age_days,
        enabled: row.enabled,
        priority: row.priority,
        description: row.description,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };

      this.logger.info(`Created retention policy: ${policy.name}`, { policyId: createdPolicy.id });
      return createdPolicy;
    } catch (error) {
      this.logger.error(`Failed to create policy ${policy.name}:`, error);
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        `Failed to create policy: ${policy.name}`,
        { policy: policy.name, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Updates an existing retention policy
   * @param policyId - ID of the policy to update
   * @param updates - Policy updates
   * @returns Updated policy
   */
  async updatePolicy(
    policyId: string,
    updates: Partial<Omit<RetentionPolicy, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<RetentionPolicy> {
    if (!this.isInitialized) {
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Retention policy manager is not initialized'
      );
    }

    try {
      const setClause: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (updates.name !== undefined) {
        setClause.push(`name = $${paramIndex++}`);
        values.push(updates.name);
      }
      if (updates.dataType !== undefined) {
        setClause.push(`data_type = $${paramIndex++}`);
        values.push(updates.dataType);
      }
      if (updates.tier !== undefined) {
        setClause.push(`tier = $${paramIndex++}`);
        values.push(updates.tier);
      }
      if (updates.maxRetentionDays !== undefined) {
        setClause.push(`max_retention_days = $${paramIndex++}`);
        values.push(updates.maxRetentionDays);
      }
      if (updates.maxAccessCount !== undefined) {
        setClause.push(`max_access_count = $${paramIndex++}`);
        values.push(updates.maxAccessCount);
      }
      if (updates.maxAgeDays !== undefined) {
        setClause.push(`max_age_days = $${paramIndex++}`);
        values.push(updates.maxAgeDays);
      }
      if (updates.enabled !== undefined) {
        setClause.push(`enabled = $${paramIndex++}`);
        values.push(updates.enabled);
      }
      if (updates.priority !== undefined) {
        setClause.push(`priority = $${paramIndex++}`);
        values.push(updates.priority);
      }
      if (updates.description !== undefined) {
        setClause.push(`description = $${paramIndex++}`);
        values.push(updates.description);
      }

      setClause.push(`updated_at = NOW()`);
      values.push(policyId);

      const result = await this.postgres.query(
        `UPDATE retention_policies SET ${setClause.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        throw new StorageError(
          StorageErrorCode.RESOURCE_NOT_FOUND,
          `Policy not found: ${policyId}`
        );
      }

      const row = result.rows[0];
      const updatedPolicy: RetentionPolicy = {
        id: row.id,
        name: row.name,
        dataType: row.data_type as DataType,
        tier: row.tier as StorageTier,
        maxRetentionDays: row.max_retention_days,
        maxAccessCount: row.max_access_count,
        maxAgeDays: row.max_age_days,
        enabled: row.enabled,
        priority: row.priority,
        description: row.description,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };

      this.logger.info(`Updated retention policy: ${updatedPolicy.name}`, { policyId });
      return updatedPolicy;
    } catch (error) {
      this.logger.error(`Failed to update policy ${policyId}:`, error);
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        `Failed to update policy: ${policyId}`,
        { policyId, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Deletes a retention policy
   * @param policyId - ID of the policy to delete
   */
  async deletePolicy(policyId: string): Promise<void> {
    if (!this.isInitialized) {
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Retention policy manager is not initialized'
      );
    }

    try {
      const result = await this.postgres.query(
        'DELETE FROM retention_policies WHERE id = $1 RETURNING name',
        [policyId]
      );

      if (result.rows.length === 0) {
        throw new StorageError(
          StorageErrorCode.RESOURCE_NOT_FOUND,
          `Policy not found: ${policyId}`
        );
      }

      this.logger.info(`Deleted retention policy: ${result.rows[0].name}`, { policyId });
    } catch (error) {
      this.logger.error(`Failed to delete policy ${policyId}:`, error);
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        `Failed to delete policy: ${policyId}`,
        { policyId, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Gets a retention policy by ID
   * @param policyId - ID of the policy
   * @returns Policy or null if not found
   */
  async getPolicy(policyId: string): Promise<RetentionPolicy | null> {
    if (!this.isInitialized) {
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Retention policy manager is not initialized'
      );
    }

    try {
      const result = await this.postgres.query(
        'SELECT * FROM retention_policies WHERE id = $1',
        [policyId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        name: row.name,
        dataType: row.data_type as DataType,
        tier: row.tier as StorageTier,
        maxRetentionDays: row.max_retention_days,
        maxAccessCount: row.max_access_count,
        maxAgeDays: row.max_age_days,
        enabled: row.enabled,
        priority: row.priority,
        description: row.description,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } catch (error) {
      this.logger.error(`Failed to get policy ${policyId}:`, error);
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        `Failed to get policy: ${policyId}`,
        { policyId, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Lists all retention policies
   * @param filters - Optional filters
   * @returns Array of policies
   */
  async listPolicies(filters?: {
    dataType?: DataType;
    tier?: StorageTier;
    enabled?: boolean;
  }): Promise<RetentionPolicy[]> {
    if (!this.isInitialized) {
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Retention policy manager is not initialized'
      );
    }

    try {
      const conditions: string[] = ['1=1'];
      const values: any[] = [];
      let paramIndex = 1;

      if (filters?.dataType !== undefined) {
        conditions.push(`data_type = $${paramIndex++}`);
        values.push(filters.dataType);
      }
      if (filters?.tier !== undefined) {
        conditions.push(`tier = $${paramIndex++}`);
        values.push(filters.tier);
      }
      if (filters?.enabled !== undefined) {
        conditions.push(`enabled = $${paramIndex++}`);
        values.push(filters.enabled);
      }

      const result = await this.postgres.query(
        `SELECT * FROM retention_policies
         WHERE ${conditions.join(' AND ')}
         ORDER BY priority DESC, created_at ASC`,
        values
      );

      return result.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        dataType: row.data_type as DataType,
        tier: row.tier as StorageTier,
        maxRetentionDays: row.max_retention_days,
        maxAccessCount: row.max_access_count,
        maxAgeDays: row.max_age_days,
        enabled: row.enabled,
        priority: row.priority,
        description: row.description,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } catch (error) {
      this.logger.error('Failed to list policies:', error);
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Failed to list policies',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Enforces all enabled retention policies
   * @returns Number of items affected
   */
  async enforcePolicies(): Promise<number> {
    if (!this.isInitialized) {
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Retention policy manager is not initialized'
      );
    }

    try {
      this.logger.info('Enforcing retention policies...');

      const policies = await this.listPolicies({ enabled: true });
      let totalAffected = 0;

      for (const policy of policies) {
        const report = await this.enforcePolicy(policy);
        totalAffected += report.itemsDeleted + report.itemsArchived + report.itemsMoved;
      }

      this.logger.info(`Retention policies enforced, ${totalAffected} items affected`);
      return totalAffected;
    } catch (error) {
      this.logger.error('Failed to enforce policies:', error);
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Failed to enforce policies',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Enforces a specific retention policy
   * @param policy - Policy to enforce
   * @returns Enforcement report
   */
  async enforcePolicy(policy: RetentionPolicy): Promise<PolicyEnforcementReport> {
    if (!this.isInitialized) {
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Retention policy manager is not initialized'
      );
    }

    const startTime = Date.now();
    const report: PolicyEnforcementReport = {
      policyId: policy.id,
      policyName: policy.name,
      itemsChecked: 0,
      violationsFound: 0,
      itemsDeleted: 0,
      itemsArchived: 0,
      itemsMoved: 0,
      executionTime: 0,
      errors: []
    };

    try {
      // Get data items that match the policy criteria
      const result = await this.postgres.query(
        `SELECT id, data_type, current_tier, created_at, last_accessed_at, access_count
         FROM tiered_storage_metadata
         WHERE data_type = $1 AND current_tier = $2`,
        [policy.dataType, policy.tier]
      );

      report.itemsChecked = result.rows.length;

      for (const row of result.rows) {
        try {
          const violation = await this.checkPolicyViolation(policy, row);
          
          if (violation) {
            report.violationsFound++;
            await this.handleViolation(violation, report);
          }
        } catch (error) {
          report.errors.push(
            `Failed to process ${row.id}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      report.executionTime = Date.now() - startTime;
      this.logger.info(`Policy enforcement completed: ${policy.name}`, {
        violationsFound: report.violationsFound,
        itemsDeleted: report.itemsDeleted,
        itemsArchived: report.itemsArchived,
        itemsMoved: report.itemsMoved,
        executionTime: report.executionTime
      });

      return report;
    } catch (error) {
      this.logger.error(`Failed to enforce policy ${policy.name}:`, error);
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        `Failed to enforce policy: ${policy.name}`,
        { policy: policy.name, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Detects policy violations
   * @param limit - Maximum number of violations to return
   * @returns Array of violations
   */
  async detectViolations(limit: number = 100): Promise<PolicyViolation[]> {
    if (!this.isInitialized) {
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Retention policy manager is not initialized'
      );
    }

    try {
      const policies = await this.listPolicies({ enabled: true });
      const violations: PolicyViolation[] = [];

      for (const policy of policies) {
        const policyViolations = await this.detectPolicyViolations(policy, Math.floor(limit / policies.length));
        violations.push(...policyViolations);
      }

      // Sort by severity
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      violations.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

      return violations.slice(0, limit);
    } catch (error) {
      this.logger.error('Failed to detect violations:', error);
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Failed to detect violations',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Gets a policy violation by ID
   * @param violationId - ID of the violation
   * @returns Violation or null if not found
   */
  async getViolation(violationId: string): Promise<PolicyViolation | null> {
    if (!this.isInitialized) {
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Retention policy manager is not initialized'
      );
    }

    try {
      const result = await this.postgres.query(
        'SELECT * FROM policy_violations WHERE id = $1',
        [violationId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        policyId: row.policy_id,
        policyName: row.policy_name,
        dataKey: row.data_key,
        dataType: row.data_type as DataType,
        currentTier: row.current_tier as StorageTier,
        violationType: row.violation_type,
        currentValue: row.current_value,
        thresholdValue: row.threshold_value,
        severity: row.severity,
        detectedAt: row.detected_at,
        resolvedAt: row.resolved_at,
        actionTaken: row.action_taken
      };
    } catch (error) {
      this.logger.error(`Failed to get violation ${violationId}:`, error);
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        `Failed to get violation: ${violationId}`,
        { violationId, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Lists policy violations
   * @param filters - Optional filters
   * @returns Array of violations
   */
  async listViolations(filters?: {
    policyId?: string;
    severity?: string;
    resolved?: boolean;
  }): Promise<PolicyViolation[]> {
    if (!this.isInitialized) {
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Retention policy manager is not initialized'
      );
    }

    try {
      const conditions: string[] = ['1=1'];
      const values: any[] = [];
      let paramIndex = 1;

      if (filters?.policyId !== undefined) {
        conditions.push(`policy_id = $${paramIndex++}`);
        values.push(filters.policyId);
      }
      if (filters?.severity !== undefined) {
        conditions.push(`severity = $${paramIndex++}`);
        values.push(filters.severity);
      }
      if (filters?.resolved !== undefined) {
        if (filters.resolved) {
          conditions.push(`resolved_at IS NOT NULL`);
        } else {
          conditions.push(`resolved_at IS NULL`);
        }
      }

      const result = await this.postgres.query(
        `SELECT * FROM policy_violations
         WHERE ${conditions.join(' AND ')}
         ORDER BY detected_at DESC`,
        values
      );

      return result.rows.map((row: any) => ({
        id: row.id,
        policyId: row.policy_id,
        policyName: row.policy_name,
        dataKey: row.data_key,
        dataType: row.data_type as DataType,
        currentTier: row.current_tier as StorageTier,
        violationType: row.violation_type,
        currentValue: row.current_value,
        thresholdValue: row.threshold_value,
        severity: row.severity,
        detectedAt: row.detected_at,
        resolvedAt: row.resolved_at,
        actionTaken: row.action_taken
      }));
    } catch (error) {
      this.logger.error('Failed to list violations:', error);
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Failed to list violations',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Resolves a policy violation
   * @param violationId - ID of the violation
   * @param actionTaken - Action taken to resolve the violation
   */
  async resolveViolation(violationId: string, actionTaken: string): Promise<void> {
    if (!this.isInitialized) {
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Retention policy manager is not initialized'
      );
    }

    try {
      await this.postgres.query(
        `UPDATE policy_violations
         SET resolved_at = NOW(), action_taken = $1
         WHERE id = $2`,
        [actionTaken, violationId]
      );

      this.logger.info(`Resolved violation ${violationId}`, { actionTaken });
    } catch (error) {
      this.logger.error(`Failed to resolve violation ${violationId}:`, error);
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        `Failed to resolve violation: ${violationId}`,
        { violationId, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Gets policy summary
   * @returns Policy summary
   */
  async getSummary(): Promise<PolicySummary> {
    if (!this.isInitialized) {
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Retention policy manager is not initialized'
      );
    }

    try {
      const totalResult = await this.postgres.query(
        'SELECT COUNT(*) as count FROM retention_policies'
      );

      const enabledResult = await this.postgres.query(
        'SELECT COUNT(*) as count FROM retention_policies WHERE enabled = true'
      );

      const activeViolationsResult = await this.postgres.query(
        'SELECT COUNT(*) as count FROM policy_violations WHERE resolved_at IS NULL'
      );

      const resolvedViolationsResult = await this.postgres.query(
        'SELECT COUNT(*) as count FROM policy_violations WHERE resolved_at IS NOT NULL'
      );

      const lastEnforcementResult = await this.postgres.query(
        'SELECT MAX(created_at) as last_enforcement FROM policy_enforcement_logs'
      );

      return {
        totalPolicies: parseInt(totalResult.rows[0].count),
        enabledPolicies: parseInt(enabledResult.rows[0].count),
        activeViolations: parseInt(activeViolationsResult.rows[0].count),
        resolvedViolations: parseInt(resolvedViolationsResult.rows[0].count),
        lastEnforcementAt: lastEnforcementResult.rows[0].last_enforcement || new Date(),
        nextScheduledEnforcement: new Date(Date.now() + 24 * 60 * 60 * 1000) // Next 24 hours
      };
    } catch (error) {
      this.logger.error('Failed to get policy summary:', error);
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Failed to get policy summary',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Creates necessary database tables for retention policies
   */
  private async createTables(): Promise<void> {
    // Skip table creation if postgres is not available
    if (!this.postgres) {
      this.logger.warn('PostgreSQL connection not available, skipping retention policy table creation. Only hot tier (Redis) will be used.');
      return;
    }

    const tables = [
      `CREATE TABLE IF NOT EXISTS retention_policies (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        data_type VARCHAR(50) NOT NULL,
        tier VARCHAR(20) NOT NULL,
        max_retention_days INTEGER NOT NULL,
        max_access_count INTEGER,
        max_age_days INTEGER,
        enabled BOOLEAN DEFAULT true,
        priority INTEGER DEFAULT 0,
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_retention_type ON retention_policies(data_type)`,
      `CREATE INDEX IF NOT EXISTS idx_retention_tier ON retention_policies(tier)`,
      `CREATE INDEX IF NOT EXISTS idx_retention_enabled ON retention_policies(enabled)`,
      `CREATE TABLE IF NOT EXISTS policy_violations (
        id VARCHAR(255) PRIMARY KEY,
        policy_id VARCHAR(255) NOT NULL REFERENCES retention_policies(id),
        policy_name VARCHAR(255) NOT NULL,
        data_key VARCHAR(255) NOT NULL,
        data_type VARCHAR(50) NOT NULL,
        current_tier VARCHAR(20) NOT NULL,
        violation_type VARCHAR(50) NOT NULL,
        current_value NUMERIC NOT NULL,
        threshold_value NUMERIC NOT NULL,
        severity VARCHAR(20) NOT NULL,
        detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        resolved_at TIMESTAMP WITH TIME ZONE,
        action_taken TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS idx_violations_policy ON policy_violations(policy_id)`,
      `CREATE INDEX IF NOT EXISTS idx_violations_severity ON policy_violations(severity)`,
      `CREATE INDEX IF NOT EXISTS idx_violations_resolved ON policy_violations(resolved_at)`,
      `CREATE TABLE IF NOT EXISTS policy_enforcement_logs (
        id SERIAL PRIMARY KEY,
        policy_id VARCHAR(255) NOT NULL REFERENCES retention_policies(id),
        policy_name VARCHAR(255) NOT NULL,
        items_checked INTEGER DEFAULT 0,
        violations_found INTEGER DEFAULT 0,
        items_deleted INTEGER DEFAULT 0,
        items_archived INTEGER DEFAULT 0,
        items_moved INTEGER DEFAULT 0,
        execution_time INTEGER DEFAULT 0,
        errors TEXT[],
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_enforcement_policy ON policy_enforcement_logs(policy_id)`,
      `CREATE INDEX IF NOT EXISTS idx_enforcement_time ON policy_enforcement_logs(created_at)`
    ];

    for (const table of tables) {
      await this.postgres.query(table);
    }
  }

  /**
   * Creates default retention policies
   */
  private async createDefaultPolicies(): Promise<void> {
    const defaultPolicies: Omit<RetentionPolicy, 'id' | 'createdAt' | 'updatedAt'>[] = [
      {
        name: 'Hot Tier - User Profiles',
        dataType: DataType.USER_PROFILE,
        tier: StorageTier.HOT,
        maxRetentionDays: 7,
        maxAccessCount: 10,
        enabled: true,
        priority: 10,
        description: 'User profiles in hot tier for 7 days or 10 accesses'
      },
      {
        name: 'Hot Tier - Conversations',
        dataType: DataType.CONVERSATION,
        tier: StorageTier.HOT,
        maxRetentionDays: 1,
        maxAccessCount: 20,
        enabled: true,
        priority: 10,
        description: 'Conversations in hot tier for 1 day or 20 accesses'
      },
      {
        name: 'Warm Tier - Messages',
        dataType: DataType.MESSAGE,
        tier: StorageTier.WARM,
        maxRetentionDays: 90,
        enabled: true,
        priority: 5,
        description: 'Messages in warm tier for 90 days'
      },
      {
        name: 'Warm Tier - Analytics',
        dataType: DataType.ANALYTICS,
        tier: StorageTier.WARM,
        maxRetentionDays: 30,
        enabled: true,
        priority: 5,
        description: 'Analytics data in warm tier for 30 days'
      },
      {
        name: 'Cold Tier - Historical Data',
        dataType: DataType.CONVERSATION,
        tier: StorageTier.COLD,
        maxRetentionDays: 365,
        enabled: true,
        priority: 3,
        description: 'Historical conversations in cold tier for 1 year'
      },
      {
        name: 'Backup Tier - Long-term Archive',
        dataType: DataType.CODE_MODIFICATION,
        tier: StorageTier.BACKUP,
        maxRetentionDays: 2555, // 7 years
        enabled: true,
        priority: 1,
        description: 'Code modifications archived for 7 years'
      }
    ];

    for (const policy of defaultPolicies) {
      try {
        await this.createPolicy(policy);
      } catch (error) {
        // Ignore duplicate policy errors
        if (!(error instanceof StorageError && error.code === StorageErrorCode.RESOURCE_ALREADY_EXISTS)) {
          this.logger.warn(`Failed to create default policy ${policy.name}:`, error);
        }
      }
    }
  }

  /**
   * Checks if a data item violates a policy
   * @param policy - Policy to check
   * @param data - Data metadata
   * @returns Violation or null if no violation
   */
  private async checkPolicyViolation(
    policy: RetentionPolicy,
    data: any
  ): Promise<PolicyViolation | null> {
    const now = new Date();
    const ageInDays = (now.getTime() - data.created_at.getTime()) / (1000 * 60 * 60 * 24);
    const daysSinceLastAccess = (now.getTime() - data.last_accessed_at.getTime()) / (1000 * 60 * 60 * 24);

    // Check retention days
    if (ageInDays > policy.maxRetentionDays) {
      return {
        id: `${policy.id}-${data.id}-${Date.now()}`,
        policyId: policy.id,
        policyName: policy.name,
        dataKey: data.id,
        dataType: data.data_type as DataType,
        currentTier: data.current_tier as StorageTier,
        violationType: 'retention_exceeded',
        currentValue: ageInDays,
        thresholdValue: policy.maxRetentionDays,
        severity: ageInDays > policy.maxRetentionDays * 2 ? 'critical' : 'high',
        detectedAt: now
      };
    }

    // Check access count
    if (policy.maxAccessCount && data.access_count > policy.maxAccessCount) {
      return {
        id: `${policy.id}-${data.id}-${Date.now()}`,
        policyId: policy.id,
        policyName: policy.name,
        dataKey: data.id,
        dataType: data.data_type as DataType,
        currentTier: data.current_tier as StorageTier,
        violationType: 'access_count_exceeded',
        currentValue: data.access_count,
        thresholdValue: policy.maxAccessCount,
        severity: 'medium',
        detectedAt: now
      };
    }

    // Check max age
    if (policy.maxAgeDays && ageInDays > policy.maxAgeDays) {
      return {
        id: `${policy.id}-${data.id}-${Date.now()}`,
        policyId: policy.id,
        policyName: policy.name,
        dataKey: data.id,
        dataType: data.data_type as DataType,
        currentTier: data.current_tier as StorageTier,
        violationType: 'age_exceeded',
        currentValue: ageInDays,
        thresholdValue: policy.maxAgeDays,
        severity: ageInDays > policy.maxAgeDays * 2 ? 'critical' : 'high',
        detectedAt: now
      };
    }

    return null;
  }

  /**
   * Handles a policy violation
   * @param violation - Violation to handle
   * @param report - Enforcement report to update
   */
  private async handleViolation(
    violation: PolicyViolation,
    report: PolicyEnforcementReport
  ): Promise<void> {
    // Record the violation
    await this.postgres.query(
      `INSERT INTO policy_violations (
        id, policy_id, policy_name, data_key, data_type, current_tier,
        violation_type, current_value, threshold_value, severity, detected_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
      [
        violation.id,
        violation.policyId,
        violation.policyName,
        violation.dataKey,
        violation.dataType,
        violation.currentTier,
        violation.violationType,
        violation.currentValue,
        violation.thresholdValue,
        violation.severity
      ]
    );

    // Take action based on severity and violation type
    switch (violation.violationType) {
      case 'retention_exceeded':
      case 'age_exceeded':
        if (violation.severity === 'critical') {
          // Delete the data
          await this.deleteDataFromTier(violation.dataKey, violation.currentTier);
          report.itemsDeleted++;
        } else if (violation.severity === 'high') {
          // Archive the data
          await this.archiveData(violation.dataKey, violation.currentTier);
          report.itemsArchived++;
        } else {
          // Move to lower tier
          await this.moveToLowerTier(violation.dataKey, violation.currentTier);
          report.itemsMoved++;
        }
        break;
      
      case 'access_count_exceeded':
        // Move to lower tier
        await this.moveToLowerTier(violation.dataKey, violation.currentTier);
        report.itemsMoved++;
        break;
    }
  }

  /**
   * Detects violations for a specific policy
   * @param policy - Policy to check
   * @param limit - Maximum violations to return
   * @returns Array of violations
   */
  private async detectPolicyViolations(
    policy: RetentionPolicy,
    limit: number
  ): Promise<PolicyViolation[]> {
    const result = await this.postgres.query(
      `SELECT id, data_type, current_tier, created_at, last_accessed_at, access_count
       FROM tiered_storage_metadata
       WHERE data_type = $1 AND current_tier = $2
       LIMIT $3`,
      [policy.dataType, policy.tier, limit]
    );

    const violations: PolicyViolation[] = [];
    const now = new Date();

    for (const data of result.rows) {
      const violation = await this.checkPolicyViolation(policy, data);
      if (violation) {
        violations.push(violation);
      }
    }

    return violations;
  }

  /**
   * Deletes data from a specific tier
   * @param key - Data key
   * @param tier - Tier to delete from
   */
  private async deleteDataFromTier(key: string, tier: StorageTier): Promise<void> {
    const tableName = `tiered_storage_${tier}`;
    await this.postgres.query(`DELETE FROM ${tableName} WHERE id = $1`, [key]);
  }

  /**
   * Archives data to backup tier
   * @param key - Data key
   * @param currentTier - Current tier of the data
   */
  private async archiveData(key: string, currentTier: StorageTier): Promise<void> {
    // Get data from current tier
    const result = await this.postgres.query(
      `SELECT value FROM tiered_storage_${currentTier} WHERE id = $1`,
      [key]
    );

    if (result.rows.length > 0) {
      // Insert into backup tier
      await this.postgres.query(
        `INSERT INTO tiered_storage_backup (id, value, created_at, updated_at)
         VALUES ($1, $2, NOW(), NOW())
         ON CONFLICT (id) DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, result.rows[0].value]
      );

      // Delete from current tier
      await this.deleteDataFromTier(key, currentTier);

      // Update metadata
      await this.postgres.query(
        `UPDATE tiered_storage_metadata
         SET current_tier = 'backup', updated_at = NOW()
         WHERE id = $1`,
        [key]
      );
    }
  }

  /**
   * Moves data to a lower tier
   * @param key - Data key
   * @param currentTier - Current tier of the data
   */
  private async moveToLowerTier(key: string, currentTier: StorageTier): Promise<void> {
    const tierOrder = [StorageTier.HOT, StorageTier.WARM, StorageTier.COLD, StorageTier.BACKUP];
    const currentIndex = tierOrder.indexOf(currentTier);
    
    if (currentIndex < tierOrder.length - 1) {
      const targetTier = tierOrder[currentIndex + 1];
      await this.archiveData(key, currentTier);
    }
  }
}

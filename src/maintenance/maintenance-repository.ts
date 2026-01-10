/**
 * Maintenance Repository
 *
 * Repository for maintenance data operations.
 * Extends base repository pattern with CRUD operations for maintenance tasks,
 * bug reports, security vulnerabilities, dependency updates, compliance audits,
 * and maintenance schedules.
 */

import { BaseRepository, QueryOptions, PaginationResult } from '../storage/repositories/base';
import { PostgresConnectionManager } from '../storage/database/postgres';
import { Logger } from '../utils/logger';
import {
  MaintenanceTask,
  BugReport,
  SecurityVulnerability,
  DependencyUpdate,
  ComplianceAudit,
  MaintenanceSchedule,
  MaintenanceStatus,
  MaintenancePriority,
  SecuritySeverity,
  MaintenanceType,
  ComplianceType,
} from './maintenance-models';

/**
 * Maintenance repository class
 * Handles all database operations for maintenance-related entities
 */
export class MaintenanceRepository extends BaseRepository<any> {
  private logger: Logger;

  constructor(db: PostgresConnectionManager) {
    super(db, 'maintenance_tasks', 'id');
    this.logger = new Logger('MaintenanceRepository');
  }

  // ============================================================================
  // MAINTENANCE TASKS
  // ============================================================================

  /**
   * Create a new maintenance task
   * @param task - Partial maintenance task object
   * @returns Created maintenance task
   */
  async createMaintenanceTask(task: Partial<MaintenanceTask>): Promise<MaintenanceTask> {
    const result = await this.db.query(
      `INSERT INTO maintenance_tasks (
        title, description, type, status, priority, assigned_to, assigned_to_name,
        estimated_hours, scheduled_at, due_date, tags, dependencies, related_issues, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        task.title,
        task.description,
        task.type,
        task.status || MaintenanceStatus.PENDING,
        task.priority || MaintenancePriority.MEDIUM,
        task.assignedTo,
        task.assignedToName,
        task.estimatedHours,
        task.scheduledAt,
        task.dueDate,
        task.tags || [],
        task.dependencies || [],
        task.relatedIssues || [],
        task.metadata || {},
      ]
    );
    return this.mapRowToMaintenanceTask(result.rows[0]);
  }

  /**
   * Get maintenance task by ID
   * @param id - Task ID
   * @returns Maintenance task or null
   */
  async getMaintenanceTaskById(id: string): Promise<MaintenanceTask | null> {
    const result = await this.db.query('SELECT * FROM maintenance_tasks WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return null;
    }
    return this.mapRowToMaintenanceTask(result.rows[0]);
  }

  /**
   * Get all maintenance tasks with optional filtering
   * @param options - Query options
   * @returns Array of maintenance tasks
   */
  async getMaintenanceTasks(options: QueryOptions = {}): Promise<MaintenanceTask[]> {
    let query = 'SELECT * FROM maintenance_tasks';
    const params: any[] = [];

    if (options.where) {
      query += ` WHERE ${options.where}`;
      if (options.params) {
        params.push(...options.params);
      }
    }

    if (options.orderBy) {
      query += ` ORDER BY ${options.orderBy} ${options.orderDirection || 'ASC'}`;
    }

    if (options.limit) {
      query += ` LIMIT ${options.limit}`;
    }

    if (options.offset) {
      query += ` OFFSET ${options.offset}`;
    }

    const result = await this.db.query(query, params);
    return result.rows.map((row: any) => this.mapRowToMaintenanceTask(row));
  }

  /**
   * Get maintenance tasks with pagination
   * @param options - Query options with pagination
   * @returns Paginated result of maintenance tasks
   */
  async getMaintenanceTasksWithPagination(
    options: QueryOptions & { page: number; pageSize: number }
  ): Promise<PaginationResult<MaintenanceTask>> {
    const offset = (options.page - 1) * options.pageSize;

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM maintenance_tasks';
    const countParams: any[] = [];

    if (options.where) {
      countQuery += ` WHERE ${options.where}`;
      if (options.params) {
        countParams.push(...options.params);
      }
    }

    const countResult = await this.db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    // Get data
    const data = await this.getMaintenanceTasks({
      ...options,
      limit: options.pageSize,
      offset,
    });

    return {
      data,
      total,
      page: options.page,
      pageSize: options.pageSize,
      hasNext: offset + options.pageSize < total,
      hasPrevious: options.page > 1,
    };
  }

  /**
   * Update maintenance task
   * @param id - Task ID
   * @param updates - Partial task object with updates
   * @returns Updated maintenance task or null
   */
  async updateMaintenanceTask(id: string, updates: Partial<MaintenanceTask>): Promise<MaintenanceTask | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const updateFields: Record<string, any> = {
      title: updates.title,
      description: updates.description,
      type: updates.type,
      status: updates.status,
      priority: updates.priority,
      assigned_to: updates.assignedTo,
      assigned_to_name: updates.assignedToName,
      estimated_hours: updates.estimatedHours,
      actual_hours: updates.actualHours,
      scheduled_at: updates.scheduledAt,
      started_at: updates.startedAt,
      completed_at: updates.completedAt,
      due_date: updates.dueDate,
      tags: updates.tags,
      dependencies: updates.dependencies,
      related_issues: updates.relatedIssues,
      metadata: updates.metadata,
    };

    for (const [key, value] of Object.entries(updateFields)) {
      if (value !== undefined) {
        fields.push(`${key} = $${paramIndex++}`);
        values.push(value);
      }
    }

    if (fields.length === 0) {
      return this.getMaintenanceTaskById(id);
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE maintenance_tasks
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.db.query(query, values);
    if (result.rows.length === 0) {
      return null;
    }
    return this.mapRowToMaintenanceTask(result.rows[0]);
  }

  /**
   * Delete maintenance task
   * @param id - Task ID
   * @returns True if deleted, false otherwise
   */
  async deleteMaintenanceTask(id: string): Promise<boolean> {
    const result = await this.db.query('DELETE FROM maintenance_tasks WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  }

  /**
   * Get maintenance tasks by status
   * @param status - Task status
   * @returns Array of maintenance tasks
   */
  async getMaintenanceTasksByStatus(status: MaintenanceStatus): Promise<MaintenanceTask[]> {
    return this.getMaintenanceTasks({
      where: 'status = $1',
      params: [status],
      orderBy: 'created_at',
      orderDirection: 'DESC',
    });
  }

  /**
   * Get maintenance tasks by priority
   * @param priority - Task priority
   * @returns Array of maintenance tasks
   */
  async getMaintenanceTasksByPriority(priority: MaintenancePriority): Promise<MaintenanceTask[]> {
    return this.getMaintenanceTasks({
      where: 'priority = $1',
      params: [priority],
      orderBy: 'created_at',
      orderDirection: 'DESC',
    });
  }

  /**
   * Get maintenance tasks by type
   * @param type - Task type
   * @returns Array of maintenance tasks
   */
  async getMaintenanceTasksByType(type: MaintenanceType): Promise<MaintenanceTask[]> {
    return this.getMaintenanceTasks({
      where: 'type = $1',
      params: [type],
      orderBy: 'created_at',
      orderDirection: 'DESC',
    });
  }

  /**
   * Get maintenance tasks by assignee
   * @param assignedTo - Assignee Discord ID
   * @returns Array of maintenance tasks
   */
  async getMaintenanceTasksByAssignee(assignedTo: string): Promise<MaintenanceTask[]> {
    return this.getMaintenanceTasks({
      where: 'assigned_to = $1',
      params: [assignedTo],
      orderBy: 'created_at',
      orderDirection: 'DESC',
    });
  }

  // ============================================================================
  // BUG REPORTS
  // ============================================================================

  /**
   * Create a new bug report
   * @param bugReport - Partial bug report object
   * @returns Created bug report
   */
  async createBugReport(bugReport: Partial<BugReport>): Promise<BugReport> {
    const result = await this.db.query(
      `INSERT INTO bug_reports (
        title, description, severity, status, reported_by, reported_by_name, reported_at,
        category, reproduction_steps, expected_behavior, actual_behavior, environment,
        logs, stack_trace, attachments, assigned_to, assigned_to_name, related_issues, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *`,
      [
        bugReport.title,
        bugReport.description,
        bugReport.severity || MaintenancePriority.MEDIUM,
        bugReport.status || MaintenanceStatus.PENDING,
        bugReport.reportedBy,
        bugReport.reportedByName,
        bugReport.reportedAt || new Date(),
        bugReport.category,
        bugReport.reproductionSteps,
        bugReport.expectedBehavior,
        bugReport.actualBehavior,
        bugReport.environment,
        bugReport.logs,
        bugReport.stackTrace,
        bugReport.attachments || [],
        bugReport.assignedTo,
        bugReport.assignedToName,
        bugReport.relatedIssues || [],
        bugReport.metadata || {},
      ]
    );
    return this.mapRowToBugReport(result.rows[0]);
  }

  /**
   * Get bug report by ID
   * @param id - Bug report ID
   * @returns Bug report or null
   */
  async getBugReportById(id: string): Promise<BugReport | null> {
    const result = await this.db.query('SELECT * FROM bug_reports WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return null;
    }
    return this.mapRowToBugReport(result.rows[0]);
  }

  /**
   * Get all bug reports with optional filtering
   * @param options - Query options
   * @returns Array of bug reports
   */
  async getBugReports(options: QueryOptions = {}): Promise<BugReport[]> {
    let query = 'SELECT * FROM bug_reports';
    const params: any[] = [];

    if (options.where) {
      query += ` WHERE ${options.where}`;
      if (options.params) {
        params.push(...options.params);
      }
    }

    if (options.orderBy) {
      query += ` ORDER BY ${options.orderBy} ${options.orderDirection || 'ASC'}`;
    }

    if (options.limit) {
      query += ` LIMIT ${options.limit}`;
    }

    if (options.offset) {
      query += ` OFFSET ${options.offset}`;
    }

    const result = await this.db.query(query, params);
    return result.rows.map((row: any) => this.mapRowToBugReport(row));
  }

  /**
   * Update bug report
   * @param id - Bug report ID
   * @param updates - Partial bug report object with updates
   * @returns Updated bug report or null
   */
  async updateBugReport(id: string, updates: Partial<BugReport>): Promise<BugReport | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const updateFields: Record<string, any> = {
      title: updates.title,
      description: updates.description,
      severity: updates.severity,
      status: updates.status,
      assigned_to: updates.assignedTo,
      assigned_to_name: updates.assignedToName,
      resolved_at: updates.resolvedAt,
      resolution: updates.resolution,
      related_issues: updates.relatedIssues,
      metadata: updates.metadata,
    };

    for (const [key, value] of Object.entries(updateFields)) {
      if (value !== undefined) {
        fields.push(`${key} = $${paramIndex++}`);
        values.push(value);
      }
    }

    if (fields.length === 0) {
      return this.getBugReportById(id);
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE bug_reports
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.db.query(query, values);
    if (result.rows.length === 0) {
      return null;
    }
    return this.mapRowToBugReport(result.rows[0]);
  }

  /**
   * Delete bug report
   * @param id - Bug report ID
   * @returns True if deleted, false otherwise
   */
  async deleteBugReport(id: string): Promise<boolean> {
    const result = await this.db.query('DELETE FROM bug_reports WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  }

  // ============================================================================
  // SECURITY VULNERABILITIES
  // ============================================================================

  /**
   * Create a new security vulnerability
   * @param vulnerability - Partial vulnerability object
   * @returns Created security vulnerability
   */
  async createSecurityVulnerability(vulnerability: Partial<SecurityVulnerability>): Promise<SecurityVulnerability> {
    const result = await this.db.query(
      `INSERT INTO security_vulnerabilities (
        title, description, severity, status, cve_id, cvss_score, affected_components,
        discovered_at, discovered_by, discovered_by_name, exploit_available, patch_available,
        patch_version, mitigation, references, assigned_to, assigned_to_name, fixed_at,
        fix_description, related_vulnerabilities, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *`,
      [
        vulnerability.title,
        vulnerability.description,
        vulnerability.severity || SecuritySeverity.MEDIUM,
        vulnerability.status || MaintenanceStatus.PENDING,
        vulnerability.cveId,
        vulnerability.cvssScore,
        vulnerability.affectedComponents || [],
        vulnerability.discoveredAt || new Date(),
        vulnerability.discoveredBy,
        vulnerability.discoveredByName,
        vulnerability.exploitAvailable || false,
        vulnerability.patchAvailable || false,
        vulnerability.patchVersion,
        vulnerability.mitigation,
        vulnerability.references || [],
        vulnerability.assignedTo,
        vulnerability.assignedToName,
        vulnerability.fixedAt,
        vulnerability.fixDescription,
        vulnerability.relatedVulnerabilities || [],
        vulnerability.metadata || {},
      ]
    );
    return this.mapRowToSecurityVulnerability(result.rows[0]);
  }

  /**
   * Get security vulnerability by ID
   * @param id - Vulnerability ID
   * @returns Security vulnerability or null
   */
  async getSecurityVulnerabilityById(id: string): Promise<SecurityVulnerability | null> {
    const result = await this.db.query('SELECT * FROM security_vulnerabilities WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return null;
    }
    return this.mapRowToSecurityVulnerability(result.rows[0]);
  }

  /**
   * Get all security vulnerabilities with optional filtering
   * @param options - Query options
   * @returns Array of security vulnerabilities
   */
  async getSecurityVulnerabilities(options: QueryOptions = {}): Promise<SecurityVulnerability[]> {
    let query = 'SELECT * FROM security_vulnerabilities';
    const params: any[] = [];

    if (options.where) {
      query += ` WHERE ${options.where}`;
      if (options.params) {
        params.push(...options.params);
      }
    }

    if (options.orderBy) {
      query += ` ORDER BY ${options.orderBy} ${options.orderDirection || 'ASC'}`;
    }

    if (options.limit) {
      query += ` LIMIT ${options.limit}`;
    }

    if (options.offset) {
      query += ` OFFSET ${options.offset}`;
    }

    const result = await this.db.query(query, params);
    return result.rows.map((row: any) => this.mapRowToSecurityVulnerability(row));
  }

  /**
   * Update security vulnerability
   * @param id - Vulnerability ID
   * @param updates - Partial vulnerability object with updates
   * @returns Updated security vulnerability or null
   */
  async updateSecurityVulnerability(id: string, updates: Partial<SecurityVulnerability>): Promise<SecurityVulnerability | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const updateFields: Record<string, any> = {
      title: updates.title,
      description: updates.description,
      severity: updates.severity,
      status: updates.status,
      assigned_to: updates.assignedTo,
      assigned_to_name: updates.assignedToName,
      fixed_at: updates.fixedAt,
      fix_description: updates.fixDescription,
      related_vulnerabilities: updates.relatedVulnerabilities,
      metadata: updates.metadata,
    };

    for (const [key, value] of Object.entries(updateFields)) {
      if (value !== undefined) {
        fields.push(`${key} = $${paramIndex++}`);
        values.push(value);
      }
    }

    if (fields.length === 0) {
      return this.getSecurityVulnerabilityById(id);
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE security_vulnerabilities
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.db.query(query, values);
    if (result.rows.length === 0) {
      return null;
    }
    return this.mapRowToSecurityVulnerability(result.rows[0]);
  }

  /**
   * Delete security vulnerability
   * @param id - Vulnerability ID
   * @returns True if deleted, false otherwise
   */
  async deleteSecurityVulnerability(id: string): Promise<boolean> {
    const result = await this.db.query('DELETE FROM security_vulnerabilities WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  }

  // ============================================================================
  // DEPENDENCY UPDATES
  // ============================================================================

  /**
   * Create a new dependency update
   * @param dependencyUpdate - Partial dependency update object
   * @returns Created dependency update
   */
  async createDependencyUpdate(dependencyUpdate: Partial<DependencyUpdate>): Promise<DependencyUpdate> {
    const result = await this.db.query(
      `INSERT INTO dependency_updates (
        package_name, current_version, target_version, update_type, status, severity,
        is_security_update, vulnerabilities, breaking_changes, scheduled_at, started_at,
        completed_at, rollback_version, test_results, assigned_to, assigned_to_name,
        changelog, related_issues, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *`,
      [
        dependencyUpdate.packageName,
        dependencyUpdate.currentVersion,
        dependencyUpdate.targetVersion,
        dependencyUpdate.updateType,
        dependencyUpdate.status || MaintenanceStatus.PENDING,
        dependencyUpdate.severity || SecuritySeverity.LOW,
        dependencyUpdate.isSecurityUpdate || false,
        dependencyUpdate.vulnerabilities || [],
        dependencyUpdate.breakingChanges || [],
        dependencyUpdate.scheduledAt,
        dependencyUpdate.startedAt,
        dependencyUpdate.completedAt,
        dependencyUpdate.rollbackVersion,
        dependencyUpdate.testResults,
        dependencyUpdate.assignedTo,
        dependencyUpdate.assignedToName,
        dependencyUpdate.changelog,
        dependencyUpdate.relatedIssues || [],
        dependencyUpdate.metadata || {},
      ]
    );
    return this.mapRowToDependencyUpdate(result.rows[0]);
  }

  /**
   * Get dependency update by ID
   * @param id - Dependency update ID
   * @returns Dependency update or null
   */
  async getDependencyUpdateById(id: string): Promise<DependencyUpdate | null> {
    const result = await this.db.query('SELECT * FROM dependency_updates WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return null;
    }
    return this.mapRowToDependencyUpdate(result.rows[0]);
  }

  /**
   * Get all dependency updates with optional filtering
   * @param options - Query options
   * @returns Array of dependency updates
   */
  async getDependencyUpdates(options: QueryOptions = {}): Promise<DependencyUpdate[]> {
    let query = 'SELECT * FROM dependency_updates';
    const params: any[] = [];

    if (options.where) {
      query += ` WHERE ${options.where}`;
      if (options.params) {
        params.push(...options.params);
      }
    }

    if (options.orderBy) {
      query += ` ORDER BY ${options.orderBy} ${options.orderDirection || 'ASC'}`;
    }

    if (options.limit) {
      query += ` LIMIT ${options.limit}`;
    }

    if (options.offset) {
      query += ` OFFSET ${options.offset}`;
    }

    const result = await this.db.query(query, params);
    return result.rows.map((row: any) => this.mapRowToDependencyUpdate(row));
  }

  /**
   * Update dependency update
   * @param id - Dependency update ID
   * @param updates - Partial dependency update object with updates
   * @returns Updated dependency update or null
   */
  async updateDependencyUpdate(id: string, updates: Partial<DependencyUpdate>): Promise<DependencyUpdate | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const updateFields: Record<string, any> = {
      status: updates.status,
      scheduled_at: updates.scheduledAt,
      started_at: updates.startedAt,
      completed_at: updates.completedAt,
      rollback_version: updates.rollbackVersion,
      test_results: updates.testResults,
      assigned_to: updates.assignedTo,
      assigned_to_name: updates.assignedToName,
      related_issues: updates.relatedIssues,
      metadata: updates.metadata,
    };

    for (const [key, value] of Object.entries(updateFields)) {
      if (value !== undefined) {
        fields.push(`${key} = $${paramIndex++}`);
        values.push(value);
      }
    }

    if (fields.length === 0) {
      return this.getDependencyUpdateById(id);
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE dependency_updates
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.db.query(query, values);
    if (result.rows.length === 0) {
      return null;
    }
    return this.mapRowToDependencyUpdate(result.rows[0]);
  }

  /**
   * Delete dependency update
   * @param id - Dependency update ID
   * @returns True if deleted, false otherwise
   */
  async deleteDependencyUpdate(id: string): Promise<boolean> {
    const result = await this.db.query('DELETE FROM dependency_updates WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  }

  // ============================================================================
  // COMPLIANCE AUDITS
  // ============================================================================

  /**
   * Create a new compliance audit
   * @param audit - Partial compliance audit object
   * @returns Created compliance audit
   */
  async createComplianceAudit(audit: Partial<ComplianceAudit>): Promise<ComplianceAudit> {
    const result = await this.db.query(
      `INSERT INTO compliance_audits (
        type, title, description, status, priority, scheduled_at, started_at,
        completed_at, auditor, auditor_name, findings, overall_score, passed,
        recommendations, next_audit_date, related_audits, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [
        audit.type,
        audit.title,
        audit.description,
        audit.status || MaintenanceStatus.PENDING,
        audit.priority || MaintenancePriority.MEDIUM,
        audit.scheduledAt,
        audit.startedAt,
        audit.completedAt,
        audit.auditor,
        audit.auditorName,
        JSON.stringify(audit.findings || []),
        audit.overallScore,
        audit.passed,
        audit.recommendations || [],
        audit.nextAuditDate,
        audit.relatedAudits || [],
        audit.metadata || {},
      ]
    );
    return this.mapRowToComplianceAudit(result.rows[0]);
  }

  /**
   * Get compliance audit by ID
   * @param id - Compliance audit ID
   * @returns Compliance audit or null
   */
  async getComplianceAuditById(id: string): Promise<ComplianceAudit | null> {
    const result = await this.db.query('SELECT * FROM compliance_audits WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return null;
    }
    return this.mapRowToComplianceAudit(result.rows[0]);
  }

  /**
   * Get all compliance audits with optional filtering
   * @param options - Query options
   * @returns Array of compliance audits
   */
  async getComplianceAudits(options: QueryOptions = {}): Promise<ComplianceAudit[]> {
    let query = 'SELECT * FROM compliance_audits';
    const params: any[] = [];

    if (options.where) {
      query += ` WHERE ${options.where}`;
      if (options.params) {
        params.push(...options.params);
      }
    }

    if (options.orderBy) {
      query += ` ORDER BY ${options.orderBy} ${options.orderDirection || 'ASC'}`;
    }

    if (options.limit) {
      query += ` LIMIT ${options.limit}`;
    }

    if (options.offset) {
      query += ` OFFSET ${options.offset}`;
    }

    const result = await this.db.query(query, params);
    return result.rows.map((row: any) => this.mapRowToComplianceAudit(row));
  }

  /**
   * Update compliance audit
   * @param id - Compliance audit ID
   * @param updates - Partial compliance audit object with updates
   * @returns Updated compliance audit or null
   */
  async updateComplianceAudit(id: string, updates: Partial<ComplianceAudit>): Promise<ComplianceAudit | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const updateFields: Record<string, any> = {
      status: updates.status,
      started_at: updates.startedAt,
      completed_at: updates.completedAt,
      findings: updates.findings,
      overall_score: updates.overallScore,
      passed: updates.passed,
      recommendations: updates.recommendations,
      next_audit_date: updates.nextAuditDate,
      related_audits: updates.relatedAudits,
      metadata: updates.metadata,
    };

    for (const [key, value] of Object.entries(updateFields)) {
      if (value !== undefined) {
        fields.push(`${key} = $${paramIndex++}`);
        values.push(typeof value === 'object' ? JSON.stringify(value) : value);
      }
    }

    if (fields.length === 0) {
      return this.getComplianceAuditById(id);
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE compliance_audits
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.db.query(query, values);
    if (result.rows.length === 0) {
      return null;
    }
    return this.mapRowToComplianceAudit(result.rows[0]);
  }

  /**
   * Delete compliance audit
   * @param id - Compliance audit ID
   * @returns True if deleted, false otherwise
   */
  async deleteComplianceAudit(id: string): Promise<boolean> {
    const result = await this.db.query('DELETE FROM compliance_audits WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  }

  // ============================================================================
  // MAINTENANCE SCHEDULES
  // ============================================================================

  /**
   * Create a new maintenance schedule
   * @param schedule - Partial maintenance schedule object
   * @returns Created maintenance schedule
   */
  async createMaintenanceSchedule(schedule: Partial<MaintenanceSchedule>): Promise<MaintenanceSchedule> {
    const result = await this.db.query(
      `INSERT INTO maintenance_schedules (
        title, description, type, frequency, priority, enabled, scheduled_time,
        timezone, estimated_duration, maintenance_window_start, maintenance_window_end,
        notify_before, notify_channels, last_run_at, next_run_at, run_count,
        success_count, failure_count, last_run_status, last_run_output, related_tasks, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *`,
      [
        schedule.title,
        schedule.description,
        schedule.type,
        schedule.frequency,
        schedule.priority || MaintenancePriority.MEDIUM,
        schedule.enabled !== undefined ? schedule.enabled : true,
        schedule.scheduledTime,
        schedule.timezone || 'UTC',
        schedule.estimatedDuration,
        schedule.maintenanceWindowStart,
        schedule.maintenanceWindowEnd,
        schedule.notifyBefore || [],
        schedule.notifyChannels || [],
        schedule.lastRunAt,
        schedule.nextRunAt,
        schedule.runCount || 0,
        schedule.successCount || 0,
        schedule.failureCount || 0,
        schedule.lastRunStatus,
        schedule.lastRunOutput,
        schedule.relatedTasks || [],
        schedule.metadata || {},
      ]
    );
    return this.mapRowToMaintenanceSchedule(result.rows[0]);
  }

  /**
   * Get maintenance schedule by ID
   * @param id - Schedule ID
   * @returns Maintenance schedule or null
   */
  async getMaintenanceScheduleById(id: string): Promise<MaintenanceSchedule | null> {
    const result = await this.db.query('SELECT * FROM maintenance_schedules WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return null;
    }
    return this.mapRowToMaintenanceSchedule(result.rows[0]);
  }

  /**
   * Get all maintenance schedules with optional filtering
   * @param options - Query options
   * @returns Array of maintenance schedules
   */
  async getMaintenanceSchedules(options: QueryOptions = {}): Promise<MaintenanceSchedule[]> {
    let query = 'SELECT * FROM maintenance_schedules';
    const params: any[] = [];

    if (options.where) {
      query += ` WHERE ${options.where}`;
      if (options.params) {
        params.push(...options.params);
      }
    }

    if (options.orderBy) {
      query += ` ORDER BY ${options.orderBy} ${options.orderDirection || 'ASC'}`;
    }

    if (options.limit) {
      query += ` LIMIT ${options.limit}`;
    }

    if (options.offset) {
      query += ` OFFSET ${options.offset}`;
    }

    const result = await this.db.query(query, params);
    return result.rows.map((row: any) => this.mapRowToMaintenanceSchedule(row));
  }

  /**
   * Get enabled maintenance schedules
   * @returns Array of enabled maintenance schedules
   */
  async getEnabledMaintenanceSchedules(): Promise<MaintenanceSchedule[]> {
    return this.getMaintenanceSchedules({
      where: 'enabled = TRUE',
      orderBy: 'next_run_at',
      orderDirection: 'ASC',
    });
  }

  /**
   * Get maintenance schedules due to run
   * @param beforeTime - Time threshold
   * @returns Array of due maintenance schedules
   */
  async getDueMaintenanceSchedules(beforeTime: Date = new Date()): Promise<MaintenanceSchedule[]> {
    return this.getMaintenanceSchedules({
      where: 'enabled = TRUE AND next_run_at <= $1',
      params: [beforeTime],
      orderBy: 'next_run_at',
      orderDirection: 'ASC',
    });
  }

  /**
   * Update maintenance schedule
   * @param id - Schedule ID
   * @param updates - Partial maintenance schedule object with updates
   * @returns Updated maintenance schedule or null
   */
  async updateMaintenanceSchedule(id: string, updates: Partial<MaintenanceSchedule>): Promise<MaintenanceSchedule | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const updateFields: Record<string, any> = {
      title: updates.title,
      description: updates.description,
      type: updates.type,
      frequency: updates.frequency,
      priority: updates.priority,
      enabled: updates.enabled,
      scheduled_time: updates.scheduledTime,
      timezone: updates.timezone,
      estimated_duration: updates.estimatedDuration,
      maintenance_window_start: updates.maintenanceWindowStart,
      maintenance_window_end: updates.maintenanceWindowEnd,
      notify_before: updates.notifyBefore,
      notify_channels: updates.notifyChannels,
      last_run_at: updates.lastRunAt,
      next_run_at: updates.nextRunAt,
      run_count: updates.runCount,
      success_count: updates.successCount,
      failure_count: updates.failureCount,
      last_run_status: updates.lastRunStatus,
      last_run_output: updates.lastRunOutput,
      related_tasks: updates.relatedTasks,
      metadata: updates.metadata,
    };

    for (const [key, value] of Object.entries(updateFields)) {
      if (value !== undefined) {
        fields.push(`${key} = $${paramIndex++}`);
        values.push(value);
      }
    }

    if (fields.length === 0) {
      return this.getMaintenanceScheduleById(id);
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE maintenance_schedules
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.db.query(query, values);
    if (result.rows.length === 0) {
      return null;
    }
    return this.mapRowToMaintenanceSchedule(result.rows[0]);
  }

  /**
   * Delete maintenance schedule
   * @param id - Schedule ID
   * @returns True if deleted, false otherwise
   */
  async deleteMaintenanceSchedule(id: string): Promise<boolean> {
    const result = await this.db.query('DELETE FROM maintenance_schedules WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  }

  // ============================================================================
  // ROW MAPPING METHODS
  // ============================================================================

  /**
   * Map database row to MaintenanceTask
   * @param row - Database row
   * @returns MaintenanceTask object
   */
  private mapRowToMaintenanceTask(row: any): MaintenanceTask {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      type: row.type as MaintenanceType,
      status: row.status as MaintenanceStatus,
      priority: row.priority as MaintenancePriority,
      assignedTo: row.assigned_to,
      assignedToName: row.assigned_to_name,
      estimatedHours: row.estimated_hours ? parseFloat(row.estimated_hours) : undefined,
      actualHours: row.actual_hours ? parseFloat(row.actual_hours) : undefined,
      scheduledAt: row.scheduled_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      dueDate: row.due_date,
      tags: row.tags || [],
      dependencies: row.dependencies || [],
      relatedIssues: row.related_issues || [],
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Map database row to BugReport
   * @param row - Database row
   * @returns BugReport object
   */
  private mapRowToBugReport(row: any): BugReport {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      severity: row.severity as MaintenancePriority,
      status: row.status as MaintenanceStatus,
      reportedBy: row.reported_by,
      reportedByName: row.reported_by_name,
      reportedAt: row.reported_at,
      category: row.category,
      reproductionSteps: row.reproduction_steps,
      expectedBehavior: row.expected_behavior,
      actualBehavior: row.actual_behavior,
      environment: row.environment,
      logs: row.logs,
      stackTrace: row.stack_trace,
      attachments: row.attachments || [],
      assignedTo: row.assigned_to,
      assignedToName: row.assigned_to_name,
      resolvedAt: row.resolved_at,
      resolution: row.resolution,
      relatedIssues: row.related_issues || [],
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Map database row to SecurityVulnerability
   * @param row - Database row
   * @returns SecurityVulnerability object
   */
  private mapRowToSecurityVulnerability(row: any): SecurityVulnerability {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      severity: row.severity as SecuritySeverity,
      status: row.status as MaintenanceStatus,
      cveId: row.cve_id,
      cvssScore: row.cvss_score ? parseFloat(row.cvss_score) : undefined,
      affectedComponents: row.affected_components || [],
      discoveredAt: row.discovered_at,
      discoveredBy: row.discovered_by,
      discoveredByName: row.discovered_by_name,
      exploitAvailable: row.exploit_available,
      patchAvailable: row.patch_available,
      patchVersion: row.patch_version,
      mitigation: row.mitigation,
      references: row.references || [],
      assignedTo: row.assigned_to,
      assignedToName: row.assigned_to_name,
      fixedAt: row.fixed_at,
      fixDescription: row.fix_description,
      relatedVulnerabilities: row.related_vulnerabilities || [],
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Map database row to DependencyUpdate
   * @param row - Database row
   * @returns DependencyUpdate object
   */
  private mapRowToDependencyUpdate(row: any): DependencyUpdate {
    return {
      id: row.id,
      packageName: row.package_name,
      currentVersion: row.current_version,
      targetVersion: row.target_version,
      updateType: row.update_type,
      status: row.status as MaintenanceStatus,
      severity: row.severity as SecuritySeverity,
      isSecurityUpdate: row.is_security_update,
      vulnerabilities: row.vulnerabilities || [],
      breakingChanges: row.breaking_changes || [],
      scheduledAt: row.scheduled_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      rollbackVersion: row.rollback_version,
      testResults: row.test_results,
      assignedTo: row.assigned_to,
      assignedToName: row.assigned_to_name,
      changelog: row.changelog,
      relatedIssues: row.related_issues || [],
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Map database row to ComplianceAudit
   * @param row - Database row
   * @returns ComplianceAudit object
   */
  private mapRowToComplianceAudit(row: any): ComplianceAudit {
    return {
      id: row.id,
      type: row.type as ComplianceType,
      title: row.title,
      description: row.description,
      status: row.status as MaintenanceStatus,
      priority: row.priority as MaintenancePriority,
      scheduledAt: row.scheduled_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      auditor: row.auditor,
      auditorName: row.auditor_name,
      findings: typeof row.findings === 'string' ? JSON.parse(row.findings) : row.findings,
      overallScore: row.overall_score,
      passed: row.passed,
      recommendations: row.recommendations || [],
      nextAuditDate: row.next_audit_date,
      relatedAudits: row.related_audits || [],
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Map database row to MaintenanceSchedule
   * @param row - Database row
   * @returns MaintenanceSchedule object
   */
  private mapRowToMaintenanceSchedule(row: any): MaintenanceSchedule {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      type: row.type as MaintenanceType,
      frequency: row.frequency,
      priority: row.priority as MaintenancePriority,
      enabled: row.enabled,
      scheduledTime: row.scheduled_time,
      timezone: row.timezone,
      estimatedDuration: row.estimated_duration,
      maintenanceWindowStart: row.maintenance_window_start,
      maintenanceWindowEnd: row.maintenance_window_end,
      notifyBefore: row.notify_before || [],
      notifyChannels: row.notify_channels || [],
      lastRunAt: row.last_run_at,
      nextRunAt: row.next_run_at,
      runCount: row.run_count,
      successCount: row.success_count,
      failureCount: row.failure_count,
      lastRunStatus: row.last_run_status as MaintenanceStatus | undefined,
      lastRunOutput: row.last_run_output,
      relatedTasks: row.related_tasks || [],
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Abstract method implementation for base repository
   */
  protected mapRowToEntity(row: any): any {
    return row;
  }

  /**
   * Abstract method implementation for base repository
   */
  protected getEntityName(): string {
    return 'Maintenance';
  }
}

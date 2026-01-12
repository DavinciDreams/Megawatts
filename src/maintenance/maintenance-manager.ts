/**
 * Maintenance Manager
 *
 * Main maintenance orchestrator for coordinating all maintenance activities,
 * bug triage and prioritization, security incident response,
 * and performance optimization tracking.
 */

import { EventEmitter } from 'events';
import { Logger } from '../utils/logger';
import { MaintenanceRepository } from './maintenance-repository';
import { SecurityAuditor } from './security-auditor';
import { DependencyManager } from './dependency-manager';
import { ComplianceManager } from './compliance-manager';
import { MaintenanceScheduler } from './maintenance-scheduler';
import {
  MaintenanceTask,
  BugReport,
  SecurityVulnerability,
  DependencyUpdate,
  ComplianceAudit,
  MaintenanceStatus,
  MaintenancePriority,
  MaintenanceType,
  SecuritySeverity,
} from './maintenance-models';

/**
 * Maintenance manager configuration
 */
export interface MaintenanceManagerConfig {
  autoTriageBugs: boolean;
  autoPrioritizeTasks: boolean;
  autoRespondToSecurityIncidents: boolean;
  autoTrackPerformance: boolean;
  notificationChannels: string[];
  triageRules: TriageRules;
  securityResponseRules: SecurityResponseRules;
}

/**
 * Triage rules for bugs and issues
 */
export interface TriageRules {
  priorityThresholds: {
    critical: number; // hours to respond
    high: number; // hours to respond
    medium: number; // hours to respond
    low: number; // hours to respond
  };
  autoAssignRules: {
    securityVulnerabilities: boolean;
    criticalBugs: boolean;
    highPriorityTasks: boolean;
  };
}

/**
 * Security incident response rules
 */
export interface SecurityResponseRules {
  criticalResponseTime: number; // in minutes
  highResponseTime: number; // in minutes
  mediumResponseTime: number; // in minutes
  autoCreateTasks: boolean;
  autoNotifyChannels: string[];
}

/**
 * Default maintenance manager configuration
 */
export const DEFAULT_MAINTENANCE_MANAGER_CONFIG: MaintenanceManagerConfig = {
  autoTriageBugs: true,
  autoPrioritizeTasks: true,
  autoRespondToSecurityIncidents: true,
  autoTrackPerformance: true,
  notificationChannels: [],
  triageRules: {
    priorityThresholds: {
      critical: 1,
      high: 4,
      medium: 24,
      low: 72,
    },
    autoAssignRules: {
      securityVulnerabilities: true,
      criticalBugs: true,
      highPriorityTasks: false,
    },
  },
  securityResponseRules: {
    criticalResponseTime: 15,
    highResponseTime: 60,
    mediumResponseTime: 240,
    autoCreateTasks: true,
    autoNotifyChannels: [],
  },
};

/**
 * Triage result
 */
export interface TriageResult {
  id: string;
  itemType: 'bug' | 'vulnerability' | 'task';
  itemId: string;
  originalPriority: MaintenancePriority;
  triagedPriority: MaintenancePriority;
  assignedTo?: string;
  assignedToName?: string;
  reason: string;
  triagedAt: Date;
}

/**
 * Security incident response
 */
export interface SecurityIncidentResponse {
  vulnerabilityId: string;
  severity: SecuritySeverity;
  responseTime: number; // in minutes
  taskId?: string;
  status: 'responding' | 'responded' | 'mitigated' | 'resolved';
  respondedAt: Date;
  mitigatedAt?: Date;
  resolvedAt?: Date;
}

/**
 * Performance optimization result
 */
export interface PerformanceOptimizationResult {
  id: string;
  type: 'database' | 'cache' | 'api' | 'code' | 'infrastructure';
  description: string;
  beforeMetrics: Record<string, number>;
  afterMetrics: Record<string, number>;
  improvement: number; // percentage
  implementedAt: Date;
  status: 'in_progress' | 'completed' | 'failed';
}

/**
 * Maintenance manager class
 */
export class MaintenanceManager extends EventEmitter {
  private config: MaintenanceManagerConfig;
  private repository: MaintenanceRepository;
  private logger: Logger;
  private securityAuditor: SecurityAuditor;
  private dependencyManager: DependencyManager;
  private complianceManager: ComplianceManager;
  private scheduler: MaintenanceScheduler;
  private isRunning = false;
  private triageHistory: TriageResult[] = [];
  private securityIncidents: SecurityIncidentResponse[] = [];
  private performanceOptimizations: PerformanceOptimizationResult[] = [];

  constructor(
    repository: MaintenanceRepository,
    securityAuditor: SecurityAuditor,
    dependencyManager: DependencyManager,
    complianceManager: ComplianceManager,
    scheduler: MaintenanceScheduler,
    config: Partial<MaintenanceManagerConfig> = {}
  ) {
    super();
    this.config = { ...DEFAULT_MAINTENANCE_MANAGER_CONFIG, ...config };
    this.repository = repository;
    this.securityAuditor = securityAuditor;
    this.dependencyManager = dependencyManager;
    this.complianceManager = complianceManager;
    this.scheduler = scheduler;
    this.logger = new Logger('MaintenanceManager');

    // Listen to events from subsystems
    this.setupEventListeners();
  }

  /**
   * Setup event listeners from subsystems
   */
  private setupEventListeners(): void {
    // Listen to security auditor events
    this.securityAuditor.on('criticalVulnerabilities', (data) => {
      this.handleCriticalVulnerabilities(data);
    });

    this.securityAuditor.on('auditCompleted', (result) => {
      this.handleSecurityAuditCompleted(result);
    });

    // Listen to dependency manager events
    this.dependencyManager.on('updatesFound', (updates) => {
      this.handleDependencyUpdatesFound(updates);
    });

    this.dependencyManager.on('vulnerabilitiesFound', (updates) => {
      this.handleDependencyVulnerabilitiesFound(updates);
    });

    this.dependencyManager.on('updateFailed', (data) => {
      this.handleDependencyUpdateFailed(data);
    });

    // Listen to compliance manager events
    this.complianceManager.on('complianceFailed', (data) => {
      this.handleComplianceFailure(data);
    });

    this.complianceManager.on('reportGenerated', (report) => {
      this.handleComplianceReportGenerated(report);
    });

    // Listen to scheduler events
    this.scheduler.on('notification', (data) => {
      this.handleMaintenanceNotification(data);
    });

    this.scheduler.on('taskCompleted', (data) => {
      this.handleMaintenanceTaskCompleted(data);
    });
  }

  /**
   * Start maintenance manager
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Maintenance manager is already running');
      return;
    }

    this.isRunning = true;

    // Start subsystems
    this.securityAuditor.start();
    this.dependencyManager.start();
    this.complianceManager.start();
    this.scheduler.start();

    // Run initial triage
    if (this.config.autoTriageBugs) {
      await this.runBugTriage();
    }

    // Run initial task prioritization
    if (this.config.autoPrioritizeTasks) {
      await this.prioritizeTasks();
    }

    this.logger.info('Maintenance manager started');
    this.emit('started');
  }

  /**
   * Stop maintenance manager
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // Stop subsystems
    this.securityAuditor.stop();
    this.dependencyManager.stop();
    this.complianceManager.stop();
    this.scheduler.stop();

    this.logger.info('Maintenance manager stopped');
    this.emit('stopped');
  }

  /**
   * Run bug triage
   */
  async runBugTriage(): Promise<TriageResult[]> {
    this.logger.info('Running bug triage');

    const results: TriageResult[] = [];

    try {
      // Get pending bug reports
      const pendingBugs = await this.repository.getBugReports({
        where: 'status = $1',
        params: [MaintenanceStatus.PENDING],
        orderBy: 'reported_at',
        orderDirection: 'DESC',
      });

      for (const bug of pendingBugs) {
        const triageResult = await this.triageBug(bug);
        results.push(triageResult);
      }

      this.logger.info(`Bug triage completed: ${results.length} bugs triaged`);
      this.emit('bugTriageCompleted', results);

    } catch (error) {
      this.logger.error('Bug triage failed:', error);
    }

    return results;
  }

  /**
   * Triage a single bug report
   * @param bug - Bug report to triage
   * @returns Triage result
   */
  private async triageBug(bug: BugReport): Promise<TriageResult> {
    const now = new Date();
    const hoursSinceReport = (now.getTime() - bug.reportedAt.getTime()) / (1000 * 60 * 60);

    // Determine priority based on triage rules
    let triagedPriority: MaintenancePriority = bug.severity;
    let reason = 'Priority based on severity';

    // Check if auto-assign rules apply
    if (this.config.triageRules.autoAssignRules.criticalBugs && bug.severity === MaintenancePriority.CRITICAL) {
      // Auto-assign to security team
      const securityTeam = await this.getSecurityTeamMember();
      if (securityTeam) {
        await this.repository.updateBugReport(bug.id, {
          assignedTo: securityTeam.id,
          assignedToName: securityTeam.name,
          status: MaintenanceStatus.SCHEDULED,
        });

        triagedPriority = MaintenancePriority.CRITICAL;
        reason = 'Auto-assigned to security team';
      }
    }

    // Store triage result
    const result: TriageResult = {
      id: `triage-${Date.now()}`,
      itemType: 'bug',
      itemId: bug.id,
      originalPriority: bug.severity,
      triagedPriority,
      assignedTo: this.config.triageRules.autoAssignRules.criticalBugs && bug.severity === MaintenancePriority.CRITICAL
        ? (await this.getSecurityTeamMember())?.id
        : undefined,
      assignedToName: this.config.triageRules.autoAssignRules.criticalBugs && bug.severity === MaintenancePriority.CRITICAL
        ? (await this.getSecurityTeamMember())?.name
        : undefined,
      reason,
      triagedAt: now,
    };

    this.triageHistory.push(result);

    // Emit triage event
    this.emit('bugTriaged', { bug, result });

    return result;
  }

  /**
   * Get security team member for assignment
   * @returns Team member or null
   */
  private async getSecurityTeamMember(): Promise<{ id: string; name: string } | null> {
    try {
      this.logger.debug('Getting security team member for assignment');

      // Query security team members from database
      const securityTeamMembers = await this.repository.getSecurityTeamMembers({
        where: 'on_call = $1',
        params: [true],
        orderBy: 'priority',
        orderDirection: 'ASC',
        limit: 1,
      });

      // Return the first on-call team member
      if (securityTeamMembers.length > 0) {
        const member = securityTeamMembers[0];
        this.logger.debug(`Found on-call security team member: ${member.name}`);
        return {
          id: member.id,
          name: member.name,
        };
      }

      // Fallback to a default if no on-call member found
      this.logger.warn('No on-call security team member found, using fallback');
      return { id: 'security-team-lead', name: 'Security Team Lead' };

    } catch (error) {
      this.logger.error('Error getting security team member:', error);
      return { id: 'security-team-lead', name: 'Security Team Lead' };
    }
  }

  /**
   * Prioritize maintenance tasks
   */
  async prioritizeTasks(): Promise<MaintenanceTask[]> {
    this.logger.info('Prioritizing maintenance tasks');

    try {
      // Get pending tasks
      const pendingTasks = await this.repository.getMaintenanceTasks({
        where: 'status IN ($1, $2)',
        params: [MaintenanceStatus.PENDING, MaintenanceStatus.SCHEDULED],
        orderBy: 'priority',
        orderDirection: 'DESC',
      });

      // Re-prioritize based on rules
      const prioritizedTasks: MaintenanceTask[] = [];

      for (const task of pendingTasks) {
        const newPriority = await this.calculateTaskPriority(task);
        if (newPriority !== task.priority) {
          const updated = await this.repository.updateMaintenanceTask(task.id, {
            priority: newPriority,
          });
          prioritizedTasks.push(updated!);
        } else {
          prioritizedTasks.push(task);
        }
      }

      this.logger.info(`Task prioritization completed: ${prioritizedTasks.length} tasks prioritized`);
      this.emit('tasksPrioritized', prioritizedTasks);

      return prioritizedTasks;

    } catch (error) {
      this.logger.error('Task prioritization failed:', error);
      return [];
    }
  }

  /**
   * Calculate task priority based on various factors
   * @param task - Maintenance task
   * @returns Calculated priority
   */
  private async calculateTaskPriority(task: MaintenanceTask): Promise<MaintenancePriority> {
    let score = 0;

    // Base priority score
    switch (task.priority) {
      case MaintenancePriority.CRITICAL:
        score += 100;
        break;
      case MaintenancePriority.HIGH:
        score += 75;
        break;
      case MaintenancePriority.MEDIUM:
        score += 50;
        break;
      case MaintenancePriority.LOW:
        score += 25;
        break;
    }

    // Type bonus
    if (task.type === MaintenanceType.SECURITY_PATCH) {
      score += 50;
    } else if (task.type === MaintenanceType.EMERGENCY_FIX) {
      score += 40;
    }

    // Due date penalty
    if (task.dueDate) {
      const hoursUntilDue = (task.dueDate.getTime() - Date.now()) / (1000 * 60 * 60);
      if (hoursUntilDue < 24) {
        score += 30;
      } else if (hoursUntilDue < 72) {
        score += 15;
      }
    }

    // Age penalty
    const hoursSinceCreated = (Date.now() - task.createdAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceCreated > 168) { // 7 days
      score += 20;
    } else if (hoursSinceCreated > 336) { // 14 days
      score += 40;
    }

    // Convert score back to priority
    if (score >= 150) {
      return MaintenancePriority.CRITICAL;
    } else if (score >= 100) {
      return MaintenancePriority.HIGH;
    } else if (score >= 50) {
      return MaintenancePriority.MEDIUM;
    }
    return MaintenancePriority.LOW;
  }

  /**
   * Handle critical vulnerabilities found
   * @param data - Critical vulnerabilities data
   */
  private async handleCriticalVulnerabilities(data: {
    count: number;
    findings: any[];
  }): Promise<void> {
    this.logger.info(`Handling ${data.count} critical vulnerabilities`);

    if (this.config.autoRespondToSecurityIncidents) {
      for (const finding of data.findings) {
        await this.respondToSecurityIncident(finding);
      }
    }
  }

  /**
   * Respond to security incident
   * @param finding - Security finding/vulnerability
   */
  private async respondToSecurityIncident(finding: any): Promise<void> {
    const now = new Date();
    const severity = finding.severity as SecuritySeverity;

    // Get response time from rules
    let responseTime = 60;
    switch (severity) {
      case SecuritySeverity.CRITICAL:
        responseTime = this.config.securityResponseRules.criticalResponseTime;
        break;
      case SecuritySeverity.HIGH:
        responseTime = this.config.securityResponseRules.highResponseTime;
        break;
      case SecuritySeverity.MEDIUM:
        responseTime = this.config.securityResponseRules.mediumResponseTime;
        break;
      default:
        responseTime = 60;
    }

    // Create or update security incident response
    const response: SecurityIncidentResponse = {
      vulnerabilityId: finding.id,
      severity,
      responseTime,
      status: 'responding',
      respondedAt: now,
    };

    this.securityIncidents.push(response);

    // Notify channels
    if (this.config.securityResponseRules.autoNotifyChannels.length > 0) {
      this.emit('securityIncidentResponse', {
        response,
        channels: this.config.securityResponseRules.autoNotifyChannels,
      });
    }

    // Create task if configured
    if (this.config.securityResponseRules.autoCreateTasks) {
      const task = await this.repository.createMaintenanceTask({
        title: `Respond to Security Incident: ${finding.title}`,
        description: `Security incident response for ${finding.title}`,
        type: MaintenanceType.SECURITY_PATCH,
        status: MaintenanceStatus.IN_PROGRESS,
        priority: severity === SecuritySeverity.CRITICAL ? MaintenancePriority.CRITICAL : MaintenancePriority.HIGH,
        scheduledAt: new Date(),
        startedAt: new Date(),
        estimatedHours: responseTime / 60,
        tags: ['security', 'incident-response'],
        metadata: {
          securityFindingId: finding.id,
          incidentResponseId: response.vulnerabilityId,
        },
      });

      response.taskId = task.id;
      response.status = 'responded';
    }

    this.emit('securityIncidentResponded', response);
  }

  /**
   * Handle security audit completed
   * @param result - Security audit result
   */
  private async handleSecurityAuditCompleted(result: any): Promise<void> {
    this.logger.info(`Security audit completed with score: ${result.overallScore}`);

    // Create maintenance task for follow-up if needed
    if (result.overallScore < 80 && result.findings.length > 0) {
      await this.repository.createMaintenanceTask({
        title: 'Address Security Audit Findings',
        description: `Security audit found ${result.findings.length} findings with score ${result.overallScore}`,
        type: MaintenanceType.SECURITY_PATCH,
        status: MaintenanceStatus.PENDING,
        priority: MaintenancePriority.HIGH,
        tags: ['security', 'audit-follow-up'],
        metadata: {
          auditId: result.id,
          findingsCount: result.findings.length,
          score: result.overallScore,
        },
      });
    }
  }

  /**
   * Handle dependency updates found
   * @param updates - Array of dependency updates
   */
  private async handleDependencyUpdatesFound(updates: DependencyUpdate[]): Promise<void> {
    this.logger.info(`Found ${updates.length} dependency updates`);

    // Create maintenance tasks for security updates
    const securityUpdates = updates.filter(u => u.isSecurityUpdate);
    for (const update of securityUpdates) {
      await this.repository.createMaintenanceTask({
        title: `Update Dependency: ${update.packageName}`,
        description: `Update ${update.packageName} from ${update.currentVersion} to ${update.targetVersion}`,
        type: MaintenanceType.DEPENDENCY_UPDATE,
        status: MaintenanceStatus.PENDING,
        priority: update.severity === SecuritySeverity.CRITICAL ? MaintenancePriority.CRITICAL : MaintenancePriority.MEDIUM,
        tags: ['dependency', 'update'],
        metadata: {
          dependencyUpdateId: update.id,
          isSecurityUpdate: update.isSecurityUpdate,
        },
      });
    }
  }

  /**
   * Handle dependency vulnerabilities found
   * @param updates - Array of vulnerable dependency updates
   */
  private async handleDependencyVulnerabilitiesFound(updates: DependencyUpdate[]): Promise<void> {
    this.logger.info(`Found ${updates.length} vulnerable dependencies`);

    // Create high-priority tasks for vulnerable dependencies
    for (const update of updates) {
      await this.repository.createMaintenanceTask({
        title: `Security Update: ${update.packageName}`,
        description: `Update ${update.packageName} to address ${update.vulnerabilities.length} security vulnerabilities`,
        type: MaintenanceType.SECURITY_PATCH,
        status: MaintenanceStatus.PENDING,
        priority: MaintenancePriority.HIGH,
        tags: ['security', 'dependency', 'vulnerability'],
        metadata: {
          dependencyUpdateId: update.id,
          vulnerabilities: update.vulnerabilities,
        },
      });
    }
  }

  /**
   * Handle dependency update failed
   * @param data - Failed update data
   */
  private async handleDependencyUpdateFailed(data: {
    update: DependencyUpdate;
    reason: string;
  }): Promise<void> {
    this.logger.error(`Dependency update failed for ${data.update.packageName}: ${data.reason}`);

    // Create task to investigate failure
    await this.repository.createMaintenanceTask({
      title: `Investigate Dependency Update Failure: ${data.update.packageName}`,
      description: `Dependency update failed: ${data.reason}. Investigate and retry.`,
      type: MaintenanceType.BUG_FIX,
      status: MaintenanceStatus.PENDING,
      priority: MaintenancePriority.HIGH,
      tags: ['dependency', 'investigation'],
      metadata: {
        dependencyUpdateId: data.update.id,
        failureReason: data.reason,
      },
    });

    this.emit('dependencyUpdateFailureHandled', data);
  }

  /**
   * Handle compliance failure
   * @param data - Failed compliance data
   */
  private async handleComplianceFailure(data: {
    audit: ComplianceAudit;
    findings: any[];
  }): Promise<void> {
    this.logger.error(`Compliance audit failed with ${data.findings.length} findings`);

    // Create tasks for critical findings
    const criticalFindings = data.findings.filter((f: any) => f.severity === 'critical');
    for (const finding of criticalFindings) {
      await this.repository.createMaintenanceTask({
        title: `Address Compliance Finding: ${finding.title}`,
        description: finding.description,
        type: MaintenanceType.SECURITY_PATCH,
        status: MaintenanceStatus.PENDING,
        priority: MaintenancePriority.CRITICAL,
        tags: ['compliance', 'security'],
        metadata: {
          complianceAuditId: data.audit.id,
          findingId: finding.id,
        },
      });
    }
  }

  /**
   * Handle compliance report generated
   * @param report - Compliance report
   */
  private async handleComplianceReportGenerated(report: any): Promise<void> {
    this.logger.info(`Compliance report generated: ${JSON.stringify(report.summary)}`);

    // Create task if there are failed audits
    if (report.summary.failedAudits > 0) {
      await this.repository.createMaintenanceTask({
        title: 'Review Failed Compliance Audits',
        description: `${report.summary.failedAudits} compliance audits failed. Review and address issues.`,
        type: MaintenanceType.ROUTINE_MAINTENANCE,
        status: MaintenanceStatus.PENDING,
        priority: MaintenancePriority.HIGH,
        tags: ['compliance', 'review'],
        metadata: {
          reportSummary: report.summary,
        },
      });
    }
  }

  /**
   * Handle maintenance notification
   * @param data - Notification data
   */
  private async handleMaintenanceNotification(data: any): Promise<void> {
    this.logger.info(`Maintenance notification: ${data.message}`);

    // Emit notification event
    this.emit('maintenanceNotification', {
      channels: this.config.notificationChannels.length > 0 ? this.config.notificationChannels : data.channels,
      message: data.message,
      schedule: data.schedule,
      task: data.task,
    });
  }

  /**
   * Handle maintenance task completed
   * @param data - Completed task data
   */
  private async handleMaintenanceTaskCompleted(data: {
    task: MaintenanceTask;
    success: boolean;
    output?: string;
  }): Promise<void> {
    this.logger.info(`Maintenance task completed: ${data.task.id}, Success: ${data.success}`);

    // Track performance if enabled
    if (this.config.autoTrackPerformance && data.success) {
      await this.trackPerformanceForTask(data.task);
    }
  }

  /**
   * Track performance for a task
   * @param task - Completed maintenance task
   */
  private async trackPerformanceForTask(task: MaintenanceTask): Promise<void> {
    try {
      this.logger.debug(`Tracking performance for task: ${task.id}`);

      // Extract before and after metrics from task metadata
      const beforeMetrics: Record<string, number> = {};
      const afterMetrics: Record<string, number> = {};
      const improvements: Record<string, number> = {};

      // Get optimization type from task tags or metadata
      const optimizationType = this.getOptimizationType(task);

      // Extract metrics based on task type
      if (task.metadata) {
        // Before metrics
        if (task.metadata.beforeMetrics) {
          for (const [key, value] of Object.entries(task.metadata.beforeMetrics)) {
            beforeMetrics[key] = this.getMetricValue(value);
          }
        }

        // After metrics
        if (task.metadata.afterMetrics) {
          for (const [key, value] of Object.entries(task.metadata.afterMetrics)) {
            afterMetrics[key] = this.getMetricValue(value);
          }
        }
      }

      // Calculate improvements
      let totalImprovement = 0;
      let metricCount = 0;

      for (const key of Object.keys(beforeMetrics)) {
        if (afterMetrics[key] !== undefined) {
          const improvement = ((beforeMetrics[key] - afterMetrics[key]) / beforeMetrics[key]) * 100;
          improvements[key] = improvement;
          totalImprovement += improvement;
          metricCount++;
        }
      }

      const averageImprovement = metricCount > 0 ? totalImprovement / metricCount : 0;

      // Create performance tracking record in database
      await this.repository.createPerformanceTracking({
        taskId: task.id,
        taskTitle: task.title,
        taskType: task.type,
        beforeMetrics,
        afterMetrics,
        improvements,
        averageImprovement,
        actualHours: task.actualHours || 0,
        estimatedHours: task.estimatedHours || 0,
        trackedAt: new Date(),
      });

      // Create optimization result
      const optimization: PerformanceOptimizationResult = {
        id: `perf-${Date.now()}`,
        type: optimizationType,
        description: `Performance tracking for task: ${task.title}`,
        beforeMetrics,
        afterMetrics,
        improvement: averageImprovement,
        implementedAt: new Date(),
        status: 'completed',
      };

      this.performanceOptimizations.push(optimization);

      this.logger.debug(`Performance tracking completed for task ${task.id}: ${averageImprovement.toFixed(2)}% improvement`);
      this.emit('performanceTracked', { task, optimization });

    } catch (error) {
      this.logger.error(`Error tracking performance for task ${task.id}:`, error);
    }
  }

  /**
   * Get optimization type from task
   * @param task - Maintenance task
   * @returns Optimization type
   */
  private getOptimizationType(task: MaintenanceTask): 'database' | 'cache' | 'api' | 'code' | 'infrastructure' {
    // Check tags for type hints
    if (task.tags) {
      if (task.tags.includes('database') || task.tags.includes('db')) {
        return 'database';
      }
      if (task.tags.includes('cache') || task.tags.includes('redis')) {
        return 'cache';
      }
      if (task.tags.includes('api') || task.tags.includes('endpoint')) {
        return 'api';
      }
      if (task.tags.includes('infrastructure') || task.tags.includes('infra')) {
        return 'infrastructure';
      }
    }

    // Check task type
    if (task.type === MaintenanceType.DEPENDENCY_UPDATE) {
      return 'code';
    }

    // Check title for hints
    const title = task.title.toLowerCase();
    if (title.includes('database') || title.includes('db') || title.includes('query')) {
      return 'database';
    }
    if (title.includes('cache') || title.includes('redis') || title.includes('memcached')) {
      return 'cache';
    }
    if (title.includes('api') || title.includes('endpoint') || title.includes('route')) {
      return 'api';
    }
    if (title.includes('infrastructure') || title.includes('server') || title.includes('deployment')) {
      return 'infrastructure';
    }

    return 'code';
  }

  /**
   * Get metric value from various formats
   * @param value - Metric value
   * @returns Number value
   */
  private getMetricValue(value: any): number {
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      if (!isNaN(parsed)) {
        return parsed;
      }
    }
    return 0;
  }

  /**
   * Get triage history
   * @param limit - Maximum number of results to return
   * @returns Array of triage results
   */
  getTriageHistory(limit?: number): TriageResult[] {
    if (limit) {
      return this.triageHistory.slice(-limit);
    }
    return [...this.triageHistory];
  }

  /**
   * Get security incident responses
   * @param limit - Maximum number of results to return
   * @returns Array of security incident responses
   */
  getSecurityIncidentResponses(limit?: number): SecurityIncidentResponse[] {
    if (limit) {
      return this.securityIncidents.slice(-limit);
    }
    return [...this.securityIncidents];
  }

  /**
   * Get performance optimizations
   * @param limit - Maximum number of results to return
   * @returns Array of performance optimization results
   */
  getPerformanceOptimizations(limit?: number): PerformanceOptimizationResult[] {
    if (limit) {
      return this.performanceOptimizations.slice(-limit);
    }
    return [...this.performanceOptimizations];
  }

  /**
   * Generate maintenance summary report
   * @param startDate - Report start date
   * @param endDate - Report end date
   * @returns Maintenance summary report
   */
  async generateMaintenanceSummary(startDate: Date, endDate: Date): Promise<{
    summary: {
      totalTasks: number;
      completedTasks: number;
      failedTasks: number;
      pendingTasks: number;
      totalBugs: number;
      resolvedBugs: number;
      totalVulnerabilities: number;
      resolvedVulnerabilities: number;
      totalComplianceAudits: number;
      passedComplianceAudits: number;
    };
    tasks: MaintenanceTask[];
    bugs: BugReport[];
    vulnerabilities: SecurityVulnerability[];
    complianceAudits: ComplianceAudit[];
    recommendations: string[];
  }> {
    this.logger.info(`Generating maintenance summary: ${startDate.toISOString()} to ${endDate.toISOString()}`);

    // Get tasks within date range
    const tasks = await this.repository.getMaintenanceTasks({
      where: 'created_at >= $1 AND created_at <= $2',
      params: [startDate, endDate],
      orderBy: 'created_at',
      orderDirection: 'DESC',
    });

    // Get bugs within date range
    const bugs = await this.repository.getBugReports({
      where: 'reported_at >= $1 AND reported_at <= $2',
      params: [startDate, endDate],
      orderBy: 'reported_at',
      orderDirection: 'DESC',
    });

    // Get vulnerabilities within date range
    const vulnerabilities = await this.repository.getSecurityVulnerabilities({
      where: 'discovered_at >= $1 AND discovered_at <= $2',
      params: [startDate, endDate],
      orderBy: 'discovered_at',
      orderDirection: 'DESC',
    });

    // Get compliance audits within date range
    const complianceAudits = await this.repository.getComplianceAudits({
      where: 'scheduled_at >= $1 AND scheduled_at <= $2',
      params: [startDate, endDate],
      orderBy: 'scheduled_at',
      orderDirection: 'DESC',
    });

    // Calculate summary
    const completedTasks = tasks.filter(t => t.status === MaintenanceStatus.COMPLETED).length;
    const failedTasks = tasks.filter(t => t.status === MaintenanceStatus.FAILED).length;
    const pendingTasks = tasks.filter(t => t.status === MaintenanceStatus.PENDING || t.status === MaintenanceStatus.SCHEDULED).length;
    const resolvedBugs = bugs.filter(b => b.status === MaintenanceStatus.COMPLETED).length;
    const resolvedVulnerabilities = vulnerabilities.filter(v => v.status === MaintenanceStatus.COMPLETED).length;
    const passedComplianceAudits = complianceAudits.filter(a => a.passed).length;

    // Generate recommendations
    const recommendations = this.generateMaintenanceRecommendations(
      tasks,
      bugs,
      vulnerabilities,
      complianceAudits
    );

    const report = {
      summary: {
        totalTasks: tasks.length,
        completedTasks,
        failedTasks,
        pendingTasks,
        totalBugs: bugs.length,
        resolvedBugs,
        totalVulnerabilities: vulnerabilities.length,
        resolvedVulnerabilities,
        totalComplianceAudits: complianceAudits.length,
        passedComplianceAudits,
      },
      tasks,
      bugs,
      vulnerabilities,
      complianceAudits,
      recommendations,
    };

    this.logger.info(`Maintenance summary generated: ${JSON.stringify(report.summary)}`);
    this.emit('reportGenerated', report);

    return report;
  }

  /**
   * Generate maintenance recommendations
   * @param tasks - Maintenance tasks
   * @param bugs - Bug reports
   * @param vulnerabilities - Security vulnerabilities
   * @param complianceAudits - Compliance audits
   * @returns Array of recommendations
   */
  private generateMaintenanceRecommendations(
    tasks: MaintenanceTask[],
    bugs: BugReport[],
    vulnerabilities: SecurityVulnerability[],
    complianceAudits: ComplianceAudit[]
  ): string[] {
    const recommendations: string[] = [];

    // Check for high pending task count
    const pendingCritical = tasks.filter(t => t.priority === MaintenancePriority.CRITICAL && (t.status === MaintenanceStatus.PENDING || t.status === MaintenanceStatus.SCHEDULED));
    if (pendingCritical.length > 0) {
      recommendations.push(`Address ${pendingCritical.length} critical pending tasks`);
    }

    // Check for unresolved critical bugs
    const unresolvedCriticalBugs = bugs.filter(b => b.severity === MaintenancePriority.CRITICAL && b.status !== MaintenanceStatus.COMPLETED);
    if (unresolvedCriticalBugs.length > 0) {
      recommendations.push(`Resolve ${unresolvedCriticalBugs.length} critical bugs`);
    }

    // Check for unpatched critical vulnerabilities
    const unpatchedCriticalVulns = vulnerabilities.filter(v => v.severity === SecuritySeverity.CRITICAL && v.status !== MaintenanceStatus.COMPLETED);
    if (unpatchedCriticalVulns.length > 0) {
      recommendations.push(`Patch ${unpatchedCriticalVulns.length} critical vulnerabilities`);
    }

    // Check for failed compliance audits
    const failedAudits = complianceAudits.filter(a => !a.passed);
    if (failedAudits.length > 0) {
      recommendations.push(`Address ${failedAudits.length} failed compliance audits`);
    }

    // General recommendations
    recommendations.push('Regularly review and prioritize maintenance tasks');
    recommendations.push('Implement automated security scanning');
    recommendations.push('Keep dependencies up to date');
    recommendations.push('Schedule regular compliance audits');
    recommendations.push('Monitor performance metrics');

    return recommendations;
  }

  /**
   * Update configuration
   * @param newConfig - Partial configuration
   */
  updateConfig(newConfig: Partial<MaintenanceManagerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('Maintenance manager configuration updated');
  }

  /**
   * Get current configuration
   * @returns Current configuration
   */
  getConfig(): MaintenanceManagerConfig {
    return { ...this.config };
  }

  /**
   * Check if manager is running
   * @returns True if running
   */
  isActive(): boolean {
    return this.isRunning;
  }
}

/**
 * Maintenance Module
 *
 * Main module exports for maintenance and security systems.
 * Provides unified access to all maintenance-related functionality.
 */

// Export models
export * from './maintenance-models';

// Export repository
export { MaintenanceRepository } from './maintenance-repository';

// Export security auditor
export {
  SecurityAuditor,
  SecurityAuditorConfig,
  DEFAULT_SECURITY_AUDITOR_CONFIG,
  SecurityAuditResult,
  SecurityFinding,
  VulnerabilityScanResult,
  PenetrationTestSchedule,
} from './security-auditor';

// Export dependency manager
export {
  DependencyManager,
  DependencyManagerConfig,
  DEFAULT_DEPENDENCY_MANAGER_CONFIG,
  PackageInfo,
  VulnerabilityInfo,
  UpdateTestResult,
  RollbackInfo,
} from './dependency-manager';

// Export compliance manager
export {
  ComplianceManager,
  ComplianceManagerConfig,
  DEFAULT_COMPLIANCE_MANAGER_CONFIG,
  GDPRSettings,
  DiscordTOSSettings,
  AccessibilitySettings,
  LocalizationSettings,
  ComplianceCheckResult,
  GDPRComplianceResult,
  DiscordTOSComplianceResult,
  AccessibilityComplianceResult,
  LocalizationComplianceResult,
} from './compliance-manager';

// Export maintenance scheduler
export {
  MaintenanceScheduler,
  MaintenanceSchedulerConfig,
  DEFAULT_MAINTENANCE_SCHEDULER_CONFIG,
  ScheduledMaintenanceEvent,
  MaintenanceWindow,
} from './maintenance-scheduler';

// Export maintenance manager
export {
  MaintenanceManager,
  MaintenanceManagerConfig,
  DEFAULT_MAINTENANCE_MANAGER_CONFIG,
  TriageRules,
  SecurityResponseRules,
  TriageResult,
  SecurityIncidentResponse,
  PerformanceOptimizationResult,
} from './maintenance-manager';

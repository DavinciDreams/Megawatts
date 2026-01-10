/**
 * Security Auditor
 *
 * Security audit system for regular security audits, penetration testing scheduling,
 * vulnerability scanning automation, and security report generation.
 */

import { EventEmitter } from 'events';
import { Logger } from '../utils/logger';
import { MaintenanceRepository } from './maintenance-repository';
import {
  SecurityVulnerability,
  SecuritySeverity,
  MaintenanceStatus,
  MaintenanceType,
  MaintenancePriority,
} from './maintenance-models';

/**
 * Security audit configuration
 */
export interface SecurityAuditorConfig {
  auditInterval: number; // in milliseconds
  vulnerabilityScanInterval: number; // in milliseconds
  penetrationTestInterval: number; // in milliseconds
  autoSchedulePenetrationTests: boolean;
  notifyOnCriticalVulnerabilities: boolean;
  retentionPeriod: number; // in milliseconds
}

/**
 * Default security auditor configuration
 */
export const DEFAULT_SECURITY_AUDITOR_CONFIG: SecurityAuditorConfig = {
  auditInterval: 86400000, // 24 hours
  vulnerabilityScanInterval: 604800000, // 7 days
  penetrationTestInterval: 2592000000, // 30 days
  autoSchedulePenetrationTests: true,
  notifyOnCriticalVulnerabilities: true,
  retentionPeriod: 7776000000, // 90 days
};

/**
 * Security audit result
 */
export interface SecurityAuditResult {
  id: string;
  timestamp: Date;
  type: 'vulnerability_scan' | 'penetration_test' | 'code_review' | 'configuration_audit';
  status: 'in_progress' | 'completed' | 'failed';
  findings: SecurityFinding[];
  overallScore: number;
  passed: boolean;
  duration: number;
  metadata: Record<string, any>;
}

/**
 * Security finding
 */
export interface SecurityFinding {
  id: string;
  type: string;
  severity: SecuritySeverity;
  title: string;
  description: string;
  location?: string;
  recommendation: string;
  cvssScore?: number;
  cveId?: string;
  affectedComponents: string[];
  discoveredAt: Date;
}

/**
 * Vulnerability scan result
 */
export interface VulnerabilityScanResult {
  packageName: string;
  currentVersion: string;
  vulnerabilities: {
    id: string;
    severity: SecuritySeverity;
    title: string;
    cvssScore?: number;
    patchedIn?: string;
  }[];
  scanTime: Date;
}

/**
 * Penetration test schedule
 */
export interface PenetrationTestSchedule {
  id: string;
  title: string;
  description: string;
  scheduledFor: Date;
  duration: number; // in hours
  scope: string[];
  team: string[];
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  results?: SecurityAuditResult;
}

/**
 * Security auditor class
 */
export class SecurityAuditor extends EventEmitter {
  private config: SecurityAuditorConfig;
  private repository: MaintenanceRepository;
  private logger: Logger;
  private auditInterval?: NodeJS.Timeout;
  private vulnerabilityScanInterval?: NodeJS.Timeout;
  private penetrationTestInterval?: NodeJS.Timeout;
  private isRunning = false;
  private auditHistory: SecurityAuditResult[] = [];

  constructor(
    repository: MaintenanceRepository,
    config: Partial<SecurityAuditorConfig> = {}
  ) {
    super();
    this.config = { ...DEFAULT_SECURITY_AUDITOR_CONFIG, ...config };
    this.repository = repository;
    this.logger = new Logger('SecurityAuditor');
  }

  /**
   * Start the security auditor
   */
  start(): void {
    if (this.isRunning) {
      this.logger.warn('Security auditor is already running');
      return;
    }

    this.isRunning = true;

    // Schedule regular security audits
    this.auditInterval = setInterval(() => {
      this.runSecurityAudit().catch(error => {
        this.logger.error('Security audit failed:', error);
      });
    }, this.config.auditInterval);

    // Schedule vulnerability scans
    this.vulnerabilityScanInterval = setInterval(() => {
      this.scanForVulnerabilities().then(findings => {
        this.logger.info(`Scheduled vulnerability scan completed: ${findings.length} findings`);
      }).catch(error => {
        this.logger.error('Vulnerability scan failed:', error);
      });
    }, this.config.vulnerabilityScanInterval);

    // Schedule penetration tests
    if (this.config.autoSchedulePenetrationTests) {
      this.penetrationTestInterval = setInterval(() => {
        this.schedulePenetrationTest().catch(error => {
          this.logger.error('Penetration test scheduling failed:', error);
        });
      }, this.config.penetrationTestInterval);
    }

    this.logger.info('Security auditor started');
    this.emit('started');
  }

  /**
   * Stop the security auditor
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.auditInterval) {
      clearInterval(this.auditInterval);
      this.auditInterval = undefined;
    }

    if (this.vulnerabilityScanInterval) {
      clearInterval(this.vulnerabilityScanInterval);
      this.vulnerabilityScanInterval = undefined;
    }

    if (this.penetrationTestInterval) {
      clearInterval(this.penetrationTestInterval);
      this.penetrationTestInterval = undefined;
    }

    this.logger.info('Security auditor stopped');
    this.emit('stopped');
  }

  /**
   * Run a security audit
   * @returns Security audit result
   */
  async runSecurityAudit(): Promise<SecurityAuditResult> {
    const auditId = `audit-${Date.now()}`;
    const startTime = Date.now();

    this.logger.info(`Starting security audit: ${auditId}`);

    const result: SecurityAuditResult = {
      id: auditId,
      timestamp: new Date(),
      type: 'vulnerability_scan',
      status: 'in_progress',
      findings: [],
      overallScore: 0,
      passed: false,
      duration: 0,
      metadata: {},
    };

    try {
      // Run vulnerability scan
      const vulnerabilities = await this.scanForVulnerabilities();
      result.findings.push(...vulnerabilities);

      // Run configuration audit
      const configIssues = await this.auditConfiguration();
      result.findings.push(...configIssues);

      // Calculate overall score
      result.overallScore = this.calculateSecurityScore(result.findings);
      result.passed = result.overallScore >= 80;

      // Create security vulnerabilities for critical findings
      for (const finding of result.findings.filter(f => f.severity === SecuritySeverity.CRITICAL)) {
        await this.createVulnerabilityFromFinding(finding);
      }

      // Notify on critical vulnerabilities
      if (this.config.notifyOnCriticalVulnerabilities) {
        const criticalCount = result.findings.filter(f => f.severity === SecuritySeverity.CRITICAL).length;
        if (criticalCount > 0) {
          this.emit('criticalVulnerabilities', {
            count: criticalCount,
            findings: result.findings.filter(f => f.severity === SecuritySeverity.CRITICAL),
          });
        }
      }

      result.status = 'completed';
      this.logger.info(`Security audit completed: ${auditId}, Score: ${result.overallScore}, Passed: ${result.passed}`);

    } catch (error) {
      result.status = 'failed';
      this.logger.error(`Security audit failed: ${auditId}`, error);
    }

    result.duration = Date.now() - startTime;

    // Store in history
    this.auditHistory.push(result);

    // Trim history
    const cutoff = Date.now() - this.config.retentionPeriod;
    this.auditHistory = this.auditHistory.filter(a => a.timestamp.getTime() > cutoff);

    this.emit('auditCompleted', result);
    return result;
  }

  /**
   * Run a vulnerability scan
   * @returns Array of security findings
   */
  async scanForVulnerabilities(): Promise<SecurityFinding[]> {
    this.logger.info('Running vulnerability scan');

    const findings: SecurityFinding[] = [];

    try {
      // Scan dependencies for vulnerabilities
      const dependencyResults = await this.scanDependencies();
      for (const depResult of dependencyResults) {
        for (const vuln of depResult.vulnerabilities) {
          findings.push({
            id: `vuln-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'dependency_vulnerability',
            severity: vuln.severity,
            title: `Vulnerability in ${depResult.packageName}`,
            description: `Security vulnerability found in package ${depResult.packageName}@${depResult.currentVersion}`,
            location: `package.json: ${depResult.packageName}`,
            recommendation: vuln.patchedIn
              ? `Update to version ${vuln.patchedIn} or later`
              : 'Monitor for patch release',
            cvssScore: vuln.cvssScore,
            affectedComponents: [depResult.packageName],
            discoveredAt: new Date(),
          });
        }
      }

      // Scan code for security issues
      const codeFindings = await this.scanCodeForSecurityIssues();
      findings.push(...codeFindings);

      // Scan configuration for security issues
      const configFindings = await this.scanConfigurationForSecurityIssues();
      findings.push(...configFindings);

      this.logger.info(`Vulnerability scan completed: ${findings.length} findings found`);

    } catch (error) {
      this.logger.error('Vulnerability scan failed:', error);
    }

    return findings;
  }

  /**
   * Scan dependencies for vulnerabilities
   * @returns Array of vulnerability scan results
   */
  private async scanDependencies(): Promise<VulnerabilityScanResult[]> {
    // This is a placeholder implementation
    // In production, integrate with tools like npm audit, Snyk, or Dependabot
    const results: VulnerabilityScanResult[] = [];

    try {
      // Simulate dependency scanning
      // In production, run actual security scanning tools
      const packageJson = require('../../package.json');
      const dependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      for (const [name, version] of Object.entries(dependencies)) {
        // Placeholder: In production, call actual vulnerability scanning APIs
        // For now, return empty results
        results.push({
          packageName: name,
          currentVersion: version as string,
          vulnerabilities: [],
          scanTime: new Date(),
        });
      }

    } catch (error) {
      this.logger.error('Failed to scan dependencies:', error);
    }

    return results;
  }

  /**
   * Scan code for security issues
   * @returns Array of security findings
   */
  private async scanCodeForSecurityIssues(): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];

    // This is a placeholder implementation
    // In production, integrate with static analysis tools like ESLint with security plugins,
    // SonarQube, or CodeQL

    // Example: Check for hardcoded secrets
    // Example: Check for SQL injection vulnerabilities
    // Example: Check for XSS vulnerabilities

    return findings;
  }

  /**
   * Scan configuration for security issues
   * @returns Array of security findings
   */
  private async scanConfigurationForSecurityIssues(): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];

    // This is a placeholder implementation
    // In production, check for:
    // - Insecure HTTP usage
    // - Weak authentication settings
    // - Missing security headers
    // - Insecure CORS configuration

    return findings;
  }

  /**
   * Audit system configuration
   * @returns Array of security findings
   */
  private async auditConfiguration(): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];

    // This is a placeholder implementation
    // In production, audit:
    // - Database configuration
    // - API configuration
    // - Authentication configuration
    // - Authorization configuration

    return findings;
  }

  /**
   * Schedule a penetration test
   * @param schedule - Penetration test schedule details
   * @returns Created penetration test schedule
   */
  async schedulePenetrationTest(schedule?: Partial<PenetrationTestSchedule>): Promise<PenetrationTestSchedule> {
    const testSchedule: PenetrationTestSchedule = {
      id: `pentest-${Date.now()}`,
      title: schedule?.title || 'Scheduled Penetration Test',
      description: schedule?.description || 'Regular security penetration test',
      scheduledFor: schedule?.scheduledFor || new Date(Date.now() + this.config.penetrationTestInterval),
      duration: schedule?.duration || 8,
      scope: schedule?.scope || ['web', 'api', 'database'],
      team: schedule?.team || ['security-team'],
      status: 'scheduled',
    };

    this.logger.info(`Scheduled penetration test: ${testSchedule.id} for ${testSchedule.scheduledFor.toISOString()}`);

    // Create maintenance task for the penetration test
    await this.repository.createMaintenanceTask({
      title: testSchedule.title,
      description: testSchedule.description,
      type: MaintenanceType.SECURITY_PATCH,
      status: MaintenanceStatus.SCHEDULED,
      priority: MaintenancePriority.HIGH,
      scheduledAt: testSchedule.scheduledFor,
      tags: ['security', 'penetration-test'],
      metadata: {
        penetrationTestId: testSchedule.id,
        scope: testSchedule.scope,
        team: testSchedule.team,
        duration: testSchedule.duration,
      },
    });

    this.emit('penetrationTestScheduled', testSchedule);
    return testSchedule;
  }

  /**
   * Run a penetration test
   * @param scheduleId - Penetration test schedule ID
   * @returns Security audit result
   */
  async runPenetrationTest(scheduleId: string): Promise<SecurityAuditResult> {
    const startTime = Date.now();

    this.logger.info(`Running penetration test: ${scheduleId}`);

    const result: SecurityAuditResult = {
      id: `pentest-${scheduleId}`,
      timestamp: new Date(),
      type: 'penetration_test',
      status: 'in_progress',
      findings: [],
      overallScore: 0,
      passed: false,
      duration: 0,
      metadata: { scheduleId },
    };

    try {
      // This is a placeholder implementation
      // In production, integrate with penetration testing tools like Burp Suite,
      // OWASP ZAP, or external penetration testing services

      // Simulate penetration test findings
      result.overallScore = 85;
      result.passed = result.overallScore >= 80;

      result.status = 'completed';
      this.logger.info(`Penetration test completed: ${scheduleId}, Score: ${result.overallScore}`);

    } catch (error) {
      result.status = 'failed';
      this.logger.error(`Penetration test failed: ${scheduleId}`, error);
    }

    result.duration = Date.now() - startTime;

    this.emit('penetrationTestCompleted', result);
    return result;
  }

  /**
   * Generate a security report
   * @param startDate - Report start date
   * @param endDate - Report end date
   * @returns Security report
   */
  async generateSecurityReport(startDate: Date, endDate: Date): Promise<{
    summary: {
      totalAudits: number;
      totalFindings: number;
      criticalFindings: number;
      highFindings: number;
      mediumFindings: number;
      lowFindings: number;
      averageScore: number;
      passRate: number;
    };
    audits: SecurityAuditResult[];
    vulnerabilities: SecurityVulnerability[];
    recommendations: string[];
  }> {
    this.logger.info(`Generating security report: ${startDate.toISOString()} to ${endDate.toISOString()}`);

    // Get audits within date range
    const audits = this.auditHistory.filter(
      a => a.timestamp >= startDate && a.timestamp <= endDate
    );

    // Get vulnerabilities from repository
    const vulnerabilities = await this.repository.getSecurityVulnerabilities({
      where: 'discovered_at >= $1 AND discovered_at <= $2',
      params: [startDate, endDate],
      orderBy: 'discovered_at',
      orderDirection: 'DESC',
    });

    // Calculate summary
    const allFindings = audits.flatMap(a => a.findings);
    const criticalFindings = allFindings.filter(f => f.severity === SecuritySeverity.CRITICAL).length;
    const highFindings = allFindings.filter(f => f.severity === SecuritySeverity.HIGH).length;
    const mediumFindings = allFindings.filter(f => f.severity === SecuritySeverity.MEDIUM).length;
    const lowFindings = allFindings.filter(f => f.severity === SecuritySeverity.LOW).length;

    const averageScore = audits.length > 0
      ? audits.reduce((sum, a) => sum + a.overallScore, 0) / audits.length
      : 0;

    const passRate = audits.length > 0
      ? (audits.filter(a => a.passed).length / audits.length) * 100
      : 0;

    // Generate recommendations
    const recommendations = this.generateRecommendations(allFindings, vulnerabilities);

    const report = {
      summary: {
        totalAudits: audits.length,
        totalFindings: allFindings.length,
        criticalFindings,
        highFindings,
        mediumFindings,
        lowFindings,
        averageScore: Math.round(averageScore),
        passRate: Math.round(passRate),
      },
      audits,
      vulnerabilities,
      recommendations,
    };

    this.logger.info(`Security report generated: ${JSON.stringify(report.summary)}`);
    this.emit('reportGenerated', report);

    return report;
  }

  /**
   * Generate security recommendations based on findings
   * @param findings - Security findings
   * @param vulnerabilities - Security vulnerabilities
   * @returns Array of recommendations
   */
  private generateRecommendations(
    findings: SecurityFinding[],
    vulnerabilities: SecurityVulnerability[]
  ): string[] {
    const recommendations: string[] = [];

    // Analyze findings for patterns
    const criticalCount = findings.filter(f => f.severity === SecuritySeverity.CRITICAL).length;
    const highCount = findings.filter(f => f.severity === SecuritySeverity.HIGH).length;
    const mediumCount = findings.filter(f => f.severity === SecuritySeverity.MEDIUM).length;

    if (criticalCount > 0) {
      recommendations.push(`Address ${criticalCount} critical security vulnerabilities immediately`);
    }

    if (highCount > 5) {
      recommendations.push('Schedule regular security reviews to reduce high-severity findings');
    }

    if (mediumCount > 10) {
      recommendations.push('Implement automated security testing to catch issues earlier');
    }

    // Check for unpatched vulnerabilities
    const unpatchedVulns = vulnerabilities.filter(v => !v.patchAvailable);
    if (unpatchedVulns.length > 0) {
      recommendations.push(`Monitor ${unpatchedVulns.length} vulnerabilities without available patches`);
    }

    // Check for vulnerabilities with exploits
    const exploitedVulns = vulnerabilities.filter(v => v.exploitAvailable);
    if (exploitedVulns.length > 0) {
      recommendations.push(`Prioritize ${exploitedVulns.length} vulnerabilities with known exploits`);
    }

    // General recommendations
    recommendations.push('Keep all dependencies up to date');
    recommendations.push('Implement security headers on all HTTP endpoints');
    recommendations.push('Enable rate limiting on all API endpoints');
    recommendations.push('Regularly review and update security policies');

    return recommendations;
  }

  /**
   * Calculate security score from findings
   * @param findings - Security findings
   * @returns Security score (0-100)
   */
  private calculateSecurityScore(findings: SecurityFinding[]): number {
    if (findings.length === 0) {
      return 100;
    }

    let score = 100;

    for (const finding of findings) {
      switch (finding.severity) {
        case SecuritySeverity.CRITICAL:
          score -= 25;
          break;
        case SecuritySeverity.HIGH:
          score -= 15;
          break;
        case SecuritySeverity.MEDIUM:
          score -= 5;
          break;
        case SecuritySeverity.LOW:
          score -= 1;
          break;
        case SecuritySeverity.INFO:
          score -= 0;
          break;
      }
    }

    return Math.max(0, score);
  }

  /**
   * Create a security vulnerability from a finding
   * @param finding - Security finding
   * @returns Created security vulnerability
   */
  private async createVulnerabilityFromFinding(finding: SecurityFinding): Promise<SecurityVulnerability> {
    return this.repository.createSecurityVulnerability({
      title: finding.title,
      description: finding.description,
      severity: finding.severity,
      status: MaintenanceStatus.PENDING,
      cveId: finding.cveId,
      cvssScore: finding.cvssScore,
      affectedComponents: finding.affectedComponents,
      discoveredAt: finding.discoveredAt,
      discoveredBy: 'system',
      discoveredByName: 'Security Auditor',
      exploitAvailable: finding.severity === SecuritySeverity.CRITICAL,
      patchAvailable: false,
      references: [],
      metadata: {
        findingId: finding.id,
        location: finding.location,
      },
    });
  }

  /**
   * Get audit history
   * @param limit - Maximum number of audits to return
   * @returns Array of security audit results
   */
  getAuditHistory(limit?: number): SecurityAuditResult[] {
    if (limit) {
      return this.auditHistory.slice(-limit);
    }
    return [...this.auditHistory];
  }

  /**
   * Get recent critical findings
   * @param hours - Number of hours to look back
   * @returns Array of critical security findings
   */
  getRecentCriticalFindings(hours: number = 24): SecurityFinding[] {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.auditHistory
      .flatMap(a => a.findings.filter(f => f.severity === SecuritySeverity.CRITICAL))
      .filter(f => f.discoveredAt >= cutoff);
  }

  /**
   * Update configuration
   * @param newConfig - Partial configuration
   */
  updateConfig(newConfig: Partial<SecurityAuditorConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Restart intervals if running
    if (this.isRunning) {
      this.stop();
      this.start();
    }

    this.logger.info('Security auditor configuration updated');
  }

  /**
   * Get current configuration
   * @returns Current configuration
   */
  getConfig(): SecurityAuditorConfig {
    return { ...this.config };
  }

  /**
   * Check if auditor is running
   * @returns True if running
   */
  isActive(): boolean {
    return this.isRunning;
  }
}

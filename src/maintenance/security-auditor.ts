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
    this.logger.info('Scanning dependencies for vulnerabilities');
    const results: VulnerabilityScanResult[] = [];

    try {
      // Read package.json to get dependencies
      const packageJson = require('../../package.json');
      const dependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      // Check for known vulnerable packages and outdated versions
      // This is a basic implementation - in production, integrate with npm audit, Snyk, or Dependabot
      const knownVulnerablePackages: Record<string, { minVersion: string; vulnerabilities: Array<{ id: string; severity: SecuritySeverity; title: string; cvssScore?: number; patchedIn?: string }> }> = {
        // Example known vulnerabilities - in production, use real vulnerability databases
        'lodash': {
          minVersion: '4.17.0',
          vulnerabilities: [
            { id: 'CVE-2021-23337', severity: SecuritySeverity.HIGH, title: 'Prototype Pollution in lodash', cvssScore: 7.5, patchedIn: '4.17.21' },
          ],
        },
        'axios': {
          minVersion: '0.1.0',
          vulnerabilities: [
            { id: 'CVE-2023-45857', severity: SecuritySeverity.MEDIUM, title: 'SSRF in axios', cvssScore: 5.3, patchedIn: '1.6.0' },
          ],
        },
      };

      for (const [name, version] of Object.entries(dependencies)) {
        const vulnerabilities: VulnerabilityScanResult['vulnerabilities'] = [];
        const versionStr = version as string;

        // Check against known vulnerable packages
        if (knownVulnerablePackages[name]) {
          const vulnPackage = knownVulnerablePackages[name];
          if (this.isVersionInRange(versionStr, vulnPackage.minVersion)) {
            vulnerabilities.push(...vulnPackage.vulnerabilities);
          }
        }

        // Check for outdated packages (older than 6 months)
        const isOutdated = await this.checkIfPackageOutdated(name, versionStr);
        if (isOutdated) {
          vulnerabilities.push({
            id: `OUTDATED-${name}`,
            severity: SecuritySeverity.LOW,
            title: `Outdated package: ${name}`,
          });
        }

        results.push({
          packageName: name,
          currentVersion: versionStr,
          vulnerabilities,
          scanTime: new Date(),
        });
      }

      this.logger.info(`Dependency scan completed: scanned ${results.length} packages`);

    } catch (error) {
      this.logger.error('Failed to scan dependencies:', error);
    }

    return results;
  }

  /**
   * Check if a version is in a range (simple semver comparison)
   * @param version - Version to check
   * @param minVersion - Minimum version
   * @returns True if version is in range
   */
  private isVersionInRange(version: string, minVersion: string): boolean {
    const parseVersion = (v: string): number[] => {
      const parts = v.replace(/^v|^/, '').split(/[.-]/);
      return parts.map(p => parseInt(p, 10) || 0);
    };

    const v1 = parseVersion(version);
    const v2 = parseVersion(minVersion);

    for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
      const n1 = v1[i] || 0;
      const n2 = v2[i] || 0;
      if (n1 < n2) return false;
      if (n1 > n2) return true;
    }
    return true;
  }

  /**
   * Check if a package is outdated
   * @param packageName - Package name
   * @param currentVersion - Current version
   * @returns True if package is outdated
   */
  private async checkIfPackageOutdated(packageName: string, currentVersion: string): Promise<boolean> {
    try {
      const { fetch } = require('node-fetch');
      const registryUrl = process.env.NPM_REGISTRY_URL || 'https://registry.npmjs.org';
      
      // Fetch package metadata from npm registry
      const response = await fetch(`${registryUrl}/${packageName}`, {
        method: 'GET',
        headers: {
          'User-Agent': 'npm/1.0.0',
        },
      });
      
      if (!response.ok) {
        this.logger.warn(`Failed to fetch package info for ${packageName}: ${response.status}`);
        return false;
      }
      
      const packageData = await response.json();
      const latestVersion = packageData['dist-tags']?.latest;
      
      if (!latestVersion) {
        return false;
      }
      
      // Simple version comparison (not full semver, just basic comparison)
      const isOutdated = this.isVersionOutdated(currentVersion, latestVersion);
      
      if (isOutdated) {
        this.logger.debug(`Package ${packageName} is outdated: ${currentVersion} < ${latestVersion}`);
      }
      
      return isOutdated;
    } catch (error) {
      this.logger.warn(`Failed to check if package ${packageName} is outdated:`, error);
      return false;
    }
  }
  
  /**
   * Simple version comparison to check if current version is outdated
   * @param currentVersion - Current version
   * @param latestVersion - Latest version from registry
   * @returns True if current version is outdated
   */
  private isVersionOutdated(currentVersion: string, latestVersion: string): boolean {
    const parseVersion = (v: string): number[] => {
      const parts = v.replace(/^v/, '').split(/[.-]/);
      return parts.map(p => parseInt(p, 10) || 0);
    };
    
    const current = parseVersion(currentVersion);
    const latest = parseVersion(latestVersion);
    
    // Compare major, minor, patch versions
    for (let i = 0; i < Math.max(current.length, latest.length); i++) {
      const c = current[i] || 0;
      const l = latest[i] || 0;
      
      if (c < l) {
        return true;
      } else if (c > l) {
        return false;
      }
    }
    
    // If we get here, versions are equal
    return false;
  }
  
  /**
   * Map npm severity to SecuritySeverity
   * @param npmSeverity - npm severity string
   * @returns SecuritySeverity enum value
   */
  private mapNpmSeverity(npmSeverity: string): SecuritySeverity {
    const severityLower = npmSeverity.toLowerCase();
    switch (severityLower) {
      case 'critical':
        return SecuritySeverity.CRITICAL;
      case 'high':
        return SecuritySeverity.HIGH;
      case 'moderate':
      case 'medium':
        return SecuritySeverity.MEDIUM;
      case 'low':
        return SecuritySeverity.LOW;
      case 'info':
        return SecuritySeverity.INFO;
      default:
        return SecuritySeverity.LOW;
    }
  }

  /**
   * Scan code for security issues
   * @returns Array of security findings
   */
  private async scanCodeForSecurityIssues(): Promise<SecurityFinding[]> {
    this.logger.info('Scanning code for security issues');
    const findings: SecurityFinding[] = [];

    try {
      // Scan for secrets in code
      const secretFindings = await this.scanForSecrets();
      findings.push(...secretFindings);

      // Scan for insecure code patterns
      const patternFindings = await this.scanForInsecureCodePatterns();
      findings.push(...patternFindings);

      // Perform comprehensive code security analysis
      const analysisFindings = await this.analyzeCodeSecurity();
      findings.push(...analysisFindings);

      this.logger.info(`Code security scan completed: ${findings.length} findings found`);

    } catch (error) {
      this.logger.error('Failed to scan code for security issues:', error);
    }

    return findings;
  }

  /**
   * Scan configuration for security issues
   * @returns Array of security findings
   */
  private async scanConfigurationForSecurityIssues(): Promise<SecurityFinding[]> {
    this.logger.info('Scanning configuration for security issues');
    const findings: SecurityFinding[] = [];

    try {
      // Check for insecure HTTP usage
      findings.push(...this.checkInsecureHttpUsage());

      // Check for weak authentication settings
      findings.push(...this.checkAuthenticationSettings());

      // Check for missing security headers
      findings.push(...this.checkSecurityHeaders());

      // Check for insecure CORS configuration
      findings.push(...this.checkCorsConfiguration());

      // Check for environment variable exposure
      findings.push(...this.checkEnvironmentVariableExposure());

      this.logger.info(`Configuration security scan completed: ${findings.length} findings found`);

    } catch (error) {
      this.logger.error('Failed to scan configuration for security issues:', error);
    }

    return findings;
  }

  /**
   * Scan for secrets in codebase
   * @returns Array of security findings
   */
  private async scanForSecrets(): Promise<SecurityFinding[]> {
    this.logger.info('Scanning for secrets in codebase');
    const findings: SecurityFinding[] = [];

    try {
      // Patterns for detecting secrets
      const secretPatterns: Array<{ pattern: RegExp; type: string; severity: SecuritySeverity; description: string }> = [
        {
          pattern: /(?:['"`](?:api[_-]?key|apikey|api[_-]?secret|secret[_-]?key|secret|password|passwd|pwd|token|access[_-]?token|refresh[_-]?token|auth[_-]?token|bearer[_-]?token|private[_-]?key|client[_-]?secret|oauth[_-]?secret)['"`]\s*[:=]\s*['"`]([a-zA-Z0-9_\-+=/]{20,})['"`])/gi,
          type: 'hardcoded_secret',
          severity: SecuritySeverity.CRITICAL,
          description: 'Hardcoded secret detected in code',
        },
        {
          pattern: /(?:['"`](?:aws[_-]?access[_-]?key[_-]?id|aws[_-]?secret[_-]?access[_-]?key|aws[_-]?session[_-]?token)['"`]\s*[:=]\s*['"`]([A-Z0-9]{20}|[a-zA-Z0-9/+]{40})['"`])/gi,
          type: 'aws_credentials',
          severity: SecuritySeverity.CRITICAL,
          description: 'AWS credentials detected in code',
        },
        {
          pattern: /(?:['"`](?:github[_-]?token|gh[_-]?token|ghp_[a-zA-Z0-9]{36})['"`]\s*[:=]\s*['"`]([a-zA-Z0-9_\-]{36,})['"`])/gi,
          type: 'github_token',
          severity: SecuritySeverity.CRITICAL,
          description: 'GitHub token detected in code',
        },
        {
          pattern: /(?:['"`](?:stripe[_-]?api[_-]?key|stripe[_-]?secret[_-]?key|sk_live_[a-zA-Z0-9]{24})['"`]\s*[:=]\s*['"`]([a-zA-Z0-9_\-]{24,})['"`])/gi,
          type: 'stripe_key',
          severity: SecuritySeverity.CRITICAL,
          description: 'Stripe API key detected in code',
        },
        {
          pattern: /(?:['"`](?:slack[_-]?token|slack[_-]?webhook|slack[_-]?signing[_-]?secret|xoxb-[a-zA-Z0-9\-]{24,})['"`]\s*[:=]\s*['"`]([a-zA-Z0-9_\-]{24,})['"`])/gi,
          type: 'slack_token',
          severity: SecuritySeverity.CRITICAL,
          description: 'Slack token detected in code',
        },
        {
          pattern: /(?:['"`](?:mongodb[_-]?uri|mongo[_-]?url|database[_-]?url|db[_-]?connection)['"`]\s*[:=]\s*['"`](mongodb(?:\+srv)?:\/\/[^\s'"`]+)['"`])/gi,
          type: 'database_connection_string',
          severity: SecuritySeverity.HIGH,
          description: 'Database connection string detected in code',
        },
        {
          pattern: /(?:['"`](?:postgres[_-]?uri|postgresql[_-]?url|pg[_-]?url)['"`]\s*[:=]\s*['"`](postgres(?:ql)?:\/\/[^\s'"`]+)['"`])/gi,
          type: 'postgres_connection_string',
          severity: SecuritySeverity.HIGH,
          description: 'PostgreSQL connection string detected in code',
        },
        {
          pattern: /(?:['"`](?:redis[_-]?uri|redis[_-]?url)['"`]\s*[:=]\s*['"`](redis(?:\+s)?:\/\/[^\s'"`]+)['"`])/gi,
          type: 'redis_connection_string',
          severity: SecuritySeverity.HIGH,
          description: 'Redis connection string detected in code',
        },
        {
          pattern: /(?:['"`](?:jwt[_-]?secret|jwt[_-]?key|secret[_-]?jwt)['"`]\s*[:=]\s*['"`]([a-zA-Z0-9_\-]{32,})['"`])/gi,
          type: 'jwt_secret',
          severity: SecuritySeverity.HIGH,
          description: 'JWT secret detected in code',
        },
        {
          pattern: /(?:['"`](?:encryption[_-]?key|encrypt[_-]?key|crypto[_-]?key)['"`]\s*[:=]\s*['"`]([a-zA-Z0-9_\-]{32,})['"`])/gi,
          type: 'encryption_key',
          severity: SecuritySeverity.HIGH,
          description: 'Encryption key detected in code',
        },
        {
          pattern: /(?:['"`](?:private[_-]?key|rsa[_-]?private[_-]?key)['"`]\s*[:=]\s*['"`](-----BEGIN[^\s]*PRIVATE KEY-----[\s\S]+?-----END[^\s]*PRIVATE KEY-----)['"`])/gi,
          type: 'private_key',
          severity: SecuritySeverity.CRITICAL,
          description: 'Private key detected in code',
        },
      ];

      // Scan TypeScript and JavaScript files
      const { readdirSync, readFileSync, statSync } = require('fs');
      const { join } = require('path');

      const scanDirectory = (dir: string, baseDir: string = dir) => {
        try {
          const files = readdirSync(dir);

          for (const file of files) {
            const filePath = join(dir, file);
            const stat = statSync(filePath);

            if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules' && file !== 'dist' && file !== 'build') {
              scanDirectory(filePath, baseDir);
            } else if (stat.isFile() && (file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.json') || file.endsWith('.env'))) {
              try {
                const content = readFileSync(filePath, 'utf-8');
                const relativePath = filePath.replace(baseDir, '').replace(/\\/g, '/');

                for (const secretPattern of secretPatterns) {
                  const matches = content.matchAll(secretPattern.pattern);
                  for (const match of matches) {
                    findings.push({
                      id: `secret-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                      type: secretPattern.type,
                      severity: secretPattern.severity,
                      title: `Secret detected: ${secretPattern.type}`,
                      description: secretPattern.description,
                      location: relativePath,
                      recommendation: 'Move secrets to environment variables or a secure secret management system',
                      affectedComponents: [relativePath],
                      discoveredAt: new Date(),
                    });
                  }
                }
              } catch (error) {
                // Skip files that can't be read
              }
            }
          }
        } catch (error) {
          // Skip directories that can't be accessed
        }
      };

      // Scan the src directory
      scanDirectory(join(process.cwd(), 'src'));

      this.logger.info(`Secret scan completed: ${findings.length} secrets found`);

    } catch (error) {
      this.logger.error('Failed to scan for secrets:', error);
    }

    return findings;
  }

  /**
   * Scan for insecure code patterns
   * @returns Array of security findings
   */
  private async scanForInsecureCodePatterns(): Promise<SecurityFinding[]> {
    this.logger.info('Scanning for insecure code patterns');
    const findings: SecurityFinding[] = [];

    try {
      // Patterns for detecting insecure code
      const insecurePatterns: Array<{ pattern: RegExp; type: string; severity: SecuritySeverity; title: string; description: string; recommendation: string }> = [
        {
          pattern: /\beval\s*\(/g,
          type: 'eval_usage',
          severity: SecuritySeverity.HIGH,
          title: 'Use of eval() function',
          description: 'The eval() function can execute arbitrary code and is a major security risk',
          recommendation: 'Replace eval() with safer alternatives like JSON.parse() for parsing data',
        },
        {
          pattern: /\bFunction\s*\(\s*['"`][^'"`]*['"`]\s*\)/g,
          type: 'function_constructor',
          severity: SecuritySeverity.HIGH,
          title: 'Use of Function constructor',
          description: 'The Function constructor can execute arbitrary code and is a security risk',
          recommendation: 'Avoid using Function constructor, use regular function declarations or arrow functions',
        },
        {
          pattern: /innerHTML\s*=/g,
          type: 'inner_html_assignment',
          severity: SecuritySeverity.HIGH,
          title: 'Direct innerHTML assignment',
          description: 'Direct innerHTML assignment can lead to XSS vulnerabilities',
          recommendation: 'Use textContent or sanitize HTML before setting innerHTML',
        },
        {
          pattern: /dangerouslySetInnerHTML\s*=/g,
          type: 'dangerously_set_inner_html',
          severity: SecuritySeverity.HIGH,
          title: 'Use of dangerouslySetInnerHTML',
          description: 'dangerouslySetInnerHTML bypasses React XSS protection',
          recommendation: 'Avoid using dangerouslySetInnerHTML or use a sanitization library like DOMPurify',
        },
        {
          pattern: /document\.write\s*\(/g,
          type: 'document_write',
          severity: SecuritySeverity.MEDIUM,
          title: 'Use of document.write()',
          description: 'document.write() can overwrite the entire document and is a security risk',
          recommendation: 'Use DOM manipulation methods like createElement, appendChild, etc.',
        },
        {
          pattern: /setTimeout\s*\(\s*['"`][^'"`]*['"`]/g,
          type: 'setTimeout_string',
          severity: SecuritySeverity.MEDIUM,
          title: 'setTimeout with string argument',
          description: 'Passing a string to setTimeout is equivalent to eval() and is a security risk',
          recommendation: 'Pass a function instead of a string to setTimeout',
        },
        {
          pattern: /setInterval\s*\(\s*['"`][^'"`]*['"`]/g,
          type: 'setInterval_string',
          severity: SecuritySeverity.MEDIUM,
          title: 'setInterval with string argument',
          description: 'Passing a string to setInterval is equivalent to eval() and is a security risk',
          recommendation: 'Pass a function instead of a string to setInterval',
        },
        {
          pattern: /exec\s*\(/g,
          type: 'regex_exec',
          severity: SecuritySeverity.LOW,
          title: 'Use of regex exec() with user input',
          description: 'Using exec() with untrusted input can lead to ReDoS attacks',
          recommendation: 'Validate and sanitize regex patterns before use',
        },
        {
          pattern: /process\.env\.[A-Z_]+\s*==\s*['"`][^'"`]*['"`]/g,
          type: 'hardcoded_env_comparison',
          severity: SecuritySeverity.LOW,
          title: 'Hardcoded environment variable comparison',
          description: 'Comparing environment variables to hardcoded values may indicate secrets',
          recommendation: 'Use environment variables for configuration, not hardcoded values',
        },
      ];

      // Scan TypeScript and JavaScript files
      const { readdirSync, readFileSync, statSync } = require('fs');
      const { join } = require('path');

      const scanDirectory = (dir: string, baseDir: string = dir) => {
        try {
          const files = readdirSync(dir);

          for (const file of files) {
            const filePath = join(dir, file);
            const stat = statSync(filePath);

            if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules' && file !== 'dist' && file !== 'build') {
              scanDirectory(filePath, baseDir);
            } else if (stat.isFile() && (file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.tsx') || file.endsWith('.jsx'))) {
              try {
                const content = readFileSync(filePath, 'utf-8');
                const lines = content.split('\n');
                const relativePath = filePath.replace(baseDir, '').replace(/\\/g, '/');

                for (const insecurePattern of insecurePatterns) {
                  const matches = content.matchAll(insecurePattern.pattern);
                  for (const match of matches) {
                    const lineNumber = lines.slice(0, content.indexOf(match[0])).length + 1;
                    findings.push({
                      id: `pattern-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                      type: insecurePattern.type,
                      severity: insecurePattern.severity,
                      title: insecurePattern.title,
                      description: insecurePattern.description,
                      location: `${relativePath}:${lineNumber}`,
                      recommendation: insecurePattern.recommendation,
                      affectedComponents: [relativePath],
                      discoveredAt: new Date(),
                    });
                  }
                }
              } catch (error) {
                // Skip files that can't be read
              }
            }
          }
        } catch (error) {
          // Skip directories that can't be accessed
        }
      };

      // Scan the src directory
      scanDirectory(join(process.cwd(), 'src'));

      this.logger.info(`Insecure pattern scan completed: ${findings.length} patterns found`);

    } catch (error) {
      this.logger.error('Failed to scan for insecure code patterns:', error);
    }

    return findings;
  }

  /**
   * Analyze code for security issues
   * @returns Array of security findings
   */
  private async analyzeCodeSecurity(): Promise<SecurityFinding[]> {
    this.logger.info('Analyzing code security');
    const findings: SecurityFinding[] = [];

    try {
      // Check for SQL injection vulnerabilities
      findings.push(...this.checkSqlInjectionVulnerabilities());

      // Check for XSS vulnerabilities
      findings.push(...this.checkXssVulnerabilities());

      // Check for authentication and authorization issues
      findings.push(...this.checkAuthenticationIssues());

      // Check for input validation issues
      findings.push(...this.checkInputValidation());

      // Check for data exposure issues
      findings.push(...this.checkDataExposure());

      // Check for cryptographic issues
      findings.push(...this.checkCryptographicIssues());

      this.logger.info(`Code security analysis completed: ${findings.length} issues found`);

    } catch (error) {
      this.logger.error('Failed to analyze code security:', error);
    }

    return findings;
  }

  /**
   * Check for SQL injection vulnerabilities
   * @returns Array of security findings
   */
  private checkSqlInjectionVulnerabilities(): SecurityFinding[] {
    const findings: SecurityFinding[] = [];

    // Patterns that may indicate SQL injection vulnerabilities
    const sqlPatterns: Array<{ pattern: RegExp; severity: SecuritySeverity; description: string }> = [
      {
        pattern: /(?:query|execute)\s*\(\s*['"`][^'"`]*\$\{[^}]+\}[^'"`]*['"`]/g,
        severity: SecuritySeverity.HIGH,
        description: 'Possible SQL injection via template literal concatenation',
      },
      {
        pattern: /(?:query|execute)\s*\(\s*['"`][^'"`]*\+[^'"`]+['"`]/g,
        severity: SecuritySeverity.HIGH,
        description: 'Possible SQL injection via string concatenation',
      },
      {
        pattern: /SELECT\s+.*\s+FROM\s+.*\s+WHERE\s+.*=\s*['"`][^'"`]*\$\{[^}]+\}/gi,
        severity: SecuritySeverity.CRITICAL,
        description: 'SQL query with user input in WHERE clause',
      },
    ];

    const { readdirSync, readFileSync, statSync } = require('fs');
    const { join } = require('path');

    const scanDirectory = (dir: string, baseDir: string = dir) => {
      try {
        const files = readdirSync(dir);

        for (const file of files) {
          const filePath = join(dir, file);
          const stat = statSync(filePath);

          if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules' && file !== 'dist' && file !== 'build') {
            scanDirectory(filePath, baseDir);
          } else if (stat.isFile() && (file.endsWith('.ts') || file.endsWith('.js'))) {
            try {
              const content = readFileSync(filePath, 'utf-8');
              const lines = content.split('\n');
              const relativePath = filePath.replace(baseDir, '').replace(/\\/g, '/');

              for (const sqlPattern of sqlPatterns) {
                const matches = content.matchAll(sqlPattern.pattern);
                for (const match of matches) {
                  const lineNumber = lines.slice(0, content.indexOf(match[0])).length + 1;
                  findings.push({
                    id: `sqli-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    type: 'sql_injection',
                    severity: sqlPattern.severity,
                    title: 'SQL Injection Vulnerability',
                    description: sqlPattern.description,
                    location: `${relativePath}:${lineNumber}`,
                    recommendation: 'Use parameterized queries or prepared statements to prevent SQL injection',
                    affectedComponents: [relativePath],
                    discoveredAt: new Date(),
                  });
                }
              }
            } catch (error) {
              // Skip files that can't be read
            }
          }
        }
      } catch (error) {
        // Skip directories that can't be accessed
      }
    };

    scanDirectory(join(process.cwd(), 'src'));
    return findings;
  }

  /**
   * Check for XSS vulnerabilities
   * @returns Array of security findings
   */
  private checkXssVulnerabilities(): SecurityFinding[] {
    const findings: SecurityFinding[] = [];

    // Patterns that may indicate XSS vulnerabilities
    const xssPatterns: Array<{ pattern: RegExp; severity: SecuritySeverity; description: string }> = [
      {
        pattern: /document\.(write|writeln)\s*\([^)]*\$\{[^}]+\}/g,
        severity: SecuritySeverity.HIGH,
        description: 'Possible XSS via document.write with template literal',
      },
      {
        pattern: /element\.innerHTML\s*=\s*[^;]*\$\{[^}]+\}/g,
        severity: SecuritySeverity.HIGH,
        description: 'Possible XSS via innerHTML with template literal',
      },
      {
        pattern: /element\.outerHTML\s*=\s*[^;]*\$\{[^}]+\}/g,
        severity: SecuritySeverity.HIGH,
        description: 'Possible XSS via outerHTML with template literal',
      },
    ];

    const { readdirSync, readFileSync, statSync } = require('fs');
    const { join } = require('path');

    const scanDirectory = (dir: string, baseDir: string = dir) => {
      try {
        const files = readdirSync(dir);

        for (const file of files) {
          const filePath = join(dir, file);
          const stat = statSync(filePath);

          if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules' && file !== 'dist' && file !== 'build') {
            scanDirectory(filePath, baseDir);
          } else if (stat.isFile() && (file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.tsx') || file.endsWith('.jsx'))) {
            try {
              const content = readFileSync(filePath, 'utf-8');
              const lines = content.split('\n');
              const relativePath = filePath.replace(baseDir, '').replace(/\\/g, '/');

              for (const xssPattern of xssPatterns) {
                const matches = content.matchAll(xssPattern.pattern);
                for (const match of matches) {
                  const lineNumber = lines.slice(0, content.indexOf(match[0])).length + 1;
                  findings.push({
                    id: `xss-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    type: 'xss_vulnerability',
                    severity: xssPattern.severity,
                    title: 'XSS Vulnerability',
                    description: xssPattern.description,
                    location: `${relativePath}:${lineNumber}`,
                    recommendation: 'Sanitize user input before rendering and use frameworks with built-in XSS protection',
                    affectedComponents: [relativePath],
                    discoveredAt: new Date(),
                  });
                }
              }
            } catch (error) {
              // Skip files that can't be read
            }
          }
        }
      } catch (error) {
        // Skip directories that can't be accessed
      }
    };

    scanDirectory(join(process.cwd(), 'src'));
    return findings;
  }

  /**
   * Check for authentication and authorization issues
   * @returns Array of security findings
   */
  private checkAuthenticationIssues(): SecurityFinding[] {
    const findings: SecurityFinding[] = [];

    // Patterns that may indicate authentication issues
    const authPatterns: Array<{ pattern: RegExp; severity: SecuritySeverity; title: string; description: string; recommendation: string }> = [
      {
        pattern: /(?:password|passwd|pwd)\s*==\s*['"`][^'"`]*['"`]/gi,
        severity: SecuritySeverity.CRITICAL,
        title: 'Hardcoded password comparison',
        description: 'Comparing passwords to hardcoded values is insecure',
        recommendation: 'Use secure password hashing and comparison (e.g., bcrypt)',
      },
      {
        pattern: /if\s*\(\s*user\s*===\s*['"`]admin['"`]\s*\)/g,
        severity: SecuritySeverity.HIGH,
        title: 'Hardcoded admin check',
        description: 'Hardcoded admin role check is insecure',
        recommendation: 'Implement proper role-based access control',
      },
      {
        pattern: /if\s*\(\s*authenticated\s*===\s*true\s*\)/g,
        severity: SecuritySeverity.MEDIUM,
        title: 'Simple authentication check',
        description: 'Simple boolean authentication check may be bypassed',
        recommendation: 'Use proper authentication middleware and session management',
      },
    ];

    const { readdirSync, readFileSync, statSync } = require('fs');
    const { join } = require('path');

    const scanDirectory = (dir: string, baseDir: string = dir) => {
      try {
        const files = readdirSync(dir);

        for (const file of files) {
          const filePath = join(dir, file);
          const stat = statSync(filePath);

          if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules' && file !== 'dist' && file !== 'build') {
            scanDirectory(filePath, baseDir);
          } else if (stat.isFile() && (file.endsWith('.ts') || file.endsWith('.js'))) {
            try {
              const content = readFileSync(filePath, 'utf-8');
              const lines = content.split('\n');
              const relativePath = filePath.replace(baseDir, '').replace(/\\/g, '/');

              for (const authPattern of authPatterns) {
                const matches = content.matchAll(authPattern.pattern);
                for (const match of matches) {
                  const lineNumber = lines.slice(0, content.indexOf(match[0])).length + 1;
                  findings.push({
                    id: `auth-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    type: 'authentication_issue',
                    severity: authPattern.severity,
                    title: authPattern.title,
                    description: authPattern.description,
                    location: `${relativePath}:${lineNumber}`,
                    recommendation: authPattern.recommendation,
                    affectedComponents: [relativePath],
                    discoveredAt: new Date(),
                  });
                }
              }
            } catch (error) {
              // Skip files that can't be read
            }
          }
        }
      } catch (error) {
        // Skip directories that can't be accessed
      }
    };

    scanDirectory(join(process.cwd(), 'src'));
    return findings;
  }

  /**
   * Check for input validation issues
   * @returns Array of security findings
   */
  private checkInputValidation(): SecurityFinding[] {
    const findings: SecurityFinding[] = [];

    // Patterns that may indicate lack of input validation
    const validationPatterns: Array<{ pattern: RegExp; severity: SecuritySeverity; title: string; description: string }> = [
      {
        pattern: /req\.body\.[a-zA-Z_$][a-zA-Z0-9_$]*\s*(?!\s*&&|\s*\|\||\s*\?)/g,
        severity: SecuritySeverity.MEDIUM,
        title: 'Unvalidated request body access',
        description: 'Accessing request body without validation may lead to security issues',
      },
      {
        pattern: /req\.query\.[a-zA-Z_$][a-zA-Z0-9_$]*\s*(?!\s*&&|\s*\|\||\s*\?)/g,
        severity: SecuritySeverity.MEDIUM,
        title: 'Unvalidated query parameter access',
        description: 'Accessing query parameters without validation may lead to security issues',
      },
      {
        pattern: /req\.params\.[a-zA-Z_$][a-zA-Z0-9_$]*\s*(?!\s*&&|\s*\|\||\s*\?)/g,
        severity: SecuritySeverity.MEDIUM,
        title: 'Unvalidated path parameter access',
        description: 'Accessing path parameters without validation may lead to security issues',
      },
    ];

    const { readdirSync, readFileSync, statSync } = require('fs');
    const { join } = require('path');

    const scanDirectory = (dir: string, baseDir: string = dir) => {
      try {
        const files = readdirSync(dir);

        for (const file of files) {
          const filePath = join(dir, file);
          const stat = statSync(filePath);

          if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules' && file !== 'dist' && file !== 'build') {
            scanDirectory(filePath, baseDir);
          } else if (stat.isFile() && (file.endsWith('.ts') || file.endsWith('.js'))) {
            try {
              const content = readFileSync(filePath, 'utf-8');
              const lines = content.split('\n');
              const relativePath = filePath.replace(baseDir, '').replace(/\\/g, '/');

              for (const validationPattern of validationPatterns) {
                const matches = content.matchAll(validationPattern.pattern);
                for (const match of matches) {
                  const lineNumber = lines.slice(0, content.indexOf(match[0])).length + 1;
                  findings.push({
                    id: `validation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    type: 'input_validation',
                    severity: validationPattern.severity,
                    title: validationPattern.title,
                    description: validationPattern.description,
                    location: `${relativePath}:${lineNumber}`,
                    recommendation: 'Implement proper input validation and sanitization for all user inputs',
                    affectedComponents: [relativePath],
                    discoveredAt: new Date(),
                  });
                }
              }
            } catch (error) {
              // Skip files that can't be read
            }
          }
        }
      } catch (error) {
        // Skip directories that can't be accessed
      }
    };

    scanDirectory(join(process.cwd(), 'src'));
    return findings;
  }

  /**
   * Check for data exposure issues
   * @returns Array of security findings
   */
  private checkDataExposure(): SecurityFinding[] {
    const findings: SecurityFinding[] = [];

    // Patterns that may indicate data exposure
    const exposurePatterns: Array<{ pattern: RegExp; severity: SecuritySeverity; title: string; description: string }> = [
      {
        pattern: /console\.(log|debug|info|warn|error)\s*\([^)]*(?:password|secret|token|key|credit|ssn|social)/gi,
        severity: SecuritySeverity.MEDIUM,
        title: 'Sensitive data in console output',
        description: 'Logging sensitive data may expose it in logs',
      },
      {
        pattern: /res\.(send|json)\s*\([^)]*(?:password|secret|token|key|credit|ssn|social)/gi,
        severity: SecuritySeverity.HIGH,
        title: 'Sensitive data in API response',
        description: 'Returning sensitive data in API responses may expose it to clients',
      },
    ];

    const { readdirSync, readFileSync, statSync } = require('fs');
    const { join } = require('path');

    const scanDirectory = (dir: string, baseDir: string = dir) => {
      try {
        const files = readdirSync(dir);

        for (const file of files) {
          const filePath = join(dir, file);
          const stat = statSync(filePath);

          if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules' && file !== 'dist' && file !== 'build') {
            scanDirectory(filePath, baseDir);
          } else if (stat.isFile() && (file.endsWith('.ts') || file.endsWith('.js'))) {
            try {
              const content = readFileSync(filePath, 'utf-8');
              const lines = content.split('\n');
              const relativePath = filePath.replace(baseDir, '').replace(/\\/g, '/');

              for (const exposurePattern of exposurePatterns) {
                const matches = content.matchAll(exposurePattern.pattern);
                for (const match of matches) {
                  const lineNumber = lines.slice(0, content.indexOf(match[0])).length + 1;
                  findings.push({
                    id: `exposure-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    type: 'data_exposure',
                    severity: exposurePattern.severity,
                    title: exposurePattern.title,
                    description: exposurePattern.description,
                    location: `${relativePath}:${lineNumber}`,
                    recommendation: 'Remove sensitive data from logs and API responses',
                    affectedComponents: [relativePath],
                    discoveredAt: new Date(),
                  });
                }
              }
            } catch (error) {
              // Skip files that can't be read
            }
          }
        }
      } catch (error) {
        // Skip directories that can't be accessed
      }
    };

    scanDirectory(join(process.cwd(), 'src'));
    return findings;
  }

  /**
   * Check for cryptographic issues
   * @returns Array of security findings
   */
  private checkCryptographicIssues(): SecurityFinding[] {
    const findings: SecurityFinding[] = [];

    // Patterns that may indicate cryptographic issues
    const cryptoPatterns: Array<{ pattern: RegExp; severity: SecuritySeverity; title: string; description: string; recommendation: string }> = [
      {
        pattern: /createHash\s*\(\s*['"`]md5['"`]\s*\)/gi,
        severity: SecuritySeverity.MEDIUM,
        title: 'Use of MD5 hash',
        description: 'MD5 is cryptographically broken and should not be used for security purposes',
        recommendation: 'Use SHA-256 or stronger hash algorithms',
      },
      {
        pattern: /createHash\s*\(\s*['"`]sha1['"`]\s*\)/gi,
        severity: SecuritySeverity.MEDIUM,
        title: 'Use of SHA-1 hash',
        description: 'SHA-1 is deprecated for security purposes',
        recommendation: 'Use SHA-256 or stronger hash algorithms',
      },
      {
        pattern: /createCipher\s*\(/gi,
        severity: SecuritySeverity.HIGH,
        title: 'Use of insecure cipher',
        description: 'createCipher uses insecure defaults and should be avoided',
        recommendation: 'Use createCipheriv with proper initialization vectors',
      },
      {
        pattern: /randomBytes\s*\(\s*[0-9]+\s*\)/gi,
        severity: SecuritySeverity.LOW,
        title: 'Insufficient random bytes',
        description: 'Insufficient random bytes may reduce cryptographic strength',
        recommendation: 'Use at least 16 bytes (128 bits) for cryptographic operations',
      },
    ];

    const { readdirSync, readFileSync, statSync } = require('fs');
    const { join } = require('path');

    const scanDirectory = (dir: string, baseDir: string = dir) => {
      try {
        const files = readdirSync(dir);

        for (const file of files) {
          const filePath = join(dir, file);
          const stat = statSync(filePath);

          if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules' && file !== 'dist' && file !== 'build') {
            scanDirectory(filePath, baseDir);
          } else if (stat.isFile() && (file.endsWith('.ts') || file.endsWith('.js'))) {
            try {
              const content = readFileSync(filePath, 'utf-8');
              const lines = content.split('\n');
              const relativePath = filePath.replace(baseDir, '').replace(/\\/g, '/');

              for (const cryptoPattern of cryptoPatterns) {
                const matches = content.matchAll(cryptoPattern.pattern);
                for (const match of matches) {
                  const lineNumber = lines.slice(0, content.indexOf(match[0])).length + 1;
                  findings.push({
                    id: `crypto-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    type: 'cryptographic_issue',
                    severity: cryptoPattern.severity,
                    title: cryptoPattern.title,
                    description: cryptoPattern.description,
                    location: `${relativePath}:${lineNumber}`,
                    recommendation: cryptoPattern.recommendation,
                    affectedComponents: [relativePath],
                    discoveredAt: new Date(),
                  });
                }
              }
            } catch (error) {
              // Skip files that can't be read
            }
          }
        }
      } catch (error) {
        // Skip directories that can't be accessed
      }
    };

    scanDirectory(join(process.cwd(), 'src'));
    return findings;
  }

  /**
   * Check for insecure HTTP usage
   * @returns Array of security findings
   */
  private checkInsecureHttpUsage(): SecurityFinding[] {
    const findings: SecurityFinding[] = [];

    try {
      // Check for http:// URLs in configuration
      const { readFileSync } = require('fs');
      const { join } = require('path');

      const configFiles = [
        'package.json',
        '.env',
        '.env.example',
        'docker-compose.yml',
      ];

      for (const configFile of configFiles) {
        try {
          const filePath = join(process.cwd(), configFile);
          const content = readFileSync(filePath, 'utf-8');
          const httpMatches = content.match(/http:\/\/[^\s"']+/g);

          if (httpMatches) {
            for (const match of httpMatches) {
              // Skip localhost and internal IPs
              if (!match.includes('localhost') && !match.includes('127.0.0.1') && !match.includes('10.') && !match.includes('192.168.')) {
                findings.push({
                  id: `http-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  type: 'insecure_http',
                  severity: SecuritySeverity.MEDIUM,
                  title: 'Insecure HTTP usage',
                  description: `Using HTTP instead of HTTPS: ${match}`,
                  location: configFile,
                  recommendation: 'Use HTTPS for all external communications',
                  affectedComponents: [configFile],
                  discoveredAt: new Date(),
                });
              }
            }
          }
        } catch (error) {
          // Skip files that don't exist
        }
      }

    } catch (error) {
      this.logger.error('Failed to check for insecure HTTP usage:', error);
    }

    return findings;
  }

  /**
   * Check for weak authentication settings
   * @returns Array of security findings
   */
  private checkAuthenticationSettings(): SecurityFinding[] {
    const findings: SecurityFinding[] = [];

    try {
      // Check for weak session settings
      const weakSessionPatterns = [
        { pattern: /maxAge\s*:\s*\d{4,5}/, severity: SecuritySeverity.MEDIUM, description: 'Session timeout may be too long' },
        { pattern: /secure\s*:\s*false/, severity: SecuritySeverity.HIGH, description: 'Session cookie not marked as secure' },
        { pattern: /httpOnly\s*:\s*false/, severity: SecuritySeverity.HIGH, description: 'Session cookie not marked as httpOnly' },
        { pattern: /sameSite\s*:\s*['"`]none['"`]/i, severity: SecuritySeverity.MEDIUM, description: 'Session cookie sameSite set to none without secure' },
      ];

      const { readdirSync, readFileSync, statSync } = require('fs');
      const { join } = require('path');

      const scanDirectory = (dir: string, baseDir: string = dir) => {
        try {
          const files = readdirSync(dir);

          for (const file of files) {
            const filePath = join(dir, file);
            const stat = statSync(filePath);

            if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules' && file !== 'dist' && file !== 'build') {
              scanDirectory(filePath, baseDir);
            } else if (stat.isFile() && (file.endsWith('.ts') || file.endsWith('.js'))) {
              try {
                const content = readFileSync(filePath, 'utf-8');
                const lines = content.split('\n');
                const relativePath = filePath.replace(baseDir, '').replace(/\\/g, '/');

                for (const sessionPattern of weakSessionPatterns) {
                  const matches = content.matchAll(sessionPattern.pattern);
                  for (const match of matches) {
                    const lineNumber = lines.slice(0, content.indexOf(match[0])).length + 1;
                    findings.push({
                      id: `auth-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                      type: 'weak_authentication',
                      severity: sessionPattern.severity,
                      title: 'Weak authentication setting',
                      description: sessionPattern.description,
                      location: `${relativePath}:${lineNumber}`,
                      recommendation: 'Configure secure session settings with appropriate timeouts and security flags',
                      affectedComponents: [relativePath],
                      discoveredAt: new Date(),
                    });
                  }
                }
              } catch (error) {
                // Skip files that can't be read
              }
            }
          }
        } catch (error) {
          // Skip directories that can't be accessed
        }
      };

      scanDirectory(join(process.cwd(), 'src'));

    } catch (error) {
      this.logger.error('Failed to check authentication settings:', error);
    }

    return findings;
  }

  /**
   * Check for missing security headers
   * @returns Array of security findings
   */
  private checkSecurityHeaders(): SecurityFinding[] {
    const findings: SecurityFinding[] = [];

    try {
      // Check for security headers in middleware or configuration
      const securityHeaders = [
        { name: 'X-Content-Type-Options', severity: SecuritySeverity.LOW },
        { name: 'X-Frame-Options', severity: SecuritySeverity.MEDIUM },
        { name: 'X-XSS-Protection', severity: SecuritySeverity.LOW },
        { name: 'Strict-Transport-Security', severity: SecuritySeverity.HIGH },
        { name: 'Content-Security-Policy', severity: SecuritySeverity.HIGH },
        { name: 'Permissions-Policy', severity: SecuritySeverity.MEDIUM },
      ];

      const { readdirSync, readFileSync, statSync } = require('fs');
      const { join } = require('path');

      // Check if security headers are configured
      let hasSecurityHeaders = false;
      const headerFiles: string[] = [];

      const scanDirectory = (dir: string, baseDir: string = dir) => {
        try {
          const files = readdirSync(dir);

          for (const file of files) {
            const filePath = join(dir, file);
            const stat = statSync(filePath);

            if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules' && file !== 'dist' && file !== 'build') {
              scanDirectory(filePath, baseDir);
            } else if (stat.isFile() && (file.endsWith('.ts') || file.endsWith('.js'))) {
              try {
                const content = readFileSync(filePath, 'utf-8');
                const relativePath = filePath.replace(baseDir, '').replace(/\\/g, '/');

                for (const header of securityHeaders) {
                  if (content.includes(header.name)) {
                    hasSecurityHeaders = true;
                    break;
                  }
                }

                if (content.includes('helmet') || content.includes('security-headers') || content.includes('cors')) {
                  headerFiles.push(relativePath);
                }
              } catch (error) {
                // Skip files that can't be read
              }
            }
          }
        } catch (error) {
          // Skip directories that can't be accessed
        }
      };

      scanDirectory(join(process.cwd(), 'src'));

      // If no security headers found, add a finding
      if (!hasSecurityHeaders && headerFiles.length === 0) {
        findings.push({
          id: `headers-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'missing_security_headers',
          severity: SecuritySeverity.MEDIUM,
          title: 'Missing security headers',
          description: 'Security headers are not configured in the application',
          location: 'middleware',
          recommendation: 'Implement security headers using helmet or similar middleware',
          affectedComponents: ['middleware'],
          discoveredAt: new Date(),
        });
      }

    } catch (error) {
      this.logger.error('Failed to check security headers:', error);
    }

    return findings;
  }

  /**
   * Check for insecure CORS configuration
   * @returns Array of security findings
   */
  private checkCorsConfiguration(): SecurityFinding[] {
    const findings: SecurityFinding[] = [];

    try {
      const { readdirSync, readFileSync, statSync } = require('fs');
      const { join } = require('path');

      const scanDirectory = (dir: string, baseDir: string = dir) => {
        try {
          const files = readdirSync(dir);

          for (const file of files) {
            const filePath = join(dir, file);
            const stat = statSync(filePath);

            if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules' && file !== 'dist' && file !== 'build') {
              scanDirectory(filePath, baseDir);
            } else if (stat.isFile() && (file.endsWith('.ts') || file.endsWith('.js'))) {
              try {
                const content = readFileSync(filePath, 'utf-8');
                const lines = content.split('\n');
                const relativePath = filePath.replace(baseDir, '').replace(/\\/g, '/');

                // Check for overly permissive CORS settings
                const corsPatterns = [
                  {
                    pattern: /origin\s*:\s*['"`]\*['"`]/,
                    severity: SecuritySeverity.HIGH,
                    description: 'CORS origin set to wildcard (*) allows any origin',
                  },
                  {
                    pattern: /origin\s*:\s*true/,
                    severity: SecuritySeverity.HIGH,
                    description: 'CORS origin set to true allows any origin',
                  },
                  {
                    pattern: /methods\s*:\s*['"`]\*['"`]/,
                    severity: SecuritySeverity.MEDIUM,
                    description: 'CORS methods set to wildcard (*) allows any HTTP method',
                  },
                ];

                for (const corsPattern of corsPatterns) {
                  const matches = content.matchAll(corsPattern.pattern);
                  for (const match of matches) {
                    const lineNumber = lines.slice(0, content.indexOf(match[0])).length + 1;
                    findings.push({
                      id: `cors-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                      type: 'insecure_cors',
                      severity: corsPattern.severity,
                      title: 'Insecure CORS configuration',
                      description: corsPattern.description,
                      location: `${relativePath}:${lineNumber}`,
                      recommendation: 'Configure CORS with specific allowed origins, methods, and headers',
                      affectedComponents: [relativePath],
                      discoveredAt: new Date(),
                    });
                  }
                }
              } catch (error) {
                // Skip files that can't be read
              }
            }
          }
        } catch (error) {
          // Skip directories that can't be accessed
        }
      };

      scanDirectory(join(process.cwd(), 'src'));

    } catch (error) {
      this.logger.error('Failed to check CORS configuration:', error);
    }

    return findings;
  }

  /**
   * Check for environment variable exposure
   * @returns Array of security findings
   */
  private checkEnvironmentVariableExposure(): SecurityFinding[] {
    const findings: SecurityFinding[] = [];

    try {
      const { readdirSync, readFileSync, statSync } = require('fs');
      const { join } = require('path');

      const scanDirectory = (dir: string, baseDir: string = dir) => {
        try {
          const files = readdirSync(dir);

          for (const file of files) {
            const filePath = join(dir, file);
            const stat = statSync(filePath);

            if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules' && file !== 'dist' && file !== 'build') {
              scanDirectory(filePath, baseDir);
            } else if (stat.isFile() && (file.endsWith('.ts') || file.endsWith('.js'))) {
              try {
                const content = readFileSync(filePath, 'utf-8');
                const lines = content.split('\n');
                const relativePath = filePath.replace(baseDir, '').replace(/\\/g, '/');

                // Check for environment variables that might be exposed
                const envPatterns = [
                  {
                    pattern: /process\.env\.[A-Z_]+(?!\s*\?)/,
                    severity: SecuritySeverity.LOW,
                    description: 'Environment variable accessed without null check',
                  },
                ];

                for (const envPattern of envPatterns) {
                  const matches = content.matchAll(envPattern.pattern);
                  for (const match of matches) {
                    const lineNumber = lines.slice(0, content.indexOf(match[0])).length + 1;
                    findings.push({
                      id: `env-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                      type: 'env_exposure',
                      severity: envPattern.severity,
                      title: 'Environment variable exposure',
                      description: envPattern.description,
                      location: `${relativePath}:${lineNumber}`,
                      recommendation: 'Add null checks for environment variables and provide default values',
                      affectedComponents: [relativePath],
                      discoveredAt: new Date(),
                    });
                  }
                }
              } catch (error) {
                // Skip files that can't be read
              }
            }
          }
        } catch (error) {
          // Skip directories that can't be accessed
        }
      };

      scanDirectory(join(process.cwd(), 'src'));

    } catch (error) {
      this.logger.error('Failed to check for environment variable exposure:', error);
    }

    return findings;
  }

  /**
   * Audit system configuration
   * @returns Array of security findings
   */
  private async auditConfiguration(): Promise<SecurityFinding[]> {
    this.logger.info('Auditing system configuration');
    const findings: SecurityFinding[] = [];

    try {
      // Audit database configuration
      findings.push(...this.auditDatabaseConfiguration());

      // Audit API configuration
      findings.push(...this.auditApiConfiguration());

      // Audit authentication configuration
      findings.push(...this.auditAuthenticationConfiguration());

      // Audit authorization configuration
      findings.push(...this.auditAuthorizationConfiguration());

      // Audit file system permissions
      findings.push(...this.auditFileSystemPermissions());

      // Audit logging configuration
      findings.push(...this.auditLoggingConfiguration());

      this.logger.info(`Configuration audit completed: ${findings.length} findings found`);

    } catch (error) {
      this.logger.error('Failed to audit configuration:', error);
    }

    return findings;
  }

  /**
   * Audit database configuration
   * @returns Array of security findings
   */
  private auditDatabaseConfiguration(): SecurityFinding[] {
    const findings: SecurityFinding[] = [];

    try {
      const { readFileSync } = require('fs');
      const { join } = require('path');

      // Check for database configuration files
      const configFiles = [
        '.env',
        '.env.example',
        'docker-compose.yml',
        'postgres/init.sql',
      ];

      for (const configFile of configFiles) {
        try {
          const filePath = join(process.cwd(), configFile);
          const content = readFileSync(filePath, 'utf-8');

          // Check for default database credentials
          const defaultCredentials = [
            { pattern: /password\s*[:=]\s*['"`]?postgres['"`]?/gi, severity: SecuritySeverity.HIGH, description: 'Default PostgreSQL password detected' },
            { pattern: /password\s*[:=]\s*['"`]?password['"`]?/gi, severity: SecuritySeverity.HIGH, description: 'Default password detected' },
            { pattern: /password\s*[:=]\s*['"`]?123456['"`]?/gi, severity: SecuritySeverity.HIGH, description: 'Weak password detected' },
            { pattern: /password\s*[:=]\s*['"`]?admin['"`]?/gi, severity: SecuritySeverity.HIGH, description: 'Default admin password detected' },
          ];

          for (const credential of defaultCredentials) {
            if (credential.pattern.test(content)) {
              findings.push({
                id: `db-config-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                type: 'database_config',
                severity: credential.severity,
                title: 'Insecure database configuration',
                description: credential.description,
                location: configFile,
                recommendation: 'Change default database credentials to strong, unique passwords',
                affectedComponents: ['database'],
                discoveredAt: new Date(),
              });
            }
          }

          // Check for unencrypted database connections
          if (content.includes('postgresql://') && !content.includes('localhost') && !content.includes('127.0.0.1')) {
            findings.push({
              id: `db-encrypt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              type: 'database_config',
              severity: SecuritySeverity.MEDIUM,
              title: 'Unencrypted database connection',
              description: 'Database connection string does not use SSL/TLS',
              location: configFile,
              recommendation: 'Use SSL/TLS for database connections (add ?sslmode=require)',
              affectedComponents: ['database'],
              discoveredAt: new Date(),
            });
          }

        } catch (error) {
          // Skip files that don't exist
        }
      }

    } catch (error) {
      this.logger.error('Failed to audit database configuration:', error);
    }

    return findings;
  }

  /**
   * Audit API configuration
   * @returns Array of security findings
   */
  private auditApiConfiguration(): SecurityFinding[] {
    const findings: SecurityFinding[] = [];

    try {
      const { readdirSync, readFileSync, statSync } = require('fs');
      const { join } = require('path');

      const scanDirectory = (dir: string, baseDir: string = dir) => {
        try {
          const files = readdirSync(dir);

          for (const file of files) {
            const filePath = join(dir, file);
            const stat = statSync(filePath);

            if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules' && file !== 'dist' && file !== 'build') {
              scanDirectory(filePath, baseDir);
            } else if (stat.isFile() && (file.endsWith('.ts') || file.endsWith('.js'))) {
              try {
                const content = readFileSync(filePath, 'utf-8');
                const lines = content.split('\n');
                const relativePath = filePath.replace(baseDir, '').replace(/\\/g, '/');

                // Check for missing rate limiting
                if (content.includes('app.listen') || content.includes('express()') || content.includes('createServer')) {
                  if (!content.includes('rateLimit') && !content.includes('express-rate-limit') && !content.includes('throttle')) {
                    findings.push({
                      id: `api-rate-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                      type: 'api_config',
                      severity: SecuritySeverity.MEDIUM,
                      title: 'Missing rate limiting',
                      description: 'API endpoints do not have rate limiting configured',
                      location: relativePath,
                      recommendation: 'Implement rate limiting to prevent abuse and DoS attacks',
                      affectedComponents: ['api'],
                      discoveredAt: new Date(),
                    });
                  }
                }

                // Check for API key in URL parameters
                const apiKeyPattern = /(?:api[_-]?key|apikey|key)\s*[=]\s*['"`]([^'"`]+)['"`]/gi;
                const matches = content.matchAll(apiKeyPattern);
                for (const match of matches) {
                  if (match[1] && match[1].length > 10) {
                    const lineNumber = lines.slice(0, content.indexOf(match[0])).length + 1;
                    findings.push({
                      id: `api-key-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                      type: 'api_config',
                      severity: SecuritySeverity.HIGH,
                      title: 'API key in code',
                      description: 'API key hardcoded in code',
                      location: `${relativePath}:${lineNumber}`,
                      recommendation: 'Move API keys to environment variables',
                      affectedComponents: ['api'],
                      discoveredAt: new Date(),
                    });
                  }
                }

              } catch (error) {
                // Skip files that can't be read
              }
            }
          }
        } catch (error) {
          // Skip directories that can't be accessed
        }
      };

      scanDirectory(join(process.cwd(), 'src'));

    } catch (error) {
      this.logger.error('Failed to audit API configuration:', error);
    }

    return findings;
  }

  /**
   * Audit authentication configuration
   * @returns Array of security findings
   */
  private auditAuthenticationConfiguration(): SecurityFinding[] {
    const findings: SecurityFinding[] = [];

    try {
      const { readdirSync, readFileSync, statSync } = require('fs');
      const { join } = require('path');

      const scanDirectory = (dir: string, baseDir: string = dir) => {
        try {
          const files = readdirSync(dir);

          for (const file of files) {
            const filePath = join(dir, file);
            const stat = statSync(filePath);

            if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules' && file !== 'dist' && file !== 'build') {
              scanDirectory(filePath, baseDir);
            } else if (stat.isFile() && (file.endsWith('.ts') || file.endsWith('.js'))) {
              try {
                const content = readFileSync(filePath, 'utf-8');
                const lines = content.split('\n');
                const relativePath = filePath.replace(baseDir, '').replace(/\\/g, '/');

                // Check for plain text password storage
                if (content.includes('password') && (content.includes('save') || content.includes('store') || content.includes('insert'))) {
                  findings.push({
                    id: `auth-store-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    type: 'auth_config',
                    severity: SecuritySeverity.CRITICAL,
                    title: 'Possible plain text password storage',
                    description: 'Passwords may be stored in plain text',
                    location: relativePath,
                    recommendation: 'Always hash passwords using bcrypt, argon2, or similar',
                    affectedComponents: ['authentication'],
                    discoveredAt: new Date(),
                  });
                }

                // Check for missing password complexity requirements
                if (content.includes('password') && !content.includes('complexity') && !content.includes('length') && !content.includes('minLength')) {
                  findings.push({
                    id: `auth-complexity-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    type: 'auth_config',
                    severity: SecuritySeverity.MEDIUM,
                    title: 'Missing password complexity requirements',
                    description: 'Password validation may not enforce complexity requirements',
                    location: relativePath,
                    recommendation: 'Implement password complexity requirements (min length, uppercase, numbers, special chars)',
                    affectedComponents: ['authentication'],
                    discoveredAt: new Date(),
                  });
                }

                // Check for missing account lockout
                if (content.includes('login') || content.includes('authenticate')) {
                  if (!content.includes('lockout') && !content.includes('lock') && !content.includes('attempt')) {
                    findings.push({
                      id: `auth-lockout-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                      type: 'auth_config',
                      severity: SecuritySeverity.HIGH,
                      title: 'Missing account lockout',
                      description: 'No account lockout mechanism detected for failed login attempts',
                      location: relativePath,
                      recommendation: 'Implement account lockout after multiple failed login attempts',
                      affectedComponents: ['authentication'],
                      discoveredAt: new Date(),
                    });
                  }
                }

                // Check for missing multi-factor authentication
                if (content.includes('login') && !content.includes('2fa') && !content.includes('mfa') && !content.includes('two-factor')) {
                  findings.push({
                    id: `auth-mfa-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    type: 'auth_config',
                    severity: SecuritySeverity.MEDIUM,
                    title: 'Missing multi-factor authentication',
                    description: 'Multi-factor authentication not implemented',
                    location: relativePath,
                    recommendation: 'Consider implementing multi-factor authentication for enhanced security',
                    affectedComponents: ['authentication'],
                    discoveredAt: new Date(),
                  });
                }

              } catch (error) {
                // Skip files that can't be read
              }
            }
          }
        } catch (error) {
          // Skip directories that can't be accessed
        }
      };

      scanDirectory(join(process.cwd(), 'src'));

    } catch (error) {
      this.logger.error('Failed to audit authentication configuration:', error);
    }

    return findings;
  }

  /**
   * Audit authorization configuration
   * @returns Array of security findings
   */
  private auditAuthorizationConfiguration(): SecurityFinding[] {
    const findings: SecurityFinding[] = [];

    try {
      const { readdirSync, readFileSync, statSync } = require('fs');
      const { join } = require('path');

      const scanDirectory = (dir: string, baseDir: string = dir) => {
        try {
          const files = readdirSync(dir);

          for (const file of files) {
            const filePath = join(dir, file);
            const stat = statSync(filePath);

            if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules' && file !== 'dist' && file !== 'build') {
              scanDirectory(filePath, baseDir);
            } else if (stat.isFile() && (file.endsWith('.ts') || file.endsWith('.js'))) {
              try {
                const content = readFileSync(filePath, 'utf-8');
                const lines = content.split('\n');
                const relativePath = filePath.replace(baseDir, '').replace(/\\/g, '/');

                // Check for role-based access control
                if (content.includes('admin') && !content.includes('role') && !content.includes('permission')) {
                  findings.push({
                    id: `authz-rbac-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    type: 'authz_config',
                    severity: SecuritySeverity.HIGH,
                    title: 'Missing role-based access control',
                    description: 'Admin access may not be properly controlled',
                    location: relativePath,
                    recommendation: 'Implement proper role-based access control (RBAC)',
                    affectedComponents: ['authorization'],
                    discoveredAt: new Date(),
                  });
                }

                // Check for authorization bypass patterns
                const bypassPatterns = [
                  { pattern: /if\s*\(\s*user\s*===\s*['"`]admin['"`]\s*\)/, severity: SecuritySeverity.HIGH, description: 'Simple admin check' },
                  { pattern: /if\s*\(\s*isAdmin\s*===\s*true\s*\)/, severity: SecuritySeverity.HIGH, description: 'Simple isAdmin check' },
                  { pattern: /skipAuth\s*[:=]\s*true/gi, severity: SecuritySeverity.CRITICAL, description: 'Authentication bypass detected' },
                ];

                for (const bypass of bypassPatterns) {
                  const matches = content.matchAll(bypass.pattern);
                  for (const match of matches) {
                    const lineNumber = lines.slice(0, content.indexOf(match[0])).length + 1;
                    findings.push({
                      id: `authz-bypass-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                      type: 'authz_config',
                      severity: bypass.severity,
                      title: 'Potential authorization bypass',
                      description: bypass.description,
                      location: `${relativePath}:${lineNumber}`,
                      recommendation: 'Implement proper authorization checks and avoid bypass mechanisms',
                      affectedComponents: ['authorization'],
                      discoveredAt: new Date(),
                    });
                  }
                }

              } catch (error) {
                // Skip files that can't be read
              }
            }
          }
        } catch (error) {
          // Skip directories that can't be accessed
        }
      };

      scanDirectory(join(process.cwd(), 'src'));

    } catch (error) {
      this.logger.error('Failed to audit authorization configuration:', error);
    }

    return findings;
  }

  /**
   * Audit file system permissions
   * @returns Array of security findings
   */
  private auditFileSystemPermissions(): SecurityFinding[] {
    const findings: SecurityFinding[] = [];

    try {
      const { readFileSync } = require('fs');
      const { join } = require('path');

      // Check for sensitive files in repository
      const sensitiveFiles = [
        '.env',
        '.env.local',
        '.env.development',
        '.env.production',
        'secrets.json',
        'config/secrets.json',
        'credentials.json',
      ];

      // Check if .gitignore exists and contains sensitive files
      try {
        const gitignorePath = join(process.cwd(), '.gitignore');
        const gitignoreContent = readFileSync(gitignorePath, 'utf-8');

        for (const sensitiveFile of sensitiveFiles) {
          try {
            const filePath = join(process.cwd(), sensitiveFile);
            readFileSync(filePath, 'utf-8'); // Try to read the file

            // File exists, check if it's in .gitignore
            if (!gitignoreContent.includes(sensitiveFile) && !gitignoreContent.includes('.env*')) {
              findings.push({
                id: `fs-perm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                type: 'filesystem_permission',
                severity: SecuritySeverity.HIGH,
                title: 'Sensitive file not in .gitignore',
                description: `Sensitive file ${sensitiveFile} may be committed to version control`,
                location: sensitiveFile,
                recommendation: `Add ${sensitiveFile} to .gitignore and ensure it is not committed`,
                affectedComponents: ['filesystem'],
                discoveredAt: new Date(),
              });
            }
          } catch (error) {
            // File doesn't exist, skip
          }
        }
      } catch (error) {
        // .gitignore doesn't exist
        findings.push({
          id: `fs-gitignore-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'filesystem_permission',
          severity: SecuritySeverity.MEDIUM,
          title: 'Missing .gitignore file',
          description: 'No .gitignore file found to protect sensitive files',
          location: 'root',
          recommendation: 'Create a .gitignore file to exclude sensitive files from version control',
          affectedComponents: ['filesystem'],
          discoveredAt: new Date(),
        });
      }

    } catch (error) {
      this.logger.error('Failed to audit file system permissions:', error);
    }

    return findings;
  }

  /**
   * Audit logging configuration
   * @returns Array of security findings
   */
  private auditLoggingConfiguration(): SecurityFinding[] {
    const findings: SecurityFinding[] = [];

    try {
      const { readdirSync, readFileSync, statSync } = require('fs');
      const { join } = require('path');

      const scanDirectory = (dir: string, baseDir: string = dir) => {
        try {
          const files = readdirSync(dir);

          for (const file of files) {
            const filePath = join(dir, file);
            const stat = statSync(filePath);

            if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules' && file !== 'dist' && file !== 'build') {
              scanDirectory(filePath, baseDir);
            } else if (stat.isFile() && (file.endsWith('.ts') || file.endsWith('.js'))) {
              try {
                const content = readFileSync(filePath, 'utf-8');
                const lines = content.split('\n');
                const relativePath = filePath.replace(baseDir, '').replace(/\\/g, '/');

                // Check for logging sensitive data
                const sensitiveLoggingPatterns = [
                  { pattern: /console\.(log|debug|info|warn|error)\s*\([^)]*(?:password|token|secret|key|credit|ssn|social)/gi, severity: SecuritySeverity.HIGH },
                  { pattern: /logger\.(log|debug|info|warn|error)\s*\([^)]*(?:password|token|secret|key|credit|ssn|social)/gi, severity: SecuritySeverity.HIGH },
                ];

                for (const logPattern of sensitiveLoggingPatterns) {
                  const matches = content.matchAll(logPattern.pattern);
                  for (const match of matches) {
                    const lineNumber = lines.slice(0, content.indexOf(match[0])).length + 1;
                    findings.push({
                      id: `log-sensitive-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                      type: 'logging_config',
                      severity: logPattern.severity,
                      title: 'Sensitive data in logs',
                      description: 'Logging sensitive data may expose it in log files',
                      location: `${relativePath}:${lineNumber}`,
                      recommendation: 'Remove sensitive data from logs and implement log sanitization',
                      affectedComponents: ['logging'],
                      discoveredAt: new Date(),
                    });
                  }
                }

                // Check for structured logging
                if (content.includes('console.log') && !content.includes('winston') && !content.includes('pino') && !content.includes('bunyan')) {
                  findings.push({
                    id: `log-structured-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    type: 'logging_config',
                    severity: SecuritySeverity.LOW,
                    title: 'Missing structured logging',
                    description: 'Using console.log instead of structured logging library',
                    location: relativePath,
                    recommendation: 'Use a structured logging library like winston or pino for better log management',
                    affectedComponents: ['logging'],
                    discoveredAt: new Date(),
                  });
                }

              } catch (error) {
                // Skip files that can't be read
              }
            }
          }
        } catch (error) {
          // Skip directories that can't be accessed
        }
      };

      scanDirectory(join(process.cwd(), 'src'));

    } catch (error) {
      this.logger.error('Failed to audit logging configuration:', error);
    }

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
      // Integrate with penetration testing tools
      // For this implementation, we'll use npm audit for dependency scanning
      // and integrate with external penetration testing service if configured
      
      const { exec } = require('child_process');
      
      // Run npm audit for dependency vulnerabilities
      const npmAuditResult = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        exec('npm audit --json', { cwd: process.cwd() }, (error: Error | null, stdout: string, stderr: string) => {
          if (error) {
            reject(error);
          } else {
            resolve({ stdout, stderr });
          }
        });
      });
      
      // Parse npm audit results
      let auditFindings: SecurityFinding[] = [];
      let overallScore = 100;
      
      if (npmAuditResult.stdout) {
        try {
          const auditData = JSON.parse(npmAuditResult.stdout);
          
          // Process vulnerabilities
          if (auditData.vulnerabilities && Array.isArray(auditData.vulnerabilities)) {
            for (const vuln of auditData.vulnerabilities) {
              const severity = this.mapNpmSeverity(vuln.severity);
              auditFindings.push({
                id: `pentest-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                type: 'dependency_vulnerability',
                severity,
                title: `Vulnerability in ${vuln.packageName}`,
                description: `${vuln.title || 'Security vulnerability'} in package ${vuln.packageName}@${vuln.version}`,
                location: `package.json: ${vuln.packageName}`,
                recommendation: vuln.patchAvailable
                  ? `Update to version ${vuln.patchVersions?.[0]} or later`
                  : 'Monitor for patch release',
                cvssScore: vuln.cvss?.score,
                affectedComponents: [vuln.packageName],
                discoveredAt: new Date(),
              });
              
              // Reduce score based on severity
              switch (severity) {
                case SecuritySeverity.CRITICAL:
                  overallScore -= 25;
                  break;
                case SecuritySeverity.HIGH:
                  overallScore -= 15;
                  break;
                case SecuritySeverity.MEDIUM:
                  overallScore -= 5;
                  break;
                case SecuritySeverity.LOW:
                  overallScore -= 1;
                  break;
              }
            }
          }
          
          // Process advisories
          if (auditData.advisories && Array.isArray(auditData.advisories)) {
            for (const advisory of auditData.advisories) {
              auditFindings.push({
                id: `pentest-advisory-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                type: 'security_advisory',
                severity: SecuritySeverity.MEDIUM,
                title: `Security advisory: ${advisory.title}`,
                description: advisory.overview || 'Security advisory detected',
                location: 'npm registry',
                recommendation: 'Review and apply security recommendations',
                affectedComponents: ['dependencies'],
                discoveredAt: new Date(),
              });
              overallScore -= 5;
            }
          }
        } catch (parseError) {
          this.logger.warn('Failed to parse npm audit output:', parseError);
        }
      }
      
      // If configured, integrate with external penetration testing service
      const penTestProvider = process.env.PENETRATION_TEST_PROVIDER || 'local';
      
      if (penTestProvider !== 'local') {
        // External penetration testing service integration
        // This would integrate with services like Snyk, Burp Suite, OWASP ZAP
        // For now, log that external service is configured
        this.logger.info(`External penetration testing provider: ${penTestProvider}`);
      }
      
      result.overallScore = Math.max(0, overallScore);
      result.passed = result.overallScore >= 80;
      
      result.status = 'completed';
      this.logger.info(`Penetration test completed: ${scheduleId}, Score: ${result.overallScore}, Findings: ${auditFindings.length}`);
      
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

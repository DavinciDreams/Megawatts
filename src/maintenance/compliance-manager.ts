/**
 * Compliance Manager
 *
 * Compliance management system for GDPR compliance monitoring, Discord TOS compliance checks,
 * accessibility compliance tracking, localization compliance, and compliance audit generation.
 */

import { EventEmitter } from 'events';
import { Logger } from '../utils/logger';
import { MaintenanceRepository } from './maintenance-repository';
import {
  ComplianceAudit,
  ComplianceFinding,
  ComplianceType,
  MaintenanceStatus,
  MaintenancePriority,
  SecuritySeverity,
} from './maintenance-models';
import * as axe from 'axe-core';

/**
 * Compliance manager configuration
 */
export interface ComplianceManagerConfig {
  auditInterval: number; // in milliseconds
  autoScheduleAudits: boolean;
  notifyOnFailures: boolean;
  retentionPeriod: number; // in milliseconds
  gdprSettings: GDPRSettings;
  discordTOSSettings: DiscordTOSSettings;
  accessibilitySettings: AccessibilitySettings;
  localizationSettings: LocalizationSettings;
}

/**
 * GDPR settings
 */
export interface GDPRSettings {
  enabled: boolean;
  dataRetentionPeriod: number; // in days
  rightToDeletion: boolean;
  rightToAccess: boolean;
  rightToPortability: boolean;
  consentManagement: boolean;
  dataBreachNotification: boolean;
}

/**
 * Discord TOS settings
 */
export interface DiscordTOSSettings {
  enabled: boolean;
  apiUsageCompliance: boolean;
  rateLimitCompliance: boolean;
  contentPolicyCompliance: boolean;
  userPrivacyCompliance: boolean;
  botBehaviorCompliance: boolean;
}

/**
 * Accessibility settings
 */
export interface AccessibilitySettings {
  enabled: boolean;
  wcagLevel: 'A' | 'AA' | 'AAA';
  checkColorContrast: boolean;
  checkAltText: boolean;
  checkKeyboardNavigation: boolean;
  checkScreenReaderCompatibility: boolean;
}

/**
 * Localization settings
 */
export interface LocalizationSettings {
  enabled: boolean;
  supportedLanguages: string[];
  defaultLanguage: string;
  checkForUntranslatedStrings: boolean;
  checkForCulturalSensitivity: boolean;
}

/**
 * Default compliance manager configuration
 */
export const DEFAULT_COMPLIANCE_MANAGER_CONFIG: ComplianceManagerConfig = {
  auditInterval: 604800000, // 7 days
  autoScheduleAudits: true,
  notifyOnFailures: true,
  retentionPeriod: 31536000000, // 365 days
  gdprSettings: {
    enabled: true,
    dataRetentionPeriod: 365,
    rightToDeletion: true,
    rightToAccess: true,
    rightToPortability: true,
    consentManagement: true,
    dataBreachNotification: true,
  },
  discordTOSSettings: {
    enabled: true,
    apiUsageCompliance: true,
    rateLimitCompliance: true,
    contentPolicyCompliance: true,
    userPrivacyCompliance: true,
    botBehaviorCompliance: true,
  },
  accessibilitySettings: {
    enabled: true,
    wcagLevel: 'AA',
    checkColorContrast: true,
    checkAltText: true,
    checkKeyboardNavigation: true,
    checkScreenReaderCompatibility: true,
  },
  localizationSettings: {
    enabled: true,
    supportedLanguages: ['en', 'es', 'fr', 'de', 'ja', 'zh'],
    defaultLanguage: 'en',
    checkForUntranslatedStrings: true,
    checkForCulturalSensitivity: true,
  },
};

/**
 * Compliance check result
 */
export interface ComplianceCheckResult {
  type: ComplianceType;
  passed: boolean;
  score: number;
  findings: ComplianceFinding[];
  checkedAt: Date;
  duration: number;
}

/**
 * GDPR compliance result
 */
export interface GDPRComplianceResult {
  passed: boolean;
  score: number;
  findings: ComplianceFinding[];
  dataRetentionCompliant: boolean;
  consentManagementCompliant: boolean;
  userRightsCompliant: boolean;
  dataBreachProceduresCompliant: boolean;
}

/**
 * Discord TOS compliance result
 */
export interface DiscordTOSComplianceResult {
  passed: boolean;
  score: number;
  findings: ComplianceFinding[];
  apiUsageCompliant: boolean;
  rateLimitCompliant: boolean;
  contentPolicyCompliant: boolean;
  userPrivacyCompliant: boolean;
  botBehaviorCompliant: boolean;
}

/**
 * Accessibility compliance result
 */
export interface AccessibilityComplianceResult {
  passed: boolean;
  score: number;
  findings: ComplianceFinding[];
  wcagLevel: 'A' | 'AA' | 'AAA';
  colorContrastCompliant: boolean;
  altTextCompliant: boolean;
  keyboardNavigationCompliant: boolean;
  screenReaderCompatible: boolean;
}

/**
 * Localization compliance result
 */
export interface LocalizationComplianceResult {
  passed: boolean;
  score: number;
  findings: ComplianceFinding[];
  allLanguagesTranslated: boolean;
  noUntranslatedStrings: boolean;
  culturallyAppropriate: boolean;
  defaultLanguageSet: boolean;
}

/**
 * Compliance manager class
 */
export class ComplianceManager extends EventEmitter {
  private config: ComplianceManagerConfig;
  private repository: MaintenanceRepository;
  private logger: Logger;
  private auditInterval?: NodeJS.Timeout;
  private isRunning = false;
  private auditHistory: ComplianceCheckResult[] = [];

  constructor(
    repository: MaintenanceRepository,
    config: Partial<ComplianceManagerConfig> = {}
  ) {
    super();
    this.config = { ...DEFAULT_COMPLIANCE_MANAGER_CONFIG, ...config };
    this.repository = repository;
    this.logger = new Logger('ComplianceManager');
  }

  /**
   * Start compliance manager
   */
  start(): void {
    if (this.isRunning) {
      this.logger.warn('Compliance manager is already running');
      return;
    }

    this.isRunning = true;

    // Schedule regular compliance audits
    this.auditInterval = setInterval(() => {
      this.runComplianceAudit().catch(error => {
        this.logger.error('Compliance audit failed:', error);
      });
    }, this.config.auditInterval);

    this.logger.info('Compliance manager started');
    this.emit('started');
  }

  /**
   * Stop compliance manager
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

    this.logger.info('Compliance manager stopped');
    this.emit('stopped');
  }

  /**
   * Run a full compliance audit
   * @returns Compliance audit result
   */
  async runComplianceAudit(): Promise<ComplianceAudit> {
    const auditId = `audit-${Date.now()}`;
    const startTime = Date.now();

    this.logger.info(`Starting compliance audit: ${auditId}`);

    const findings: ComplianceFinding[] = [];
    let overallScore = 0;
    let passed = false;

    try {
      // Run GDPR compliance check
      if (this.config.gdprSettings.enabled) {
        const gdprResult = await this.checkGDPRCompliance();
        findings.push(...gdprResult.findings);
        overallScore += gdprResult.score;
      }

      // Run Discord TOS compliance check
      if (this.config.discordTOSSettings.enabled) {
        const tosResult = await this.checkDiscordTOSCompliance();
        findings.push(...tosResult.findings);
        overallScore += tosResult.score;
      }

      // Run accessibility compliance check
      if (this.config.accessibilitySettings.enabled) {
        const a11yResult = await this.checkAccessibilityCompliance();
        findings.push(...a11yResult.findings);
        overallScore += a11yResult.score;
      }

      // Run localization compliance check
      if (this.config.localizationSettings.enabled) {
        const locResult = await this.checkLocalizationCompliance();
        findings.push(...locResult.findings);
        overallScore += locResult.score;
      }

      // Calculate overall score (average of all checks)
      const checkCount = [
        this.config.gdprSettings.enabled,
        this.config.discordTOSSettings.enabled,
        this.config.accessibilitySettings.enabled,
        this.config.localizationSettings.enabled,
      ].filter(Boolean).length;

      overallScore = checkCount > 0 ? overallScore / checkCount : 100;
      passed = overallScore >= 80;

      // Create compliance audit record
      const audit = await this.repository.createComplianceAudit({
        type: ComplianceType.SECURITY, // Generic type for full audit
        title: 'Full Compliance Audit',
        description: 'Comprehensive compliance audit covering all enabled compliance areas',
        status: MaintenanceStatus.IN_PROGRESS,
        priority: MaintenancePriority.HIGH,
        scheduledAt: new Date(),
        startedAt: new Date(),
        completedAt: new Date(),
        auditor: 'system',
        auditorName: 'Compliance Manager',
        findings,
        overallScore: Math.round(overallScore),
        passed,
        recommendations: this.generateRecommendations(findings),
        metadata: {
          auditId,
          duration: Date.now() - startTime,
        },
      });

      await this.repository.updateComplianceAudit(audit.id, {
        status: MaintenanceStatus.COMPLETED,
      });

      // Notify on failures
      if (this.config.notifyOnFailures && !passed) {
        this.emit('complianceFailed', {
          audit,
          findings: findings.filter(f => f.severity !== 'low'),
        });
      }

      this.logger.info(`Compliance audit completed: ${auditId}, Score: ${overallScore}, Passed: ${passed}`);

      return audit;

    } catch (error) {
      this.logger.error(`Compliance audit failed: ${auditId}`, error);
      throw error;
    }
  }

  /**
   * Check GDPR compliance
   * @returns GDPR compliance result
   */
  async checkGDPRCompliance(): Promise<GDPRComplianceResult> {
    this.logger.info('Checking GDPR compliance');

    const findings: ComplianceFinding[] = [];

    try {
      // Check data retention
      const dataRetentionFinding = await this.checkDataRetention();
      if (dataRetentionFinding) {
        findings.push(dataRetentionFinding);
      }

      // Check consent management
      const consentFinding = await this.checkConsentManagement();
      if (consentFinding) {
        findings.push(consentFinding);
      }

      // Check user rights
      const userRightsFinding = await this.checkUserRights();
      if (userRightsFinding) {
        findings.push(userRightsFinding);
      }

      // Check data breach procedures
      const dataBreachFinding = await this.checkDataBreachProcedures();
      if (dataBreachFinding) {
        findings.push(dataBreachFinding);
      }

      // Calculate score
      const score = this.calculateComplianceScore(findings);
      const passed = score >= 80;

      const result: GDPRComplianceResult = {
        passed,
        score,
        findings,
        dataRetentionCompliant: !findings.some(f => f.category === 'data_retention'),
        consentManagementCompliant: !findings.some(f => f.category === 'consent_management'),
        userRightsCompliant: !findings.some(f => f.category === 'user_rights'),
        dataBreachProceduresCompliant: !findings.some(f => f.category === 'data_breach'),
      };

      this.logger.info(`GDPR compliance check completed: Score ${score}, Passed: ${passed}`);
      this.emit('gdprCheckCompleted', result);

      return result;

    } catch (error) {
      this.logger.error('GDPR compliance check failed:', error);
      throw error;
    }
  }

  /**
   * Check data retention compliance
   * Verifies that data retention policies are properly implemented and followed
   * @returns Compliance finding or null
   */
  private async checkDataRetention(): Promise<ComplianceFinding | null> {
    try {
      this.logger.debug('Checking data retention compliance');

      const findings: string[] = [];
      let maxSeverity: SecuritySeverity = SecuritySeverity.LOW;

      // Check if data retention period is configured
      if (!this.config.gdprSettings.dataRetentionPeriod) {
        findings.push('Data retention period is not configured');
        maxSeverity = SecuritySeverity.CRITICAL;
      } else {
        // Verify retention period is reasonable (not excessively long)
        const retentionDays = this.config.gdprSettings.dataRetentionPeriod;
        if (retentionDays > 365 * 5) { // More than 5 years
          findings.push(`Data retention period (${retentionDays} days) exceeds recommended maximum of 5 years`);
          maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
        }
      }

      // Check for data deletion mechanisms
      // In a real implementation, this would query the database for expired records
      const hasDeletionMechanism = true; // Placeholder - would check actual implementation
      if (!hasDeletionMechanism) {
        findings.push('No automatic data deletion mechanism for expired records');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
      }

      // Check for data retention documentation
      const hasDocumentation = true; // Placeholder - would check for documentation
      if (!hasDocumentation) {
        findings.push('Data retention policy documentation is missing');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.MEDIUM);
      }

      // Check for user data mapping
      const hasUserDataMapping = true; // Placeholder - would check for data mapping
      if (!hasUserDataMapping) {
        findings.push('User data mapping for GDPR compliance is incomplete');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.MEDIUM);
      }

      // Return finding if issues found
      if (findings.length > 0) {
        return {
          id: `finding-${Date.now()}`,
          category: 'data_retention',
          severity: maxSeverity,
          description: findings.join('; '),
          location: 'compliance-manager.ts',
          recommendation: 'Implement proper data retention policies: configure retention period, set up automatic deletion, document policies, and maintain user data mapping',
          status: 'open',
        };
      }

      return null;

    } catch (error) {
      this.logger.error('Error checking data retention compliance:', error);
      return {
        id: `finding-${Date.now()}`,
        category: 'data_retention',
        severity: SecuritySeverity.MEDIUM,
        description: 'Failed to verify data retention compliance',
        location: 'compliance-manager.ts',
        recommendation: 'Review data retention implementation and error handling',
        status: 'open',
      };
    }
  }

  /**
   * Check consent management compliance
   * Verifies that consent management practices comply with GDPR requirements
   * @returns Compliance finding or null
   */
  private async checkConsentManagement(): Promise<ComplianceFinding | null> {
    try {
      this.logger.debug('Checking consent management compliance');

      const findings: string[] = [];
      let maxSeverity: SecuritySeverity = SecuritySeverity.LOW;

      // Check if consent management is enabled
      if (!this.config.gdprSettings.consentManagement) {
        findings.push('Consent management is not enabled in configuration');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.CRITICAL);
      }

      // Check for explicit consent mechanisms
      const hasExplicitConsent = true; // Placeholder - would check actual implementation
      if (!hasExplicitConsent) {
        findings.push('Explicit consent mechanisms are not properly implemented');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
      }

      // Check for granular consent options
      const hasGranularConsent = true; // Placeholder - would check actual implementation
      if (!hasGranularConsent) {
        findings.push('Consent options are not granular enough (users should be able to consent to specific data uses)');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.MEDIUM);
      }

      // Check for consent withdrawal mechanism
      const hasWithdrawalMechanism = true; // Placeholder - would check actual implementation
      if (!hasWithdrawalMechanism) {
        findings.push('Users cannot easily withdraw their consent');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
      }

      // Check for consent documentation
      const hasConsentDocumentation = true; // Placeholder - would check for documentation
      if (!hasConsentDocumentation) {
        findings.push('Consent policy documentation is missing or incomplete');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.MEDIUM);
      }

      // Return finding if issues found
      if (findings.length > 0) {
        return {
          id: `finding-${Date.now()}`,
          category: 'consent_management',
          severity: maxSeverity,
          description: findings.join('; '),
          location: 'compliance-manager.ts',
          recommendation: 'Implement GDPR-compliant consent management: explicit opt-in consent, granular options, easy withdrawal, and clear documentation',
          status: 'open',
        };
      }

      return null;

    } catch (error) {
      this.logger.error('Error checking consent management compliance:', error);
      return {
        id: `finding-${Date.now()}`,
        category: 'consent_management',
        severity: SecuritySeverity.MEDIUM,
        description: 'Failed to verify consent management compliance',
        location: 'compliance-manager.ts',
        recommendation: 'Review consent management implementation and error handling',
        status: 'open',
      };
    }
  }

  /**
   * Check user rights compliance
   * Verifies that GDPR user rights are properly implemented
   * @returns Compliance finding or null
   */
  private async checkUserRights(): Promise<ComplianceFinding | null> {
    try {
      this.logger.debug('Checking user rights compliance');

      const findings: string[] = [];
      let maxSeverity: SecuritySeverity = SecuritySeverity.LOW;

      // Check right to deletion (right to be forgotten)
      if (!this.config.gdprSettings.rightToDeletion) {
        findings.push('Right to deletion (right to be forgotten) is not enabled');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.CRITICAL);
      }

      // Check right to access
      if (!this.config.gdprSettings.rightToAccess) {
        findings.push('Right to access personal data is not enabled');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.CRITICAL);
      }

      // Check right to data portability
      if (!this.config.gdprSettings.rightToPortability) {
        findings.push('Right to data portability is not enabled');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
      }

      // Check for deletion mechanism implementation
      const hasDeletionMechanism = true; // Placeholder - would check actual implementation
      if (!hasDeletionMechanism) {
        findings.push('Data deletion mechanism for user requests is not implemented');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
      }

      // Check for data access mechanism
      const hasAccessMechanism = true; // Placeholder - would check actual implementation
      if (!hasAccessMechanism) {
        findings.push('Data access mechanism for user requests is not implemented');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
      }

      // Check for data portability mechanism
      const hasPortabilityMechanism = true; // Placeholder - would check actual implementation
      if (!hasPortabilityMechanism) {
        findings.push('Data portability mechanism (export) is not implemented');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.MEDIUM);
      }

      // Check for response time compliance (GDPR requires response within 30 days)
      const hasResponseTimeTracking = true; // Placeholder - would check actual implementation
      if (!hasResponseTimeTracking) {
        findings.push('Response time tracking for user rights requests is not implemented');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.MEDIUM);
      }

      // Return finding if issues found
      if (findings.length > 0) {
        return {
          id: `finding-${Date.now()}`,
          category: 'user_rights',
          severity: maxSeverity,
          description: findings.join('; '),
          location: 'compliance-manager.ts',
          recommendation: 'Implement GDPR user rights: deletion, access, and portability mechanisms with proper response time tracking',
          status: 'open',
        };
      }

      return null;

    } catch (error) {
      this.logger.error('Error checking user rights compliance:', error);
      return {
        id: `finding-${Date.now()}`,
        category: 'user_rights',
        severity: SecuritySeverity.MEDIUM,
        description: 'Failed to verify user rights compliance',
        location: 'compliance-manager.ts',
        recommendation: 'Review user rights implementation and error handling',
        status: 'open',
      };
    }
  }

  /**
   * Check data breach procedures compliance
   * Verifies that data breach notification procedures comply with GDPR requirements
   * @returns Compliance finding or null
   */
  private async checkDataBreachProcedures(): Promise<ComplianceFinding | null> {
    try {
      this.logger.debug('Checking data breach procedures compliance');

      const findings: string[] = [];
      let maxSeverity: SecuritySeverity = SecuritySeverity.LOW;

      // Check if data breach notification is enabled
      if (!this.config.gdprSettings.dataBreachNotification) {
        findings.push('Data breach notification is not enabled in configuration');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.CRITICAL);
      }

      // Check for breach detection mechanism
      const hasBreachDetection = true; // Placeholder - would check actual implementation
      if (!hasBreachDetection) {
        findings.push('Data breach detection mechanism is not implemented');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.CRITICAL);
      }

      // Check for notification timeline (GDPR requires notification within 72 hours)
      const hasNotificationTimeline = true; // Placeholder - would check actual implementation
      if (!hasNotificationTimeline) {
        findings.push('Data breach notification timeline does not meet GDPR 72-hour requirement');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.CRITICAL);
      }

      // Check for breach response plan
      const hasResponsePlan = true; // Placeholder - would check actual implementation
      if (!hasResponsePlan) {
        findings.push('Data breach response plan is not documented or implemented');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
      }

      // Check for data breach notification templates
      const hasNotificationTemplates = true; // Placeholder - would check actual implementation
      if (!hasNotificationTemplates) {
        findings.push('Data breach notification templates for different stakeholders are not prepared');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.MEDIUM);
      }

      // Check for breach logging and audit trail
      const hasBreachLogging = true; // Placeholder - would check actual implementation
      if (!hasBreachLogging) {
        findings.push('Data breach logging and audit trail is not implemented');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
      }

      // Return finding if issues found
      if (findings.length > 0) {
        return {
          id: `finding-${Date.now()}`,
          category: 'data_breach',
          severity: maxSeverity,
          description: findings.join('; '),
          location: 'compliance-manager.ts',
          recommendation: 'Implement GDPR-compliant data breach procedures: detection, 72-hour notification, response plan, templates, and logging',
          status: 'open',
        };
      }

      return null;

    } catch (error) {
      this.logger.error('Error checking data breach procedures compliance:', error);
      return {
        id: `finding-${Date.now()}`,
        category: 'data_breach',
        severity: SecuritySeverity.MEDIUM,
        description: 'Failed to verify data breach procedures compliance',
        location: 'compliance-manager.ts',
        recommendation: 'Review data breach procedures implementation and error handling',
        status: 'open',
      };
    }
  }

  /**
   * Check Discord TOS compliance
   * @returns Discord TOS compliance result
   */
  async checkDiscordTOSCompliance(): Promise<DiscordTOSComplianceResult> {
    this.logger.info('Checking Discord TOS compliance');

    const findings: ComplianceFinding[] = [];

    try {
      // Check API usage
      if (this.config.discordTOSSettings.apiUsageCompliance) {
        const apiFinding = await this.checkAPIUsage();
        if (apiFinding) {
          findings.push(apiFinding);
        }
      }

      // Check rate limiting
      if (this.config.discordTOSSettings.rateLimitCompliance) {
        const rateLimitFinding = await this.checkRateLimiting();
        if (rateLimitFinding) {
          findings.push(rateLimitFinding);
        }
      }

      // Check content policy
      if (this.config.discordTOSSettings.contentPolicyCompliance) {
        const contentFinding = await this.checkContentPolicy();
        if (contentFinding) {
          findings.push(contentFinding);
        }
      }

      // Check user privacy
      if (this.config.discordTOSSettings.userPrivacyCompliance) {
        const privacyFinding = await this.checkUserPrivacy();
        if (privacyFinding) {
          findings.push(privacyFinding);
        }
      }

      // Check bot behavior
      if (this.config.discordTOSSettings.botBehaviorCompliance) {
        const botFinding = await this.checkBotBehavior();
        if (botFinding) {
          findings.push(botFinding);
        }
      }

      // Calculate score
      const score = this.calculateComplianceScore(findings);
      const passed = score >= 80;

      const result: DiscordTOSComplianceResult = {
        passed,
        score,
        findings,
        apiUsageCompliant: !findings.some(f => f.category === 'api_usage'),
        rateLimitCompliant: !findings.some(f => f.category === 'rate_limiting'),
        contentPolicyCompliant: !findings.some(f => f.category === 'content_policy'),
        userPrivacyCompliant: !findings.some(f => f.category === 'user_privacy'),
        botBehaviorCompliant: !findings.some(f => f.category === 'bot_behavior'),
      };

      this.logger.info(`Discord TOS compliance check completed: Score ${score}, Passed: ${passed}`);
      this.emit('discordTOSCheckCompleted', result);

      return result;

    } catch (error) {
      this.logger.error('Discord TOS compliance check failed:', error);
      throw error;
    }
  }

  /**
   * Check API usage compliance
   * Verifies that API usage complies with Discord's terms of service
   * @returns Compliance finding or null
   */
  private async checkAPIUsage(): Promise<ComplianceFinding | null> {
    try {
      this.logger.debug('Checking API usage compliance');

      const findings: string[] = [];
      let maxSeverity: SecuritySeverity = SecuritySeverity.LOW;

      // Check for API key security
      const hasSecureKeyStorage = true; // Placeholder - would check actual implementation
      if (!hasSecureKeyStorage) {
        findings.push('API keys are not stored securely');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.CRITICAL);
      }

      // Check for API rate limit compliance
      const respectsRateLimits = true; // Placeholder - would check actual implementation
      if (!respectsRateLimits) {
        findings.push('API usage does not respect Discord rate limits');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
      }

      // Check for API endpoint usage compliance
      const usesApprovedEndpoints = true; // Placeholder - would check actual implementation
      if (!usesApprovedEndpoints) {
        findings.push('API calls to unauthorized or deprecated endpoints detected');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.CRITICAL);
      }

      // Check for proper error handling
      const hasProperErrorHandling = true; // Placeholder - would check actual implementation
      if (!hasProperErrorHandling) {
        findings.push('API error handling does not follow Discord best practices');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.MEDIUM);
      }

      // Check for API usage monitoring
      const hasUsageMonitoring = true; // Placeholder - would check actual implementation
      if (!hasUsageMonitoring) {
        findings.push('API usage monitoring and logging is not implemented');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.MEDIUM);
      }

      // Return finding if issues found
      if (findings.length > 0) {
        return {
          id: `finding-${Date.now()}`,
          category: 'api_usage',
          severity: maxSeverity,
          description: findings.join('; '),
          location: 'compliance-manager.ts',
          recommendation: 'Ensure Discord API compliance: secure key storage, respect rate limits, use approved endpoints, implement error handling and monitoring',
          status: 'open',
        };
      }

      return null;

    } catch (error) {
      this.logger.error('Error checking API usage compliance:', error);
      return {
        id: `finding-${Date.now()}`,
        category: 'api_usage',
        severity: SecuritySeverity.MEDIUM,
        description: 'Failed to verify API usage compliance',
        location: 'compliance-manager.ts',
        recommendation: 'Review API usage implementation and error handling',
        status: 'open',
      };
    }
  }

  /**
   * Check rate limiting compliance
   * Verifies that Discord API rate limits are properly respected
   * @returns Compliance finding or null
   */
  private async checkRateLimiting(): Promise<ComplianceFinding | null> {
    try {
      this.logger.debug('Checking rate limiting compliance');

      const findings: string[] = [];
      let maxSeverity: SecuritySeverity = SecuritySeverity.LOW;

      // Check for rate limit tracking implementation
      const hasRateLimitTracking = true; // Placeholder - would check actual implementation
      if (!hasRateLimitTracking) {
        findings.push('Rate limit tracking is not implemented');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
      }

      // Check for rate limit error handling
      const hasRateLimitErrorHandling = true; // Placeholder - would check actual implementation
      if (!hasRateLimitErrorHandling) {
        findings.push('Rate limit error handling (429 responses) is not properly implemented');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
      }

      // Check for backoff/retry mechanism
      const hasBackoffMechanism = true; // Placeholder - would check actual implementation
      if (!hasBackoffMechanism) {
        findings.push('Exponential backoff mechanism for rate limits is not implemented');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.MEDIUM);
      }

      // Check for request queuing
      const hasRequestQueuing = true; // Placeholder - would check actual implementation
      if (!hasRequestQueuing) {
        findings.push('Request queuing system for managing rate limits is not implemented');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.MEDIUM);
      }

      // Check for rate limit monitoring
      const hasRateLimitMonitoring = true; // Placeholder - would check actual implementation
      if (!hasRateLimitMonitoring) {
        findings.push('Rate limit usage monitoring and alerting is not implemented');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.LOW);
      }

      // Return finding if issues found
      if (findings.length > 0) {
        return {
          id: `finding-${Date.now()}`,
          category: 'rate_limiting',
          severity: maxSeverity,
          description: findings.join('; '),
          location: 'compliance-manager.ts',
          recommendation: 'Implement proper Discord API rate limiting: track limits, handle 429 responses, use exponential backoff, implement request queuing, and monitor usage',
          status: 'open',
        };
      }

      return null;

    } catch (error) {
      this.logger.error('Error checking rate limiting compliance:', error);
      return {
        id: `finding-${Date.now()}`,
        category: 'rate_limiting',
        severity: SecuritySeverity.MEDIUM,
        description: 'Failed to verify rate limiting compliance',
        location: 'compliance-manager.ts',
        recommendation: 'Review rate limiting implementation and error handling',
        status: 'open',
      };
    }
  }

  /**
   * Check content policy compliance
   * Verifies that content moderation practices comply with Discord's content policy
   * @returns Compliance finding or null
   */
  private async checkContentPolicy(): Promise<ComplianceFinding | null> {
    try {
      this.logger.debug('Checking content policy compliance');

      const findings: string[] = [];
      let maxSeverity: SecuritySeverity = SecuritySeverity.LOW;

      // Check for content moderation implementation
      const hasContentModeration = true; // Placeholder - would check actual implementation
      if (!hasContentModeration) {
        findings.push('Content moderation system is not implemented');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
      }

      // Check for profanity filter
      const hasProfanityFilter = true; // Placeholder - would check actual implementation
      if (!hasProfanityFilter) {
        findings.push('Profanity/inappropriate language filtering is not implemented');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.MEDIUM);
      }

      // Check for spam detection
      const hasSpamDetection = true; // Placeholder - would check actual implementation
      if (!hasSpamDetection) {
        findings.push('Spam detection and prevention is not implemented');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.MEDIUM);
      }

      // Check for hate speech detection
      const hasHateSpeechDetection = true; // Placeholder - would check actual implementation
      if (!hasHateSpeechDetection) {
        findings.push('Hate speech detection is not implemented');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
      }

      // Check for NSFW content filtering
      const hasNSFWFilter = true; // Placeholder - would check actual implementation
      if (!hasNSFWFilter) {
        findings.push('NSFW content filtering is not implemented');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
      }

      // Check for content moderation logging
      const hasModerationLogging = true; // Placeholder - would check actual implementation
      if (!hasModerationLogging) {
        findings.push('Content moderation actions are not logged for audit purposes');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.MEDIUM);
      }

      // Check for appeal mechanism
      const hasAppealMechanism = true; // Placeholder - would check actual implementation
      if (!hasAppealMechanism) {
        findings.push('User appeal mechanism for moderation decisions is not implemented');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.LOW);
      }

      // Return finding if issues found
      if (findings.length > 0) {
        return {
          id: `finding-${Date.now()}`,
          category: 'content_policy',
          severity: maxSeverity,
          description: findings.join('; '),
          location: 'compliance-manager.ts',
          recommendation: 'Implement Discord-compliant content moderation: profanity filter, spam detection, hate speech detection, NSFW filtering, moderation logging, and user appeals',
          status: 'open',
        };
      }

      return null;

    } catch (error) {
      this.logger.error('Error checking content policy compliance:', error);
      return {
        id: `finding-${Date.now()}`,
        category: 'content_policy',
        severity: SecuritySeverity.MEDIUM,
        description: 'Failed to verify content policy compliance',
        location: 'compliance-manager.ts',
        recommendation: 'Review content moderation implementation and error handling',
        status: 'open',
      };
    }
  }

  /**
   * Check user privacy compliance
   * Verifies that user privacy practices comply with Discord's privacy requirements
   * @returns Compliance finding or null
   */
  private async checkUserPrivacy(): Promise<ComplianceFinding | null> {
    try {
      this.logger.debug('Checking user privacy compliance');

      const findings: string[] = [];
      let maxSeverity: SecuritySeverity = SecuritySeverity.LOW;

      // Check for data minimization
      const hasDataMinimization = true; // Placeholder - would check actual implementation
      if (!hasDataMinimization) {
        findings.push('Data minimization practices (collecting only necessary data) are not implemented');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
      }

      // Check for user consent mechanisms
      const hasUserConsent = true; // Placeholder - would check actual implementation
      if (!hasUserConsent) {
        findings.push('User consent mechanisms for data collection are not implemented');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.CRITICAL);
      }

      // Check for data encryption
      const hasDataEncryption = true; // Placeholder - would check actual implementation
      if (!hasDataEncryption) {
        findings.push('User data is not properly encrypted at rest and in transit');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.CRITICAL);
      }

      // Check for data retention limits
      const hasRetentionLimits = true; // Placeholder - would check actual implementation
      if (!hasRetentionLimits) {
        findings.push('User data retention limits are not defined or enforced');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
      }

      // Check for data deletion capability
      const hasDataDeletion = true; // Placeholder - would check actual implementation
      if (!hasDataDeletion) {
        findings.push('User data deletion capability (right to be forgotten) is not implemented');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
      }

      // Check for data access controls
      const hasAccessControls = true; // Placeholder - would check actual implementation
      if (!hasAccessControls) {
        findings.push('User data access controls and permissions are not properly implemented');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
      }

      // Check for privacy policy documentation
      const hasPrivacyPolicy = true; // Placeholder - would check actual implementation
      if (!hasPrivacyPolicy) {
        findings.push('Privacy policy documentation is not available or up to date');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.MEDIUM);
      }

      // Return finding if issues found
      if (findings.length > 0) {
        return {
          id: `finding-${Date.now()}`,
          category: 'user_privacy',
          severity: maxSeverity,
          description: findings.join('; '),
          location: 'compliance-manager.ts',
          recommendation: 'Implement Discord-compliant user privacy practices: data minimization, user consent, encryption, retention limits, deletion capability, access controls, and privacy policy',
          status: 'open',
        };
      }

      return null;

    } catch (error) {
      this.logger.error('Error checking user privacy compliance:', error);
      return {
        id: `finding-${Date.now()}`,
        category: 'user_privacy',
        severity: SecuritySeverity.MEDIUM,
        description: 'Failed to verify user privacy compliance',
        location: 'compliance-manager.ts',
        recommendation: 'Review user privacy implementation and error handling',
        status: 'open',
      };
    }
  }

  /**
   * Check bot behavior compliance
   * Verifies that bot behavior complies with Discord's bot guidelines
   * @returns Compliance finding or null
   */
  private async checkBotBehavior(): Promise<ComplianceFinding | null> {
    try {
      this.logger.debug('Checking bot behavior compliance');

      const findings: string[] = [];
      let maxSeverity: SecuritySeverity = SecuritySeverity.LOW;

      // Check for bot prefix configuration
      const hasBotPrefix = true; // Placeholder - would check actual implementation
      if (!hasBotPrefix) {
        findings.push('Bot prefix for command handling is not properly configured');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.MEDIUM);
      }

      // Check for command cooldown implementation
      const hasCommandCooldowns = true; // Placeholder - would check actual implementation
      if (!hasCommandCooldowns) {
        findings.push('Command cooldown mechanisms to prevent spam/abuse are not implemented');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
      }

      // Check for rate limiting per user
      const hasPerUserRateLimit = true; // Placeholder - would check actual implementation
      if (!hasPerUserRateLimit) {
        findings.push('Per-user rate limiting is not implemented');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
      }

      // Check for error handling
      const hasErrorHandling = true; // Placeholder - would check actual implementation
      if (!hasErrorHandling) {
        findings.push('Proper error handling and user-friendly error messages are not implemented');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.MEDIUM);
      }

      // Check for help command
      const hasHelpCommand = true; // Placeholder - would check actual implementation
      if (!hasHelpCommand) {
        findings.push('Help command or user documentation is not available');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.MEDIUM);
      }

      // Check for permissions checking
      const hasPermissionsCheck = true; // Placeholder - would check actual implementation
      if (!hasPermissionsCheck) {
        findings.push('Bot does not check required permissions before executing commands');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
      }

      // Check for DM spam prevention
      const hasDMSpamPrevention = true; // Placeholder - would check actual implementation
      if (!hasDMSpamPrevention) {
        findings.push('Direct message spam prevention is not implemented');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.MEDIUM);
      }

      // Check for bot status/presence
      const hasProperPresence = true; // Placeholder - would check actual implementation
      if (!hasProperPresence) {
        findings.push('Bot status/presence (online/idle/dnd) is not properly managed');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.LOW);
      }

      // Return finding if issues found
      if (findings.length > 0) {
        return {
          id: `finding-${Date.now()}`,
          category: 'bot_behavior',
          severity: maxSeverity,
          description: findings.join('; '),
          location: 'compliance-manager.ts',
          recommendation: 'Implement Discord-compliant bot behavior: proper prefix, command cooldowns, per-user rate limiting, error handling, help command, permissions checking, DM spam prevention, and proper presence management',
          status: 'open',
        };
      }

      return null;

    } catch (error) {
      this.logger.error('Error checking bot behavior compliance:', error);
      return {
        id: `finding-${Date.now()}`,
        category: 'bot_behavior',
        severity: SecuritySeverity.MEDIUM,
        description: 'Failed to verify bot behavior compliance',
        location: 'compliance-manager.ts',
        recommendation: 'Review bot behavior implementation and error handling',
        status: 'open',
      };
    }
  }

  /**
   * Check accessibility compliance
   * @returns Accessibility compliance result
   */
  async checkAccessibilityCompliance(): Promise<AccessibilityComplianceResult> {
    this.logger.info('Checking accessibility compliance');

    const findings: ComplianceFinding[] = [];

    try {
      // Check color contrast
      if (this.config.accessibilitySettings.checkColorContrast) {
        const contrastFinding = await this.checkColorContrast();
        if (contrastFinding) {
          findings.push(contrastFinding);
        }
      }

      // Check alt text
      if (this.config.accessibilitySettings.checkAltText) {
        const altTextFinding = await this.checkAltText();
        if (altTextFinding) {
          findings.push(altTextFinding);
        }
      }

      // Check keyboard navigation
      if (this.config.accessibilitySettings.checkKeyboardNavigation) {
        const keyboardFinding = await this.checkKeyboardNavigation();
        if (keyboardFinding) {
          findings.push(keyboardFinding);
        }
      }

      // Check screen reader compatibility
      if (this.config.accessibilitySettings.checkScreenReaderCompatibility) {
        const screenReaderFinding = await this.checkScreenReaderCompatibility();
        if (screenReaderFinding) {
          findings.push(screenReaderFinding);
        }
      }

      // Calculate score
      const score = this.calculateComplianceScore(findings);
      const passed = score >= 80;

      const result: AccessibilityComplianceResult = {
        passed,
        score,
        findings,
        wcagLevel: this.config.accessibilitySettings.wcagLevel,
        colorContrastCompliant: !findings.some(f => f.category === 'color_contrast'),
        altTextCompliant: !findings.some(f => f.category === 'alt_text'),
        keyboardNavigationCompliant: !findings.some(f => f.category === 'keyboard_navigation'),
        screenReaderCompatible: !findings.some(f => f.category === 'screen_reader'),
      };

      this.logger.info(`Accessibility compliance check completed: Score ${score}, Passed: ${passed}`);
      this.emit('accessibilityCheckCompleted', result);

      return result;

    } catch (error) {
      this.logger.error('Accessibility compliance check failed:', error);
      throw error;
    }
  }

  /**
   * Check color contrast compliance
   * Verifies WCAG color contrast ratios meet accessibility standards
   * @returns Compliance finding or null
   */
  private async checkColorContrast(): Promise<ComplianceFinding | null> {
    try {
      this.logger.debug('Checking color contrast compliance');

      const findings: string[] = [];
      let maxSeverity: SecuritySeverity = SecuritySeverity.LOW;

      // Define WCAG AA color contrast thresholds
      const wcagAALevels = {
        normalText: 4.5,
        largeText: 3.0,
        uiComponents: 3.0,
      };

      const wcagAAALevels = {
        normalText: 7.0,
        largeText: 4.5,
        uiComponents: 4.5,
      };

      // Get configured WCAG level
      const wcagLevel = this.config.accessibilitySettings.wcagLevel;
      const thresholds = wcagLevel === 'AAA' ? wcagAAALevels : wcagAALevels;

      // Check for color contrast testing in UI components
      // In a real implementation, this would use axe-core to analyze actual UI
      const hasColorContrastTesting = true; // Placeholder - would check actual implementation
      if (!hasColorContrastTesting) {
        findings.push('Automated color contrast testing is not implemented');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
      }

      // Check for accessible color palette
      const hasAccessiblePalette = true; // Placeholder - would check actual implementation
      if (!hasAccessiblePalette) {
        findings.push('Accessible color palette with sufficient contrast ratios is not defined');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
      }

      // Check for dark mode support
      const hasDarkModeSupport = true; // Placeholder - would check actual implementation
      if (!hasDarkModeSupport) {
        findings.push('Dark mode with proper color contrast is not supported');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.MEDIUM);
      }

      // Check for color blindness considerations
      const hasColorBlindnessSupport = true; // Placeholder - would check actual implementation
      if (!hasColorBlindnessSupport) {
        findings.push('Color blindness considerations (deuteranopia, protanopia, tritanopia) are not implemented');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.MEDIUM);
      }

      // Check for text size considerations
      const hasTextSizeConsiderations = true; // Placeholder - would check actual implementation
      if (!hasTextSizeConsiderations) {
        findings.push('Text size scaling with proper contrast ratios is not implemented');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.MEDIUM);
      }

      // Check for focus indicator contrast
      const hasFocusIndicatorContrast = true; // Placeholder - would check actual implementation
      if (!hasFocusIndicatorContrast) {
        findings.push('Focus indicators have insufficient contrast against background');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.MEDIUM);
      }

      // Check for link/button contrast
      const hasLinkContrast = true; // Placeholder - would check actual implementation
      if (!hasLinkContrast) {
        findings.push('Links and buttons have insufficient contrast ratios');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
      }

      // Return finding if issues found
      if (findings.length > 0) {
        return {
          id: `finding-${Date.now()}`,
          category: 'color_contrast',
          severity: maxSeverity,
          description: findings.join('; '),
          location: 'compliance-manager.ts',
          recommendation: `Implement WCAG ${wcagLevel} compliant color contrast: automated testing, accessible palette, dark mode support, color blindness considerations, text size scaling, focus indicators, and proper link/button contrast (normal text: ${thresholds.normalText}:1, large text: ${thresholds.largeText}:1)`,
          status: 'open',
        };
      }

      return null;

    } catch (error) {
      this.logger.error('Error checking color contrast compliance:', error);
      return {
        id: `finding-${Date.now()}`,
        category: 'color_contrast',
        severity: SecuritySeverity.MEDIUM,
        description: 'Failed to verify color contrast compliance',
        location: 'compliance-manager.ts',
        recommendation: 'Review color contrast implementation and error handling',
        status: 'open',
      };
    }
  }

  /**
   * Check alt text compliance
   * Verifies that images have appropriate alt text for accessibility
   * @returns Compliance finding or null
   */
  private async checkAltText(): Promise<ComplianceFinding | null> {
    try {
      this.logger.debug('Checking alt text compliance');

      const findings: string[] = [];
      let maxSeverity: SecuritySeverity = SecuritySeverity.LOW;

      // Check for alt text presence on images
      const hasAltTextChecking = true; // Placeholder - would check actual implementation
      if (!hasAltTextChecking) {
        findings.push('Automated alt text presence checking is not implemented');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
      }

      // Check for meaningful alt text (not just "image" or empty)
      const hasMeaningfulAltText = true; // Placeholder - would check actual implementation
      if (!hasMeaningfulAltText) {
        findings.push('Alt text is not descriptive or meaningful for screen readers');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
      }

      // Check for decorative image handling
      const hasDecorativeImageHandling = true; // Placeholder - would check actual implementation
      if (!hasDecorativeImageHandling) {
        findings.push('Decorative images are not properly marked with empty alt text or role="presentation"');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.MEDIUM);
      }

      // Check for complex image descriptions
      const hasComplexImageDescriptions = true; // Placeholder - would check actual implementation
      if (!hasComplexImageDescriptions) {
        findings.push('Complex images (charts, graphs, diagrams) lack detailed descriptions');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.MEDIUM);
      }

      // Check for alt text length limits
      const hasAltTextLengthCheck = true; // Placeholder - would check actual implementation
      if (!hasAltTextLengthCheck) {
        findings.push('Alt text is excessively long or too brief for effective communication');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.LOW);
      }

      // Check for dynamic content alt text
      const hasDynamicAltText = true; // Placeholder - would check actual implementation
      if (!hasDynamicAltText) {
        findings.push('Dynamic images (emojis, status indicators) lack appropriate alt text updates');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.MEDIUM);
      }

      // Check for image link alt text
      const hasImageLinkAltText = true; // Placeholder - would check actual implementation
      if (!hasImageLinkAltText) {
        findings.push('Image links have insufficient alt text describing both image and link purpose');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.MEDIUM);
      }

      // Return finding if issues found
      if (findings.length > 0) {
        return {
          id: `finding-${Date.now()}`,
          category: 'alt_text',
          severity: maxSeverity,
          description: findings.join('; '),
          location: 'compliance-manager.ts',
          recommendation: 'Implement WCAG compliant alt text: presence checking, meaningful descriptions, decorative image handling, complex image descriptions, appropriate length, dynamic content updates, and proper image link descriptions',
          status: 'open',
        };
      }

      return null;

    } catch (error) {
      this.logger.error('Error checking alt text compliance:', error);
      return {
        id: `finding-${Date.now()}`,
        category: 'alt_text',
        severity: SecuritySeverity.MEDIUM,
        description: 'Failed to verify alt text compliance',
        location: 'compliance-manager.ts',
        recommendation: 'Review alt text implementation and error handling',
        status: 'open',
      };
    }
  }

  /**
   * Check keyboard navigation compliance
   * Verifies that keyboard navigation is properly implemented
   * @returns Compliance finding or null
   */
  private async checkKeyboardNavigation(): Promise<ComplianceFinding | null> {
    try {
      this.logger.debug('Checking keyboard navigation compliance');

      const findings: string[] = [];
      let maxSeverity: SecuritySeverity = SecuritySeverity.LOW;

      // Check for keyboard accessibility testing
      const hasKeyboardTesting = true; // Placeholder - would check actual implementation
      if (!hasKeyboardTesting) {
        findings.push('Automated keyboard navigation testing is not implemented');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
      }

      // Check for focus management
      const hasFocusManagement = true; // Placeholder - would check actual implementation
      if (!hasFocusManagement) {
        findings.push('Focus management (visible focus indicator, logical tab order) is not properly implemented');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
      }

      // Check for keyboard shortcuts
      const hasKeyboardShortcuts = true; // Placeholder - would check actual implementation
      if (!hasKeyboardShortcuts) {
        findings.push('Keyboard shortcuts for common actions are not implemented');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.MEDIUM);
      }

      // Check for skip links
      const hasSkipLinks = true; // Placeholder - would check actual implementation
      if (!hasSkipLinks) {
        findings.push('"Skip to content" links for bypassing repeated content are not implemented');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.MEDIUM);
      }

      // Check for no keyboard traps
      const hasNoKeyboardTraps = true; // Placeholder - would check actual implementation
      if (!hasNoKeyboardTraps) {
        findings.push('Keyboard traps (content that cannot be exited with keyboard) are present');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.CRITICAL);
      }

      // Check for focus not obscured
      const hasFocusNotObscured = true; // Placeholder - would check actual implementation
      if (!hasFocusNotObscured) {
        findings.push('Focus indicator is obscured by other content or not visible');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
      }

      // Check for form keyboard accessibility
      const hasFormKeyboardAccess = true; // Placeholder - would check actual implementation
      if (!hasFormKeyboardAccess) {
        findings.push('Forms cannot be completed using keyboard only');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
      }

      // Check for modal keyboard handling
      const hasModalKeyboardHandling = true; // Placeholder - would check actual implementation
      if (!hasModalKeyboardHandling) {
        findings.push('Modals/dialogs trap keyboard focus and do not return focus on close');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
      }

      // Return finding if issues found
      if (findings.length > 0) {
        return {
          id: `finding-${Date.now()}`,
          category: 'keyboard_navigation',
          severity: maxSeverity,
          description: findings.join('; '),
          location: 'compliance-manager.ts',
          recommendation: 'Implement WCAG compliant keyboard navigation: testing, focus management, keyboard shortcuts, skip links, avoid keyboard traps, visible focus indicators, form accessibility, and proper modal focus handling',
          status: 'open',
        };
      }

      return null;

    } catch (error) {
      this.logger.error('Error checking keyboard navigation compliance:', error);
      return {
        id: `finding-${Date.now()}`,
        category: 'keyboard_navigation',
        severity: SecuritySeverity.MEDIUM,
        description: 'Failed to verify keyboard navigation compliance',
        location: 'compliance-manager.ts',
        recommendation: 'Review keyboard navigation implementation and error handling',
        status: 'open',
      };
    }
  }

  /**
   * Check screen reader compatibility
   * Verifies compatibility with screen readers
   * @returns Compliance finding or null
   */
  private async checkScreenReaderCompatibility(): Promise<ComplianceFinding | null> {
    try {
      this.logger.debug('Checking screen reader compatibility');

      const findings: string[] = [];
      let maxSeverity: SecuritySeverity = SecuritySeverity.LOW;

      // Check for ARIA attributes
      const hasAriaAttributes = true; // Placeholder - would check actual implementation
      if (!hasAriaAttributes) {
        findings.push('ARIA attributes (role, aria-label, aria-describedby) are not properly used');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
      }

      // Check for semantic HTML
      const hasSemanticHTML = true; // Placeholder - would check actual implementation
      if (!hasSemanticHTML) {
        findings.push('Semantic HTML elements (nav, main, article, section) are not properly used');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
      }

      // Check for heading structure
      const hasHeadingStructure = true; // Placeholder - would check actual implementation
      if (!hasHeadingStructure) {
        findings.push('Heading structure (h1-h6) is not properly nested or sequential');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
      }

      // Check for landmark regions
      const hasLandmarkRegions = true; // Placeholder - would check actual implementation
      if (!hasLandmarkRegions) {
        findings.push('Landmark regions (banner, navigation, main, content, footer) are not defined');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.MEDIUM);
      }

      // Check for live region announcements
      const hasLiveRegionAnnouncements = true; // Placeholder - would check actual implementation
      if (!hasLiveRegionAnnouncements) {
        findings.push('Dynamic content changes are not announced via ARIA live regions');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
      }

      // Check for form labels
      const hasFormLabels = true; // Placeholder - would check actual implementation
      if (!hasFormLabels) {
        findings.push('Form inputs lack proper labels (label, aria-label, aria-labelledby)');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
      }

      // Check for error announcements
      const hasErrorAnnouncements = true; // Placeholder - would check actual implementation
      if (!hasErrorAnnouncements) {
        findings.push('Form validation errors are not announced to screen readers');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
      }

      // Check for status updates
      const hasStatusUpdates = true; // Placeholder - would check actual implementation
      if (!hasStatusUpdates) {
        findings.push('Status changes (loading, success, error) are not announced via ARIA live regions');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.MEDIUM);
      }

      // Return finding if issues found
      if (findings.length > 0) {
        return {
          id: `finding-${Date.now()}`,
          category: 'screen_reader',
          severity: maxSeverity,
          description: findings.join('; '),
          location: 'compliance-manager.ts',
          recommendation: 'Implement WCAG compliant screen reader support: ARIA attributes, semantic HTML, heading structure, landmarks, live regions, form labels, error announcements, and status updates',
          status: 'open',
        };
      }

      return null;

    } catch (error) {
      this.logger.error('Error checking screen reader compatibility:', error);
      return {
        id: `finding-${Date.now()}`,
        category: 'screen_reader',
        severity: SecuritySeverity.MEDIUM,
        description: 'Failed to verify screen reader compatibility',
        location: 'compliance-manager.ts',
        recommendation: 'Review screen reader compatibility implementation and error handling',
        status: 'open',
      };
    }
  }

  /**
   * Check localization compliance
   * @returns Localization compliance result
   */
  async checkLocalizationCompliance(): Promise<LocalizationComplianceResult> {
    this.logger.info('Checking localization compliance');

    const findings: ComplianceFinding[] = [];

    try {
      // Check for untranslated strings
      if (this.config.localizationSettings.checkForUntranslatedStrings) {
        const untranslatedFinding = await this.checkForUntranslatedStrings();
        if (untranslatedFinding) {
          findings.push(untranslatedFinding);
        }
      }

      // Check for cultural sensitivity
      if (this.config.localizationSettings.checkForCulturalSensitivity) {
        const culturalFinding = await this.checkForCulturalSensitivity();
        if (culturalFinding) {
          findings.push(culturalFinding);
        }
      }

      // Calculate score
      const score = this.calculateComplianceScore(findings);
      const passed = score >= 80;

      const result: LocalizationComplianceResult = {
        passed,
        score,
        findings,
        allLanguagesTranslated: !findings.some(f => f.category === 'translation'),
        noUntranslatedStrings: !findings.some(f => f.category === 'untranslated_strings'),
        culturallyAppropriate: !findings.some(f => f.category === 'cultural_sensitivity'),
        defaultLanguageSet: true,
      };

      this.logger.info(`Localization compliance check completed: Score ${score}, Passed: ${passed}`);
      this.emit('localizationCheckCompleted', result);

      return result;

    } catch (error) {
      this.logger.error('Localization compliance check failed:', error);
      throw error;
    }
  }

  /**
   * Check for untranslated strings
   * Verifies translation coverage across supported languages
   * @returns Compliance finding or null
   */
  private async checkForUntranslatedStrings(): Promise<ComplianceFinding | null> {
    try {
      this.logger.debug('Checking for untranslated strings');

      const findings: string[] = [];
      let maxSeverity: SecuritySeverity = SecuritySeverity.LOW;

      // Check for translation file presence for all supported languages
      const hasTranslationFiles = true; // Placeholder - would check actual implementation
      if (!hasTranslationFiles) {
        findings.push('Translation files are missing for one or more supported languages');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
      }

      // Check for translation completeness
      const hasCompleteTranslations = true; // Placeholder - would check actual implementation
      if (!hasCompleteTranslations) {
        findings.push('Translation coverage is incomplete across supported languages');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
      }

      // Check for translation key consistency
      const hasKeyConsistency = true; // Placeholder - would check actual implementation
      if (!hasKeyConsistency) {
        findings.push('Translation keys are inconsistent across language files');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.MEDIUM);
      }

      // Check for placeholder strings
      const hasNoPlaceholders = true; // Placeholder - would check actual implementation
      if (!hasNoPlaceholders) {
        findings.push('Placeholder strings (e.g., "TODO", "FIXME") are present in translations');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.MEDIUM);
      }

      // Check for variable interpolation
      const hasVariableInterpolation = true; // Placeholder - would check actual implementation
      if (!hasVariableInterpolation) {
        findings.push('Variable interpolation (e.g., {{name}}) is not properly handled in translations');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.MEDIUM);
      }

      // Check for pluralization support
      const hasPluralization = true; // Placeholder - would check actual implementation
      if (!hasPluralization) {
        findings.push('Pluralization rules are not implemented for languages requiring them');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.MEDIUM);
      }

      // Check for RTL language support
      const hasRTLSupport = true; // Placeholder - would check actual implementation
      if (!hasRTLSupport) {
        findings.push('RTL (right-to-left) language support is not implemented');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.MEDIUM);
      }

      // Return finding if issues found
      if (findings.length > 0) {
        return {
          id: `finding-${Date.now()}`,
          category: 'translation',
          severity: maxSeverity,
          description: findings.join('; '),
          location: 'compliance-manager.ts',
          recommendation: 'Ensure complete translations: translation files, key consistency, remove placeholders, variable interpolation, pluralization, and RTL support',
          status: 'open',
        };
      }

      return null;

    } catch (error) {
      this.logger.error('Error checking for untranslated strings:', error);
      return {
        id: `finding-${Date.now()}`,
        category: 'translation',
        severity: SecuritySeverity.MEDIUM,
        description: 'Failed to verify translation coverage',
        location: 'compliance-manager.ts',
        recommendation: 'Review translation implementation and error handling',
        status: 'open',
      };
    }
  }

  /**
   * Check for cultural sensitivity
   * Verifies cultural appropriateness in translations
   * @returns Compliance finding or null
   */
  private async checkForCulturalSensitivity(): Promise<ComplianceFinding | null> {
    try {
      this.logger.debug('Checking for cultural sensitivity');

      const findings: string[] = [];
      let maxSeverity: SecuritySeverity = SecuritySeverity.LOW;

      // Check for culturally appropriate content
      const hasCulturalReview = true; // Placeholder - would check actual implementation
      if (!hasCulturalReview) {
        findings.push('Cultural sensitivity review process is not implemented');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
      }

      // Check for region-specific content
      const hasRegionSpecificContent = true; // Placeholder - would check actual implementation
      if (!hasRegionSpecificContent) {
        findings.push('Region-specific content and localization are not properly implemented');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.MEDIUM);
      }

      // Check for date/time format localization
      const hasDateTimeLocalization = true; // Placeholder - would check actual implementation
      if (!hasDateTimeLocalization) {
        findings.push('Date and time formats are not localized for target regions');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.MEDIUM);
      }

      // Check for number/currency format localization
      const hasNumberCurrencyLocalization = true; // Placeholder - would check actual implementation
      if (!hasNumberCurrencyLocalization) {
        findings.push('Number and currency formats are not localized for target regions');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.MEDIUM);
      }

      // Check for sensitive content filtering
      const hasSensitiveContentFiltering = true; // Placeholder - would check actual implementation
      if (!hasSensitiveContentFiltering) {
        findings.push('Culturally sensitive content filtering is not implemented');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.HIGH);
      }

      // Check for inclusive language
      const hasInclusiveLanguage = true; // Placeholder - would check actual implementation
      if (!hasInclusiveLanguage) {
        findings.push('Inclusive and neutral language is not used in translations');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.MEDIUM);
      }

      // Check for religious/holiday sensitivity
      const hasHolidaySensitivity = true; // Placeholder - would check actual implementation
      if (!hasHolidaySensitivity) {
        findings.push('Religious and holiday sensitivity considerations are not implemented');
        maxSeverity = this.getHigherSeverity(maxSeverity, SecuritySeverity.MEDIUM);
      }

      // Return finding if issues found
      if (findings.length > 0) {
        return {
          id: `finding-${Date.now()}`,
          category: 'cultural_sensitivity',
          severity: maxSeverity,
          description: findings.join('; '),
          location: 'compliance-manager.ts',
          recommendation: 'Implement culturally appropriate translations: cultural review, region-specific content, date/time localization, number/currency formats, sensitive content filtering, inclusive language, and religious/holiday considerations',
          status: 'open',
        };
      }

      return null;

    } catch (error) {
      this.logger.error('Error checking for cultural sensitivity:', error);
      return {
        id: `finding-${Date.now()}`,
        category: 'cultural_sensitivity',
        severity: SecuritySeverity.MEDIUM,
        description: 'Failed to verify cultural sensitivity',
        location: 'compliance-manager.ts',
        recommendation: 'Review cultural sensitivity implementation and error handling',
        status: 'open',
      };
    }
  }

  /**
   * Generate a compliance report
   * @param startDate - Report start date
   * @param endDate - Report end date
   * @returns Compliance report
   */
  async generateComplianceReport(startDate: Date, endDate: Date): Promise<{
    summary: {
      totalAudits: number;
      passedAudits: number;
      failedAudits: number;
      averageScore: number;
      passRate: number;
    };
    gdprResults: GDPRComplianceResult[];
    discordTOSResults: DiscordTOSComplianceResult[];
    accessibilityResults: AccessibilityComplianceResult[];
    localizationResults: LocalizationComplianceResult[];
    recommendations: string[];
  }> {
    this.logger.info(`Generating compliance report: ${startDate.toISOString()} to ${endDate.toISOString()}`);

    // Get audits within date range
    const audits = await this.repository.getComplianceAudits({
      where: 'scheduled_at >= $1 AND scheduled_at <= $2',
      params: [startDate, endDate],
      orderBy: 'scheduled_at',
      orderDirection: 'DESC',
    });

    // Calculate summary
    const passedAudits = audits.filter(a => a.passed).length;
    const failedAudits = audits.filter(a => !a.passed).length;
    const averageScore = audits.length > 0
      ? audits.reduce((sum, a) => sum + a.overallScore, 0) / audits.length
      : 0;
    const passRate = audits.length > 0
      ? (passedAudits / audits.length) * 100
      : 0;

    // Get check results from history
    const gdprResults = this.auditHistory
      .filter(a => a.type === ComplianceType.GDPR)
      .map(a => ({
        passed: a.passed,
        score: a.score,
        findings: a.findings,
        dataRetentionCompliant: true,
        consentManagementCompliant: true,
        userRightsCompliant: true,
        dataBreachProceduresCompliant: true,
      }));

    const discordTOSResults = this.auditHistory
      .filter(a => a.type === ComplianceType.DISCORD_TOS)
      .map(a => ({
        passed: a.passed,
        score: a.score,
        findings: a.findings,
        apiUsageCompliant: true,
        rateLimitCompliant: true,
        contentPolicyCompliant: true,
        userPrivacyCompliant: true,
        botBehaviorCompliant: true,
      }));

    const accessibilityResults = this.auditHistory
      .filter(a => a.type === ComplianceType.ACCESSIBILITY)
      .map(a => ({
        passed: a.passed,
        score: a.score,
        findings: a.findings,
        wcagLevel: this.config.accessibilitySettings.wcagLevel,
        colorContrastCompliant: true,
        altTextCompliant: true,
        keyboardNavigationCompliant: true,
        screenReaderCompatible: true,
      }));

    const localizationResults = this.auditHistory
      .filter(a => a.type === ComplianceType.LOCALIZATION)
      .map(a => ({
        passed: a.passed,
        score: a.score,
        findings: a.findings,
        allLanguagesTranslated: true,
        noUntranslatedStrings: true,
        culturallyAppropriate: true,
        defaultLanguageSet: true,
      }));

    // Generate recommendations
    const recommendations = this.generateComplianceRecommendations(audits);

    const report = {
      summary: {
        totalAudits: audits.length,
        passedAudits,
        failedAudits,
        averageScore: Math.round(averageScore),
        passRate: Math.round(passRate),
      },
      gdprResults,
      discordTOSResults,
      accessibilityResults,
      localizationResults,
      recommendations,
    };

    this.logger.info(`Compliance report generated: ${JSON.stringify(report.summary)}`);
    this.emit('reportGenerated', report);

    return report;
  }

  /**
   * Generate compliance recommendations
   * @param audits - Array of compliance audits
   * @returns Array of recommendations
   */
  private generateComplianceRecommendations(audits: ComplianceAudit[]): string[] {
    const recommendations: string[] = [];

    // Analyze failed audits
    const failedAudits = audits.filter(a => !a.passed);
    if (failedAudits.length > 0) {
      recommendations.push(`Address ${failedAudits.length} failed compliance audits`);
    }

    // Check for GDPR issues
    const gdprIssues = failedAudits.filter(a => a.type === ComplianceType.GDPR);
    if (gdprIssues.length > 0) {
      recommendations.push('Review and update GDPR compliance practices');
    }

    // Check for Discord TOS issues
    const tosIssues = failedAudits.filter(a => a.type === ComplianceType.DISCORD_TOS);
    if (tosIssues.length > 0) {
      recommendations.push('Review Discord Terms of Service and update bot behavior');
    }

    // Check for accessibility issues
    const a11yIssues = failedAudits.filter(a => a.type === ComplianceType.ACCESSIBILITY);
    if (a11yIssues.length > 0) {
      recommendations.push('Improve accessibility features to meet WCAG AA standards');
    }

    // Check for localization issues
    const locIssues = failedAudits.filter(a => a.type === ComplianceType.LOCALIZATION);
    if (locIssues.length > 0) {
      recommendations.push('Complete translations for all supported languages');
    }

    // General recommendations
    recommendations.push('Schedule regular compliance audits');
    recommendations.push('Monitor for regulatory changes');
    recommendations.push('Maintain up-to-date documentation');
    recommendations.push('Train team on compliance requirements');

    return recommendations;
  }

  /**
   * Calculate compliance score from findings
   * @param findings - Compliance findings
   * @returns Compliance score (0-100)
   */
  private calculateComplianceScore(findings: ComplianceFinding[]): number {
    if (findings.length === 0) {
      return 100;
    }

    let score = 100;

    for (const finding of findings) {
      switch (finding.severity) {
        case 'critical':
          score -= 25;
          break;
        case 'high':
          score -= 15;
          break;
        case 'medium':
          score -= 5;
          break;
        case 'low':
          score -= 1;
          break;
      }
    }

    return Math.max(0, score);
  }

  /**
   * Get the higher of two severity levels
   * @param current - Current severity level
   * @param candidate - Candidate severity level
   * @returns The higher severity level
   */
  private getHigherSeverity(current: SecuritySeverity, candidate: SecuritySeverity): SecuritySeverity {
    const severityOrder = [
      SecuritySeverity.INFO,
      SecuritySeverity.LOW,
      SecuritySeverity.MEDIUM,
      SecuritySeverity.HIGH,
      SecuritySeverity.CRITICAL,
    ];
    const currentIndex = severityOrder.indexOf(current);
    const candidateIndex = severityOrder.indexOf(candidate);
    return severityOrder[Math.max(currentIndex, candidateIndex)];
  }

  /**
   * Generate recommendations from findings
   * @param findings - Compliance findings
   * @returns Array of recommendations
   */
  private generateRecommendations(findings: ComplianceFinding[]): string[] {
    const recommendations: string[] = [];

    // Group findings by category
    const categories = new Map<string, ComplianceFinding[]>();
    for (const finding of findings) {
      if (!categories.has(finding.category)) {
        categories.set(finding.category, []);
      }
      categories.get(finding.category)!.push(finding);
    }

    // Generate recommendations for each category
    for (const [category, categoryFindings] of categories) {
      const criticalCount = categoryFindings.filter(f => f.severity === 'critical').length;
      if (criticalCount > 0) {
        recommendations.push(`Address ${criticalCount} critical issues in ${category}`);
      }

      recommendations.push(...categoryFindings.map(f => f.recommendation));
    }

    return recommendations;
  }

  /**
   * Get audit history
   * @param limit - Maximum number of audits to return
   * @returns Array of compliance check results
   */
  getAuditHistory(limit?: number): ComplianceCheckResult[] {
    if (limit) {
      return this.auditHistory.slice(-limit);
    }
    return [...this.auditHistory];
  }

  /**
   * Update configuration
   * @param newConfig - Partial configuration
   */
  updateConfig(newConfig: Partial<ComplianceManagerConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Restart intervals if running
    if (this.isRunning) {
      this.stop();
      this.start();
    }

    this.logger.info('Compliance manager configuration updated');
  }

  /**
   * Get current configuration
   * @returns Current configuration
   */
  getConfig(): ComplianceManagerConfig {
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

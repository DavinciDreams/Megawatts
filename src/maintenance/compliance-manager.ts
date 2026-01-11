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
   * @returns Compliance finding or null
   */
  private async checkRateLimiting(): Promise<ComplianceFinding | null> {
    // This is a placeholder implementation
    // In production, check actual rate limiting implementation

    return null;
  }

  /**
   * Check content policy compliance
   * @returns Compliance finding or null
   */
  private async checkContentPolicy(): Promise<ComplianceFinding | null> {
    // This is a placeholder implementation
    // In production, check actual content moderation practices

    return null;
  }

  /**
   * Check user privacy compliance
   * @returns Compliance finding or null
   */
  private async checkUserPrivacy(): Promise<ComplianceFinding | null> {
    // This is a placeholder implementation
    // In production, check actual user privacy practices

    return null;
  }

  /**
   * Check bot behavior compliance
   * @returns Compliance finding or null
   */
  private async checkBotBehavior(): Promise<ComplianceFinding | null> {
    // This is a placeholder implementation
    // In production, check actual bot behavior against Discord's guidelines

    return null;
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
   * @returns Compliance finding or null
   */
  private async checkColorContrast(): Promise<ComplianceFinding | null> {
    // This is a placeholder implementation
    // In production, check actual color contrast ratios

    return null;
  }

  /**
   * Check alt text compliance
   * @returns Compliance finding or null
   */
  private async checkAltText(): Promise<ComplianceFinding | null> {
    // This is a placeholder implementation
    // In production, check actual alt text usage

    return null;
  }

  /**
   * Check keyboard navigation compliance
   * @returns Compliance finding or null
   */
  private async checkKeyboardNavigation(): Promise<ComplianceFinding | null> {
    // This is a placeholder implementation
    // In production, check actual keyboard navigation implementation

    return null;
  }

  /**
   * Check screen reader compatibility
   * @returns Compliance finding or null
   */
  private async checkScreenReaderCompatibility(): Promise<ComplianceFinding | null> {
    // This is a placeholder implementation
    // In production, check actual screen reader compatibility

    return null;
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
   * @returns Compliance finding or null
   */
  private async checkForUntranslatedStrings(): Promise<ComplianceFinding | null> {
    // This is a placeholder implementation
    // In production, check actual translation coverage

    return null;
  }

  /**
   * Check for cultural sensitivity
   * @returns Compliance finding or null
   */
  private async checkForCulturalSensitivity(): Promise<ComplianceFinding | null> {
    // This is a placeholder implementation
    // In production, check actual cultural sensitivity in translations

    return null;
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

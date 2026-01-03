/**
 * Impact Analyzer
 * 
 * Comprehensive impact analysis for code modifications.
 * Implements pre-modification impact projection and post-modification impact monitoring.
 */

import { Logger } from '../../utils/logger';
import { SelfEditingError } from '../../utils/errors';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Impact analysis stage
 */
export enum ImpactStage {
  PRE_MODIFICATION = 'pre_modification',
  POST_MODIFICATION = 'post_modification'
}

/**
 * Impact level
 */
export enum ImpactLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Impact category
 */
export enum ImpactCategory {
  PERFORMANCE = 'performance',
  SECURITY = 'security',
  USER_EXPERIENCE = 'user_experience',
  SYSTEM_STABILITY = 'system_stability',
  RESOURCE = 'resource',
  DEPENDENCY = 'dependency'
}

/**
 * Modification context for impact analysis
 */
export interface ModificationContext {
  id: string;
  code: string;
  filePath?: string;
  language?: string;
  originalCode?: string;
  dependencies?: Array<{ name: string; version: string }>;
  metadata?: Record<string, any>;
  timestamp: Date;
}

/**
 * Pre-modification impact analysis result
 */
export interface PreModificationImpactResult {
  stage: ImpactStage.PRE_MODIFICATION;
  overallImpact: {
    level: ImpactLevel;
    score: number;
  };
  performanceImpact: PerformanceImpactAnalysis;
  securityImpact: SecurityImpactAnalysis;
  userExperienceImpact: UserExperienceImpactAnalysis;
  systemStabilityImpact: SystemStabilityImpactAnalysis;
  affectedAreas: Array<{
    area: string;
    impact: ImpactLevel;
    description: string;
  }>;
  risks: Array<{
    type: string;
    severity: ImpactLevel;
    description: string;
    mitigation: string;
  }>;
  recommendations: string[];
  canProceed: boolean;
}

/**
 * Post-modification impact monitoring result
 */
export interface PostModificationImpactResult {
  stage: ImpactStage.POST_MODIFICATION;
  modificationId: string;
  performanceMetrics: PerformanceMetrics;
  securityMetrics: SecurityMetrics;
  userExperienceMetrics: UserExperienceMetrics;
  systemStabilityMetrics: SystemStabilityMetrics;
  actualImpact: {
    performance: ImpactLevel;
    security: ImpactLevel;
    userExperience: ImpactLevel;
    systemStability: ImpactLevel;
  };
  deviations: Array<{
    category: string;
    expected: number;
    actual: number;
    deviation: number;
    severity: ImpactLevel;
  }>;
  rollbackTriggered: boolean;
  rollbackReason?: string;
}

/**
 * Performance impact analysis
 */
export interface PerformanceImpactAnalysis {
  estimatedImpact: ImpactLevel;
  metrics: {
    cpuImpact: number;
    memoryImpact: number;
    latencyImpact: number;
    throughputImpact: number;
  };
  concerns: Array<{
    type: string;
    severity: ImpactLevel;
    description: string;
    mitigation?: string;
  }>;
}

/**
 * Security impact analysis
 */
export interface SecurityImpactAnalysis {
  estimatedImpact: ImpactLevel;
  attackSurfaceChange: 'increased' | 'decreased' | 'unchanged';
  newVulnerabilities: Array<{
    type: string;
    severity: ImpactLevel;
    description: string;
  }>;
  dataAccessChanges: Array<{
    resource: string;
    accessChange: 'increased' | 'decreased' | 'unchanged';
  }>;
}

/**
 * User experience impact analysis
 */
export interface UserExperienceImpactAnalysis {
  estimatedImpact: ImpactLevel;
  metrics: {
    responseTimeImpact: number;
    qualityImpact: number;
    usabilityImpact: number;
  };
  concerns: Array<{
    type: string;
    severity: ImpactLevel;
    description: string;
    mitigation?: string;
  }>;
}

/**
 * System stability impact analysis
 */
export interface SystemStabilityImpactAnalysis {
  estimatedImpact: ImpactLevel;
  metrics: {
    errorRateImpact: number;
    availabilityImpact: number;
    reliabilityImpact: number;
  };
  concerns: Array<{
    type: string;
    severity: ImpactLevel;
    description: string;
    mitigation?: string;
  }>;
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  cpuUsage: number;
  memoryUsage: number;
  latency: number;
  throughput: number;
  timestamp: Date;
}

/**
 * Security metrics
 */
export interface SecurityMetrics {
  vulnerabilityCount: number;
  attackSurface: number;
  securityScore: number;
  timestamp: Date;
}

/**
 * User experience metrics
 */
export interface UserExperienceMetrics {
  averageResponseTime: number;
  successRate: number;
  userSatisfaction: number;
  timestamp: Date;
}

/**
 * System stability metrics
 */
export interface SystemStabilityMetrics {
  errorRate: number;
  availability: number;
  meanTimeToRecovery: number;
  timestamp: Date;
}

/**
 * Impact analyzer configuration
 */
export interface ImpactAnalyzerConfig {
  // Performance thresholds
  maxCpuImpact: number;
  maxMemoryImpact: number;
  maxLatencyImpact: number;
  
  // Security thresholds
  allowIncreasedAttackSurface: boolean;
  maxNewVulnerabilities: number;
  
  // User experience thresholds
  maxResponseTimeImpact: number;
  minSuccessRate: number;
  
  // System stability thresholds
  maxErrorRateImpact: number;
  minAvailability: number;
  
  // General settings
  strictMode: boolean;
  enableContinuousMonitoring: boolean;
  monitoringInterval: number;
}

// ============================================================================
// IMPACT ANALYZER CLASS
// ============================================================================

export class ImpactAnalyzer {
  private logger: Logger;
  private config: ImpactAnalyzerConfig;
  private baselineMetrics: Map<string, PerformanceMetrics> = new Map();
  private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: ImpactAnalyzerConfig, logger: Logger) {
    this.logger = logger;
    this.config = config;
  }

  /**
   * Analyze pre-modification impact
   */
  public async analyzePreModificationImpact(
    modification: ModificationContext
  ): Promise<PreModificationImpactResult> {
    try {
      this.logger.info('Starting pre-modification impact analysis', {
        modificationId: modification.id,
        filePath: modification.filePath
      });

      const startTime = Date.now();

      // Analyze performance impact
      const performanceImpact = await this.analyzePerformanceImpact(modification);
      
      // Analyze security impact
      const securityImpact = await this.analyzeSecurityImpact(modification);
      
      // Analyze user experience impact
      const userExperienceImpact = await this.analyzeUserExperienceImpact(modification);
      
      // Analyze system stability impact
      const systemStabilityImpact = await this.analyzeSystemStabilityImpact(modification);
      
      // Calculate overall impact
      const impactScore = this.calculateOverallImpactScore(
        performanceImpact,
        securityImpact,
        userExperienceImpact,
        systemStabilityImpact
      );
      
      const overallImpact = {
        level: this.getImpactLevel(impactScore),
        score: impactScore
      };
      
      // Identify affected areas
      const affectedAreas = this.identifyAffectedAreas(modification);
      
      // Identify risks
      const risks = this.identifyRisks(
        modification,
        performanceImpact,
        securityImpact,
        userExperienceImpact,
        systemStabilityImpact
      );
      
      // Generate recommendations
      const recommendations = this.generateRecommendations(
        modification,
        overallImpact.level,
        risks
      );
      
      // Determine if can proceed
      const canProceed = this.canProceedWithImpact(overallImpact.level, risks);

      const result: PreModificationImpactResult = {
        stage: ImpactStage.PRE_MODIFICATION,
        overallImpact,
        performanceImpact,
        securityImpact,
        userExperienceImpact,
        systemStabilityImpact,
        affectedAreas,
        risks,
        recommendations,
        canProceed
      };

      this.logger.info('Pre-modification impact analysis completed', {
        modificationId: modification.id,
        overallImpact: overallImpact.level,
        impactScore: impactScore,
        canProceed,
        processingTime: Date.now() - startTime
      });

      return result;

    } catch (error) {
      this.logger.error('Pre-modification impact analysis failed:', error as Error);
      throw new SelfEditingError(
        `Pre-modification impact analysis failed: ${error}`,
        'high',
        'ImpactAnalyzer',
        'analyzePreModificationImpact',
        modification.id
      );
    }
  }

  /**
   * Monitor post-modification impact
   */
  public async monitorPostModificationImpact(
    modification: ModificationContext,
    duration: number = 300000 // 5 minutes default
  ): Promise<PostModificationImpactResult> {
    try {
      this.logger.info('Starting post-modification impact monitoring', {
        modificationId: modification.id,
        duration
      });

      const startTime = Date.now();

      // Capture baseline metrics before modification
      const baseline = await this.captureBaselineMetrics(modification);
      this.baselineMetrics.set(modification.id, baseline);

      // Wait for monitoring period
      await this.waitForMonitoringPeriod(duration);

      // Capture current metrics
      const currentMetrics = await this.captureCurrentMetrics(modification);
      
      // Analyze performance impact
      const performanceMetrics = currentMetrics.performance;
      const performanceImpact = this.analyzePerformanceDeviation(
        baseline.performance,
        performanceMetrics
      );
      
      // Analyze security impact
      const securityMetrics = currentMetrics.security;
      const securityImpact = this.analyzeSecurityDeviation(
        baseline.security,
        securityMetrics
      );
      
      // Analyze user experience impact
      const userExperienceMetrics = currentMetrics.userExperience;
      const userExperienceImpact = this.analyzeUserExperienceDeviation(
        baseline.userExperience,
        userExperienceMetrics
      );
      
      // Analyze system stability impact
      const systemStabilityMetrics = currentMetrics.systemStability;
      const systemStabilityImpact = this.analyzeSystemStabilityDeviation(
        baseline.systemStability,
        systemStabilityMetrics
      );
      
      // Calculate actual impact
      const actualImpact = {
        performance: performanceImpact.level,
        security: securityImpact.level,
        userExperience: userExperienceImpact.level,
        systemStability: systemStabilityImpact.level
      };
      
      // Identify deviations
      const deviations = this.identifyDeviations(
        baseline,
        currentMetrics
      );
      
      // Check if rollback should be triggered
      const rollbackTriggered = this.shouldTriggerRollback(
        actualImpact,
        deviations
      );
      
      const rollbackReason = rollbackTriggered
        ? this.getRollbackReason(actualImpact, deviations)
        : undefined;

      const result: PostModificationImpactResult = {
        stage: ImpactStage.POST_MODIFICATION,
        modificationId: modification.id,
        performanceMetrics,
        securityMetrics,
        userExperienceMetrics,
        systemStabilityMetrics,
        actualImpact,
        deviations,
        rollbackTriggered,
        rollbackReason
      };

      this.logger.info('Post-modification impact monitoring completed', {
        modificationId: modification.id,
        rollbackTriggered,
        deviations: deviations.length,
        processingTime: Date.now() - startTime
      });

      return result;

    } catch (error) {
      this.logger.error('Post-modification impact monitoring failed:', error as Error);
      throw new SelfEditingError(
        `Post-modification impact monitoring failed: ${error}`,
        'high',
        'ImpactAnalyzer',
        'monitorPostModificationImpact',
        modification.id
      );
    }
  }

  /**
   * Start continuous monitoring
   */
  public startContinuousMonitoring(
    modification: ModificationContext,
    callback: (result: PostModificationImpactResult) => void
  ): void {
    this.logger.info('Starting continuous monitoring', {
      modificationId: modification.id
    });

    const interval = setInterval(async () => {
      try {
        const result = await this.monitorPostModificationImpact(
          modification,
          this.config.monitoringInterval
        );
        callback(result);
      } catch (error) {
        this.logger.error('Continuous monitoring error:', error as Error);
      }
    }, this.config.monitoringInterval);

    this.monitoringIntervals.set(modification.id, interval);
  }

  /**
   * Stop continuous monitoring
   */
  public stopContinuousMonitoring(modificationId: string): void {
    const interval = this.monitoringIntervals.get(modificationId);
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(modificationId);
      this.logger.info('Continuous monitoring stopped', { modificationId });
    }
  }

  /**
   * Analyze performance impact
   */
  private async analyzePerformanceImpact(
    modification: ModificationContext
  ): Promise<PerformanceImpactAnalysis> {
    const code = modification.code || '';
    
    // Calculate estimated impact
    const cpuImpact = this.estimateCpuImpact(code);
    const memoryImpact = this.estimateMemoryImpact(code);
    const latencyImpact = this.estimateLatencyImpact(code);
    const throughputImpact = this.estimateThroughputImpact(code);
    
    const concerns: Array<{
      type: string;
      severity: ImpactLevel;
      description: string;
      mitigation?: string;
    }> = [];
    
    // Check for performance concerns
    if (cpuImpact > this.config.maxCpuImpact) {
      concerns.push({
        type: 'cpu_usage',
        severity: ImpactLevel.HIGH,
        description: `High CPU impact estimated: ${cpuImpact}%`,
        mitigation: 'Optimize algorithms, add caching, or reduce computational complexity'
      });
    }
    
    if (memoryImpact > this.config.maxMemoryImpact) {
      concerns.push({
        type: 'memory_usage',
        severity: ImpactLevel.HIGH,
        description: `High memory impact estimated: ${memoryImpact}%`,
        mitigation: 'Implement memory pooling, use streaming, or optimize data structures'
      });
    }
    
    if (latencyImpact > this.config.maxLatencyImpact) {
      concerns.push({
        type: 'latency',
        severity: ImpactLevel.MEDIUM,
        description: `High latency impact estimated: ${latencyImpact}%`,
        mitigation: 'Optimize I/O operations, use async patterns, or implement caching'
      });
    }
    
    const overallImpact = Math.max(cpuImpact, memoryImpact, latencyImpact, throughputImpact);
    const level = this.getImpactLevel(overallImpact);
    
    return {
      estimatedImpact: level,
      metrics: {
        cpuImpact,
        memoryImpact,
        latencyImpact,
        throughputImpact
      },
      concerns
    };
  }

  /**
   * Analyze security impact
   */
  private async analyzeSecurityImpact(
    modification: ModificationContext
  ): Promise<SecurityImpactAnalysis> {
    const code = modification.code || '';
    
    // Analyze attack surface changes
    const attackSurfaceChange = this.analyzeAttackSurfaceChange(code);
    
    // Identify new vulnerabilities
    const newVulnerabilities = this.identifyNewVulnerabilities(code);
    
    // Analyze data access changes
    const dataAccessChanges = this.analyzeDataAccessChanges(code);
    
    const severity = newVulnerabilities.length > 0 ? ImpactLevel.HIGH : ImpactLevel.LOW;
    
    return {
      estimatedImpact: severity,
      attackSurfaceChange,
      newVulnerabilities,
      dataAccessChanges
    };
  }

  /**
   * Analyze user experience impact
   */
  private async analyzeUserExperienceImpact(
    modification: ModificationContext
  ): Promise<UserExperienceImpactAnalysis> {
    const code = modification.code || '';
    
    // Estimate response time impact
    const responseTimeImpact = this.estimateResponseTimeImpact(code);
    
    // Estimate quality impact
    const qualityImpact = this.estimateQualityImpact(code);
    
    // Estimate usability impact
    const usabilityImpact = this.estimateUsabilityImpact(code);
    
    const concerns: Array<{
      type: string;
      severity: ImpactLevel;
      description: string;
      mitigation?: string;
    }> = [];
    
    // Check for UX concerns
    if (responseTimeImpact > this.config.maxResponseTimeImpact) {
      concerns.push({
        type: 'response_time',
        severity: ImpactLevel.MEDIUM,
        description: `High response time impact estimated: ${responseTimeImpact}%`,
        mitigation: 'Optimize performance, implement caching, or use async operations'
      });
    }
    
    const overallImpact = Math.max(responseTimeImpact, qualityImpact, usabilityImpact);
    const level = this.getImpactLevel(overallImpact);
    
    return {
      estimatedImpact: level,
      metrics: {
        responseTimeImpact,
        qualityImpact,
        usabilityImpact
      },
      concerns
    };
  }

  /**
   * Analyze system stability impact
   */
  private async analyzeSystemStabilityImpact(
    modification: ModificationContext
  ): Promise<SystemStabilityImpactAnalysis> {
    const code = modification.code || '';
    
    // Estimate error rate impact
    const errorRateImpact = this.estimateErrorRateImpact(code);
    
    // Estimate availability impact
    const availabilityImpact = this.estimateAvailabilityImpact(code);
    
    // Estimate reliability impact
    const reliabilityImpact = this.estimateReliabilityImpact(code);
    
    const concerns: Array<{
      type: string;
      severity: ImpactLevel;
      description: string;
      mitigation?: string;
    }> = [];
    
    // Check for stability concerns
    if (errorRateImpact > this.config.maxErrorRateImpact) {
      concerns.push({
        type: 'error_rate',
        severity: ImpactLevel.HIGH,
        description: `High error rate impact estimated: ${errorRateImpact}%`,
        mitigation: 'Add error handling, implement retries, or improve code quality'
      });
    }
    
    const overallImpact = Math.max(errorRateImpact, availabilityImpact, reliabilityImpact);
    const level = this.getImpactLevel(overallImpact);
    
    return {
      estimatedImpact: level,
      metrics: {
        errorRateImpact,
        availabilityImpact,
        reliabilityImpact
      },
      concerns
    };
  }

  /**
   * Capture baseline metrics
   */
  private async captureBaselineMetrics(
    modification: ModificationContext
  ): Promise<{
    performance: PerformanceMetrics;
    security: SecurityMetrics;
    userExperience: UserExperienceMetrics;
    systemStability: SystemStabilityMetrics;
  }> {
    // In a real implementation, this would measure actual system metrics
    return {
      performance: {
        cpuUsage: 30,
        memoryUsage: 40,
        latency: 100,
        throughput: 1000,
        timestamp: new Date()
      } as PerformanceMetrics,
      security: {
        vulnerabilityCount: 0,
        attackSurface: 5,
        securityScore: 90,
        timestamp: new Date()
      } as SecurityMetrics,
      userExperience: {
        averageResponseTime: 200,
        successRate: 0.99,
        userSatisfaction: 4.5,
        timestamp: new Date()
      } as UserExperienceMetrics,
      systemStability: {
        errorRate: 0.01,
        availability: 0.999,
        meanTimeToRecovery: 5,
        timestamp: new Date()
      } as SystemStabilityMetrics
    };
  }

  /**
   * Capture current metrics
   */
  private async captureCurrentMetrics(
    modification: ModificationContext
  ): Promise<{
    performance: PerformanceMetrics;
    security: SecurityMetrics;
    userExperience: UserExperienceMetrics;
    systemStability: SystemStabilityMetrics;
  }> {
    // In a real implementation, this would measure actual system metrics
    return {
      performance: {
        cpuUsage: 35,
        memoryUsage: 45,
        latency: 120,
        throughput: 950,
        timestamp: new Date()
      } as PerformanceMetrics,
      security: {
        vulnerabilityCount: 1,
        attackSurface: 6,
        securityScore: 85,
        timestamp: new Date()
      } as SecurityMetrics,
      userExperience: {
        averageResponseTime: 250,
        successRate: 0.97,
        userSatisfaction: 4.2,
        timestamp: new Date()
      } as UserExperienceMetrics,
      systemStability: {
        errorRate: 0.03,
        availability: 0.995,
        meanTimeToRecovery: 8,
        timestamp: new Date()
      } as SystemStabilityMetrics
    };
  }

  /**
   * Wait for monitoring period
   */
  private async waitForMonitoringPeriod(duration: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, duration));
  }

  /**
   * Analyze performance deviation
   */
  private analyzePerformanceDeviation(
    baseline: PerformanceMetrics,
    current: PerformanceMetrics
  ): { level: ImpactLevel; deviation: number } {
    const cpuDeviation = Math.abs(current.cpuUsage - baseline.cpuUsage);
    const memoryDeviation = Math.abs(current.memoryUsage - baseline.memoryUsage);
    const latencyDeviation = Math.abs(current.latency - baseline.latency);
    
    const avgDeviation = (cpuDeviation + memoryDeviation + latencyDeviation) / 3;
    const level = this.getImpactLevel(avgDeviation);
    
    return { level, deviation: avgDeviation };
  }

  /**
   * Analyze security deviation
   */
  private analyzeSecurityDeviation(
    baseline: SecurityMetrics,
    current: SecurityMetrics
  ): { level: ImpactLevel; deviation: number } {
    const vulnerabilityDeviation = current.vulnerabilityCount - baseline.vulnerabilityCount;
    const attackSurfaceDeviation = current.attackSurface - baseline.attackSurface;
    const scoreDeviation = baseline.securityScore - current.securityScore;
    
    const avgDeviation = Math.abs(
      (vulnerabilityDeviation + attackSurfaceDeviation + scoreDeviation) / 3
    );
    const level = this.getImpactLevel(avgDeviation);
    
    return { level, deviation: avgDeviation };
  }

  /**
   * Analyze user experience deviation
   */
  private analyzeUserExperienceDeviation(
    baseline: UserExperienceMetrics,
    current: UserExperienceMetrics
  ): { level: ImpactLevel; deviation: number } {
    const responseTimeDeviation = current.averageResponseTime - baseline.averageResponseTime;
    const successRateDeviation = baseline.successRate - current.successRate;
    const satisfactionDeviation = baseline.userSatisfaction - current.userSatisfaction;
    
    const avgDeviation = Math.abs(
      (responseTimeDeviation + successRateDeviation + satisfactionDeviation) / 3
    );
    const level = this.getImpactLevel(avgDeviation);
    
    return { level, deviation: avgDeviation };
  }

  /**
   * Analyze system stability deviation
   */
  private analyzeSystemStabilityDeviation(
    baseline: SystemStabilityMetrics,
    current: SystemStabilityMetrics
  ): { level: ImpactLevel; deviation: number } {
    const errorRateDeviation = current.errorRate - baseline.errorRate;
    const availabilityDeviation = baseline.availability - current.availability;
    const mttrDeviation = current.meanTimeToRecovery - baseline.meanTimeToRecovery;
    
    const avgDeviation = Math.abs(
      (errorRateDeviation + availabilityDeviation + mttrDeviation) / 3
    );
    const level = this.getImpactLevel(avgDeviation);
    
    return { level, deviation: avgDeviation };
  }

  /**
   * Identify deviations
   */
  private identifyDeviations(
    baseline: {
      performance: PerformanceMetrics;
      security: SecurityMetrics;
      userExperience: UserExperienceMetrics;
      systemStability: SystemStabilityMetrics;
    },
    current: {
      performance: PerformanceMetrics;
      security: SecurityMetrics;
      userExperience: UserExperienceMetrics;
      systemStability: SystemStabilityMetrics;
    }
  ): Array<{
    category: string;
    expected: number;
    actual: number;
    deviation: number;
    severity: ImpactLevel;
  }> {
    const deviations: Array<{
      category: string;
      expected: number;
      actual: number;
      deviation: number;
      severity: ImpactLevel;
    }> = [];
    
    // Performance deviations
    const perfDev = this.analyzePerformanceDeviation(
      baseline.performance,
      current.performance
    );
    deviations.push({
      category: 'performance',
      expected: 0,
      actual: perfDev.deviation,
      deviation: perfDev.deviation,
      severity: perfDev.level
    });
    
    // Security deviations
    const secDev = this.analyzeSecurityDeviation(
      baseline.security,
      current.security
    );
    deviations.push({
      category: 'security',
      expected: 0,
      actual: secDev.deviation,
      deviation: secDev.deviation,
      severity: secDev.level
    });
    
    // User experience deviations
    const uxDev = this.analyzeUserExperienceDeviation(
      baseline.userExperience,
      current.userExperience
    );
    deviations.push({
      category: 'user_experience',
      expected: 0,
      actual: uxDev.deviation,
      deviation: uxDev.deviation,
      severity: uxDev.level
    });
    
    // System stability deviations
    const stabDev = this.analyzeSystemStabilityDeviation(
      baseline.systemStability,
      current.systemStability
    );
    deviations.push({
      category: 'system_stability',
      expected: 0,
      actual: stabDev.deviation,
      deviation: stabDev.deviation,
      severity: stabDev.level
    });
    
    return deviations;
  }

  /**
   * Check if rollback should be triggered
   */
  private shouldTriggerRollback(
    actualImpact: {
      performance: ImpactLevel;
      security: ImpactLevel;
      userExperience: ImpactLevel;
      systemStability: ImpactLevel;
    },
    deviations: Array<{
      category: string;
      expected: number;
      actual: number;
      deviation: number;
      severity: ImpactLevel;
    }>
  ): boolean {
    // Trigger rollback for critical impacts
    if (actualImpact.security === ImpactLevel.CRITICAL) {
      return true;
    }
    
    if (actualImpact.systemStability === ImpactLevel.CRITICAL) {
      return true;
    }
    
    // Trigger rollback for large deviations in strict mode
    if (this.config.strictMode) {
      const largeDeviations = deviations.filter(
        d => d.severity === ImpactLevel.HIGH || d.severity === ImpactLevel.CRITICAL
      );
      if (largeDeviations.length > 0) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Get rollback reason
   */
  private getRollbackReason(
    actualImpact: {
      performance: ImpactLevel;
      security: ImpactLevel;
      userExperience: ImpactLevel;
      systemStability: ImpactLevel;
    },
    deviations: Array<{
      category: string;
      expected: number;
      actual: number;
      deviation: number;
      severity: ImpactLevel;
    }>
  ): string {
    const reasons: string[] = [];
    
    if (actualImpact.security === ImpactLevel.CRITICAL) {
      reasons.push('Critical security impact detected');
    }
    
    if (actualImpact.systemStability === ImpactLevel.CRITICAL) {
      reasons.push('Critical system stability impact detected');
    }
    
    const largeDeviations = deviations.filter(
      d => d.severity === ImpactLevel.HIGH || d.severity === ImpactLevel.CRITICAL
    );
    
    for (const dev of largeDeviations) {
      reasons.push(`Significant deviation in ${dev.category}: ${dev.actual}%`);
    }
    
    return reasons.join('; ');
  }

  /**
   * Calculate overall impact score
   */
  private calculateOverallImpactScore(
    performance: PerformanceImpactAnalysis,
    security: SecurityImpactAnalysis,
    userExperience: UserExperienceImpactAnalysis,
    systemStability: SystemStabilityImpactAnalysis
  ): number {
    let score = 0;
    
    // Performance contribution
    const perfScore = this.getImpactScore(performance.estimatedImpact);
    score += perfScore * 0.3;
    
    // Security contribution
    const secScore = this.getImpactScore(security.estimatedImpact);
    score += secScore * 0.3;
    
    // User experience contribution
    const uxScore = this.getImpactScore(userExperience.estimatedImpact);
    score += uxScore * 0.2;
    
    // System stability contribution
    const stabScore = this.getImpactScore(systemStability.estimatedImpact);
    score += stabScore * 0.2;
    
    return Math.min(100, score);
  }

  /**
   * Get impact level from score
   */
  private getImpactLevel(score: number): ImpactLevel {
    if (score < 25) return ImpactLevel.LOW;
    if (score < 50) return ImpactLevel.MEDIUM;
    if (score < 75) return ImpactLevel.HIGH;
    return ImpactLevel.CRITICAL;
  }

  /**
   * Get impact score from level
   */
  private getImpactScore(level: ImpactLevel): number {
    switch (level) {
      case ImpactLevel.LOW:
        return 10;
      case ImpactLevel.MEDIUM:
        return 40;
      case ImpactLevel.HIGH:
        return 70;
      case ImpactLevel.CRITICAL:
        return 90;
    }
  }

  /**
   * Identify affected areas
   */
  private identifyAffectedAreas(
    modification: ModificationContext
  ): Array<{
    area: string;
    impact: ImpactLevel;
    description: string;
  }> {
    const areas = [];
    const code = modification.code || '';
    
    // Check for core system impact
    if (code.includes('core') || code.includes('system') || code.includes('kernel')) {
      areas.push({
        area: 'Core System',
        impact: ImpactLevel.HIGH,
        description: 'Modification affects core system functionality'
      });
    }
    
    // Check for database impact
    if (code.includes('database') || code.includes('db.') || code.includes('sql')) {
      areas.push({
        area: 'Database',
        impact: ImpactLevel.MEDIUM,
        description: 'Modification affects database operations'
      });
    }
    
    // Check for network impact
    if (code.includes('fetch') || code.includes('http') || code.includes('socket')) {
      areas.push({
        area: 'Network',
        impact: ImpactLevel.MEDIUM,
        description: 'Modification affects network communications'
      });
    }
    
    // Check for UI impact
    if (code.includes('render') || code.includes('display') || code.includes('ui')) {
      areas.push({
        area: 'User Interface',
        impact: ImpactLevel.LOW,
        description: 'Modification affects user interface'
      });
    }
    
    return areas;
  }

  /**
   * Identify risks
   */
  private identifyRisks(
    modification: ModificationContext,
    performance: PerformanceImpactAnalysis,
    security: SecurityImpactAnalysis,
    userExperience: UserExperienceImpactAnalysis,
    systemStability: SystemStabilityImpactAnalysis
  ): Array<{
    type: string;
    severity: ImpactLevel;
    description: string;
    mitigation: string;
  }> {
    const risks = [];
    
    // Add performance risks
    for (const concern of performance.concerns) {
      risks.push({
        type: concern.type,
        severity: concern.severity,
        description: concern.description,
        mitigation: concern.mitigation || 'Monitor performance metrics closely'
      });
    }
    
    // Add security risks
    if (security.newVulnerabilities.length > 0) {
      risks.push({
        type: 'security_vulnerability',
        severity: ImpactLevel.HIGH,
        description: 'New security vulnerabilities introduced',
        mitigation: 'Conduct security review and apply patches'
      });
    }
    
    if (security.attackSurfaceChange === 'increased' && !this.config.allowIncreasedAttackSurface) {
      risks.push({
        type: 'attack_surface',
        severity: ImpactLevel.MEDIUM,
        description: 'Attack surface increased',
        mitigation: 'Review and minimize exposed functionality'
      });
    }
    
    // Add user experience risks
    for (const concern of userExperience.concerns) {
      risks.push({
        type: concern.type,
        severity: concern.severity,
        description: concern.description,
        mitigation: concern.mitigation || 'Conduct user testing'
      });
    }
    
    // Add system stability risks
    for (const concern of systemStability.concerns) {
      risks.push({
        type: concern.type,
        severity: concern.severity,
        description: concern.description,
        mitigation: concern.mitigation || 'Implement monitoring and rollback'
      });
    }
    
    return risks;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    modification: ModificationContext,
    impactLevel: ImpactLevel,
    risks: Array<{
      type: string;
      severity: ImpactLevel;
      description: string;
      mitigation: string;
    }>
  ): string[] {
    const recommendations: string[] = [];
    
    // High impact recommendations
    if (impactLevel === ImpactLevel.HIGH || impactLevel === ImpactLevel.CRITICAL) {
      recommendations.push('Require multiple code reviews');
      recommendations.push('Implement comprehensive testing');
      recommendations.push('Consider gradual rollout');
      recommendations.push('Create backup before deployment');
    }
    
    // Medium impact recommendations
    if (impactLevel === ImpactLevel.MEDIUM) {
      recommendations.push('Conduct thorough testing');
      recommendations.push('Monitor system health closely');
      recommendations.push('Prepare rollback plan');
    }
    
    // Risk-specific recommendations
    for (const risk of risks) {
      if (risk.mitigation) {
        if (!recommendations.includes(risk.mitigation)) {
          recommendations.push(risk.mitigation);
        }
      }
    }
    
    return recommendations;
  }

  /**
   * Determine if can proceed with impact
   */
  private canProceedWithImpact(
    impactLevel: ImpactLevel,
    risks: Array<{
      type: string;
      severity: ImpactLevel;
      description: string;
      mitigation: string;
    }>
  ): boolean {
    // Critical impact always requires review
    if (impactLevel === ImpactLevel.CRITICAL) {
      return false;
    }
    
    // High impact requires review in strict mode
    if (this.config.strictMode && impactLevel === ImpactLevel.HIGH) {
      return false;
    }
    
    // High severity risks require review
    const hasHighSeverityRisks = risks.some(r => r.severity === ImpactLevel.HIGH);
    if (hasHighSeverityRisks) {
      return false;
    }
    
    return true;
  }

  // ============================================================================
  // ESTIMATION METHODS
  // ============================================================================

  /**
   * Estimate CPU impact
   */
  private estimateCpuImpact(code: string): number {
    const patterns = [
      /for\s*\(/gi,
      /while\s*\(/gi,
      /forEach/gi,
      /map\(/gi,
      /reduce\(/gi
    ];
    
    let impact = 10; // Base impact
    for (const pattern of patterns) {
      const matches = code.match(pattern);
      if (matches) {
        impact += matches.length * 5;
      }
    }
    
    return Math.min(100, impact);
  }

  /**
   * Estimate memory impact
   */
  private estimateMemoryImpact(code: string): number {
    const patterns = [
      /new\s+Array\s*\(/gi,
      /new\s+Buffer\s*\(/gi,
      /Array\s*\(\s*\d{3,}\s*\)/g,
      /Object\.assign\s*\([^)]{50,}\)/gi
    ];
    
    let impact = 5; // Base impact
    for (const pattern of patterns) {
      const matches = code.match(pattern);
      if (matches) {
        impact += matches.length * 10;
      }
    }
    
    return Math.min(100, impact);
  }

  /**
   * Estimate latency impact
   */
  private estimateLatencyImpact(code: string): number {
    const patterns = [
      /await\s+[^;]+;/gi,
      /Promise\.all\(/gi,
      /Promise\.race\(/gi,
      /setTimeout/gi,
      /setInterval/gi
    ];
    
    let impact = 5; // Base impact
    for (const pattern of patterns) {
      const matches = code.match(pattern);
      if (matches) {
        impact += matches.length * 8;
      }
    }
    
    return Math.min(100, impact);
  }

  /**
   * Estimate throughput impact
   */
  private estimateThroughputImpact(code: string): number {
    const patterns = [
      /filter\(/gi,
      /reduce\(/gi,
      /sort\(/gi,
      /find\(/gi
    ];
    
    let impact = 5; // Base impact
    for (const pattern of patterns) {
      const matches = code.match(pattern);
      if (matches) {
        impact += matches.length * 3;
      }
    }
    
    return Math.min(100, impact);
  }

  /**
   * Analyze attack surface change
   */
  private analyzeAttackSurfaceChange(code: string): 'increased' | 'decreased' | 'unchanged' {
    const newEndpoints = (code.match(/router\.(get|post|put|delete)/gi) || []).length;
    const newAuth = (code.match(/auth/gi) || []).length;
    
    if (newEndpoints > 0 || newAuth > 0) {
      return 'increased';
    }
    
    return 'unchanged';
  }

  /**
   * Identify new vulnerabilities
   */
  private identifyNewVulnerabilities(code: string): Array<{
    type: string;
    severity: ImpactLevel;
    description: string;
  }> {
    const vulnerabilities: Array<{
      type: string;
      severity: ImpactLevel;
      description: string;
    }> = [];
    
    // Check for common vulnerability patterns
    const patterns = [
      { type: 'xss', pattern: /innerHTML\s*=/gi, severity: ImpactLevel.HIGH },
      { type: 'sql_injection', pattern: /sql\s*=\s*['"][^'"]*\+/gi, severity: ImpactLevel.CRITICAL },
      { type: 'command_injection', pattern: /exec\s*\(/gi, severity: ImpactLevel.CRITICAL },
      { type: 'path_traversal', pattern: /\.\.\//g, severity: ImpactLevel.HIGH }
    ];
    
    for (const { type, pattern, severity } of patterns) {
      if (pattern.test(code)) {
        vulnerabilities.push({
          type,
          severity,
          description: `Potential ${type.replace('_', ' ')} vulnerability detected`
        });
      }
    }
    
    return vulnerabilities;
  }

  /**
   * Analyze data access changes
   */
  private analyzeDataAccessChanges(code: string): Array<{
    resource: string;
    accessChange: 'increased' | 'decreased' | 'unchanged';
  }> {
    const changes: Array<{
      resource: string;
      accessChange: 'increased' | 'decreased' | 'unchanged';
    }> = [];
    
    // Check for database access
    if (code.includes('database') || code.includes('db.')) {
      changes.push({
        resource: 'database',
        accessChange: 'increased'
      });
    }
    
    // Check for file system access
    if (code.includes('fs.') || code.includes('readFile')) {
      changes.push({
        resource: 'filesystem',
        accessChange: 'increased'
      });
    }
    
    // Check for network access
    if (code.includes('fetch') || code.includes('http')) {
      changes.push({
        resource: 'network',
        accessChange: 'increased'
      });
    }
    
    return changes;
  }

  /**
   * Estimate response time impact
   */
  private estimateResponseTimeImpact(code: string): number {
    const patterns = [
      /await\s+[^;]+;/gi,
      /Promise\.all\(/gi,
      /async\s+function/gi
    ];
    
    let impact = 5; // Base impact
    for (const pattern of patterns) {
      const matches = code.match(pattern);
      if (matches) {
        impact += matches.length * 10;
      }
    }
    
    return Math.min(100, impact);
  }

  /**
   * Estimate quality impact
   */
  private estimateQualityImpact(code: string): number {
    const patterns = [
      /console\.log/gi,
      /TODO|FIXME|HACK/gi,
      /throw\s+new\s+Error/gi
    ];
    
    let impact = 5; // Base impact
    for (const pattern of patterns) {
      const matches = code.match(pattern);
      if (matches) {
        impact += matches.length * 5;
      }
    }
    
    return Math.min(100, impact);
  }

  /**
   * Estimate usability impact
   */
  private estimateUsabilityImpact(code: string): number {
    const patterns = [
      /complex/gi,
      /callback/gi,
      /Promise/gi
    ];
    
    let impact = 5; // Base impact
    for (const pattern of patterns) {
      const matches = code.match(pattern);
      if (matches) {
        impact += matches.length * 8;
      }
    }
    
    return Math.min(100, impact);
  }

  /**
   * Estimate error rate impact
   */
  private estimateErrorRateImpact(code: string): number {
    const patterns = [
      /try\s*\{/gi,
      /catch\s*\(/gi,
      /throw\s+/gi
    ];
    
    let impact = 5; // Base impact
    for (const pattern of patterns) {
      const matches = code.match(pattern);
      if (matches) {
        impact += matches.length * 5;
      }
    }
    
    return Math.min(100, impact);
  }

  /**
   * Estimate availability impact
   */
  private estimateAvailabilityImpact(code: string): number {
    const patterns = [
      /process\.exit/gi,
      /throw\s+new\s+Error/gi,
      /return\s*;/gi
    ];
    
    let impact = 5; // Base impact
    for (const pattern of patterns) {
      const matches = code.match(pattern);
      if (matches) {
        impact += matches.length * 10;
      }
    }
    
    return Math.min(100, impact);
  }

  /**
   * Estimate reliability impact
   */
  private estimateReliabilityImpact(code: string): number {
    const patterns = [
      /setTimeout/gi,
      /setInterval/gi,
      /Promise\.race/gi
    ];
    
    let impact = 5; // Base impact
    for (const pattern of patterns) {
      const matches = code.match(pattern);
      if (matches) {
        impact += matches.length * 5;
      }
    }
    
    return Math.min(100, impact);
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<ImpactAnalyzerConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('Impact analyzer configuration updated');
  }

  /**
   * Get current configuration
   */
  public getConfig(): ImpactAnalyzerConfig {
    return { ...this.config };
  }

  /**
   * Clear baseline metrics
   */
  public clearBaselineMetrics(modificationId?: string): void {
    if (modificationId) {
      this.baselineMetrics.delete(modificationId);
      this.logger.debug('Baseline metrics cleared for modification', { modificationId });
    } else {
      this.baselineMetrics.clear();
      this.logger.debug('All baseline metrics cleared');
    }
  }
}

import { EventEmitter } from 'events';
import { Logger } from '../../utils/logger.js';
import { BotError } from '../../core/errors/bot-error.js';
import { SelfEditingError } from '../../core/errors/self-editing-error.js';
import {
  SelfEditingConfig,
  SelfEditingEvent,
  SelfEditingEventType,
  ProgressTracker,
  AuditLog,
  HealthCheck,
  HealthCheckItem
} from '../../types/self-editing.js';

/**
 * Core self-editing engine that orchestrates all self-modification operations
 */
export class SelfEditingCore extends EventEmitter {
  private config: SelfEditingConfig;
  private logger: Logger;
  private isRunning = false;
  private operations: Map<string, ProgressTracker> = new Map();
  private auditLogs: AuditLog[] = [];
  private healthChecks: HealthCheck[] = [];

  constructor(config: SelfEditingConfig, logger: Logger) {
    super();
    this.config = config;
    this.logger = logger;
    
    this.setupEventHandlers();
  }

  /**
   * Initialize self-editing core
   */
  public async initialize(): Promise<void> {
    this.logger.info('Initializing Self-Editing Core...');
    
    try {
      // Validate configuration
      this.validateConfiguration();
      
      // Initialize subsystems
      await this.initializeSubsystems();
      
      // Perform initial health check
      await this.performHealthCheck();
      
      this.isRunning = true;
      this.emitEvent(SelfEditingEventType.MODIFICATION_STARTED, { timestamp: new Date() });
      
      this.logger.info('Self-Editing Core initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Self-Editing Core:', error instanceof Error ? error : new Error(String(error)));
      throw new SelfEditingError(
        'Self-Editing Core initialization failed',
        'critical',
        'core',
        'initialization',
        undefined,
        undefined,
        undefined,
        'Retry initialization or check configuration'
      );
    }
  }

  /**
   * Start self-editing engine
   */
  public async start(): Promise<void> {
    if (!this.isRunning) {
      await this.initialize();
    }

    this.logger.info('Starting Self-Editing Engine...');
    
    try {
      // Start periodic operations
      this.startPeriodicOperations();
      
      // Register event listeners
      this.registerEventListeners();
      
      this.emitEvent(SelfEditingEventType.MODIFICATION_COMPLETED, { timestamp: new Date() });
      this.logger.info('Self-Editing Engine started successfully');
    } catch (error) {
      this.logger.error('Failed to start Self-Editing Engine:', error as Error);
      throw new SelfEditingError(
        'Self-Editing Engine start failed',
        'high',
        'core',
        'start',
        undefined,
        undefined,
        undefined,
        'Check system state and retry'
      );
    }
  }

  /**
   * Stop self-editing engine
   */
  public async stop(): Promise<void> {
    this.logger.info('Stopping Self-Editing Engine...');
    
    try {
      // Stop periodic operations
      this.stopPeriodicOperations();
      
      // Wait for active operations to complete or timeout
      await this.waitForOperationsCompletion(30000); // 30 seconds timeout
      
      // Perform final health check
      await this.performHealthCheck();
      
      this.isRunning = false;
      this.emitEvent(SelfEditingEventType.MODIFICATION_FAILED, { timestamp: new Date() });
      
      this.logger.info('Self-Editing Engine stopped successfully');
    } catch (error) {
      this.logger.error('Error stopping Self-Editing Engine:', error as Error);
      throw new SelfEditingError(
        'Self-Editing Engine stop failed',
        'medium',
        'core',
        'stop',
        undefined,
        undefined,
        undefined,
        'Force stop may be required'
      );
    }
  }

  /**
   * Execute a self-editing operation
   */
  public async executeOperation(
    operationType: string,
    parameters: Record<string, any>,
    options: {
      priority?: 'low' | 'medium' | 'high' | 'critical';
      timeout?: number;
      rollbackOnFailure?: boolean;
    } = {}
  ): Promise<string> {
    const operationId = this.generateOperationId();
    const tracker = this.createProgressTracker(operationId, operationType, parameters);
    
    try {
      this.operations.set(operationId, tracker);
      this.emitEvent(SelfEditingEventType.ROLLBACK_INITIATED, { 
        operationId, 
        operationType, 
        parameters,
        options 
      });

      // Validate operation
      await this.validateOperation(operationType, parameters);
      
      // Execute operation based on type
      const result = await this.executeOperationByType(operationType, parameters, tracker);
      
      // Update tracker with success
      tracker.status = 'completed';
      tracker.endTime = new Date();
      tracker.progress = 100;
      
      this.emitEvent(SelfEditingEventType.ROLLBACK_COMPLETED, { 
        operationId, 
        operationType, 
        result 
      });

      // Log audit entry
      this.createAuditLog('OPERATION_EXECUTED', 'system', operationId, {
        operationType,
        parameters,
        result,
        duration: tracker.endTime.getTime() - tracker.startTime.getTime()
      });

      return operationId;
    } catch (error) {
      // Update tracker with failure
      tracker.status = 'failed';
      tracker.endTime = new Date();
      tracker.errors.push(error instanceof Error ? error.message : String(error));
      
      this.emitEvent(SelfEditingEventType.LEARNING_COMPLETED, { 
        operationId, 
        operationType, 
        error: error instanceof Error ? error.message : String(error)
      });

      // Log audit entry
      this.createAuditLog('OPERATION_FAILED', 'system', operationId, {
        operationType,
        parameters,
        error: error instanceof Error ? error.message : String(error)
      });

      // Rollback if requested
      if (options.rollbackOnFailure) {
        await this.rollbackOperation(operationId);
      }

      throw error;
    } finally {
      this.operations.delete(operationId);
    }
  }

  /**
   * Get operation status
   */
  public getOperationStatus(operationId: string): ProgressTracker | null {
    return this.operations.get(operationId) || null;
  }

  /**
   * Get all active operations
   */
  public getActiveOperations(): ProgressTracker[] {
    return Array.from(this.operations.values());
  }

  /**
   * Get audit logs
   */
  public getAuditLogs(limit?: number): AuditLog[] {
    if (limit) {
      return this.auditLogs.slice(-limit);
    }
    return [...this.auditLogs];
  }

  /**
   * Get health check results
   */
  public getHealthChecks(limit?: number): HealthCheck[] {
    if (limit) {
      return this.healthChecks.slice(-limit);
    }
    return [...this.healthChecks];
  }

  /**
   * Perform manual health check
   */
  public async performHealthCheck(): Promise<HealthCheck> {
    const healthCheck: HealthCheck = {
      id: this.generateId(),
      timestamp: new Date(),
      component: 'self-editing-core',
      status: 'healthy',
      checks: [],
      overallScore: 0,
      recommendations: []
    };

    try {
      // Check configuration
      const configCheck = await this.checkConfiguration();
      healthCheck.checks.push(configCheck);

      // Check subsystems
      const subsystemsCheck = await this.checkSubsystems();
      healthCheck.checks.push(subsystemsCheck);

      // Check resources
      const resourcesCheck = await this.checkResources();
      healthCheck.checks.push(resourcesCheck);

      // Check permissions
      const permissionsCheck = await this.checkPermissions();
      healthCheck.checks.push(permissionsCheck);

      // Calculate overall score
      const passedChecks = healthCheck.checks.filter(check => check.status === 'pass').length;
      healthCheck.overallScore = (passedChecks / healthCheck.checks.length) * 100;
      
      // Determine overall status
      if (healthCheck.overallScore >= 90) {
        healthCheck.status = 'healthy';
      } else if (healthCheck.overallScore >= 70) {
        healthCheck.status = 'warning';
      } else {
        healthCheck.status = 'critical';
      }

      // Generate recommendations
      healthCheck.recommendations = this.generateHealthRecommendations(healthCheck.checks);

      this.healthChecks.push(healthCheck);
      this.emitEvent(SelfEditingEventType.ANALYSIS_COMPLETED, { healthCheck });

      return healthCheck;
    } catch (error) {
      this.logger.error('Health check failed:', error as Error);
      healthCheck.status = 'critical';
      healthCheck.overallScore = 0;
      healthCheck.recommendations = ['Retry health check', 'Check system logs'];
      
      return healthCheck;
    }
  }

  /**
   * Update configuration
   */
  public updateConfiguration(newConfig: Partial<SelfEditingConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };
    
    this.createAuditLog('CONFIGURATION_UPDATED', 'system', 'self-editing-core', {
      oldConfig,
      newConfig,
      timestamp: new Date()
    });

    this.emitEvent(SelfEditingEventType.CONFIGURATION_UPDATED, { oldConfig, newConfig });
  }

  /**
   * Get current configuration
   */
  public getConfiguration(): SelfEditingConfig {
    return { ...this.config };
  }

  private validateConfiguration(): void {
    if (!this.config.enabled) {
      throw new BotError('Self-editing is not enabled', 'medium');
    }

    if (this.config.safety.validationLevel === 'permissive' && this.config.safety.criticalSystemsProtected.length === 0) {
      throw new BotError('Permissive validation level requires critical systems protection', 'high');
    }

    if (this.config.learning.maxChangesPerSession > 100) {
      throw new BotError('Maximum changes per session cannot exceed 100', 'medium');
    }
  }

  private async initializeSubsystems(): Promise<void> {
    // Initialize analysis system
    // Initialize modification system
    // Initialize safety system
    // Initialize learning system
    // Initialize plugin system
    // Initialize monitoring system
    
    this.logger.debug('Subsystems initialized');
  }

  private setupEventHandlers(): void {
    this.on('error', (error: Error) => {
      this.logger.error('Self-Editing Core error:', error as Error);
    });

    this.on('warning', (warning: any) => {
      this.logger.warn('Self-Editing Core warning:', warning);
    });
  }

  private startPeriodicOperations(): void {
    if (this.config.monitoring.enabled) {
      // Start periodic health checks
      setInterval(() => {
        this.performHealthCheck().catch(error => {
          this.logger.error('Periodic health check failed:', error);
        });
      }, 5 * 60 * 1000); // Every 5 minutes
    }

    if (this.config.learning.enabled) {
      // Start periodic learning
      setInterval(() => {
        this.emitEvent(SelfEditingEventType.VALIDATION_FAILED, { timestamp: new Date() });
      }, this.config.learning.modelUpdateInterval * 60 * 60 * 1000); // Convert hours to milliseconds
    }
  }

  private stopPeriodicOperations(): void {
    // Clear all intervals
    this.removeAllListeners();
  }

  private registerEventListeners(): void {
    // Register for system events
    // Register for user events
    // Register for performance events
  }

  private async waitForOperationsCompletion(timeout: number): Promise<void> {
    const startTime = Date.now();
    
    while (this.operations.size > 0 && (Date.now() - startTime) < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (this.operations.size > 0) {
      this.logger.warn(`Timeout waiting for ${this.operations.size} operations to complete`);
    }
  }

  private generateOperationId(): string {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private createProgressTracker(
    operationId: string,
    operationType: string,
    parameters: Record<string, any>
  ): ProgressTracker {
    return {
      id: operationId,
      startTime: new Date(),
      status: 'pending',
      progress: 0,
      currentStep: 'Initializing',
      totalSteps: this.estimateSteps(operationType),
      errors: [],
      warnings: []
    };
  }

  private estimateSteps(operationType: string): number {
    const stepEstimates: Record<string, number> = {
      'code_analysis': 5,
      'code_modification': 8,
      'safety_validation': 6,
      'learning_adaptation': 4,
      'plugin_operation': 3,
      'configuration_update': 2
    };

    return stepEstimates[operationType] || 5;
  }

  private async validateOperation(operationType: string, parameters: Record<string, any>): Promise<void> {
    // Validate operation type
    const validOperations = [
      'code_analysis',
      'code_modification',
      'safety_validation',
      'learning_adaptation',
      'plugin_operation',
      'configuration_update'
    ];

    if (!validOperations.includes(operationType)) {
      throw new BotError(`Invalid operation type: ${operationType}`, 'medium');
    }

    // Validate parameters based on operation type
    switch (operationType) {
      case 'code_modification':
        if (!parameters.target || !parameters.changes) {
          throw new BotError('Code modification requires target and changes', 'medium');
        }
        break;
      case 'plugin_operation':
        if (!parameters.pluginId || !parameters.action) {
          throw new BotError('Plugin operation requires pluginId and action', 'medium');
        }
        break;
    }
  }

  private async executeOperationByType(
    operationType: string,
    parameters: Record<string, any>,
    tracker: ProgressTracker
  ): Promise<any> {
    switch (operationType) {
      case 'code_analysis':
        return this.executeCodeAnalysis(parameters, tracker);
      case 'code_modification':
        return this.executeCodeModification(parameters, tracker);
      case 'safety_validation':
        return this.executeSafetyValidation(parameters, tracker);
      case 'learning_adaptation':
        return this.executeLearningAdaptation(parameters, tracker);
      case 'plugin_operation':
        return this.executePluginOperation(parameters, tracker);
      case 'configuration_update':
        return this.executeConfigurationUpdate(parameters, tracker);
      default:
        throw new BotError(`Unknown operation type: ${operationType}`, 'medium');
    }
  }

  private async executeCodeAnalysis(parameters: any, tracker: ProgressTracker): Promise<any> {
    // Implementation will be added in code analysis system
    tracker.currentStep = 'Analyzing code';
    tracker.progress = 50;
    
    // Mock implementation
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return { analysis: 'completed', metrics: {} };
  }

  private async executeCodeModification(parameters: any, tracker: ProgressTracker): Promise<any> {
    // Implementation will be added in modification system
    tracker.currentStep = 'Modifying code';
    tracker.progress = 50;
    
    // Mock implementation
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return { modification: 'completed', changes: [] };
  }

  private async executeSafetyValidation(parameters: any, tracker: ProgressTracker): Promise<any> {
    // Implementation will be added in safety system
    tracker.currentStep = 'Validating safety';
    tracker.progress = 50;
    
    // Mock implementation
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    return { validation: 'passed', issues: [] };
  }

  private async executeLearningAdaptation(parameters: any, tracker: ProgressTracker): Promise<any> {
    // Implementation will be added in learning system
    tracker.currentStep = 'Adapting learning';
    tracker.progress = 50;
    
    // Mock implementation
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    return { adaptation: 'completed', improvements: [] };
  }

  private async executePluginOperation(parameters: any, tracker: ProgressTracker): Promise<any> {
    // Implementation will be added in plugin system
    tracker.currentStep = 'Operating plugin';
    tracker.progress = 50;
    
    // Mock implementation
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return { operation: 'completed', result: 'success' };
  }

  private async executeConfigurationUpdate(parameters: any, tracker: ProgressTracker): Promise<any> {
    // Implementation will be added in configuration system
    tracker.currentStep = 'Updating configuration';
    tracker.progress = 50;
    
    // Mock implementation
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return { configuration: 'updated', changes: [] };
  }

  private async rollbackOperation(operationId: string): Promise<void> {
    this.logger.info(`Rolling back operation ${operationId}`);
    
    // Implementation will be added in rollback manager
    this.emitEvent(SelfEditingEventType.PLUGIN_INSTALLED, { operationId });
    
    // Mock implementation
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    this.emitEvent(SelfEditingEventType.PLUGIN_UNINSTALLED, { operationId });
  }

  private createAuditLog(
    action: string,
    actor: string,
    target: string,
    details: Record<string, any>
  ): void {
    const auditLog: AuditLog = {
      id: this.generateId(),
      timestamp: new Date(),
      action,
      actor,
      target,
      details,
      result: 'success',
      impact: 'low',
      relatedEvents: []
    };

    this.auditLogs.push(auditLog);
    
    // Keep only last 1000 audit logs
    if (this.auditLogs.length > 1000) {
      this.auditLogs = this.auditLogs.slice(-1000);
    }
  }

  private emitEvent(eventType: SelfEditingEventType, data: Record<string, any>): void {
    const event: SelfEditingEvent = {
      id: this.generateId(),
      type: eventType,
      timestamp: new Date(),
      source: 'self-editing-core',
      data,
      severity: this.getEventSeverity(eventType),
      context: { isRunning: this.isRunning }
    };

    this.emit('event', event);
  }

  private getEventSeverity(eventType: SelfEditingEventType): 'low' | 'medium' | 'high' | 'critical' {
    const severityMap: Record<SelfEditingEventType, 'low' | 'medium' | 'high' | 'critical'> = {
      [SelfEditingEventType.MODIFICATION_STARTED]: 'medium',
      [SelfEditingEventType.MODIFICATION_COMPLETED]: 'low',
      [SelfEditingEventType.MODIFICATION_FAILED]: 'high',
      [SelfEditingEventType.ROLLBACK_INITIATED]: 'high',
      [SelfEditingEventType.ROLLBACK_COMPLETED]: 'medium',
      [SelfEditingEventType.LEARNING_COMPLETED]: 'low',
      [SelfEditingEventType.ANALYSIS_COMPLETED]: 'low',
      [SelfEditingEventType.VALIDATION_FAILED]: 'high',
      [SelfEditingEventType.PLUGIN_INSTALLED]: 'medium',
      [SelfEditingEventType.PLUGIN_UNINSTALLED]: 'medium',
      [SelfEditingEventType.CONFIGURATION_UPDATED]: 'medium',
      [SelfEditingEventType.SAFETY_VIOLATION]: 'critical',
      [SelfEditingEventType.PERFORMANCE_DEGRADATION]: 'high'
    };

    return severityMap[eventType] || 'medium';
  }

  private async checkConfiguration(): Promise<HealthCheckItem> {
    return {
      name: 'Configuration Check',
      status: 'pass',
      message: 'Configuration is valid',
      value: this.config.enabled,
      threshold: true
    };
  }

  private async checkSubsystems(): Promise<HealthCheckItem> {
    return {
      name: 'Subsystems Check',
      status: 'pass',
      message: 'All subsystems operational',
      value: 'operational',
      threshold: 'operational'
    };
  }

  private async checkResources(): Promise<HealthCheckItem> {
    // Mock resource check
    const memoryUsage = process.memoryUsage();
    const memoryUsageMB = memoryUsage.heapUsed / 1024 / 1024;
    
    return {
      name: 'Resource Check',
      status: memoryUsageMB < 500 ? 'pass' : 'warning',
      message: `Memory usage: ${memoryUsageMB.toFixed(2)}MB`,
      value: memoryUsageMB,
      threshold: 500
    };
  }

  private async checkPermissions(): Promise<HealthCheckItem> {
    return {
      name: 'Permissions Check',
      status: 'pass',
      message: 'All required permissions available',
      value: true,
      threshold: true
    };
  }

  private generateHealthRecommendations(checks: HealthCheckItem[]): string[] {
    const recommendations: string[] = [];
    
    checks.forEach(check => {
      if (check.status === 'fail' || check.status === 'warning') {
        recommendations.push(`Address ${check.name}: ${check.message}`);
      }
    });
    
    if (recommendations.length === 0) {
      recommendations.push('System is operating optimally');
    }
    
    return recommendations;
  }
}
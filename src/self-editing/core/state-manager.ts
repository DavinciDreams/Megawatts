import { Logger } from '../../utils/logger.js';
import { BotError } from '../../core/errors';
import {
  ProgressTracker,
  AuditLog,
  HealthCheck,
  SelfEditingEvent,
  SelfEditingEventType
} from '../../types/self-editing.js';

/**
 * Manages state tracking and persistence for self-editing operations
 */
export class StateManager {
  private logger: Logger;
  private state: Map<string, any> = new Map();
  private progressTrackers: Map<string, ProgressTracker> = new Map();
  private auditLogs: AuditLog[] = [];
  private healthChecks: HealthCheck[] = [];
  private events: SelfEditingEvent[] = [];

  constructor(logger: Logger) {
    this.logger = logger;
    this.initializeState();
  }

  /**
   * Initialize state manager
   */
  private async initializeState(): Promise<void> {
    this.logger.info('Initializing State Manager');
    
    try {
      // Load persisted state if available
      await this.loadPersistedState();
      
      // Initialize default state
      this.setDefaultState();
      
      this.logger.info('State Manager initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize State Manager:', error as Error);
      throw new BotError(`State initialization failed: ${error}`, 'medium');
    }
  }

  /**
   * Get state value
   */
  public getState(key: string): any {
    return this.state.get(key);
  }

  /**
   * Set state value
   */
  public setState(key: string, value: any): void {
    this.state.set(key, value);
    this.logger.debug(`State updated: ${key} = ${JSON.stringify(value)}`);
  }

  /**
   * Get all state
   */
  public getAllState(): Record<string, any> {
    const result: Record<string, any> = {};
    this.state.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  /**
   * Clear state
   */
  public clearState(): void {
    this.state.clear();
    this.logger.info('State cleared');
  }

  /**
   * Add progress tracker
   */
  public addProgressTracker(tracker: ProgressTracker): void {
    this.progressTrackers.set(tracker.id, tracker);
    this.emitEvent(SelfEditingEventType.MODIFICATION_STARTED, {
      trackerId: tracker.id,
      status: tracker.status,
      progress: tracker.progress
    });
  }

  /**
   * Update progress tracker
   */
  public updateProgressTracker(
    trackerId: string, 
    updates: Partial<ProgressTracker>
  ): void {
    const tracker = this.progressTrackers.get(trackerId);
    if (!tracker) {
      this.logger.warn(`Progress tracker ${trackerId} not found`);
      return;
    }

    Object.assign(tracker, updates);
    this.emitEvent(SelfEditingEventType.MODIFICATION_COMPLETED, {
      trackerId,
      tracker
    });
  }

  /**
   * Get progress tracker
   */
  public getProgressTracker(trackerId: string): ProgressTracker | null {
    return this.progressTrackers.get(trackerId) || null;
  }

  /**
   * Get all progress trackers
   */
  public getAllProgressTrackers(): ProgressTracker[] {
    return Array.from(this.progressTrackers.values());
  }

  /**
   * Remove progress tracker
   */
  public removeProgressTracker(trackerId: string): void {
    const tracker = this.progressTrackers.get(trackerId);
    if (tracker) {
      this.progressTrackers.delete(trackerId);
      this.emitEvent(SelfEditingEventType.MODIFICATION_FAILED, {
        trackerId,
        finalStatus: tracker.status
      });
    }
  }

  /**
   * Add audit log
   */
  public addAuditLog(auditLog: AuditLog): void {
    this.auditLogs.push(auditLog);
    
    // Keep only last 1000 audit logs
    if (this.auditLogs.length > 1000) {
      this.auditLogs = this.auditLogs.slice(-1000);
    }
    
    this.emitEvent(SelfEditingEventType.ANALYSIS_COMPLETED, {
      auditLog
    });
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
   * Add health check
   */
  public addHealthCheck(healthCheck: HealthCheck): void {
    this.healthChecks.push(healthCheck);
    
    // Keep only last 100 health checks
    if (this.healthChecks.length > 100) {
      this.healthChecks = this.healthChecks.slice(-100);
    }
    
    this.emitEvent(SelfEditingEventType.VALIDATION_FAILED, {
      healthCheck
    });
  }

  /**
   * Get health checks
   */
  public getHealthChecks(limit?: number): HealthCheck[] {
    if (limit) {
      return this.healthChecks.slice(-limit);
    }
    return [...this.healthChecks];
  }

  /**
   * Get system health status
   */
  public getSystemHealth(): {
    status: 'healthy' | 'warning' | 'critical';
    score: number;
    issues: string[];
  } {
    if (this.healthChecks.length === 0) {
      return {
        status: 'healthy',
        score: 100,
        issues: []
      };
    }

    const latestHealthCheck = this.healthChecks[this.healthChecks.length - 1];
    const issues: string[] = [];
    
    latestHealthCheck.checks.forEach(check => {
      if (check.status === 'fail' || check.status === 'warning') {
        issues.push(`${check.name}: ${check.message}`);
      }
    });

    return {
      status: latestHealthCheck.status,
      score: latestHealthCheck.overallScore,
      issues
    };
  }

  /**
   * Persist state to storage
   */
  public async persistState(): Promise<void> {
    try {
      const stateToPersist = {
        state: Object.fromEntries(this.state),
        timestamp: new Date(),
        version: '1.0.0'
      };

      // Mock persistence - would implement actual storage logic
      this.logger.debug('State persisted successfully');
    } catch (error) {
      this.logger.error('Failed to persist state:', error as Error);
      throw new BotError(`State persistence failed: ${error}`, 'medium');
    }
  }

  /**
   * Load persisted state
   */
  public async loadPersistedState(): Promise<void> {
    try {
      // Mock loading - would implement actual loading logic
      this.logger.debug('Persisted state loaded successfully');
    } catch (error) {
      this.logger.warn('Failed to load persisted state:', error as Error);
      // Continue with default state
    }
  }

  /**
   * Get state statistics
   */
  public getStateStatistics(): {
    totalStateKeys: number;
    activeTrackers: number;
    totalAuditLogs: number;
    totalHealthChecks: number;
    systemUptime: number;
  } {
    return {
      totalStateKeys: this.state.size,
      activeTrackers: this.progressTrackers.size,
      totalAuditLogs: this.auditLogs.length,
      totalHealthChecks: this.healthChecks.length,
      systemUptime: this.getState('systemStartTime') ? 
        Date.now() - this.getState('systemStartTime').getTime() : 0
    };
  }

  /**
   * Reset state
   */
  public async resetState(): Promise<void> {
    this.logger.info('Resetting state');
    
    this.state.clear();
    this.progressTrackers.clear();
    this.auditLogs = [];
    this.healthChecks = [];
    this.events = [];
    
    await this.persistState();
    
    this.logger.info('State reset successfully');
  }

  /**
   * Export state
   */
  public exportState(): {
    state: Record<string, any>;
    auditLogs: AuditLog[];
    healthChecks: HealthCheck[];
    statistics: any;
  } {
    return {
      state: this.getAllState(),
      auditLogs: this.getAuditLogs(),
      healthChecks: this.getHealthChecks(),
      statistics: this.getStateStatistics()
    };
  }

  /**
   * Import state
   */
  public async importState(importedState: {
    state: Record<string, any>;
    auditLogs?: AuditLog[];
    healthChecks?: HealthCheck[];
  }): Promise<void> {
    this.logger.info('Importing state');
    
    try {
      // Import state
      Object.entries(importedState.state).forEach(([key, value]) => {
        this.state.set(key, value);
      });
      
      // Import audit logs if provided
      if (importedState.auditLogs) {
        this.auditLogs = [...importedState.auditLogs];
      }
      
      // Import health checks if provided
      if (importedState.healthChecks) {
        this.healthChecks = [...importedState.healthChecks];
      }
      
      this.logger.info('State imported successfully');
    } catch (error) {
      this.logger.error('Failed to import state:', error as Error);
      throw new BotError(`State import failed: ${error}`, 'medium');
    }
  }

  private setDefaultState(): void {
    if (!this.state.has('systemStartTime')) {
      this.setState('systemStartTime', new Date());
    }
    
    if (!this.state.has('version')) {
      this.setState('version', '1.0.0');
    }
    
    if (!this.state.has('environment')) {
      this.setState('environment', 'development');
    }
  }

  private emitEvent(eventType: SelfEditingEventType, data: Record<string, any>): void {
    const event: SelfEditingEvent = {
      id: this.generateId(),
      type: eventType,
      timestamp: new Date(),
      source: 'state-manager',
      data,
      severity: 'low'
    };
    
    this.events.push(event);
    
    // Keep only last 1000 events
    if (this.events.length > 1000) {
      this.events = this.events.slice(-1000);
    }
  }

  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
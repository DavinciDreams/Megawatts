/**
 * Meta-Learning Engine - Orchestrator for Self-Learning System
 * 
 * Coordinates all learning layers, manages learning lifecycle,
 * applies learning constraints and safety boundaries,
 * and tracks learning effectiveness.
 */

import { Logger } from '../utils/logger.js';
import { LearningRepository } from './learning-repository.js';
import { LearningConstraints, LearningLifecycleState, LearningCycleMetrics } from './learning-models.js';
import { SelfDiscovery } from './self-discovery.js';
import { PatternRecognizer } from './pattern-recognizer.js';
import { BehaviorAdapter } from './behavior-adapter.js';
import { LearningValidator } from './learning-validator.js';
import { KnowledgeBase } from './knowledge-base.js';

/**
 * Learning layer interface
 */
interface LearningLayer {
  name: string;
  state: LearningLifecycleState;
  lastExecuted?: Date;
  execute: (context: Record<string, any>) => Promise<any>;
}

/**
 * Learning cycle result
 */
interface LearningCycleResult {
  cycle_id: string;
  start_time: Date;
  end_time: Date;
  duration_ms: number;
  success: boolean;
  metrics: LearningCycleMetrics;
  error?: string;
}

/**
 * Meta-Learning Engine class
 * Orchestrates the entire self-learning system
 */
export class MetaLearningEngine {
  private logger: Logger;
  private repository: LearningRepository;
  private constraints: LearningConstraints;
  private selfDiscovery: SelfDiscovery;
  private patternRecognizer: PatternRecognizer;
  private behaviorAdapter: BehaviorAdapter;
  private learningValidator: LearningValidator;
  private knowledgeBase: KnowledgeBase;
  private learningLayers: Map<string, LearningLayer> = new Map();
  private currentCycleId: string | null = null;
  private cycleHistory: LearningCycleResult[] = [];
  private isRunning: boolean = false;
  private autoLearnInterval?: ReturnType<typeof setInterval>;

  constructor(
    repository: LearningRepository,
    constraints?: Partial<LearningConstraints>
  ) {
    this.repository = repository;
    this.logger = new Logger('MetaLearningEngine');
    
    // Default constraints
    this.constraints = {
      max_patterns_per_type: 1000,
      max_behaviors_per_type: 500,
      max_knowledge_entries: 10000,
      min_confidence_threshold: 0.5,
      min_effectiveness_threshold: 0.6,
      require_approval_for: ['strategy', 'parameter'],
      forbidden_patterns: [],
      safety_boundaries: [
        'no_user_data_exposure',
        'no_unauthorized_modifications',
        'no_privilege_escalation'
      ],
      privacy_protection_enabled: true,
      bias_detection_enabled: true,
      explainability_enabled: true,
      ...constraints
    };

    // Initialize learning layers
    this.selfDiscovery = new SelfDiscovery(repository, this.constraints);
    this.patternRecognizer = new PatternRecognizer(repository, this.constraints);
    this.behaviorAdapter = new BehaviorAdapter(repository, this.constraints);
    this.learningValidator = new LearningValidator(repository, this.constraints);
    this.knowledgeBase = new KnowledgeBase(repository, this.constraints);

    this.initializeLearningLayers();
    this.logger.info('Meta-Learning Engine initialized');
  }

  /**
   * Initialize learning layers
   */
  private initializeLearningLayers(): void {
    // Layer 1: Pattern Recognition
    this.learningLayers.set('pattern_recognition', {
      name: 'Pattern Recognition',
      state: LearningLifecycleState.IDLE,
      execute: async (context) => {
        const interactions = context.interactions || [];
        return await this.patternRecognizer.analyze(interactions);
      }
    });

    // Layer 2: Adaptation
    this.learningLayers.set('adaptation', {
      name: 'Adaptation',
      state: LearningLifecycleState.IDLE,
      execute: async (context) => {
        const patterns = context.patterns || [];
        return await this.behaviorAdapter.adapt(patterns, context);
      }
    });

    // Layer 3: Validation
    this.learningLayers.set('validation', {
      name: 'Validation',
      state: LearningLifecycleState.IDLE,
      execute: async (context) => {
        const entities = context.entities || [];
        const results = [];
        for (const entity of entities) {
          if (entity.type === 'pattern') {
            results.push(await this.learningValidator.validatePattern(entity));
          } else if (entity.type === 'behavior') {
            results.push(await this.learningValidator.validateBehavior(entity));
          } else if (entity.type === 'knowledge') {
            results.push(await this.learningValidator.validateKnowledge(entity));
          }
        }
        return results;
      }
    });

    this.logger.debug(`Initialized ${this.learningLayers.size} learning layers`);
  }

  /**
   * Start the meta-learning engine
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Meta-Learning Engine is already running');
      return;
    }

    this.logger.info('Starting Meta-Learning Engine');
    this.isRunning = true;

    try {
      // Run initial self-discovery
      await this.selfDiscovery.discover();
      this.logger.info('Meta-Learning Engine started successfully');
    } catch (error) {
      this.logger.error('Failed to start Meta-Learning Engine:', error);
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Stop the meta-learning engine
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn('Meta-Learning Engine is not running');
      return;
    }

    this.logger.info('Stopping Meta-Learning Engine');

    // Stop auto-learning
    if (this.autoLearnInterval) {
      clearInterval(this.autoLearnInterval);
      this.autoLearnInterval = undefined;
    }

    this.isRunning = false;
    this.logger.info('Meta-Learning Engine stopped');
  }

  /**
   * Run a complete learning cycle
   * @param context - Learning context
   * @returns Learning cycle result
   */
  async runLearningCycle(context: Record<string, any> = {}): Promise<LearningCycleResult> {
    if (!this.isRunning) {
      throw new Error('Meta-Learning Engine is not running');
    }

    const startTime = Date.now();
    const cycleId = `cycle_${startTime}`;

    this.logger.info(`Starting learning cycle: ${cycleId}`);
    this.currentCycleId = cycleId;

    const metrics: LearningCycleMetrics = {
      cycle_id: cycleId,
      start_time: new Date(startTime),
      end_time: undefined,
      patterns_discovered: 0,
      patterns_validated: 0,
      behaviors_adapted: 0,
      behaviors_validated: 0,
      knowledge_created: 0,
      knowledge_validated: 0,
      knowledge_forgotten: 0,
      safety_checks_passed: 0,
      safety_checks_failed: 0,
      total_duration_ms: undefined,
      success: false,
      error_message: undefined
    };

    try {
      // Layer 1: Self-Discovery
      this.updateLayerState('self_discovery', LearningLifecycleState.DISCOVERING);
      const discoveryResult = await this.selfDiscovery.discover();
      this.updateLayerState('self_discovery', LearningLifecycleState.IDLE);

      // Layer 1: Pattern Recognition
      this.updateLayerState('pattern_recognition', LearningLifecycleState.RECOGNIZING);
      const patternResult = await this.learningLayers.get('pattern_recognition')?.execute(context);
      this.updateLayerState('pattern_recognition', LearningLifecycleState.IDLE);

      if (patternResult?.patterns) {
        metrics.patterns_discovered = patternResult.patterns.length;
      }

      // Layer 2: Adaptation
      this.updateLayerState('adaptation', LearningLifecycleState.ADAPTING);
      const adaptationResult = await this.learningLayers.get('adaptation')?.execute({
        patterns: patternResult?.patterns || [],
        ...context
      });
      this.updateLayerState('adaptation', LearningLifecycleState.IDLE);

      if (adaptationResult?.adaptations) {
        metrics.behaviors_adapted = adaptationResult.adaptations.length;
      }

      // Layer 3: Validation
      this.updateLayerState('validation', LearningLifecycleState.VALIDATING);
      const validationResults = await this.learningLayers.get('validation')?.execute({
        entities: [
          ...(patternResult?.patterns?.map((p: any) => ({ type: 'pattern', ...p })) || []),
          ...(adaptationResult?.adaptations?.map((a: any) => ({ type: 'behavior', ...a })) || [])
        ]
      });
      this.updateLayerState('validation', LearningLifecycleState.IDLE);

      if (Array.isArray(validationResults)) {
        metrics.patterns_validated = validationResults.filter((r: any) => r.entity_type === 'pattern' && r.is_valid).length;
        metrics.behaviors_validated = validationResults.filter((r: any) => r.entity_type === 'behavior' && r.is_valid).length;

        // Count safety checks
        for (const result of validationResults) {
          if (result.safety_checks) {
            metrics.safety_checks_passed += result.safety_checks.filter((c: any) => c.passed).length;
            metrics.safety_checks_failed += result.safety_checks.filter((c: any) => !c.passed).length;
          }
        }
      }

      // Knowledge Management
      const knowledgeCreated = await this.createKnowledgeFromResults(
        discoveryResult,
        patternResult,
        adaptationResult,
        validationResults
      );

      if (knowledgeCreated) {
        metrics.knowledge_created = knowledgeCreated.length;
      }

      // Selective forgetting
      const forgotten = await this.knowledgeBase.selectiveForgetting({
        older_than_days: 30,
        below_confidence: this.constraints.min_confidence_threshold,
        below_usage_count: 5
      });

      metrics.knowledge_forgotten = forgotten;

      // Complete cycle
      const endTime = Date.now();
      const duration = endTime - startTime;

      metrics.end_time = new Date(endTime);
      metrics.total_duration_ms = duration;
      metrics.success = true;

      const result: LearningCycleResult = {
        cycle_id: cycleId,
        start_time: new Date(startTime),
        end_time: new Date(endTime),
        duration_ms: duration,
        success: true,
        metrics
      };

      // Store in history
      this.cycleHistory.push(result);
      this.currentCycleId = null;

      // Log learning event
      await this.repository.events.create({
        id: `event_${Date.now()}`,
        event_type: 'learning_cycle_completed' as any,
        entity_type: 'knowledge',
        entity_id: cycleId,
        description: `Learning cycle completed successfully`,
        details: metrics,
        success: true,
        metadata: {},
        created_at: new Date()
      });

      this.logger.info(`Learning cycle completed: ${cycleId} in ${duration}ms`);
      return result;
    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;

      metrics.end_time = new Date(endTime);
      metrics.total_duration_ms = duration;
      metrics.success = false;
      metrics.error_message = error instanceof Error ? error.message : String(error);

      const result: LearningCycleResult = {
        cycle_id: cycleId,
        start_time: new Date(startTime),
        end_time: new Date(endTime),
        duration_ms: duration,
        success: false,
        metrics,
        error: metrics.error_message
      };

      this.cycleHistory.push(result);
      this.currentCycleId = null;

      // Log learning event
      await this.repository.events.create({
        id: `event_${Date.now()}`,
        event_type: 'constraint_violation' as any,
        entity_type: 'knowledge',
        entity_id: cycleId,
        description: `Learning cycle failed`,
        details: { error: metrics.error_message },
        success: false,
        metadata: {},
        created_at: new Date()
      });

      this.logger.error(`Learning cycle failed: ${cycleId}`, error);
      return result;
    }
  }

  /**
   * Create knowledge from learning results
   * @param discoveryResult - Self-discovery result
   * @param patternResult - Pattern recognition result
   * @param adaptationResult - Adaptation result
   * @param validationResults - Validation results
   * @returns Created knowledge entries
   */
  private async createKnowledgeFromResults(
    discoveryResult: any,
    patternResult: any,
    adaptationResult: any,
    validationResults: any[]
  ): Promise<any[]> {
    const created = [];

    // Create knowledge from discovery
    if (discoveryResult?.optimization_opportunities) {
      for (const opportunity of discoveryResult.optimization_opportunities) {
        try {
          const knowledge = await this.knowledgeBase.create({
            type: 'optimization' as any,
            title: `Optimization: ${opportunity.area}`,
            content: opportunity.description,
            source: 'self_discovery',
            confidence: 0.8,
            privacy_level: 'public' as any,
            tags: ['optimization', opportunity.area, opportunity.potential_impact],
            metadata: {
              potential_impact: opportunity.potential_impact
            }
          });
          created.push(knowledge);
        } catch (error) {
          this.logger.warn(`Failed to create knowledge for ${opportunity.area}:`, error);
        }
      }
    }

    // Create knowledge from patterns
    if (patternResult?.patterns) {
      for (const pattern of patternResult.patterns) {
        try {
          const knowledge = await this.knowledgeBase.create({
            type: 'pattern' as any,
            title: `Pattern: ${pattern.name}`,
            content: pattern.description,
            source: 'pattern_recognition',
            confidence: pattern.confidence,
            privacy_level: 'public' as any,
            tags: ['pattern', pattern.type, `confidence_${Math.round(pattern.confidence * 100)}`],
            metadata: {
              frequency: pattern.frequency,
              examples: pattern.examples
            }
          });
          created.push(knowledge);
        } catch (error) {
          this.logger.warn(`Failed to create knowledge for pattern ${pattern.id}:`, error);
        }
      }
    }

    // Create knowledge from adaptations
    if (adaptationResult?.adaptations) {
      for (const adaptation of adaptationResult.adaptations) {
        try {
          const knowledge = await this.knowledgeBase.create({
            type: 'best_practice' as any,
            title: `Adaptation: ${adaptation.name}`,
            content: adaptation.description,
            source: 'behavior_adaptation',
            confidence: adaptation.expected_effectiveness,
            privacy_level: 'public' as any,
            tags: ['adaptation', adaptation.type, `effectiveness_${Math.round(adaptation.expected_effectiveness * 100)}`],
            metadata: {
              config: adaptation.config,
              requires_approval: adaptationResult.requires_approval
            }
          });
          created.push(knowledge);
        } catch (error) {
          this.logger.warn(`Failed to create knowledge for adaptation ${adaptation.id}:`, error);
        }
      }
    }

    return created;
  }

  /**
   * Start auto-learning
   * @param intervalMs - Interval in milliseconds
   */
  async startAutoLearning(intervalMs: number = 3600000): Promise<void> {
    if (this.autoLearnInterval) {
      this.logger.warn('Auto-learning is already running');
      return;
    }

    this.logger.info(`Starting auto-learning every ${intervalMs}ms`);

    this.autoLearnInterval = setInterval(async () => {
      try {
        await this.runLearningCycle();
      } catch (error) {
        this.logger.error('Auto-learning cycle failed:', error);
      }
    }, intervalMs);

    // Run initial cycle
    await this.runLearningCycle();
  }

  /**
   * Stop auto-learning
   */
  stopAutoLearning(): void {
    if (this.autoLearnInterval) {
      clearInterval(this.autoLearnInterval);
      this.autoLearnInterval = undefined;
      this.logger.info('Auto-learning stopped');
    }
  }

  /**
   * Update layer state
   * @param layerName - Layer name
   * @param state - New state
   */
  private updateLayerState(layerName: string, state: LearningLifecycleState): void {
    const layer = this.learningLayers.get(layerName);
    if (layer) {
      layer.state = state;
      layer.lastExecuted = new Date();
    }
  }

  /**
   * Get learning layer states
   * @returns Map of layer states
   */
  getLayerStates(): Map<string, LearningLifecycleState> {
    const states = new Map<string, LearningLifecycleState>();
    for (const [name, layer] of this.learningLayers.entries()) {
      states.set(name, layer.state);
    }
    return states;
  }

  /**
   * Get cycle history
   * @param limit - Maximum number of cycles to return
   * @returns Cycle history
   */
  getCycleHistory(limit?: number): LearningCycleResult[] {
    const history = [...this.cycleHistory].reverse();
    return limit ? history.slice(0, limit) : history;
  }

  /**
   * Get current cycle ID
   * @returns Current cycle ID or null
   */
  getCurrentCycleId(): string | null {
    return this.currentCycleId;
  }

  /**
   * Get learning effectiveness
   * @returns Effectiveness metrics
   */
  async getEffectiveness(): Promise<{
    total_cycles: number;
    successful_cycles: number;
    failed_cycles: number;
    success_rate: number;
    average_duration_ms: number;
    patterns_per_cycle: number;
    behaviors_per_cycle: number;
    knowledge_per_cycle: number;
  }> {
    const history = this.getCycleHistory();

    const total = history.length;
    const successful = history.filter(c => c.success).length;
    const failed = history.filter(c => !c.success).length;

    const totalDuration = history.reduce((sum, c) => sum + c.duration_ms, 0);
    const totalPatterns = history.reduce((sum, c) => sum + c.metrics.patterns_discovered, 0);
    const totalBehaviors = history.reduce((sum, c) => sum + c.metrics.behaviors_adapted, 0);
    const totalKnowledge = history.reduce((sum, c) => sum + c.metrics.knowledge_created, 0);

    return {
      total_cycles: total,
      successful_cycles: successful,
      failed_cycles: failed,
      success_rate: total > 0 ? successful / total : 0,
      average_duration_ms: total > 0 ? totalDuration / total : 0,
      patterns_per_cycle: total > 0 ? totalPatterns / total : 0,
      behaviors_per_cycle: total > 0 ? totalBehaviors / total : 0,
      knowledge_per_cycle: total > 0 ? totalKnowledge / total : 0
    };
  }

  /**
   * Get learning constraints
   * @returns Current constraints
   */
  getConstraints(): LearningConstraints {
    return { ...this.constraints };
  }

  /**
   * Update learning constraints
   * @param constraints - New constraints
   */
  updateConstraints(constraints: Partial<LearningConstraints>): void {
    this.constraints = { ...this.constraints, ...constraints };

    // Update all layers
    this.selfDiscovery.updateConstraints(this.constraints);
    this.patternRecognizer.updateConstraints(this.constraints);
    this.behaviorAdapter.updateConstraints(this.constraints);
    this.learningValidator.updateConstraints(this.constraints);
    this.knowledgeBase.updateConstraints(this.constraints);

    this.logger.info('Meta-Learning Engine constraints updated', constraints);
  }

  /**
   * Check if learning is running
   * @returns Whether learning is running
   */
  isLearningRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get learning layer by name
   * @param layerName - Layer name
   * @returns Learning layer or null
   */
  getLayer(layerName: string): LearningLayer | null {
    return this.learningLayers.get(layerName) || null;
  }

  /**
   * Get all learning layers
   * @returns Map of learning layers
   */
  getAllLayers(): Map<string, LearningLayer> {
    return new Map(this.learningLayers);
  }

  /**
   * Clear cycle history
   */
  clearCycleHistory(): void {
    this.cycleHistory = [];
    this.logger.debug('Cycle history cleared');
  }

  /**
   * Get component instances
   * @returns Component instances
   */
  getComponents() {
    return {
      selfDiscovery: this.selfDiscovery,
      patternRecognizer: this.patternRecognizer,
      behaviorAdapter: this.behaviorAdapter,
      learningValidator: this.learningValidator,
      knowledgeBase: this.knowledgeBase
    };
  }
}

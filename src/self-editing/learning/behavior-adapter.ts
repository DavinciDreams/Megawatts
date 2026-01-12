import { Logger } from '../../utils/logger.js';

/**
 * User behavior adaptation system
 */
export class BehaviorAdapter {
  private logger: Logger;
  private behaviorPatterns: Map<string, {
    pattern: string;
    frequency: number;
    lastSeen: Date;
    adaptations: Array<{
      type: string;
      description: string;
      effectiveness: number;
    }>;
  }> = new Map();

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Analyze user behavior
   */
  public async analyzeBehavior(
    interactions: Array<{
      type: string;
      content: string;
      timestamp: Date;
      userId?: string;
      context?: any;
    }>
  ): Promise<{
    patterns: Array<{
      pattern: string;
      confidence: number;
      recommendation: string;
    }>;
    adaptations: Array<{
      type: string;
      description: string;
      priority: number;
    }>;
  }> {
    try {
      this.logger.debug('Analyzing user behavior patterns');
      
      const patterns = this.identifyBehaviorPatterns(interactions);
      const adaptations = this.generateAdaptations(patterns);
      
      this.logger.debug(`Behavior analysis completed: ${patterns.length} patterns found`);
      return { patterns, adaptations };
    } catch (error) {
      this.logger.error('Behavior analysis failed:', error as Error);
      throw error;
    }
  }

  /**
   * Adapt system behavior
   */
  public async adaptBehavior(
    adaptation: {
      type: string;
      parameters: any;
    }
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      this.logger.debug(`Applying behavior adaptation: ${adaptation.type}`);
      
      const success = await this.applyAdaptation(adaptation);
      
      if (success) {
        this.logger.info(`Behavior adaptation applied successfully: ${adaptation.type}`);
        return { success: true };
      } else {
        this.logger.error(`Behavior adaptation failed: ${adaptation.type}`);
        return { success: false, error: 'Adaptation application failed' };
      }
    } catch (error) {
      this.logger.error(`Behavior adaptation error:`, error as Error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Learn from adaptation results
   */
  public async learnFromAdaptation(
    adaptation: string,
    effectiveness: number,
    userFeedback?: any
  ): Promise<void> {
    try {
      this.logger.debug(`Learning from adaptation: ${adaptation}`);
      
      const existing = this.behaviorPatterns.get(adaptation);
      if (existing) {
        existing.adaptations.push({
          type: adaptation,
          description: `Adaptation with effectiveness: ${effectiveness}`,
          effectiveness
        });
        
        // Keep only last 20 adaptations
        if (existing.adaptations.length > 20) {
          existing.adaptations = existing.adaptations.slice(-20);
        }
      } else {
        this.behaviorPatterns.set(adaptation, {
          pattern: adaptation,
          frequency: 1,
          lastSeen: new Date(),
          adaptations: [{
            type: adaptation,
            description: `Adaptation with effectiveness: ${effectiveness}`,
            effectiveness
          }]
        });
      }
      
      this.logger.debug('Adaptation learning completed');
    } catch (error) {
      this.logger.error('Adaptation learning failed:', error as Error);
      throw error;
    }
  }

  /**
   * Identify behavior patterns
   */
  private identifyBehaviorPatterns(
    interactions: Array<any>
  ): Array<{
    pattern: string;
    confidence: number;
    recommendation: string;
  }> {
    const patterns = [];
    
    // Analyze interaction types
    const typeCounts = new Map();
    for (const interaction of interactions) {
      typeCounts.set(interaction.type, (typeCounts.get(interaction.type) || 0) + 1);
    }
    
    // Identify frequent patterns
    for (const [type, count] of typeCounts.entries()) {
      if (count > 5) {
        patterns.push({
          pattern: `frequent-${type}`,
          confidence: Math.min(count / interactions.length, 1),
          recommendation: `Optimize for ${type} interactions`
        });
      }
    }
    
    // Analyze timing patterns
    const timePatterns = this.analyzeTimePatterns(interactions);
    patterns.push(...timePatterns);
    
    return patterns;
  }

  /**
   * Analyze time patterns
   */
  private analyzeTimePatterns(
    interactions: Array<any>
  ): Array<{
    pattern: string;
    confidence: number;
    recommendation: string;
  }> {
    const patterns = [];
    const hours = new Map();
    
    for (const interaction of interactions) {
      const hour = interaction.timestamp.getHours();
      hours.set(hour, (hours.get(hour) || 0) + 1);
    }
    
    // Find peak hours
    let maxCount = 0;
    let peakHour = 0;
    for (const [hour, count] of hours.entries()) {
      if (count > maxCount) {
        maxCount = count;
        peakHour = hour;
      }
    }
    
    if (maxCount > interactions.length * 0.3) {
      patterns.push({
        pattern: `peak-hour-${peakHour}`,
        confidence: maxCount / interactions.length,
        recommendation: `Optimize resources for hour ${peakHour}`
      });
    }
    
    return patterns;
  }

  /**
   * Generate adaptations
   */
  private generateAdaptations(
    patterns: Array<{
      pattern: string;
      confidence: number;
      recommendation: string;
    }>
  ): Array<{
    type: string;
    description: string;
    priority: number;
  }> {
    const adaptations = [];
    
    for (const pattern of patterns) {
      if (pattern.pattern.startsWith('frequent-')) {
        const interactionType = pattern.pattern.replace('frequent-', '');
        adaptations.push({
          type: 'optimize-interaction',
          description: `Optimize for ${interactionType} interactions`,
          priority: pattern.confidence * 10
        });
      }
      
      if (pattern.pattern.startsWith('peak-hour-')) {
        adaptations.push({
          type: 'resource-scaling',
          description: 'Adjust resource allocation based on usage patterns',
          priority: pattern.confidence * 8
        });
      }
    }
    
    return adaptations.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Apply adaptation
   */
  private async applyAdaptation(adaptation: any): Promise<boolean> {
    // Mock adaptation application
    switch (adaptation.type) {
      case 'optimize-interaction':
        return await this.optimizeInteraction(adaptation.parameters);
      case 'resource-scaling':
        return await this.adjustResourceScaling(adaptation.parameters);
      case 'response-style':
        return await this.adjustResponseStyle(adaptation.parameters);
      default:
        return false;
    }
  }

  /**
   * Optimize interaction handling
   */
  private async optimizeInteraction(parameters: any): Promise<boolean> {
    // Mock interaction optimization
    return Math.random() > 0.2; // 80% success rate
  }

  /**
   * Adjust resource scaling
   */
  private async adjustResourceScaling(parameters: any): Promise<boolean> {
    // Mock resource scaling adjustment
    return Math.random() > 0.3; // 70% success rate
  }

  /**
   * Adjust response style
   */
  private async adjustResponseStyle(parameters: any): Promise<boolean> {
    // Mock response style adjustment
    return Math.random() > 0.1; // 90% success rate
  }

  /**
   * Get behavior patterns
   */
  public getBehaviorPatterns(): Array<{
    pattern: string;
    frequency: number;
    lastSeen: Date;
    adaptations: Array<{
      type: string;
      description: string;
      effectiveness: number;
    }>;
  }> {
    return Array.from(this.behaviorPatterns.values());
  }

  /**
   * Clear behavior data
   */
  public clearBehaviorData(): void {
    this.behaviorPatterns.clear();
    this.logger.debug('Behavior data cleared');
  }
}
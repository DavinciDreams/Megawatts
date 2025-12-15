import { Logger } from '../../../utils/logger';

/**
 * Pattern recognition for learning from code modifications
 */
export class PatternRecognizer {
  private logger: Logger;
  private patterns: Map<string, {
    pattern: string;
    frequency: number;
    successRate: number;
    lastSeen: Date;
    examples: Array<{
      code: string;
      result: 'success' | 'failure';
      timestamp: Date;
    }>;
  }> = new Map();

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Analyze modification for patterns
   */
  public async analyzeModification(modification: any): Promise<{
    patterns: Array<{
      pattern: string;
      confidence: number;
      recommendation: string;
    }>;
    insights: Array<{
      type: string;
      description: string;
      action: string;
    }>;
  }> {
    try {
      this.logger.debug('Analyzing modification for patterns');
      
      const code = modification.code || '';
      const patterns = this.identifyPatterns(code);
      const insights = this.generateInsights(modification);
      
      this.logger.debug(`Pattern analysis completed: ${patterns.length} patterns found`);
      return { patterns, insights };
    } catch (error) {
      this.logger.error('Pattern analysis failed:', error);
      throw error;
    }
  }

  /**
   * Learn from modification result
   */
  public async learnFromResult(
    modification: any,
    result: 'success' | 'failure',
    metrics?: any
  ): Promise<void> {
    try {
      this.logger.debug(`Learning from modification result: ${result}`);
      
      const code = modification.code || '';
      const patterns = this.extractPatterns(code);
      
      for (const pattern of patterns) {
        await this.updatePattern(pattern, modification, result, metrics);
      }
      
      this.logger.debug('Learning completed');
    } catch (error) {
      this.logger.error('Learning failed:', error);
      throw error;
    }
  }

  /**
   * Identify patterns in code
   */
  private identifyPatterns(code: string): Array<{
    pattern: string;
    confidence: number;
    recommendation: string;
  }> {
    const patterns = [];
    
    // Common code patterns
    const commonPatterns = [
      {
        regex: /for\s*\(\s*let\s+\w+\s*=\s*0\s*;\s*\w+\s*<\s*\w+\s*;\s*\w+\+\+\s*\)/g,
        pattern: 'standard-for-loop',
        recommendation: 'Consider using for...of or array methods for better readability'
      },
      {
        regex: /if\s*\(\s*\w+\s*===\s*(null|undefined)\s*\)/g,
        pattern: 'null-undefined-check',
        recommendation: 'Consider using optional chaining or nullish coalescing'
      },
      {
        regex: /catch\s*\(\s*\w+\s*\)\s*{\s*}/g,
        pattern: 'empty-catch',
        recommendation: 'Add proper error handling in catch blocks'
      },
      {
        regex: /console\.(log|error|warn)/g,
        pattern: 'console-logging',
        recommendation: 'Consider using proper logging framework'
      },
      {
        regex: /new\s+Array\s*\(/g,
        pattern: 'array-constructor',
        recommendation: 'Use array literal syntax [] instead of new Array()'
      }
    ];
    
    for (const { regex, pattern, recommendation } of commonPatterns) {
      const matches = code.match(regex);
      if (matches && matches.length > 0) {
        patterns.push({
          pattern,
          confidence: Math.min(matches.length / 10, 1),
          recommendation
        });
      }
    }
    
    return patterns;
  }

  /**
   * Generate insights
   */
  private generateInsights(modification: any): Array<{
    type: string;
    description: string;
    action: string;
  }> {
    const insights = [];
    const code = modification.code || '';
    
    // Code size insight
    if (code.length > 5000) {
      insights.push({
        type: 'code-size',
        description: 'Large code modification detected',
        action: 'Consider breaking into smaller changes'
      });
    }
    
    // Complexity insight
    const complexity = this.calculateComplexity(code);
    if (complexity > 15) {
      insights.push({
        type: 'complexity',
        description: 'High complexity detected',
        action: 'Consider refactoring for better maintainability'
      });
    }
    
    // Duplicate code insight
    if (this.hasDuplicateCode(code)) {
      insights.push({
        type: 'duplication',
        description: 'Potential code duplication detected',
        action: 'Consider extracting common functionality'
      });
    }
    
    return insights;
  }

  /**
   * Extract patterns from code
   */
  private extractPatterns(code: string): string[] {
    const patterns = [];
    
    // Extract function patterns
    const functionMatches = code.match(/function\s+(\w+)/g);
    if (functionMatches) {
      patterns.push(...functionMatches.map(match => match.replace('function ', '')));
    }
    
    // Extract class patterns
    const classMatches = code.match(/class\s+(\w+)/g);
    if (classMatches) {
      patterns.push(...classMatches.map(match => match.replace('class ', '')));
    }
    
    // Extract import patterns
    const importMatches = code.match(/import\s+.*\s+from\s+['"]([^'"]+)['"]/g);
    if (importMatches) {
      patterns.push(...importMatches);
    }
    
    return patterns;
  }

  /**
   * Update pattern data
   */
  private async updatePattern(
    pattern: string,
    modification: any,
    result: 'success' | 'failure',
    metrics?: any
  ): Promise<void> {
    const existing = this.patterns.get(pattern);
    
    if (existing) {
      existing.frequency++;
      existing.lastSeen = new Date();
      existing.examples.push({
        code: modification.code,
        result,
        timestamp: new Date()
      });
      
      // Calculate success rate
      const recentExamples = existing.examples.slice(-10);
      const successes = recentExamples.filter(ex => ex.result === 'success').length;
      existing.successRate = successes / recentExamples.length;
      
      // Keep only last 50 examples
      if (existing.examples.length > 50) {
        existing.examples = existing.examples.slice(-50);
      }
    } else {
      this.patterns.set(pattern, {
        pattern,
        frequency: 1,
        successRate: result === 'success' ? 1 : 0,
        lastSeen: new Date(),
        examples: [{
          code: modification.code,
          result,
          timestamp: new Date()
        }]
      });
    }
  }

  /**
   * Calculate complexity
   */
  private calculateComplexity(code: string): number {
    let complexity = 0;
    
    // Count control structures
    const controlStructures = ['if', 'else', 'for', 'while', 'switch', 'case', 'try', 'catch'];
    for (const structure of controlStructures) {
      const regex = new RegExp(`\\b${structure}\\b`, 'g');
      const matches = code.match(regex);
      if (matches) {
        complexity += matches.length;
      }
    }
    
    // Count logical operators
    const logicalOps = code.match(/&&|\|\|/g);
    if (logicalOps) {
      complexity += logicalOps.length;
    }
    
    return complexity;
  }

  /**
   * Check for duplicate code
   */
  private hasDuplicateCode(code: string): boolean {
    const lines = code.split('\n').filter(line => line.trim().length > 10);
    const lineCounts = new Map();
    
    for (const line of lines) {
      const trimmed = line.trim();
      lineCounts.set(trimmed, (lineCounts.get(trimmed) || 0) + 1);
    }
    
    return Array.from(lineCounts.values()).some(count => count > 2);
  }

  /**
   * Get learned patterns
   */
  public getLearnedPatterns(): Array<{
    pattern: string;
    frequency: number;
    successRate: number;
    lastSeen: Date;
  }> {
    return Array.from(this.patterns.values()).map(p => ({
      pattern: p.pattern,
      frequency: p.frequency,
      successRate: p.successRate,
      lastSeen: p.lastSeen
    }));
  }

  /**
   * Clear pattern data
   */
  public clearPatterns(): void {
    this.patterns.clear();
    this.logger.debug('Pattern data cleared');
  }
}
import { Logger } from '../../utils/logger';
import { BotError } from '../../utils/errors';

/**
 * Performance analysis for code optimization
 */

// Constants for performance scoring
const PERFORMANCE_SCORE_CONSTANTS = {
  MAX_SCORE: 100,
  MIN_SCORE: 0,
  HIGH_IMPACT_PENALTY: 20,
  MEDIUM_IMPACT_PENALTY: 10,
  LOW_IMPACT_PENALTY: 5,
  MAX_OPTIMIZATION_BONUS: 15,
  HIGH_PRIORITY_THRESHOLD: 30,
  MEDIUM_PRIORITY_THRESHOLD: 15,
} as const;

/**
 * Bottleneck severity levels
 */
type BottleneckSeverity = 'low' | 'medium' | 'high';

/**
 * Optimization priority levels
 */
type OptimizationPriority = 'low' | 'medium' | 'high';

/**
 * Bottleneck analysis result
 */
interface Bottleneck {
  type: string;
  location: string;
  impact: BottleneckSeverity;
  description: string;
  suggestion: string;
}

/**
 * Optimization opportunity result
 */
interface OptimizationOpportunity {
  type: string;
  location: string;
  expectedImprovement: number;
  description: string;
  implementation: string;
}

/**
 * Performance analysis result
 */
interface PerformanceAnalysis {
  timeComplexity: string;
  spaceComplexity: string;
  bottlenecks: Bottleneck[];
  optimizationOpportunities: OptimizationOpportunity[];
}

/**
 * Performance report bottleneck
 */
interface ReportBottleneck {
  type: string;
  severity: BottleneckSeverity;
  description: string;
  recommendation: string;
}

/**
 * Performance report optimization
 */
interface ReportOptimization {
  type: string;
  priority: OptimizationPriority;
  description: string;
  implementation: string;
  expectedImpact: number;
}

/**
 * Performance report summary
 */
interface ReportSummary {
  overallScore: number;
  timeComplexity: string;
  spaceComplexity: string;
  bottlenecksCount: number;
  optimizationsCount: number;
}

/**
 * Complete performance report
 */
interface PerformanceReport {
  summary: ReportSummary;
  bottlenecks: ReportBottleneck[];
  optimizations: ReportOptimization[];
}

export class PerformanceAnalyzer {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Analyze performance metrics
   */
  public async analyzePerformance(
    code: string,
    filePath: string,
    executionData: {
      responseTime: number;
      memoryUsage: number;
      cpuUsage: number;
      throughput: number;
    }
  ): Promise<{
    timeComplexity: string;
    spaceComplexity: string;
    bottlenecks: Array<{
      type: string;
      location: string;
      impact: 'low' | 'medium' | 'high';
      description: string;
      suggestion: string;
    }>;
    optimizationOpportunities: Array<{
      type: string;
      location: string;
      expectedImprovement: number;
      description: string;
      implementation: string;
    }>;
  }> {
    try {
      this.logger.debug(`Analyzing performance for ${filePath}`);
      
      // Mock performance analysis
      const timeComplexity = this.analyzeTimeComplexity(code);
      const spaceComplexity = this.analyzeSpaceComplexity(code);
      const bottlenecks = this.identifyBottlenecks(code, executionData);
      const optimizationOpportunities = this.identifyOptimizations(code, executionData);

      this.logger.debug(`Performance analysis completed for ${filePath}`);
      
      return {
        timeComplexity,
        spaceComplexity,
        bottlenecks,
        optimizationOpportunities
      };
    } catch (error) {
      this.logger.error(`Performance analysis failed for ${filePath}:`, error);
      throw new BotError(`Performance analysis failed: ${error}`, 'medium');
    }
  }

  /**
   * Analyze time complexity
   */
  private analyzeTimeComplexity(code: string): string {
    // Mock time complexity analysis
    const lines = code.split('\n').length;
    const loops = (code.match(/for\s*\(/g) || []).length;
    const nestedLoops = (code.match(/for.*for/g) || []).length;
    const recursions = (code.match(/function\s+\w+\s*\([^)]*\)\s*{[\s\S]/g) || []).length;
    
    if (loops === 0 && recursions === 0) {
      return 'O(1)';
    } else if (nestedLoops > 0) {
      return 'O(n²)';
    } else if (recursions > 0) {
      return 'O(n log n)';
    } else {
      return 'O(n)';
    }
  }

  /**
   * Analyze space complexity
   */
  private analyzeSpaceComplexity(code: string): string {
    // Mock space complexity analysis
    const arrays = (code.match(/\[\s*\]/g) || []).length;
    const objects = (code.match(/\{\s*\}/g) || []).length;
    const nestedStructures = arrays + objects;
    
    if (nestedStructures === 0) {
      return 'O(1)';
    } else {
      return `O(${nestedStructures})`;
    }
  }

  /**
   * Identify performance bottlenecks
   */
  private identifyBottlenecks(
    code: string,
    executionData: any
  ): Array<{
    type: string;
    location: string;
    impact: 'low' | 'medium' | 'high';
    description: string;
    suggestion: string;
  }> {
    const bottlenecks = [];

    // Check for slow database queries
    if (code.includes('database.query') && executionData.responseTime > 1000) {
      bottlenecks.push({
        type: 'Database Query',
        location: 'Database operations',
        impact: 'high',
        description: 'Slow database query detected',
        suggestion: 'Add database indexes and optimize queries'
      });
    }

    // Check for memory leaks
    if (executionData.memoryUsage > 200) {
      bottlenecks.push({
        type: 'Memory Leak',
        location: 'Memory allocation',
        impact: 'medium',
        description: 'High memory usage detected',
        suggestion: 'Check for memory leaks and optimize memory usage'
      });
    }

    // Check for CPU intensive operations
    if (executionData.cpuUsage > 85) {
      bottlenecks.push({
        type: 'CPU Intensive',
        location: 'Computation',
        impact: 'medium',
        description: 'High CPU usage detected',
        suggestion: 'Optimize algorithms and consider async processing'
      });
    }

    return bottlenecks;
  }

  /**
   * Identify optimization opportunities
   */
  private identifyOptimizations(
    code: string,
    executionData: any
  ): Array<{
    type: string;
    location: string;
    expectedImprovement: number;
    description: string;
      implementation: string;
  }> {
    const optimizations = [];

    // Check for caching opportunities
    if (code.includes('fetch') && !code.includes('cache')) {
      optimizations.push({
        type: 'Caching',
        location: 'Data fetching',
        expectedImprovement: 40,
        description: 'Add caching for frequently accessed data',
        implementation: 'Implement Redis or in-memory cache with TTL'
      });
    }

    // Check for lazy loading opportunities
    if (code.includes('import') && code.includes('require')) {
      optimizations.push({
        type: 'Lazy Loading',
        location: 'Module loading',
        expectedImprovement: 25,
        description: 'Implement lazy loading for large modules',
        implementation: 'Use dynamic imports and code splitting'
      });
    }

    // Check for async opportunities
    if (!code.includes('async') && !code.includes('await')) {
      optimizations.push({
        type: 'Async Processing',
        location: 'Synchronous operations',
        expectedImprovement: 30,
        description: 'Convert synchronous operations to async',
        implementation: 'Add async/await keywords and use Promise-based APIs'
      });
    }

    return optimizations;
  }

  /**
   * Generate performance report from analysis results
   *
   * @param analysis - The performance analysis result to convert into a report
   * @returns A structured performance report with summary, bottlenecks, and optimizations
   * @throws {BotError} If the analysis is invalid or report generation fails
   */
  public generatePerformanceReport(analysis: PerformanceAnalysis): PerformanceReport {
    try {
      this.validateAnalysis(analysis);
      
      const bottlenecks = this.transformBottlenecks(analysis.bottlenecks);
      const optimizations = this.transformOptimizations(analysis.optimizationOpportunities);
      const summary = this.generateSummary(analysis, bottlenecks, optimizations);

      this.logger.debug('Performance report generated successfully');

      return {
        summary,
        bottlenecks,
        optimizations
      };
    } catch (error) {
      this.logger.error('Failed to generate performance report:', error);
      throw new BotError(`Performance report generation failed: ${error}`, 'medium');
    }
  }

  /**
   * Validate the analysis input
   *
   * @param analysis - The analysis to validate
   * @throws {Error} If the analysis is invalid
   */
  private validateAnalysis(analysis: PerformanceAnalysis): void {
    if (!analysis) {
      throw new Error('Analysis cannot be null or undefined');
    }

    if (!analysis.timeComplexity || typeof analysis.timeComplexity !== 'string') {
      throw new Error('Invalid time complexity in analysis');
    }

    if (!analysis.spaceComplexity || typeof analysis.spaceComplexity !== 'string') {
      throw new Error('Invalid space complexity in analysis');
    }

    if (!Array.isArray(analysis.bottlenecks)) {
      throw new Error('Bottlenecks must be an array');
    }

    if (!Array.isArray(analysis.optimizationOpportunities)) {
      throw new Error('Optimization opportunities must be an array');
    }
  }

  /**
   * Transform bottlenecks from analysis format to report format
   *
   * @param bottlenecks - Array of bottlenecks from analysis
   * @returns Array of report-ready bottlenecks
   */
  private transformBottlenecks(bottlenecks: Bottleneck[]): ReportBottleneck[] {
    return bottlenecks.map((bottleneck): ReportBottleneck => ({
      type: bottleneck.type,
      severity: bottleneck.impact,
      description: bottleneck.description,
      recommendation: bottleneck.suggestion
    }));
  }

  /**
   * Transform optimization opportunities from analysis format to report format
   *
   * @param optimizations - Array of optimization opportunities from analysis
   * @returns Array of report-ready optimizations
   */
  private transformOptimizations(optimizations: OptimizationOpportunity[]): ReportOptimization[] {
    return optimizations.map((optimization): ReportOptimization => ({
      type: optimization.type,
      priority: this.getOptimizationPriority(optimization.expectedImprovement),
      description: optimization.description,
      implementation: optimization.implementation,
      expectedImpact: optimization.expectedImprovement
    }));
  }

  /**
   * Generate the report summary
   *
   * @param analysis - The performance analysis
   * @param bottlenecks - Transformed bottlenecks
   * @param optimizations - Transformed optimizations
   * @returns The report summary
   */
  private generateSummary(
    analysis: PerformanceAnalysis,
    bottlenecks: ReportBottleneck[],
    optimizations: ReportOptimization[]
  ): ReportSummary {
    return {
      overallScore: this.calculatePerformanceScore(analysis),
      timeComplexity: analysis.timeComplexity,
      spaceComplexity: analysis.spaceComplexity,
      bottlenecksCount: bottlenecks.length,
      optimizationsCount: optimizations.length
    };
  }

  /**
   * Calculate the overall performance score based on bottlenecks and optimizations
   *
   * @param analysis - The performance analysis
   * @returns A score between 0 and 100
   */
  private calculatePerformanceScore(analysis: PerformanceAnalysis): number {
    let score = PERFORMANCE_SCORE_CONSTANTS.MAX_SCORE;

    // Deduct points for bottlenecks
    analysis.bottlenecks.forEach((bottleneck) => {
      switch (bottleneck.impact) {
        case 'high':
          score -= PERFORMANCE_SCORE_CONSTANTS.HIGH_IMPACT_PENALTY;
          break;
        case 'medium':
          score -= PERFORMANCE_SCORE_CONSTANTS.MEDIUM_IMPACT_PENALTY;
          break;
        case 'low':
          score -= PERFORMANCE_SCORE_CONSTANTS.LOW_IMPACT_PENALTY;
          break;
        default:
          // Unknown impact level - ignore
          break;
      }
    });

    // Add bonus points for optimization opportunities
    analysis.optimizationOpportunities.forEach((optimization) => {
      const bonus = Math.min(
        PERFORMANCE_SCORE_CONSTANTS.MAX_OPTIMIZATION_BONUS,
        optimization.expectedImprovement / 2
      );
      score += bonus;
    });

    // Clamp score to valid range
    return Math.max(
      PERFORMANCE_SCORE_CONSTANTS.MIN_SCORE,
      Math.min(PERFORMANCE_SCORE_CONSTANTS.MAX_SCORE, score)
    );
  }

  /**
   * Determine the priority level for an optimization based on expected improvement
   *
   * @param improvement - The expected improvement percentage
   * @returns The priority level (high, medium, or low)
   */
  private getOptimizationPriority(improvement: number): OptimizationPriority {
    if (improvement >= PERFORMANCE_SCORE_CONSTANTS.HIGH_PRIORITY_THRESHOLD) {
      return 'high';
    }
    if (improvement >= PERFORMANCE_SCORE_CONSTANTS.MEDIUM_PRIORITY_THRESHOLD) {
      return 'medium';
    }
    return 'low';
  }
}
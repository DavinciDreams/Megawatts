import { Logger } from '../../../utils/logger';
import { BotError } from '../../../types';
import { ComplexityMetrics, HalsteadMetrics } from '../../../types/self-editing';

/**
 * Complexity analysis for code maintainability assessment
 */
export class ComplexityAnalyzer {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Calculate cyclomatic complexity
   */
  public calculateCyclomaticComplexity(code: string): number {
    try {
      this.logger.debug('Calculating cyclomatic complexity');
      
      // Mock cyclomatic complexity calculation
      // In real implementation, this would parse the AST and count:
      // - Decision points (if, for, while, case, etc.)
      // - Logical operators (&&, ||, etc.)
      // - Number of linearly independent paths
      
      const decisionPoints = (code.match(/\b(if|else|for|while|case|switch|catch|try)\b/g) || []).length;
      const logicalOperators = (code.match(/[&&|\|\||^]/g) || []).length;
      const linearPaths = Math.floor(decisionPoints / 2) + 1;
      
      const complexity = decisionPoints + logicalOperators + linearPaths;
      
      this.logger.debug(`Cyclomatic complexity calculated: ${complexity}`);
      return complexity;
    } catch (error) {
      this.logger.error('Failed to calculate cyclomatic complexity:', error);
      throw new BotError(`Cyclomatic complexity calculation failed: ${error}`, 'medium');
    }
  }

  /**
   * Calculate cognitive complexity
   */
  public calculateCognitiveComplexity(code: string): number {
    try {
      this.logger.debug('Calculating cognitive complexity');
      
      // Mock cognitive complexity calculation
      // In real implementation, this would analyze:
      // - Nesting levels
      // - Number of conditions
      // - Number of logical operators
      // - Number of unique variables
      
      const nestingLevel = this.calculateNestingLevel(code);
      const conditions = (code.match(/\b(if|else|while|for|switch|case)\b/g) || []).length;
      const logicalOperators = (code.match(/[&&|\|\||^]/g) || []).length;
      const uniqueVars = this.countUniqueVariables(code);
      
      const cognitiveComplexity = nestingLevel + conditions + logicalOperators + Math.floor(uniqueVars / 3);
      
      this.logger.debug(`Cognitive complexity calculated: ${cognitiveComplexity}`);
      return cognitiveComplexity;
    } catch (error) {
      this.logger.error('Failed to calculate cognitive complexity:', error);
      throw new BotError(`Cognitive complexity calculation failed: ${error}`, 'medium');
    }
  }

  /**
   * Calculate Halstead metrics
   */
  public calculateHalsteadMetrics(code: string): HalsteadMetrics {
    try {
      this.logger.debug('Calculating Halstead metrics');
      
      // Mock Halstead metrics calculation
      // In real implementation, this would:
      // - Count unique operators and operands
      // - Calculate total operators and operands
      // - Calculate vocabulary and length
      // - Calculate volume, difficulty, effort, time, and bugs
      
      const operators = this.extractOperators(code);
      const operands = this.extractOperands(code);
      const uniqueOperators = new Set(operators);
      const uniqueOperands = new Set(operands);
      
      const vocabulary = uniqueOperators.size + uniqueOperands.size;
      const length = operators.length + operands.length;
      const calculatedLength = vocabulary * Math.log2(vocabulary);
      
      const volume = length * Math.log2(vocabulary);
      const difficulty = (uniqueOperators.size / 2) * (uniqueOperands.size / 2);
      const effort = difficulty * length;
      const time = effort / 18; // Seconds to read
      const bugs = effort / 3000; // Approximate number of bugs
      
      const metrics: HalsteadMetrics = {
        vocabulary,
        length,
        calculatedLength,
        volume,
        difficulty,
        effort,
        time,
        bugs
      };
      
      this.logger.debug(`Halstead metrics calculated:`, metrics);
      return metrics;
    } catch (error) {
      this.logger.error('Failed to calculate Halstead metrics:', error);
      throw new BotError(`Halstead metrics calculation failed: ${error}`, 'medium');
    }
  }

  /**
   * Calculate maintainability index
   */
  public calculateMaintainabilityIndex(
    cyclomaticComplexity: number,
    halsteadMetrics: HalsteadMetrics,
    linesOfCode: number
  ): number {
    try {
      this.logger.debug('Calculating maintainability index');
      
      // Mock maintainability index calculation
      // In real implementation, this would use the formula:
      // MI = 171 - 5.2 * ln(Halstead Volume) - 0.23 * (Halstead Difficulty) - 16.2 * ln(Halstead Vocabulary)
      
      const halsteadVolume = halsteadMetrics.volume;
      const halsteadDifficulty = halsteadMetrics.difficulty;
      const halsteadVocabulary = halsteadMetrics.vocabulary;
      
      const maintainabilityIndex = Math.max(0,
        171 - 5.2 * Math.log(halsteadVolume) -
        0.23 * halsteadDifficulty -
        16.2 * Math.log(halsteadVocabulary)
      );
      
      this.logger.debug(`Maintainability index calculated: ${maintainabilityIndex}`);
      return maintainabilityIndex;
    } catch (error) {
      this.logger.error('Failed to calculate maintainability index:', error);
      throw new BotError(`Maintainability index calculation failed: ${error}`, 'medium');
    }
  }

  /**
   * Calculate technical debt
   */
  public calculateTechnicalDebt(
    cyclomaticComplexity: number,
    maintainabilityIndex: number,
    linesOfCode: number
  ): number {
    try {
      this.logger.debug('Calculating technical debt');
      
      // Mock technical debt calculation
      // In real implementation, this would calculate based on:
      // - Code complexity
      // - Code duplication
      // - Code smells
      // - Test coverage
      // - Documentation quality
      
      const complexityDebt = Math.max(0, (cyclomaticComplexity - 10) * 2); // 2 hours per point over 10
      const maintainabilityDebt = Math.max(0, (100 - maintainabilityIndex) * 0.5); // 0.5 hours per point under 100
      
      const technicalDebt = complexityDebt + maintainabilityDebt;
      
      this.logger.debug(`Technical debt calculated: ${technicalDebt} hours`);
      return technicalDebt;
    } catch (error) {
      this.logger.error('Failed to calculate technical debt:', error);
      throw new BotError(`Technical debt calculation failed: ${error}`, 'medium');
    }
  }

  /**
   * Analyze complexity trends
   */
  public analyzeComplexityTrends(
    historicalData: Array<{
      timestamp: Date;
      cyclomaticComplexity: number;
      cognitiveComplexity: number;
      maintainabilityIndex: number;
    }>
  ): {
    trend: 'improving' | 'stable' | 'degrading';
    averageComplexity: number;
    recommendations: string[];
  } {
    if (historicalData.length < 2) {
      throw new BotError('Insufficient data for trend analysis', 'medium');
    }

    // Mock trend analysis
    const recentData = historicalData.slice(-10);
    const avgCyclomatic = recentData.reduce((sum, d) => sum + d.cyclomaticComplexity, 0) / recentData.length;
    const avgCognitive = recentData.reduce((sum, d) => sum + d.cognitiveComplexity, 0) / recentData.length;
    const avgMaintainability = recentData.reduce((sum, d) => sum + d.maintainabilityIndex, 0) / recentData.length;

    const trend = this.calculateTrend(recentData.map(d => d.cyclomaticComplexity));
    const averageComplexity = (avgCyclomatic + avgCognitive) / 2;

    const recommendations = this.generateComplexityRecommendations(avgCyclomatic, avgCognitive, avgMaintainability);

    return {
      trend,
      averageComplexity,
      recommendations
    };
  }

  private calculateNestingLevel(code: string): number {
    const lines = code.split('\n');
    let maxNesting = 0;
    let currentNesting = 0;

    for (const line of lines) {
      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;
      currentNesting += openBraces - closeBraces;
      maxNesting = Math.max(maxNesting, currentNesting);
    }

    return maxNesting;
  }

  private countUniqueVariables(code: string): number {
    // Mock variable counting
    const variablePattern = /\b(?:const|let|var)\s+([a-zA-Z_$][\w$]*)/g;
    const matches = code.match(variablePattern) || [];
    const uniqueVariables = new Set(matches.map(m => m[1]));
    return uniqueVariables.size;
  }

  private extractOperators(code: string): string[] {
    // Mock operator extraction
    const operators = [];
    const operatorPatterns = [
      /\+\s*/g, /\-\s*/g, /\*\s*/g, /\/\s*/g, /%\s*/g, // Arithmetic
      /===?\s*/g, /!==?\s*/g, /<\s*/g, />\s*/g, />=\s*/g, // Comparison
      /&&?\s*/g, /\|\|\s*/g, /\^?\s*/g // Logical
    ];

    operatorPatterns.forEach(pattern => {
      const matches = code.match(pattern);
      if (matches) {
        operators.push(...matches);
      }
    });

    return operators;
  }

  private extractOperands(code: string): string[] {
    // Mock operand extraction
    const operands = [];
    const operandPattern = /\b([a-zA-Z_$][\w$]*)\b/g;
    const matches = code.match(operandPattern) || [];
    
    matches.forEach(match => {
      if (match && !operands.includes(match[1])) {
        operands.push(match[1]);
      }
    });

    return operands;
  }

  private calculateTrend(values: number[]): 'improving' | 'stable' | 'degrading' {
    if (values.length < 3) return 'stable';
    
    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));
    
    const firstAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;
    
    const difference = secondAvg - firstAvg;
    const threshold = Math.abs(firstAvg) * 0.05; // 5% threshold
    
    if (Math.abs(difference) < threshold) {
      return 'stable';
    }
    
    return difference > 0 ? 'degrading' : 'improving';
  }

  private generateComplexityRecommendations(
    cyclomaticComplexity: number,
    cognitiveComplexity: number,
    maintainabilityIndex: number
  ): string[] {
    const recommendations = [];

    if (cyclomaticComplexity > 15) {
      recommendations.push('Consider refactoring complex functions to reduce cyclomatic complexity');
    }

    if (cognitiveComplexity > 15) {
      recommendations.push('Break down complex functions into smaller, more focused units');
    }

    if (maintainabilityIndex < 50) {
      recommendations.push('Improve code documentation and add unit tests to increase maintainability');
    }

    if (cyclomaticComplexity < 5 && cognitiveComplexity < 8 && maintainabilityIndex > 80) {
      recommendations.push('Current complexity is within acceptable ranges');
    }

    return recommendations;
  }
}
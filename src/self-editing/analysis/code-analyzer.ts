import { EventEmitter } from 'events';
import { Logger } from '../../utils/logger';
import { BotError } from '../../utils/errors';
import {
  CodeAnalysis,
  AnalysisType,
  AnalysisResult,
  CodeLocation,
  Recommendation,
  RecommendationType,
  ImpactAssessment,
  RiskAssessment,
  Evidence,
  IssueType,
  SuggestionType
} from '../../types/self-editing';
import { randomUUID } from 'crypto';

/**
 * Issue severity levels
 */
const ISSUE_SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
} as const;

/**
 * Complexity thresholds for analysis
 */
const COMPLEXITY_THRESHOLDS = {
  CYCLOMATIC_COMPLEXITY: 10,
  COGNITIVE_COMPLEXITY: 15,
  MAINTAINABILITY_INDEX: 50,
  TECHNICAL_DEBT_RATIO: 0.05
} as const;

/**
 * Security thresholds
 */
const SECURITY_THRESHOLDS = {
  RISK_SCORE_CRITICAL: 8,
  RISK_SCORE_HIGH: 5,
  COMPLIANCE_SCORE_MINIMUM: 70
} as const;

/**
 * Performance thresholds
 */
const PERFORMANCE_THRESHOLDS = {
  BOTTLENECK_COUNT_HIGH: 3,
  OPTIMIZATION_OPPORTUNITY_THRESHOLD: 20
} as const;

/**
 * Recommendation priority levels
 */
const RECOMMENDATION_PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
} as const;

/**
 * Analysis options interface
 */
interface AnalysisOptions {
  analysisTypes?: AnalysisType[];
  includeRecommendations?: boolean;
  depth?: number;
  excludePatterns?: string[];
}

/**
 * Multiple analysis options interface
 */
interface MultipleAnalysisOptions extends AnalysisOptions {
  parallel?: boolean;
  maxConcurrency?: number;
}

/**
 * Comparison result interface
 */
interface ComparisonResult {
  improvements: string[];
  regressions: string[];
  unchanged: string[];
}

/**
 * Analysis statistics interface
 */
interface AnalysisStatistics {
  totalAnalyses: number;
  averageConfidence: number;
  commonIssues: string[];
  mostAnalyzedFiles: string[];
}

/**
 * Main code analyzer that orchestrates all analysis operations
 */
export class CodeAnalyzer extends EventEmitter {
  private logger: Logger;
  private analysisHistory: CodeAnalysis[] = [];
  private isAnalyzing = false;

  /**
   * Maximum history size to prevent memory issues
   */
  private static readonly MAX_HISTORY_SIZE = 1000;

  /**
   * Default concurrency for parallel analysis
   */
  private static readonly DEFAULT_CONCURRENCY = 3;

  constructor(logger: Logger) {
    super();
    this.logger = logger;
  }

  /**
   * Analyze code file or directory
   * @param target - File or directory path to analyze
   * @param options - Analysis configuration options
   * @returns Promise resolving to analysis results
   */
  public async analyzeCode(
    target: string,
    options: AnalysisOptions = {}
  ): Promise<CodeAnalysis> {
    this.validateTarget(target);
    
    if (this.isAnalyzing) {
      throw new BotError('Analysis already in progress', 'medium');
    }

    this.isAnalyzing = true;
    const analysisId = this.generateAnalysisId();

    try {
      this.logger.info(`Starting code analysis ${analysisId} for target: ${target}`);
      this.emit('analysisStarted', { analysisId, target, options });

      const analysis: CodeAnalysis = {
        id: analysisId,
        timestamp: new Date(),
        filePath: target,
        analysisType: options.analysisTypes?.[0] || AnalysisType.STATIC,
        results: await this.performAnalysis(target, options),
        confidence: 0.85,
        recommendations: []
      };

      // Generate recommendations if requested
      if (options.includeRecommendations !== false) {
        analysis.recommendations = await this.generateRecommendations(analysis.results);
      }

      this.addToHistory(analysis);
      this.isAnalyzing = false;

      this.logger.info(`Successfully completed analysis ${analysisId}`);
      this.emit('analysisCompleted', { analysisId, analysis });

      return analysis;
    } catch (error) {
      this.isAnalyzing = false;
      this.logger.error(`Analysis ${analysisId} failed:`, error);
      this.emit('analysisFailed', { analysisId, error });
      throw new BotError(
        `Code analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        'medium'
      );
    }
  }

  /**
   * Analyze multiple targets
   * @param targets - Array of file/directory paths to analyze
   * @param options - Analysis configuration options
   * @returns Promise resolving to array of analysis results
   */
  public async analyzeMultiple(
    targets: string[],
    options: MultipleAnalysisOptions = {}
  ): Promise<CodeAnalysis[]> {
    this.validateTargets(targets);
    
    this.logger.info(`Starting analysis of ${targets.length} targets`);

    const {
      parallel,
      maxConcurrency = CodeAnalyzer.DEFAULT_CONCURRENCY,
      ...analysisOptions
    } = options;

    if (parallel !== false) {
      return this.analyzeParallel(targets, maxConcurrency, analysisOptions);
    } else {
      return this.analyzeSequential(targets, analysisOptions);
    }
  }

  /**
   * Get analysis history
   * @param limit - Maximum number of analyses to return
   * @returns Array of analyses
   */
  public getAnalysisHistory(limit?: number): CodeAnalysis[] {
    if (limit) {
      return this.analysisHistory.slice(-limit);
    }
    return [...this.analysisHistory];
  }

  /**
   * Get analysis by ID
   * @param analysisId - Unique identifier for the analysis
   * @returns Analysis or null if not found
   */
  public getAnalysis(analysisId: string): CodeAnalysis | null {
    return this.analysisHistory.find(a => a.id === analysisId) || null;
  }

  /**
   * Compare two analyses
   * @param analysisId1 - First analysis ID
   * @param analysisId2 - Second analysis ID
   * @returns Promise resolving to comparison results
   */
  public async compareAnalyses(
    analysisId1: string,
    analysisId2: string
  ): Promise<ComparisonResult> {
    const analysis1 = this.getAnalysis(analysisId1);
    const analysis2 = this.getAnalysis(analysisId2);

    if (!analysis1 || !analysis2) {
      throw new BotError('One or both analyses not found', 'medium');
    }

    // Mock comparison - would implement actual comparison logic
    return {
      improvements: ['Reduced complexity in file1.ts', 'Improved test coverage'],
      regressions: ['Increased memory usage in file2.ts'],
      unchanged: ['File3.ts remains the same']
    };
  }

  /**
   * Get analysis statistics
   * @returns Statistics about all analyses
   */
  public getAnalysisStatistics(): AnalysisStatistics {
    if (this.analysisHistory.length === 0) {
      return {
        totalAnalyses: 0,
        averageConfidence: 0,
        commonIssues: [],
        mostAnalyzedFiles: []
      };
    }

    const totalAnalyses = this.analysisHistory.length;
    const averageConfidence = this.analysisHistory.reduce(
      (sum, a) => sum + a.confidence,
      0
    ) / totalAnalyses;
    
    // Mock statistics - would implement actual analysis
    return {
      totalAnalyses,
      averageConfidence,
      commonIssues: ['High complexity', 'Low test coverage', 'Security vulnerabilities'],
      mostAnalyzedFiles: ['src/core/', 'src/utils/', 'src/plugins/']
    };
  }

  /**
   * Validate target path
   * @param target - File or directory path
   * @throws Error if target is invalid
   */
  private validateTarget(target: string): void {
    if (!target || typeof target !== 'string' || target.trim().length === 0) {
      throw new BotError('Invalid target: must be a non-empty string', 'medium');
    }
  }

  /**
   * Validate multiple targets
   * @param targets - Array of file/directory paths
   * @throws Error if targets are invalid
   */
  private validateTargets(targets: string[]): void {
    if (!Array.isArray(targets) || targets.length === 0) {
      throw new BotError('Invalid targets: must be a non-empty array', 'medium');
    }
    
    targets.forEach(target => this.validateTarget(target));
  }

  /**
   * Add analysis to history with size limit
   * @param analysis - Analysis to add
   */
  private addToHistory(analysis: CodeAnalysis): void {
    this.analysisHistory.push(analysis);
    
    // Prevent memory issues by limiting history size
    if (this.analysisHistory.length > CodeAnalyzer.MAX_HISTORY_SIZE) {
      this.analysisHistory.shift();
    }
  }

  /**
   * Perform analysis in parallel with concurrency control
   * @param targets - Array of targets to analyze
   * @param maxConcurrency - Maximum concurrent analyses
   * @param options - Analysis options
   * @returns Promise resolving to array of analyses
   */
  private async analyzeParallel(
    targets: string[],
    maxConcurrency: number,
    options: AnalysisOptions
  ): Promise<CodeAnalysis[]> {
    const chunks = this.chunkArray(targets, maxConcurrency);
    const results: CodeAnalysis[][] = [];
    
    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map(target => this.analyzeCode(target, options))
      );
      results.push(chunkResults);
    }
    
    return results.flat();
  }

  /**
   * Perform analysis sequentially
   * @param targets - Array of targets to analyze
   * @param options - Analysis options
   * @returns Promise resolving to array of analyses
   */
  private async analyzeSequential(
    targets: string[],
    options: AnalysisOptions
  ): Promise<CodeAnalysis[]> {
    const results: CodeAnalysis[] = [];
    
    for (const target of targets) {
      const result = await this.analyzeCode(target, options);
      results.push(result);
    }
    
    return results;
  }

  /**
   * Perform the actual code analysis
   * @param target - File or directory to analyze
   * @param options - Analysis options
   * @returns Promise resolving to analysis results
   */
  private async performAnalysis(
    target: string,
    options: AnalysisOptions
  ): Promise<AnalysisResult> {
    // Mock analysis result - would implement actual analysis logic
    return this.createMockAnalysisResult(target);
  }

  /**
   * Create mock analysis result for development
   * @param target - Target file path
   * @returns Mock analysis result
   */
  private createMockAnalysisResult(target: string): AnalysisResult {
    return {
      complexity: {
        cyclomaticComplexity: 15,
        cognitiveComplexity: 8,
        halsteadMetrics: {
          vocabulary: 45,
          length: 120,
          calculatedLength: 115,
          volume: 680,
          difficulty: 12,
          effort: 8160,
          time: 453,
          bugs: 2
        },
        maintainabilityIndex: 75,
        technicalDebt: 2.5
      },
      quality: {
        testCoverage: 85,
        codeDuplication: 12,
        codeSmells: 3,
        maintainability: 78,
        readability: 82,
        documentation: 65
      },
      security: {
        vulnerabilities: [
          {
            id: 'vuln_001',
            severity: ISSUE_SEVERITY.MEDIUM,
            type: 'SQL Injection',
            description: 'Potential SQL injection vulnerability',
            location: this.createCodeLocation(target, 45, 12, 'processUserData'),
            recommendation: 'Use parameterized queries',
            cve: 'CVE-2023-1234'
          }
        ],
        riskScore: 6.5,
        complianceScore: 85,
        sensitiveData: [
          {
            type: 'API Key',
            location: this.createCodeLocation(target, 10, 5, 'initializeAPI'),
            risk: ISSUE_SEVERITY.HIGH,
            recommendation: 'Use environment variables for sensitive data'
          }
        ]
      },
      performance: {
        timeComplexity: 'O(n²)',
        spaceComplexity: 'O(n)',
        bottlenecks: [
          {
            type: 'Database Query',
            location: this.createCodeLocation(target, 78, 8, 'fetchUserData'),
            impact: ISSUE_SEVERITY.HIGH,
            description: 'Inefficient database query causing slowdown',
            suggestion: 'Add database indexes and optimize query'
          }
        ],
        optimizationOpportunities: [
          {
            type: 'Caching',
            location: this.createCodeLocation(target, 25, 15, 'getUserProfile'),
            expectedImprovement: 40,
            description: 'Implement caching for user profile data',
            implementation: 'Add Redis cache with 5-minute TTL'
          }
        ]
      },
      dependencies: {
        dependencies: [
          {
            name: 'express',
            version: '4.18.0',
            type: 'production',
            required: true,
            securityVulnerabilities: 2,
            outdated: false
          },
          {
            name: 'lodash',
            version: '4.17.21',
            type: 'production',
            required: false,
            securityVulnerabilities: 0,
            outdated: true
          }
        ],
        circularDependencies: [
          {
            files: ['file1.ts', 'file2.ts', 'file1.ts'],
            severity: ISSUE_SEVERITY.MEDIUM,
            description: 'Circular dependency between file1 and file2'
          }
        ],
        unusedDependencies: ['moment', 'axios'],
        outdatedDependencies: [
          {
            name: 'lodash',
            currentVersion: '4.17.21',
            latestVersion: '4.20.0',
            securityIssues: 0,
            breakingChanges: false
          }
        ]
      },
      issues: [
        {
          id: this.generateId(),
          type: IssueType.CODE_SMELL,
          severity: ISSUE_SEVERITY.MEDIUM,
          location: this.createCodeLocation(target, 120, 10, 'processLargeDataset'),
          message: 'Function too complex - consider refactoring',
          suggestion: 'Break down into smaller functions',
          autoFixable: false
        }
      ],
      suggestions: [
        {
          id: this.generateId(),
          type: SuggestionType.REFACTORING,
          priority: RECOMMENDATION_PRIORITY.HIGH,
          location: this.createCodeLocation(target, 120, 10, 'processLargeDataset'),
          description: 'Refactor complex function for better maintainability',
          implementation: 'Extract logic into separate helper functions',
          expectedBenefit: 'Improved maintainability and testability',
          risk: ISSUE_SEVERITY.LOW
        }
      ]
    };
  }

  /**
   * Create a code location object
   * @param file - File path
   * @param line - Line number
   * @param column - Column number
   * @param function - Function name
   * @returns Code location object
   */
  private createCodeLocation(
    file: string,
    line: number,
    column: number,
    func: string
  ): CodeLocation {
    return {
      file,
      line,
      column,
      function: func
    };
  }

  /**
   * Generate recommendations based on analysis results
   * @param results - Analysis results
   * @returns Promise resolving to array of recommendations
   */
  private async generateRecommendations(
    results: AnalysisResult
  ): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];

    // Check complexity
    this.addComplexityRecommendations(results, recommendations);
    
    // Check security
    this.addSecurityRecommendations(results, recommendations);
    
    // Check performance
    this.addPerformanceRecommendations(results, recommendations);

    return recommendations;
  }

  /**
   * Add complexity-based recommendations
   * @param results - Analysis results
   * @param recommendations - Array to add recommendations to
   */
  private addComplexityRecommendations(
    results: AnalysisResult,
    recommendations: Recommendation[]
  ): void {
    if (results.complexity.cyclomaticComplexity > COMPLEXITY_THRESHOLDS.CYCLOMATIC_COMPLEXITY) {
      recommendations.push({
        id: this.generateId(),
        type: RecommendationType.CODE_REFACTORING,
        priority: RECOMMENDATION_PRIORITY.HIGH,
        description: 'High cyclomatic complexity detected',
        rationale: `Complexity of ${results.complexity.cyclomaticComplexity} exceeds recommended threshold of ${COMPLEXITY_THRESHOLDS.CYCLOMATIC_COMPLEXITY}`,
        implementation: 'Refactor complex functions into smaller, more focused functions',
        expectedImpact: this.createImpactAssessment(0.2, 0.1, 0.8, 0.3),
        risk: this.createRiskAssessment('medium', false, true, 'simple', 0.9)
      });
    }
  }

  /**
   * Add security-based recommendations
   * @param results - Analysis results
   * @param recommendations - Array to add recommendations to
   */
  private addSecurityRecommendations(
    results: AnalysisResult,
    recommendations: Recommendation[]
  ): void {
    if (results.security.riskScore > SECURITY_THRESHOLDS.RISK_SCORE_HIGH) {
      const priority = results.security.riskScore > SECURITY_THRESHOLDS.RISK_SCORE_CRITICAL
        ? RECOMMENDATION_PRIORITY.CRITICAL
        : RECOMMENDATION_PRIORITY.HIGH;

      recommendations.push({
        id: this.generateId(),
        type: RecommendationType.SECURITY_IMPROVEMENT,
        priority,
        description: 'Security vulnerabilities detected',
        rationale: `Risk score of ${results.security.riskScore} indicates security issues`,
        implementation: 'Address all identified security vulnerabilities',
        expectedImpact: this.createImpactAssessment(-0.1, 0.9, 0.2, 0.1),
        risk: this.createRiskAssessment('high', true, true, 'moderate', 0.8)
      });
    }
  }

  /**
   * Add performance-based recommendations
   * @param results - Analysis results
   * @param recommendations - Array to add recommendations to
   */
  private addPerformanceRecommendations(
    results: AnalysisResult,
    recommendations: Recommendation[]
  ): void {
    if (results.performance.bottlenecks.length > 0) {
      recommendations.push({
        id: this.generateId(),
        type: RecommendationType.PERFORMANCE_OPTIMIZATION,
        priority: RECOMMENDATION_PRIORITY.MEDIUM,
        description: 'Performance bottlenecks identified',
        rationale: `${results.performance.bottlenecks.length} bottlenecks found`,
        implementation: 'Optimize identified performance bottlenecks',
        expectedImpact: this.createImpactAssessment(0.7, 0.0, 0.1, 0.6),
        risk: this.createRiskAssessment('medium', false, true, 'simple', 0.85)
      });
    }
  }

  /**
   * Create an impact assessment object
   * @param performance - Performance impact (-1 to 1)
   * @param security - Security impact (-1 to 1)
   * @param maintainability - Maintainability impact (-1 to 1)
   * @param userExperience - User experience impact (-1 to 1)
   * @returns Impact assessment object
   */
  private createImpactAssessment(
    performance: number,
    security: number,
    maintainability: number,
    userExperience: number
  ): ImpactAssessment {
    const overall = (performance + security + maintainability + userExperience) / 4;
    
    return {
      performance,
      security,
      maintainability,
      userExperience,
      overall
    };
  }

  /**
   * Create a risk assessment object
   * @param complexity - Complexity level
   * @param breakingChanges - Whether breaking changes are expected
   * @param testingRequired - Whether testing is required
   * @param rollbackComplexity - Rollback complexity level
   * @param confidence - Confidence level (0 to 1)
   * @returns Risk assessment object
   */
  private createRiskAssessment(
    complexity: 'low' | 'medium' | 'high',
    breakingChanges: boolean,
    testingRequired: boolean,
    rollbackComplexity: 'simple' | 'moderate' | 'complex',
    confidence: number
  ): RiskAssessment {
    return {
      complexity,
      breakingChanges,
      testingRequired,
      rollbackComplexity,
      confidence
    };
  }

  /**
   * Chunk array into smaller arrays
   * @param array - Array to chunk
   * @param chunkSize - Size of each chunk
   * @returns Array of chunked arrays
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Generate a unique analysis ID
   * @returns Unique analysis identifier
   */
  private generateAnalysisId(): string {
    return `analysis_${randomUUID()}`;
  }

  /**
   * Generate a unique ID
   * @returns Unique identifier
   */
  private generateId(): string {
    return randomUUID();
  }
}

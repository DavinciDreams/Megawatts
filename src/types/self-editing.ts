// Comprehensive type definitions for self-editing framework

import { BotError } from './index';

// Core Self-Editing Types
export interface SelfEditingConfig {
  enabled: boolean;
  interval: number; // minutes
  safety: SafetyConfig;
  learning: LearningConfig;
  modification: ModificationConfig;
  monitoring: MonitoringConfig;
  plugins: PluginSystemConfig;
  meta: MetaLearningConfig;
  userFeedback: UserFeedbackConfig;
  codeQuality: CodeQualityConfig;
  performance: PerformanceConfig;
}

export interface UserFeedbackConfig {
  enabled: boolean;
  minInteractions: number;
  collectionMethod: 'reactions' | 'ratings' | 'comments' | 'all';
  analysisInterval: number; // hours
}

export interface CodeQualityConfig {
  enabled: boolean;
  analysisTools: string[];
  complexityThreshold: number;
  coverageThreshold: number;
  autoFix: boolean;
}

export interface PerformanceConfig {
  enabled: boolean;
  thresholds: {
    responseTime: number;
    errorRate: number;
    memoryUsage: number;
    cpuUsage: number;
  };
  monitoringInterval: number; // minutes
}

export interface SafetyConfig {
  enabled: boolean;
  validationLevel: 'strict' | 'moderate' | 'permissive';
  rollbackEnabled: boolean;
  sandboxEnabled: boolean;
  maxModificationsPerSession: number;
  criticalSystemsProtected: string[];
  approvalRequired: boolean;
  securityScanning: boolean;
  performanceThresholds: PerformanceThresholds;
}

export interface PerformanceThresholds {
  maxResponseTimeIncrease: number; // percentage
  maxMemoryUsageIncrease: number; // percentage
  maxCPUUsageIncrease: number; // percentage
  maxErrorRateIncrease: number; // percentage
  minTestCoverage: number; // percentage
  maxComplexityIncrease: number; // cyclomatic complexity
}

export interface LearningConfig {
  enabled: boolean;
  adaptationRate: number;
  maxChangesPerSession: number;
  learningAlgorithm: 'reinforcement' | 'genetic' | 'neural' | 'hybrid';
  feedbackWeight: number;
  performanceWeight: number;
  userBehaviorWeight: number;
  historicalDataRetention: number; // days
  modelUpdateInterval: number; // hours
}

export interface ModificationConfig {
  enabled: boolean;
  hotReloadEnabled: boolean;
  backupEnabled: boolean;
  versionControl: VersionControlConfig;
  codeAnalysis: CodeAnalysisConfig;
  transformation: TransformationConfig;
}

export interface VersionControlConfig {
  enabled: boolean;
  autoCommit: boolean;
  branchStrategy: 'feature' | 'release' | 'hotfix';
  taggingEnabled: boolean;
  maxVersionsRetained: number;
}

export interface CodeAnalysisConfig {
  staticAnalysis: boolean;
  dynamicAnalysis: boolean;
  securityScanning: boolean;
  performanceAnalysis: boolean;
  complexityAnalysis: boolean;
  dependencyAnalysis: boolean;
  qualityMetrics: boolean;
}

export interface TransformationConfig {
  maxComplexity: number;
  preserveComments: boolean;
  preserveFormatting: boolean;
  validateSyntax: boolean;
  generateTests: boolean;
  updateDocumentation: boolean;
}

export interface MonitoringConfig {
  enabled: boolean;
  realTimeMonitoring: boolean;
  performanceTracking: boolean;
  anomalyDetection: boolean;
  successRateTracking: boolean;
  impactAnalysis: boolean;
  alerting: AlertingConfig;
  metrics: MetricsConfig;
}

export interface AlertingConfig {
  enabled: boolean;
  channels: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  thresholds: AlertThresholds;
}

export interface AlertThresholds {
  failureRate: number;
  performanceDegradation: number;
  errorCount: number;
  resourceUsage: number;
}

export interface MetricsConfig {
  collectPerformanceMetrics: boolean;
  collectUserMetrics: boolean;
  collectSystemMetrics: boolean;
  collectModificationMetrics: boolean;
  collectLearningMetrics: boolean;
  retentionPeriod: number; // days
}

export interface PluginSystemConfig {
  enabled: boolean;
  autoDiscovery: boolean;
  sandboxing: boolean;
  dependencyManagement: boolean;
  versioning: boolean;
  marketplace: MarketplaceConfig;
}

export interface MarketplaceConfig {
  enabled: boolean;
  trustedSources: string[];
  autoUpdate: boolean;
  securityScanning: boolean;
  communityVoting: boolean;
}

export interface MetaLearningConfig {
  enabled: boolean;
  selfAwareness: boolean;
  capabilityDiscovery: boolean;
  knowledgeRepresentation: boolean;
  learningStrategyOptimization: boolean;
  introspectionInterval: number; // hours
}

// Code Analysis Types
export interface CodeAnalysis {
  id: string;
  timestamp: Date;
  filePath: string;
  analysisType: AnalysisType;
  results: AnalysisResult;
  confidence: number;
  recommendations: Recommendation[];
}

export enum AnalysisType {
  STATIC = 'static',
  DYNAMIC = 'dynamic',
  SECURITY = 'security',
  PERFORMANCE = 'performance',
  COMPLEXITY = 'complexity',
  DEPENDENCY = 'dependency',
  QUALITY = 'quality'
}

export interface AnalysisResult {
  complexity: ComplexityMetrics;
  quality: QualityMetrics;
  security: SecurityMetrics;
  performance: PerformanceMetrics;
  dependencies: DependencyAnalysis;
  issues: CodeIssue[];
  suggestions: CodeSuggestion[];
}

export interface ComplexityMetrics {
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  halsteadMetrics: HalsteadMetrics;
  maintainabilityIndex: number;
  technicalDebt: number;
}

export interface HalsteadMetrics {
  vocabulary: number;
  length: number;
  calculatedLength: number;
  volume: number;
  difficulty: number;
  effort: number;
  time: number;
  bugs: number;
}

export interface QualityMetrics {
  testCoverage: number;
  codeDuplication: number;
  codeSmells: number;
  maintainability: number;
  readability: number;
  documentation: number;
}

export interface SecurityMetrics {
  vulnerabilities: SecurityVulnerability[];
  riskScore: number;
  complianceScore: number;
  sensitiveData: SensitiveData[];
}

export interface SecurityVulnerability {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: string;
  description: string;
  location: CodeLocation;
  recommendation: string;
  cve?: string;
}

export interface SensitiveData {
  type: string;
  location: CodeLocation;
  risk: 'low' | 'medium' | 'high' | 'critical';
  recommendation: string;
}

export interface PerformanceMetrics {
  timeComplexity: string;
  spaceComplexity: string;
  bottlenecks: PerformanceBottleneck[];
  optimizationOpportunities: OptimizationOpportunity[];
}

export interface PerformanceBottleneck {
  type: string;
  location: CodeLocation;
  impact: 'low' | 'medium' | 'high';
  description: string;
  suggestion: string;
}

export interface OptimizationOpportunity {
  type: string;
  location: CodeLocation;
  expectedImprovement: number;
  description: string;
  implementation: string;
}

export interface DependencyAnalysis {
  dependencies: Dependency[];
  circularDependencies: CircularDependency[];
  unusedDependencies: string[];
  outdatedDependencies: OutdatedDependency[];
}

export interface Dependency {
  name: string;
  version: string;
  type: 'production' | 'development' | 'peer';
  required: boolean;
  securityVulnerabilities: number;
  outdated: boolean;
}

export interface CircularDependency {
  files: string[];
  severity: 'low' | 'medium' | 'high';
  description: string;
}

export interface OutdatedDependency {
  name: string;
  currentVersion: string;
  latestVersion: string;
  securityIssues: number;
  breakingChanges: boolean;
}

export interface CodeIssue {
  id: string;
  type: IssueType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  location: CodeLocation;
  message: string;
  suggestion: string;
  autoFixable: boolean;
}

export enum IssueType {
  SYNTAX_ERROR = 'syntax_error',
  LOGIC_ERROR = 'logic_error',
  PERFORMANCE_ISSUE = 'performance_issue',
  SECURITY_VULNERABILITY = 'security_vulnerability',
  CODE_SMELL = 'code_smell',
  DUPLICATE_CODE = 'duplicate_code',
  UNREACHABLE_CODE = 'unreachable_code',
  DEAD_CODE = 'dead_code'
}

export interface CodeSuggestion {
  id: string;
  type: SuggestionType;
  priority: 'low' | 'medium' | 'high';
  location: CodeLocation;
  description: string;
  implementation: string;
  expectedBenefit: string;
  risk: 'low' | 'medium' | 'high';
}

export enum SuggestionType {
  REFACTORING = 'refactoring',
  OPTIMIZATION = 'optimization',
  SIMPLIFICATION = 'simplification',
  MODERNIZATION = 'modernization',
  DOCUMENTATION = 'documentation',
  TESTING = 'testing'
}

export interface CodeLocation {
  file: string;
  line: number;
  column: number;
  function?: string;
  class?: string;
}

export interface Recommendation {
  id: string;
  type: RecommendationType;
  priority: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  rationale: string;
  implementation: string;
  expectedImpact: ImpactAssessment;
  risk: RiskAssessment;
}

export enum RecommendationType {
  PERFORMANCE_OPTIMIZATION = 'performance_optimization',
  SECURITY_IMPROVEMENT = 'security_improvement',
  CODE_REFACTORING = 'code_refactoring',
  FEATURE_ENHANCEMENT = 'feature_enhancement',
  BUG_FIX = 'bug_fix',
  DOCUMENTATION_UPDATE = 'documentation_update'
}

export interface ImpactAssessment {
  performance: number; // -1 to 1
  security: number; // -1 to 1
  maintainability: number; // -1 to 1
  userExperience: number; // -1 to 1
  overall: number; // -1 to 1
}

export interface RiskAssessment {
  complexity: 'low' | 'medium' | 'high';
  breakingChanges: boolean;
  testingRequired: boolean;
  rollbackComplexity: 'simple' | 'moderate' | 'complex';
  confidence: number; // 0 to 1
}

// Code Modification Types
export interface CodeModification {
  id: string;
  timestamp: Date;
  type: ModificationType;
  target: ModificationTarget;
  changes: ModificationChange[];
  validation: ValidationReport;
  testing: TestingReport;
  rollback: RollbackPlan;
  metadata: ModificationMetadata;
}

export enum ModificationType {
  ADD = 'add',
  MODIFY = 'modify',
  DELETE = 'delete',
  REFACTOR = 'refactor',
  OPTIMIZE = 'optimize',
  FIX = 'fix',
  ENHANCE = 'enhance'
}

export interface ModificationTarget {
  files: string[];
  functions: string[];
  classes: string[];
  modules: string[];
  components: string[];
}

export interface ModificationChange {
  id: string;
  type: ModificationType;
  file: string;
  location: CodeLocation;
  originalCode?: string;
  newCode?: string;
  description: string;
  reason: string;
  risk: 'low' | 'medium' | 'high';
}

export interface ValidationReport {
  id: string;
  timestamp: Date;
  status: 'pending' | 'passed' | 'failed' | 'warning';
  checks: ValidationCheck[];
  overallScore: number;
  recommendations: string[];
  blockers: string[];
}

export interface ValidationCheck {
  name: string;
  type: ValidationType;
  status: 'passed' | 'failed' | 'warning';
  message: string;
  details?: Record<string, any>;
}

export enum ValidationType {
  SYNTAX = 'syntax',
  SECURITY = 'security',
  PERFORMANCE = 'performance',
  COMPATIBILITY = 'compatibility',
  TESTING = 'testing',
  DOCUMENTATION = 'documentation'
}

export interface TestingReport {
  id: string;
  timestamp: Date;
  status: 'pending' | 'passed' | 'failed';
  testResults: TestResult[];
  coverage: CoverageReport;
  performance: PerformanceTestReport;
  summary: TestSummary;
}

export interface TestResult {
  id: string;
  name: string;
  type: TestType;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  message?: string;
  details?: Record<string, any>;
}

export enum TestType {
  UNIT = 'unit',
  INTEGRATION = 'integration',
  E2E = 'e2e',
  PERFORMANCE = 'performance',
  SECURITY = 'security',
  REGRESSION = 'regression'
}

export interface CoverageReport {
  lines: number;
  functions: number;
  branches: number;
  statements: number;
  uncoveredLines: number[];
  uncoveredFunctions: string[];
  uncoveredBranches: number[];
}

export interface PerformanceTestReport {
  responseTime: PerformanceMetric;
  throughput: PerformanceMetric;
  memoryUsage: PerformanceMetric;
  cpuUsage: PerformanceMetric;
  errorRate: PerformanceMetric;
}

export interface PerformanceMetric {
  current: number;
  baseline: number;
  improvement: number;
  unit: string;
}

export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  successRate: number;
  duration: number;
}

export interface RollbackPlan {
  id: string;
  timestamp: Date;
  modifications: string[];
  backupLocation: string;
  steps: RollbackStep[];
  verification: VerificationStep[];
  estimatedTime: number;
  complexity: 'simple' | 'moderate' | 'complex';
}

export interface RollbackStep {
  order: number;
  description: string;
  command: string;
  expectedOutcome: string;
  rollbackStep?: string;
}

export interface VerificationStep {
  order: number;
  description: string;
  check: string;
  expectedValue: any;
  critical: boolean;
}

export interface ModificationMetadata {
  author: string;
  reason: string;
  context: Record<string, any>;
  tags: string[];
  relatedIssues: string[];
  relatedCommits: string[];
  reviewStatus: 'pending' | 'approved' | 'rejected';
  reviewers: string[];
}

// Learning System Types
export interface LearningData {
  id: string;
  timestamp: Date;
  type: LearningType;
  input: LearningInput;
  output: LearningOutput;
  feedback: LearningFeedback;
  context: LearningContext;
}

export enum LearningType {
  PERFORMANCE = 'performance',
  USER_BEHAVIOR = 'user_behavior',
  CODE_QUALITY = 'code_quality',
  ERROR_PATTERNS = 'error_patterns',
  SUCCESS_PATTERNS = 'success_patterns',
  ADAPTATION_RESULT = 'adaptation_result'
}

export interface LearningInput {
  metrics: PerformanceMetrics;
  userFeedback: UserFeedback[];
  codeAnalysis: CodeAnalysis;
  systemState: SystemState;
  environmentalFactors: EnvironmentalFactors;
}

export interface LearningOutput {
  adaptations: AdaptationRecommendation[];
  predictions: Prediction[];
  insights: LearningInsight[];
  strategies: LearningStrategy[];
}

export interface UserFeedback {
  id: string;
  type: 'reaction' | 'rating' | 'comment' | 'interaction';
  value: string | number;
  userId: string;
  guildId?: string;
  channelId?: string;
  messageId?: string;
  timestamp: Date;
  context?: Record<string, any>;
  sentiment?: 'positive' | 'neutral' | 'negative';
  category?: FeedbackCategory;
}

export enum FeedbackCategory {
  COMMAND_SUGGESTION = 'command_suggestion',
  BUG_REPORT = 'bug_report',
  FEATURE_REQUEST = 'feature_request',
  PERFORMANCE_ISSUE = 'performance_issue',
  USER_EXPERIENCE = 'user_experience',
  MODERATION = 'moderation'
}

export interface SystemState {
  performance: SystemPerformance;
  health: SystemHealth;
  configuration: SystemConfiguration;
  resources: ResourceUsage;
  errors: SystemError[];
}

export interface SystemPerformance {
  responseTime: number;
  throughput: number;
  errorRate: number;
  availability: number;
  latency: number;
}

export interface SystemHealth {
  status: 'healthy' | 'warning' | 'critical';
  issues: HealthIssue[];
  uptime: number;
  lastRestart: Date;
  version: string;
}

export interface HealthIssue {
  component: string;
  issue: string;
  severity: 'low' | 'medium' | 'high';
  impact: string;
  resolution: string;
}

export interface SystemConfiguration {
  features: FeatureFlags;
  settings: Record<string, any>;
  environment: 'development' | 'staging' | 'production';
  version: string;
}

export interface FeatureFlags {
  [key: string]: boolean;
}

export interface ResourceUsage {
  memory: number;
  cpu: number;
  disk: number;
  network: number;
  connections: number;
}

export interface SystemError {
  id: string;
  type: string;
  message: string;
  stack: string;
  timestamp: Date;
  context: Record<string, any>;
  resolved: boolean;
}

export interface EnvironmentalFactors {
  timeOfDay: number;
  dayOfWeek: number;
  season: string;
  load: 'low' | 'medium' | 'high';
  events: ExternalEvent[];
}

export interface ExternalEvent {
  type: string;
  description: string;
  impact: 'low' | 'medium' | 'high';
  timestamp: Date;
}

export interface LearningFeedback {
  success: boolean;
  accuracy: number;
  userSatisfaction: number;
  performanceImpact: number;
  unexpectedBehaviors: string[];
  improvementAreas: string[];
}

export interface LearningContext {
  guildId?: string;
  channelId?: string;
  userId?: string;
  command?: string;
  situation: string;
  previousActions: string[];
  goals: string[];
}

export interface AdaptationRecommendation {
  id: string;
  type: AdaptationType;
  priority: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  expectedImpact: ImpactAssessment;
  implementation: ImplementationPlan;
  risk: RiskAssessment;
  confidence: number;
  evidence: Evidence[];
}

export enum AdaptationType {
  PERFORMANCE_OPTIMIZATION = 'performance_optimization',
  BEHAVIOR_ADJUSTMENT = 'behavior_adjustment',
  CONFIGURATION_CHANGE = 'configuration_change',
  CODE_REFACTORING = 'code_refactoring',
  FEATURE_ENHANCEMENT = 'feature_enhancement',
  BUG_FIX = 'bug_fix'
}

export interface ImplementationPlan {
  steps: ImplementationStep[];
  estimatedTime: number;
  requiredResources: string[];
  dependencies: string[];
  testingRequirements: TestingRequirement[];
}

export interface ImplementationStep {
  order: number;
  description: string;
  action: string;
  target: string;
  expectedOutcome: string;
  verification: string;
}

export interface TestingRequirement {
  type: TestType;
  description: string;
  coverage: number;
  performance: PerformanceRequirement;
}

export interface PerformanceRequirement {
  responseTime: number;
  throughput: number;
  resourceUsage: number;
}

export interface Evidence {
  type: 'metric' | 'feedback' | 'analysis' | 'pattern';
  source: string;
  data: Record<string, any>;
  weight: number;
  timestamp: Date;
}

export interface Prediction {
  id: string;
  type: PredictionType;
  confidence: number;
  timeframe: string;
  outcome: PredictionOutcome;
  factors: PredictionFactor[];
}

export enum PredictionType {
  PERFORMANCE = 'performance',
  USER_SATISFACTION = 'user_satisfaction',
  ERROR_RATE = 'error_rate',
  RESOURCE_USAGE = 'resource_usage',
  SUCCESS_RATE = 'success_rate'
}

export interface PredictionOutcome {
  value: number;
  unit: string;
  trend: 'increasing' | 'decreasing' | 'stable';
  significance: 'low' | 'medium' | 'high';
}

export interface PredictionFactor {
  name: string;
  impact: number;
  correlation: number;
  description: string;
}

export interface LearningInsight {
  id: string;
  type: InsightType;
  description: string;
  significance: 'low' | 'medium' | 'high';
  actionable: boolean;
  recommendations: string[];
  evidence: Evidence[];
}

export enum InsightType {
  PATTERN = 'pattern',
  ANOMALY = 'anomaly',
  CORRELATION = 'correlation',
  TREND = 'trend',
  OPPORTUNITY = 'opportunity'
}

export interface LearningStrategy {
  id: string;
  name: string;
  description: string;
  effectiveness: number;
 适用情况: string[];
  parameters: StrategyParameter[];
  lastUpdated: Date;
}

export interface StrategyParameter {
  name: string;
  value: any;
  type: 'number' | 'string' | 'boolean' | 'array';
  description: string;
  constraints: ParameterConstraint[];
}

export interface ParameterConstraint {
  type: 'min' | 'max' | 'enum' | 'pattern';
  value: any;
  description: string;
}

// Plugin System Types
export interface Plugin {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  category: PluginCategory;
  enabled: boolean;
  installed: boolean;
  configuration: PluginConfiguration;
  dependencies: PluginDependency[];
  permissions: PluginPermission[];
  hooks: PluginHook[];
  metadata: PluginMetadata;
}

export enum PluginCategory {
  ADMINISTRATION = 'administration',
  MODERATION = 'moderation',
  UTILITY = 'utility',
  FUN = 'fun',
  INFORMATION = 'information',
  AI = 'ai',
  INTEGRATION = 'integration',
  DEVELOPMENT = 'development'
}

export interface PluginConfiguration {
  default: Record<string, any>;
  current: Record<string, any>;
  schema: ConfigurationSchema;
  validation: ValidationRule[];
}

export interface ConfigurationSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean';
  properties?: Record<string, ConfigurationSchema>;
  items?: ConfigurationSchema;
  required?: string[];
  enum?: any[];
  minimum?: number;
  maximum?: number;
  pattern?: string;
  format?: string;
}

export interface ValidationRule {
  name: string;
  type: 'required' | 'pattern' | 'range' | 'custom';
  parameters: Record<string, any>;
  message: string;
}

export interface PluginDependency {
  name: string;
  version: string;
  optional: boolean;
  reason: string;
}

export interface PluginPermission {
  name: string;
  description: string;
  required: boolean;
  risk: 'low' | 'medium' | 'high';
}

export interface PluginHook {
  event: string;
  handler: string;
  priority: number;
  async: boolean;
}

export interface PluginMetadata {
  repository?: string;
  homepage?: string;
  documentation?: string;
  license: string;
  keywords: string[];
  tags: string[];
  downloadCount: number;
  rating: number;
  reviews: number;
  lastUpdated: Date;
  securityScore: number;
  compatibility: string[];
}

// Meta-Learning Types
export interface MetaLearningData {
  id: string;
  timestamp: Date;
  selfAwareness: SelfAwarenessData;
  capabilities: CapabilityAssessment;
  knowledge: KnowledgeRepresentation;
  strategies: LearningStrategyAssessment;
  introspection: IntrospectionResult;
}

export interface SelfAwarenessData {
  currentAbilities: string[];
  limitations: string[];
  performanceBaseline: PerformanceBaseline;
  learningProgress: LearningProgress;
  adaptationHistory: AdaptationHistory;
}

export interface PerformanceBaseline {
  metrics: Record<string, number>;
  established: Date;
  lastUpdated: Date;
  variance: number;
}

export interface LearningProgress {
  totalAdaptations: number;
  successfulAdaptations: number;
  failedAdaptations: number;
  averageConfidence: number;
  learningRate: number;
  improvementTrend: 'improving' | 'stable' | 'declining';
}

export interface AdaptationHistory {
  adaptations: AdaptationRecord[];
  patterns: AdaptationPattern[];
  effectiveness: EffectivenessMetrics;
}

export interface AdaptationRecord {
  id: string;
  timestamp: Date;
  type: AdaptationType;
  success: boolean;
  impact: number;
  confidence: number;
  duration: number;
  rollbackRequired: boolean;
}

export interface AdaptationPattern {
  pattern: string;
  frequency: number;
  successRate: number;
  averageImpact: number;
  context: string[];
}

export interface EffectivenessMetrics {
  overallSuccessRate: number;
  averageImpact: number;
  timeToEffectiveness: number;
  rollbackRate: number;
  userSatisfaction: number;
}

export interface CapabilityAssessment {
  knownCapabilities: Capability[];
  potentialCapabilities: PotentialCapability[];
  capabilityGaps: CapabilityGap[];
  developmentRoadmap: CapabilityRoadmap;
}

export interface Capability {
  name: string;
  description: string;
  category: string;
  maturity: 'emerging' | 'developing' | 'mature' | 'optimized';
  performance: number;
  reliability: number;
  usage: number;
}

export interface PotentialCapability {
  name: string;
  description: string;
  feasibility: number;
  requirements: string[];
  estimatedEffort: number;
  potentialImpact: number;
}

export interface CapabilityGap {
  area: string;
  current: string;
  desired: string;
  gap: string;
  priority: 'low' | 'medium' | 'high';
  solution?: string;
}

export interface CapabilityRoadmap {
  shortTerm: RoadmapItem[];
  mediumTerm: RoadmapItem[];
  longTerm: RoadmapItem[];
}

export interface RoadmapItem {
  capability: string;
  description: string;
  priority: number;
  estimatedEffort: number;
  dependencies: string[];
  timeline: string;
}

export interface KnowledgeRepresentation {
  concepts: Concept[];
  relationships: Relationship[];
  rules: Rule[];
  patterns: Pattern[];
}

export interface Concept {
  id: string;
  name: string;
  description: string;
  category: string;
  properties: Property[];
  examples: Example[];
}

export interface Property {
  name: string;
  type: string;
  value: any;
  confidence: number;
}

export interface Example {
  description: string;
  context: string;
  outcome: string;
  relevance: number;
}

export interface Relationship {
  source: string;
  target: string;
  type: string;
  strength: number;
  context: string;
}

export interface Rule {
  id: string;
  condition: string;
  action: string;
  confidence: number;
  exceptions: string[];
  context: string;
}

export interface Pattern {
  id: string;
  name: string;
  description: string;
  frequency: number;
  context: string;
  implications: string[];
}

export interface LearningStrategyAssessment {
  currentStrategies: LearningStrategy[];
  strategyEffectiveness: StrategyEffectiveness[];
  recommendedStrategies: LearningStrategy[];
  strategyOptimization: StrategyOptimization;
}

export interface StrategyEffectiveness {
  strategy: string;
  effectiveness: number;
  context: string;
  lastEvaluated: Date;
  trend: 'improving' | 'stable' | 'declining';
}

export interface StrategyOptimization {
  currentOptimization: number;
  targetOptimization: number;
  optimizationMethods: string[];
  progress: number;
  nextOptimization: Date;
}

export interface IntrospectionResult {
  selfAnalysis: SelfAnalysis;
  performanceAnalysis: PerformanceAnalysis;
  learningAnalysis: LearningAnalysis;
  improvementPlan: ImprovementPlan;
}

export interface SelfAnalysis {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
  overallAssessment: string;
}

export interface PerformanceAnalysis {
  currentPerformance: number;
  performanceTrend: 'improving' | 'stable' | 'declining';
  bottlenecks: string[];
  optimizationOpportunities: string[];
}

export interface LearningAnalysis {
  learningVelocity: number;
  knowledgeRetention: number;
  adaptationSuccess: number;
  learningEfficiency: number;
}

export interface ImprovementPlan {
  shortTermGoals: Goal[];
  mediumTermGoals: Goal[];
  longTermGoals: Goal[];
  metrics: ImprovementMetric[];
}

export interface Goal {
  description: string;
  priority: number;
  target: string;
  deadline: Date;
  progress: number;
}

export interface ImprovementMetric {
  name: string;
  current: number;
  target: number;
  unit: string;
  trend: 'improving' | 'stable' | 'declining';
}

// Error Types
export interface SelfEditingError extends BotError {
  component: string;
  operation: string;
  modificationId?: string;
  pluginId?: string;
  learningDataId?: string;
  recoveryAction?: string;
}

// Event Types
export interface SelfEditingEvent {
  id: string;
  type: SelfEditingEventType;
  timestamp: Date;
  source: string;
  data: Record<string, any>;
  severity: 'low' | 'medium' | 'high' | 'critical';
  context?: Record<string, any>;
}

export enum SelfEditingEventType {
  MODIFICATION_STARTED = 'modification_started',
  MODIFICATION_COMPLETED = 'modification_completed',
  MODIFICATION_FAILED = 'modification_failed',
  ROLLBACK_INITIATED = 'rollback_initiated',
  ROLLBACK_COMPLETED = 'rollback_completed',
  LEARNING_COMPLETED = 'learning_completed',
  ANALYSIS_COMPLETED = 'analysis_completed',
  VALIDATION_FAILED = 'validation_failed',
  PLUGIN_INSTALLED = 'plugin_installed',
  PLUGIN_UNINSTALLED = 'plugin_uninstalled',
  CONFIGURATION_UPDATED = 'configuration_updated',
  SAFETY_VIOLATION = 'safety_violation',
  PERFORMANCE_DEGRADATION = 'performance_degradation'
}

// Utility Types
export interface ProgressTracker {
  id: string;
  startTime: Date;
  endTime?: Date;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  currentStep: string;
  totalSteps: number;
  estimatedTimeRemaining?: number;
  errors: string[];
  warnings: string[];
}

export interface AuditLog {
  id: string;
  timestamp: Date;
  action: string;
  actor: string;
  target: string;
  details: Record<string, any>;
  result: 'success' | 'failure' | 'partial';
  impact: 'low' | 'medium' | 'high';
  relatedEvents: string[];
}

export interface HealthCheck {
  id: string;
  timestamp: Date;
  component: string;
  status: 'healthy' | 'warning' | 'critical';
  checks: HealthCheckItem[];
  overallScore: number;
  recommendations: string[];
}

export interface HealthCheckItem {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  value?: any;
  threshold?: any;
}

export interface Backup {
  id: string;
  timestamp: Date;
  type: 'full' | 'incremental' | 'differential';
  size: number;
  location: string;
  checksum: string;
  metadata: BackupMetadata;
}

export interface BackupMetadata {
  version: string;
  components: string[];
  configuration: Record<string, any>;
  environment: string;
  createdBy: string;
  reason: string;
}
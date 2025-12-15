import { DiscordEvent, SelfEditingMetrics, BotError } from '../../types';
import { SelfEditingEngine } from '../../self-editing/engine';
import { Logger } from '../../utils/logger';

// Re-export DiscordEvent for integration modules
export type { DiscordEvent };

export interface IntegrationConfig {
  enabled: boolean;
  performanceMonitoring: {
    enabled: boolean;
    interval: number; // minutes
    metrics: Array<'responseTime' | 'errorRate' | 'memoryUsage' | 'cpuUsage'>;
    thresholds: {
      responseTime: number;
      errorRate: number;
      memoryUsage: number;
      cpuUsage: number;
    };
  };
  feedbackCollection: {
    enabled: boolean;
    channels: string[];
    reactions: string[];
    minInteractions: number;
    feedbackWeight: number;
  };
  adaptationTriggers: {
    enabled: boolean;
    performanceThreshold: number;
    feedbackThreshold: number;
    adaptationRate: number;
    maxAdaptationsPerHour: number;
  };
}

export interface EventIntegrationInterface {
  connectEventHandlers(): void;
  disconnectEventHandlers(): void;
  processEvent(event: DiscordEvent): Promise<void>;
  getMetrics(): IntegrationMetrics[];
}

export interface PerformanceMonitor {
  startMonitoring(): void;
  stopMonitoring(): void;
  collectMetrics(): Promise<PerformanceMetrics>;
  getMetrics(): PerformanceMetrics[];
  setThresholds(thresholds: PerformanceThresholds): void;
}

export interface FeedbackCollector {
  collectFeedback(event: DiscordEvent): Promise<UserFeedback[]>;
  getFeedback(): UserFeedback[];
  analyzeFeedback(): Promise<FeedbackAnalysis>;
  clearFeedback(): void;
}

export interface AdaptationTrigger {
  checkTriggers(metrics: IntegrationMetrics[]): Promise<AdaptationAction[]>;
  executeAdaptations(actions: AdaptationAction[]): Promise<void>;
  getAdaptationHistory(): AdaptationAction[];
}

export interface IntegrationMetrics {
  timestamp: Date;
  eventType: string;
  metrics: {
    performance?: PerformanceMetrics;
    feedback?: FeedbackAnalysis;
    adaptations?: AdaptationAction[];
  };
  confidence: number;
}

export interface PerformanceMetrics {
  timestamp: Date;
  responseTime: number;
  errorRate: number;
  memoryUsage: number;
  cpuUsage: number;
  activeConnections: number;
  processedEvents: number;
  failedEvents: number;
}

export interface UserFeedback {
  id: string;
  type: 'reaction' | 'rating' | 'comment' | 'interaction';
  value: string | number;
  userId: string;
  guildId?: string | undefined;
  channelId?: string | undefined;
  messageId?: string | undefined;
  timestamp: Date;
  context?: Record<string, any>;
}

export interface FeedbackAnalysis {
  timestamp: Date;
  totalInteractions: number;
  sentiment: {
    positive: number;
    negative: number;
    neutral: number;
  };
  averageRating: number;
  commonIssues: string[];
  improvementSuggestions: string[];
  confidence: number;
}

export interface AdaptationAction {
  id: string;
  type: 'performance' | 'behavior' | 'configuration' | 'safety';
  priority: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  parameters: Record<string, any>;
  timestamp: Date;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  result?: {
    success: boolean;
    message: string;
    metrics?: Record<string, any>;
  };
}

export interface PerformanceThresholds {
  responseTime: number;
  errorRate: number;
  memoryUsage: number;
  cpuUsage: number;
}

export interface IntegrationOrchestratorDependencies {
  selfEditingEngine: SelfEditingEngine;
  logger: Logger;
  config: IntegrationConfig;
}

export interface EventProcessingContext {
  event: DiscordEvent;
  startTime: number;
  metadata: Record<string, any>;
  performance: {
    processingTime: number;
    memoryBefore: number;
    memoryAfter: number;
  };
}

export interface IntegrationEvent {
  type: 'metric_collected' | 'feedback_analyzed' | 'adaptation_triggered' | 'error_occurred';
  timestamp: Date;
  data: Record<string, any>;
  source: string;
}
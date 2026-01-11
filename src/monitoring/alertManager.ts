/**
 * Alert Manager - Comprehensive alert rule configuration and notification system
 *
 * This module provides comprehensive alert management including:
 * - Alert rule configuration
 * - Alert evaluation
 * - Alert notification (email, Slack, Discord, PagerDuty)
 * - Alert escalation
 * - Alert history tracking
 */

import { Logger } from '../utils/logger';
import { BotError } from '../utils/errors';
import { register } from 'prom-client';

/**
 * Alert severity levels
 */
export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

/**
 * Alert status
 */
export enum AlertStatus {
  OPEN = 'open',
  ACKNOWLEDGED = 'acknowledged',
  RESOLVED = 'resolved',
  ESCALATED = 'escalated'
}

/**
 * Notification channels
 */
export enum NotificationChannel {
  EMAIL = 'email',
  SLACK = 'slack',
  DISCORD = 'discord',
  PAGERDUTY = 'pagerduty',
  WEBHOOK = 'webhook',
  CONSOLE = 'console'
}

/**
 * Alert rule types
 */
export enum AlertRuleType {
  THRESHOLD = 'threshold',
  RATE = 'rate',
  PATTERN = 'pattern',
  ANOMALY = 'anomaly',
  COMPOSITE = 'composite'
}

/**
 * Alert rule configuration
 */
export interface AlertRule {
  id: string;
  name: string;
  type: AlertRuleType;
  enabled: boolean;
  severity: AlertSeverity;
  condition: AlertCondition;
  notificationChannels: NotificationChannel[];
  escalationPolicy?: EscalationPolicy;
  cooldownPeriod: number;
  lastTriggered?: Date;
  triggerCount: number;
  metadata?: Record<string, any>;
}

/**
 * Alert condition
 */
export interface AlertCondition {
  metric: string;
  operator: 'gt' | 'lt' | 'eq' | 'ne' | 'gte' | 'lte' | 'contains' | 'matches';
  threshold: number;
  window?: number;
  aggregation?: 'avg' | 'sum' | 'min' | 'max' | 'count';
}

/**
 * Escalation policy
 */
export interface EscalationPolicy {
  enabled: boolean;
  levels: EscalationLevel[];
}

/**
 * Escalation level
 */
export interface EscalationLevel {
  level: number;
  delay: number; // minutes
  channels: NotificationChannel[];
  recipients?: string[];
}

/**
 * Alert data
 */
export interface Alert {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: AlertSeverity;
  status: AlertStatus;
  timestamp: Date;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  escalatedAt?: Date;
  acknowledgedBy?: string;
  resolvedBy?: string;
  message: string;
  details: Record<string, any>;
  metrics: AlertMetric[];
  notificationsSent: Notification[];
}

/**
 * Alert metric data
 */
export interface AlertMetric {
  name: string;
  value: number;
  threshold: number;
  operator: string;
  timestamp: Date;
}

/**
 * Notification data
 */
export interface Notification {
  id: string;
  channel: NotificationChannel;
  alertId: string;
  timestamp: Date;
  status: 'pending' | 'sent' | 'failed';
  recipient?: string;
  error?: string;
  retryCount: number;
}

/**
 * Alert manager configuration
 */
export interface AlertManagerConfig {
  enabled: boolean;
  evaluationInterval: number;
  historyRetention: number;
  maxRetries: number;
  retryDelay: number;
  defaultChannels: NotificationChannel[];
}

/**
 * Email notification config
 */
export interface EmailConfig {
  enabled: boolean;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  };
  from: string;
  to: string[];
}

/**
 * Slack notification config
 */
export interface SlackConfig {
  enabled: boolean;
  webhookUrl: string;
  channel?: string;
  username?: string;
  iconEmoji?: string;
}

/**
 * Discord notification config
 */
export interface DiscordConfig {
  enabled: boolean;
  webhookUrl: string;
  channelId?: string;
  roleId?: string;
}

/**
 * PagerDuty notification config
 */
export interface PagerDutyConfig {
  enabled: boolean;
  integrationKey: string;
  serviceKey?: string;
}

/**
 * Webhook notification config
 */
export interface WebhookConfig {
  enabled: boolean;
  url: string;
  headers?: Record<string, string>;
  method?: 'POST' | 'PUT';
}

/**
 * Alert Manager Class
 *
 * Provides comprehensive alert rule evaluation and notification
 */
export class AlertManager {
  private logger: Logger;
  private config: AlertManagerConfig;
  private alertRules: Map<string, AlertRule>;
  private activeAlerts: Map<string, Alert>;
  private alertHistory: Alert[];
  private notifications: Notification[];
  private evaluationInterval?: NodeJS.Timeout;
  private startTime: Date;

  // Notification configs
  private emailConfig?: EmailConfig;
  private slackConfig?: SlackConfig;
  private discordConfig?: DiscordConfig;
  private pagerDutyConfig?: PagerDutyConfig;
  private webhookConfigs: Map<string, WebhookConfig>;

  constructor(config: Partial<AlertManagerConfig> = {}) {
    this.logger = new Logger('AlertManager');
    this.startTime = new Date();
    this.alertRules = new Map();
    this.activeAlerts = new Map();
    this.alertHistory = [];
    this.notifications = [];
    this.webhookConfigs = new Map();

    this.config = {
      enabled: true,
      evaluationInterval: 60000, // 1 minute
      historyRetention: 10080, // 7 days in minutes
      maxRetries: 3,
      retryDelay: 30000, // 30 seconds
      defaultChannels: [NotificationChannel.CONSOLE],
      ...config
    };
  }

  /**
   * Register an alert rule
   */
  registerAlertRule(rule: AlertRule): void {
    this.alertRules.set(rule.id, rule);
    this.logger.info(`Registered alert rule: ${rule.name} (${rule.id})`);
  }

  /**
   * Unregister an alert rule
   */
  unregisterAlertRule(ruleId: string): void {
    this.alertRules.delete(ruleId);
    this.logger.info(`Unregistered alert rule: ${ruleId}`);
  }

  /**
   * Update an alert rule
   */
  updateAlertRule(ruleId: string, updates: Partial<AlertRule>): boolean {
    const rule = this.alertRules.get(ruleId);
    if (!rule) {
      return false;
    }

    const updatedRule = { ...rule, ...updates };
    this.alertRules.set(ruleId, updatedRule);
    this.logger.info(`Updated alert rule: ${ruleId}`);
    return true;
  }

  /**
   * Set email notification config
   */
  setEmailConfig(config: EmailConfig): void {
    this.emailConfig = config;
    this.logger.info('Email notification config updated');
  }

  /**
   * Set Slack notification config
   */
  setSlackConfig(config: SlackConfig): void {
    this.slackConfig = config;
    this.logger.info('Slack notification config updated');
  }

  /**
   * Set Discord notification config
   */
  setDiscordConfig(config: DiscordConfig): void {
    this.discordConfig = config;
    this.logger.info('Discord notification config updated');
  }

  /**
   * Set PagerDuty notification config
   */
  setPagerDutyConfig(config: PagerDutyConfig): void {
    this.pagerDutyConfig = config;
    this.logger.info('PagerDuty notification config updated');
  }

  /**
   * Add webhook config
   */
  addWebhookConfig(id: string, config: WebhookConfig): void {
    this.webhookConfigs.set(id, config);
    this.logger.info(`Webhook config added: ${id}`);
  }

  /**
   * Start alert manager
   */
  start(): void {
    if (!this.config.enabled) {
      this.logger.warn('Alert manager is disabled');
      return;
    }

    if (this.evaluationInterval) {
      this.logger.warn('Alert manager already started');
      return;
    }

    this.logger.info(`Starting alert manager with interval: ${this.config.evaluationInterval}ms`);
    
    // Initial evaluation
    this.evaluateAlertRules();

    // Set up periodic evaluation
    this.evaluationInterval = setInterval(() => {
      this.evaluateAlertRules();
    }, this.config.evaluationInterval);
  }

  /**
   * Stop alert manager
   */
  stop(): void {
    if (this.evaluationInterval) {
      clearInterval(this.evaluationInterval);
      this.evaluationInterval = undefined;
      this.logger.info('Alert manager stopped');
    }
  }

  /**
   * Evaluate all alert rules
   */
  private async evaluateAlertRules(): Promise<void> {
    try {
      for (const [ruleId, rule] of this.alertRules) {
        if (!rule.enabled) {
          continue;
        }

        // Check cooldown period
        if (rule.lastTriggered) {
          const timeSinceTrigger = Date.now() - rule.lastTriggered.getTime();
          if (timeSinceTrigger < rule.cooldownPeriod) {
            continue;
          }
        }

        // Evaluate rule
        const result = await this.evaluateRule(rule);

        if (result.triggered) {
          await this.triggerAlert(rule, result);
        }
      }

      // Check for escalations
      this.checkEscalations();

      // Retry failed notifications
      await this.retryFailedNotifications();

    } catch (error) {
      this.logger.error('Error evaluating alert rules:', error);
    }
  }

  /**
   * Evaluate a single alert rule
   */
  private async evaluateRule(rule: AlertRule): Promise<{ triggered: boolean; metrics: AlertMetric[] }> {
    const metrics: AlertMetric[] = [];
    let triggered = false;

    // Get metric value from prom-client registry
    const metricValue = await this.getMetricValue(rule.condition.metric);

    if (metricValue === null) {
      this.logger.warn(`Metric not found: ${rule.condition.metric}`);
      return { triggered: false, metrics: [] };
    }

    const metricData: AlertMetric = {
      name: rule.condition.metric,
      value: metricValue,
      threshold: rule.condition.threshold,
      operator: rule.condition.operator,
      timestamp: new Date()
    };
    metrics.push(metricData);

    // Evaluate condition
    triggered = this.evaluateCondition(
      metricValue,
      rule.condition.operator,
      rule.condition.threshold
    );

    return { triggered, metrics };
  }

  /**
   * Evaluate a condition
   */
  private evaluateCondition(
    value: number,
    operator: string,
    threshold: number
  ): boolean {
    switch (operator) {
      case 'gt':
        return value > threshold;
      case 'lt':
        return value < threshold;
      case 'eq':
        return value === threshold;
      case 'ne':
        return value !== threshold;
      case 'gte':
        return value >= threshold;
      case 'lte':
        return value <= threshold;
      default:
        return false;
    }
  }

  /**
   * Get metric value from prom-client registry
   */
  private async getMetricValue(metric: string): Promise<number | null> {
    try {
      const promMetric = register.getSingleMetric(metric);
      
      if (!promMetric) {
        this.logger.warn(`Metric not found: ${metric}`);
        return null;
      }
      
      const value = await promMetric.get();
      
      if (typeof value === 'object' && 'values' in value) {
        // For histograms/summaries, return the sum
        const metricWithValues = value as any;
        if (metricWithValues.values && Array.isArray(metricWithValues.values)) {
          return metricWithValues.values.reduce((sum: number, v: number) => sum + v, 0);
        }
      }
      
      if (typeof value === 'number') {
        return value;
      }
      
      return null;
    } catch (error) {
      this.logger.error(`Error getting metric value for ${metric}:`, error);
      return null;
    }
  }

  /**
   * Trigger an alert
   */
  private async triggerAlert(rule: AlertRule, result: { triggered: boolean; metrics: AlertMetric[] }): Promise<void> {
    // Update rule trigger info
    rule.lastTriggered = new Date();
    rule.triggerCount++;

    // Create alert
    const alert: Alert = {
      id: this.generateAlertId(),
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      status: AlertStatus.OPEN,
      timestamp: new Date(),
      message: this.generateAlertMessage(rule, result.metrics),
      details: rule.metadata || {},
      metrics: result.metrics,
      notificationsSent: []
    };

    this.activeAlerts.set(alert.id, alert);
    this.alertHistory.push(alert);

    // Trim history
    const maxAlerts = Math.floor(this.config.historyRetention * 60);
    if (this.alertHistory.length > maxAlerts) {
      this.alertHistory.splice(0, this.alertHistory.length - maxAlerts);
    }

    this.logger.warn(
      `Alert triggered: ${rule.name} (${alert.id}) - Severity: ${rule.severity}`
    );

    // Send notifications
    await this.sendNotifications(alert, rule.notificationChannels);
  }

  /**
   * Generate alert message
   */
  private generateAlertMessage(rule: AlertRule, metrics: AlertMetric[]): string {
    const metric = metrics[0];
    if (!metric) {
      return `Alert: ${rule.name}`;
    }

    return (
      `Alert: ${rule.name}\n` +
      `Metric: ${metric.name}\n` +
      `Current Value: ${metric.value}\n` +
      `Threshold: ${metric.threshold} (${metric.operator})\n` +
      `Severity: ${rule.severity}`
    );
  }

  /**
   * Send notifications for an alert
   */
  private async sendNotifications(
    alert: Alert,
    channels: NotificationChannel[]
  ): Promise<void> {
    for (const channel of channels) {
      try {
        const notification = await this.sendNotification(alert, channel);
        alert.notificationsSent.push(notification);
        this.notifications.push(notification);
      } catch (error) {
        this.logger.error(`Failed to send ${channel} notification:`, error);
        
        const failedNotification: Notification = {
          id: this.generateNotificationId(),
          channel,
          alertId: alert.id,
          timestamp: new Date(),
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          retryCount: 0
        };
        alert.notificationsSent.push(failedNotification);
        this.notifications.push(failedNotification);
      }
    }
  }

  /**
   * Send notification to specific channel
   */
  private async sendNotification(
    alert: Alert,
    channel: NotificationChannel
  ): Promise<Notification> {
    const notification: Notification = {
      id: this.generateNotificationId(),
      channel,
      alertId: alert.id,
      timestamp: new Date(),
      status: 'sent',
      retryCount: 0
    };

    switch (channel) {
      case NotificationChannel.EMAIL:
        await this.sendEmailNotification(alert, notification);
        break;
      case NotificationChannel.SLACK:
        await this.sendSlackNotification(alert, notification);
        break;
      case NotificationChannel.DISCORD:
        await this.sendDiscordNotification(alert, notification);
        break;
      case NotificationChannel.PAGERDUTY:
        await this.sendPagerDutyNotification(alert, notification);
        break;
      case NotificationChannel.WEBHOOK:
        await this.sendWebhookNotification(alert, notification);
        break;
      case NotificationChannel.CONSOLE:
        this.sendConsoleNotification(alert);
        break;
      default:
        throw new BotError(`Unknown notification channel: ${channel}`, 'medium');
    }

    return notification;
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(alert: Alert, notification: Notification): Promise<void> {
    if (!this.emailConfig?.enabled) {
      throw new Error('Email notifications not configured');
    }
    
    this.logger.info(`Sending email notification for alert: ${alert.id}`);
    
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: this.emailConfig.smtp.host,
      port: this.emailConfig.smtp.port,
      secure: this.emailConfig.smtp.secure,
      auth: {
        user: this.emailConfig.smtp.auth.user,
        pass: this.emailConfig.smtp.auth.pass,
      },
    });
    
    const mailOptions = {
      from: this.emailConfig.from,
      to: this.emailConfig.to.join(', '),
      subject: `[${alert.severity.toUpperCase()}] ${alert.ruleName}`,
      text: alert.message,
      html: this.formatAlertEmail(alert),
    };
    
    await transporter.sendMail(mailOptions);
    this.logger.info(`Email notification sent for alert: ${alert.id}`);
  }
  
  /**
   * Format alert as HTML email
   */
  private formatAlertEmail(alert: Alert): string {
    const severityColors = {
      [AlertSeverity.INFO]: '#3498db',
      [AlertSeverity.WARNING]: '#f59e0b',
      [AlertSeverity.ERROR]: '#dc2626',
      [AlertSeverity.CRITICAL]: '#dc3545',
    };
    
    const color = severityColors[alert.severity] || '#3498db';
    
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: ${color}; color: white; padding: 20px; border-radius: 5px;">
          <h2 style="margin: 0 0 10px 0;">${alert.severity.toUpperCase()} Alert</h2>
          <h3 style="margin: 0 0 10px 0;">${alert.ruleName}</h3>
          <p style="margin: 0 0 15px 0;">${alert.message}</p>
          <div style="background-color: rgba(255,255,255,255,0.1); padding: 10px; border-radius: 3px; margin-top: 15px;">
            <p><strong>Timestamp:</strong> ${alert.timestamp.toISOString()}</p>
            <p><strong>Alert ID:</strong> ${alert.id}</p>
            ${alert.metrics.length > 0 ? `<p><strong>Metrics:</strong></p>
              <ul>
                ${alert.metrics.map(m => `<li>${m.name}: ${m.value} (threshold: ${m.threshold})</li>`).join('')}
              </ul>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Send Slack notification
   */
  private async sendSlackNotification(alert: Alert, notification: Notification): Promise<void> {
    if (!this.slackConfig?.enabled) {
      throw new Error('Slack notifications not configured');
    }

    this.logger.info(`Sending Slack notification for alert: ${alert.id}`);
    
    const { IncomingWebhook } = require('@slack/web-api');
    const webhook = new IncomingWebhook(this.slackConfig.webhookUrl);
    
    const slackMessage = {
      username: this.slackConfig.username || 'Alert Manager',
      icon_emoji: this.slackConfig.iconEmoji || ':warning:',
      channel: this.slackConfig.channel,
      attachments: [
        {
          color: this.getSeverityColor(alert.severity),
          title: `[${alert.severity.toUpperCase()}] ${alert.ruleName}`,
          text: alert.message,
          fields: [
            {
              title: 'Alert ID',
              value: alert.id,
              short: true
            },
            {
              title: 'Timestamp',
              value: alert.timestamp.toISOString(),
              short: true
            },
            ...alert.metrics.map(m => ({
              title: m.name,
              value: `${m.value} (threshold: ${m.threshold})`,
              short: true
            }))
          ],
          footer: 'Megawatts Bot',
          ts: Math.floor(alert.timestamp.getTime() / 1000)
        }
      ]
    };
    
    await webhook.send(slackMessage);
    this.logger.info(`Slack notification sent for alert: ${alert.id}`);
  }

  /**
   * Get severity color for Slack/Discord
   */
  private getSeverityColor(severity: AlertSeverity): string {
    const colors = {
      [AlertSeverity.INFO]: '#3498db',
      [AlertSeverity.WARNING]: '#f59e0b',
      [AlertSeverity.ERROR]: '#dc2626',
      [AlertSeverity.CRITICAL]: '#dc3545'
    };
    return colors[severity] || '#3498db';
  }

  /**
   * Send Discord notification
   */
  private async sendDiscordNotification(alert: Alert, notification: Notification): Promise<void> {
    if (!this.discordConfig?.enabled) {
      throw new Error('Discord notifications not configured');
    }

    this.logger.info(`Sending Discord notification for alert: ${alert.id}`);
    
    const discordMessage = {
      username: 'Megawatts Alert Manager',
      avatar_url: 'https://i.imgur.com/your-avatar.png', // Replace with actual avatar
      embeds: [
        {
          title: `[${alert.severity.toUpperCase()}] ${alert.ruleName}`,
          description: alert.message,
          color: parseInt(this.getSeverityColor(alert.severity).replace('#', ''), 16),
          fields: [
            {
              name: 'Alert ID',
              value: alert.id,
              inline: true
            },
            {
              name: 'Timestamp',
              value: alert.timestamp.toISOString(),
              inline: true
            },
            ...alert.metrics.map(m => ({
              name: m.name,
              value: `${m.value} (threshold: ${m.threshold})`,
              inline: true
            }))
          ],
          footer: {
            text: 'Megawatts Bot',
            icon_url: 'https://i.imgur.com/footer-icon.png' // Replace with actual icon
          },
          timestamp: alert.timestamp.toISOString()
        }
      ]
    };
    
    const response = await fetch(this.discordConfig.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(discordMessage)
    });
    
    if (!response.ok) {
      throw new Error(`Discord webhook failed: ${response.status}`);
    }
    
    this.logger.info(`Discord notification sent for alert: ${alert.id}`);
  }

  /**
   * Send PagerDuty notification
   */
  private async sendPagerDutyNotification(alert: Alert, notification: Notification): Promise<void> {
    if (!this.pagerDutyConfig?.enabled) {
      throw new Error('PagerDuty notifications not configured');
    }

    this.logger.info(`Sending PagerDuty notification for alert: ${alert.id}`);
    
    const pagerDutyEvent = {
      routing_key: this.pagerDutyConfig.integrationKey,
      event_action: 'trigger',
      dedup_key: alert.id,
      payload: {
        summary: `[${alert.severity.toUpperCase()}] ${alert.ruleName}`,
        severity: this.mapSeverityToPagerDuty(alert.severity),
        source: 'Megawatts Bot',
        timestamp: alert.timestamp.toISOString(),
        custom_details: {
          alertId: alert.id,
          message: alert.message,
          metrics: alert.metrics
        }
      }
    };
    
    const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(pagerDutyEvent)
    });
    
    if (!response.ok) {
      throw new Error(`PagerDuty API failed: ${response.status}`);
    }
    
    this.logger.info(`PagerDuty notification sent for alert: ${alert.id}`);
  }

  /**
   * Map alert severity to PagerDuty severity
   */
  private mapSeverityToPagerDuty(severity: AlertSeverity): string {
    const mapping = {
      [AlertSeverity.INFO]: 'info',
      [AlertSeverity.WARNING]: 'warning',
      [AlertSeverity.ERROR]: 'error',
      [AlertSeverity.CRITICAL]: 'critical'
    };
    return mapping[severity] || 'info';
  }

  /**
   * Send webhook notification
   */
  private async sendWebhookNotification(alert: Alert, notification: Notification): Promise<void> {
    const webhookConfig = Array.from(this.webhookConfigs.values())[0];
    if (!webhookConfig?.enabled) {
      throw new Error('Webhook notifications not configured');
    }

    this.logger.info(`Sending webhook notification for alert: ${alert.id}`);
    
    const webhookPayload = {
      alertId: alert.id,
      ruleName: alert.ruleName,
      severity: alert.severity,
      status: alert.status,
      timestamp: alert.timestamp.toISOString(),
      message: alert.message,
      metrics: alert.metrics,
      details: alert.details
    };
    
    const response = await fetch(webhookConfig.url, {
      method: webhookConfig.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...webhookConfig.headers
      },
      body: JSON.stringify(webhookPayload)
    });
    
    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status}`);
    }
    
    this.logger.info(`Webhook notification sent for alert: ${alert.id}`);
  }

  /**
   * Send console notification
   */
  private sendConsoleNotification(alert: Alert): void {
    const severityEmoji = {
      [AlertSeverity.INFO]: 'ℹ️',
      [AlertSeverity.WARNING]: '⚠️',
      [AlertSeverity.ERROR]: '❌',
      [AlertSeverity.CRITICAL]: '🚨'
    };

    const emoji = severityEmoji[alert.severity] || '❓';
    console.log(`${emoji} ${alert.message}`);
  }

  /**
   * Check for alert escalations
   */
  private checkEscalations(): void {
    const now = Date.now();

    for (const [alertId, alert] of this.activeAlerts) {
      if (alert.status !== AlertStatus.OPEN) {
        continue;
      }

      const rule = this.alertRules.get(alert.ruleId);
      if (!rule?.escalationPolicy?.enabled) {
        continue;
      }

      // Check each escalation level
      for (const level of rule.escalationPolicy.levels) {
        const levelDelay = level.delay * 60000; // Convert minutes to ms
        const timeSinceAlert = now - alert.timestamp.getTime();

        if (timeSinceAlert >= levelDelay && timeSinceAlert < levelDelay + this.config.evaluationInterval) {
          // Escalate to this level
          this.escalateAlert(alert, level);
          break;
        }
      }
    }
  }

  /**
   * Escalate an alert
   */
  private async escalateAlert(alert: Alert, level: EscalationLevel): Promise<void> {
    alert.status = AlertStatus.ESCALATED;
    alert.escalatedAt = new Date();

    this.logger.warn(
      `Alert ${alert.id} escalated to level ${level.level}`
    );

    // Send notifications to escalation channels
    await this.sendNotifications(alert, level.channels);
  }

  /**
   * Retry failed notifications
   */
  private async retryFailedNotifications(): Promise<void> {
    const now = Date.now();

    for (const notification of this.notifications) {
      if (notification.status !== 'failed') {
        continue;
      }

      if (notification.retryCount >= this.config.maxRetries) {
        continue;
      }

      const timeSinceLastAttempt = now - notification.timestamp.getTime();
      if (timeSinceLastAttempt >= this.config.retryDelay) {
        const alert = this.alertHistory.find(a => a.id === notification.alertId);
        if (!alert) continue;

        notification.retryCount++;
        notification.timestamp = new Date();

        try {
          await this.sendNotification(alert, notification.channel);
          notification.status = 'sent';
          this.logger.info(`Notification retry succeeded: ${notification.id}`);
        } catch (error) {
          this.logger.error(`Notification retry failed: ${notification.id}`, error);
        }
      }
    }
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string, acknowledgedBy: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      return false;
    }

    alert.status = AlertStatus.ACKNOWLEDGED;
    alert.acknowledgedAt = new Date();
    alert.acknowledgedBy = acknowledgedBy;

    this.logger.info(`Alert ${alertId} acknowledged by ${acknowledgedBy}`);
    return true;
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string, resolvedBy?: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      return false;
    }

    alert.status = AlertStatus.RESOLVED;
    alert.resolvedAt = new Date();
    if (resolvedBy) {
      alert.resolvedBy = resolvedBy;
    }

    // Move from active to history
    this.activeAlerts.delete(alertId);
    this.logger.info(`Alert ${alertId} resolved by ${resolvedBy || 'system'}`);
    return true;
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Get alert history
   */
  getAlertHistory(limit?: number): Alert[] {
    if (limit) {
      return this.alertHistory.slice(-limit);
    }
    return [...this.alertHistory];
  }

  /**
   * Get alert by ID
   */
  getAlert(alertId: string): Alert | undefined {
    return this.activeAlerts.get(alertId) || this.alertHistory.find(a => a.id === alertId);
  }

  /**
   * Get alert rules
   */
  getAlertRules(): AlertRule[] {
    return Array.from(this.alertRules.values());
  }

  /**
   * Get alert rule by ID
   */
  getAlertRule(ruleId: string): AlertRule | undefined {
    return this.alertRules.get(ruleId);
  }

  /**
   * Get notifications history
   */
  getNotificationHistory(limit?: number): Notification[] {
    if (limit) {
      return this.notifications.slice(-limit);
    }
    return [...this.notifications];
  }

  /**
   * Clear alert history
   */
  clearHistory(): void {
    this.alertHistory = [];
    this.notifications = [];
    this.logger.info('Alert history cleared');
  }

  /**
   * Get configuration
   */
  getConfig(): AlertManagerConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AlertManagerConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('Alert manager configuration updated');
  }

  /**
   * Generate alert ID
   */
  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate notification ID
   */
  private generateNotificationId(): string {
    return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get uptime
   */
  getUptime(): number {
    return Date.now() - this.startTime.getTime();
  }
}

/**
 * Create a singleton instance of alert manager
 */
let alertManagerInstance: AlertManager | null = null;

/**
 * Get or create alert manager instance
 */
export function getAlertManager(config?: Partial<AlertManagerConfig>): AlertManager {
  if (!alertManagerInstance) {
    alertManagerInstance = new AlertManager(config);
  }
  return alertManagerInstance;
}

/**
 * Reset alert manager instance (mainly for testing)
 */
export function resetAlertManager(): void {
  if (alertManagerInstance) {
    alertManagerInstance.stop();
    alertManagerInstance = null;
  }
}

/**
 * Maintenance Scheduler
 *
 * Maintenance scheduling system for scheduling regular maintenance tasks,
 * priority-based task scheduling, maintenance window management,
 * and notification system for maintenance.
 */

import { EventEmitter } from 'events';
import { Logger } from '../utils/logger';
import { MaintenanceRepository } from './maintenance-repository';
import {
  MaintenanceSchedule,
  MaintenanceTask,
  MaintenanceType,
  MaintenanceStatus,
  MaintenancePriority,
} from './maintenance-models';

/**
 * Maintenance scheduler configuration
 */
export interface MaintenanceSchedulerConfig {
  checkInterval: number; // in milliseconds
  defaultMaintenanceWindowStart: string; // HH:MM format
  defaultMaintenanceWindowEnd: string; // HH:MM format
  defaultTimezone: string;
  autoScheduleTasks: boolean;
  notifyChannels: string[];
  notifyBeforeMinutes: number[];
  maxConcurrentTasks: number;
}

/**
 * Default maintenance scheduler configuration
 */
export const DEFAULT_MAINTENANCE_SCHEDULER_CONFIG: MaintenanceSchedulerConfig = {
  checkInterval: 60000, // 1 minute
  defaultMaintenanceWindowStart: '02:00',
  defaultMaintenanceWindowEnd: '04:00',
  defaultTimezone: 'UTC',
  autoScheduleTasks: true,
  notifyChannels: [],
  notifyBeforeMinutes: [60, 30, 15, 5],
  maxConcurrentTasks: 3,
};

/**
 * Scheduled maintenance event
 */
export interface ScheduledMaintenanceEvent {
  scheduleId: string;
  taskId?: string;
  type: MaintenanceType;
  scheduledFor: Date;
  duration: number; // in minutes
  priority: MaintenancePriority;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'failed';
  notificationsSent: number[];
}

/**
 * Maintenance window
 */
export interface MaintenanceWindow {
  start: Date;
  end: Date;
  timezone: string;
  available: boolean;
  scheduledTasks: ScheduledMaintenanceEvent[];
}

/**
 * Maintenance scheduler class
 */
export class MaintenanceScheduler extends EventEmitter {
  private config: MaintenanceSchedulerConfig;
  private repository: MaintenanceRepository;
  private logger: Logger;
  private checkInterval?: NodeJS.Timeout;
  private isRunning = false;
  private scheduledEvents: ScheduledMaintenanceEvent[] = [];
  private activeTasks: Map<string, Date> = new Map();

  constructor(
    repository: MaintenanceRepository,
    config: Partial<MaintenanceSchedulerConfig> = {}
  ) {
    super();
    this.config = { ...DEFAULT_MAINTENANCE_SCHEDULER_CONFIG, ...config };
    this.repository = repository;
    this.logger = new Logger('MaintenanceScheduler');
  }

  /**
   * Start maintenance scheduler
   */
  start(): void {
    if (this.isRunning) {
      this.logger.warn('Maintenance scheduler is already running');
      return;
    }

    this.isRunning = true;

    // Schedule regular checks for due maintenance
    this.checkInterval = setInterval(() => {
      this.checkDueMaintenance().catch(error => {
        this.logger.error('Maintenance check failed:', error);
      });
    }, this.config.checkInterval);

    this.logger.info('Maintenance scheduler started');
    this.emit('started');
  }

  /**
   * Stop maintenance scheduler
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }

    this.logger.info('Maintenance scheduler stopped');
    this.emit('stopped');
  }

  /**
   * Check for due maintenance
   */
  async checkDueMaintenance(): Promise<void> {
    const now = new Date();

    // Get due schedules
    const dueSchedules = await this.repository.getDueMaintenanceSchedules(now);

    for (const schedule of dueSchedules) {
      if (!schedule.enabled) {
        continue;
      }

      await this.executeSchedule(schedule);
    }

    // Check for active tasks that may have timed out
    await this.checkActiveTasks();
  }

  /**
   * Execute a maintenance schedule
   * @param schedule - Maintenance schedule to execute
   */
  async executeSchedule(schedule: MaintenanceSchedule): Promise<void> {
    this.logger.info(`Executing maintenance schedule: ${schedule.id}`);

    try {
      // Check if within maintenance window
      const window = this.getMaintenanceWindow(new Date());
      if (!window.available) {
        this.logger.info(`Maintenance window not available for ${schedule.id}`);
        // Reschedule for next window
        await this.rescheduleForNextWindow(schedule);
        return;
      }

      // Check concurrent task limit
      if (this.activeTasks.size >= this.config.maxConcurrentTasks) {
        this.logger.warn(`Max concurrent tasks reached, rescheduling ${schedule.id}`);
        await this.rescheduleForNextWindow(schedule);
        return;
      }

      // Create maintenance task from schedule
      const task = await this.repository.createMaintenanceTask({
        title: schedule.title,
        description: schedule.description,
        type: schedule.type,
        status: MaintenanceStatus.IN_PROGRESS,
        priority: schedule.priority,
        scheduledAt: new Date(),
        startedAt: new Date(),
        estimatedHours: schedule.estimatedDuration / 60,
        tags: ['scheduled', schedule.type],
        dependencies: schedule.relatedTasks,
        metadata: {
          scheduleId: schedule.id,
          maintenanceWindow: {
            start: schedule.maintenanceWindowStart,
            end: schedule.maintenanceWindowEnd,
          },
        },
      });

      // Track active task
      this.activeTasks.set(task.id, new Date());

      // Create scheduled event
      const event: ScheduledMaintenanceEvent = {
        scheduleId: schedule.id,
        taskId: task.id,
        type: schedule.type,
        scheduledFor: new Date(),
        duration: schedule.estimatedDuration,
        priority: schedule.priority,
        status: 'in_progress',
        notificationsSent: [],
      };

      this.scheduledEvents.push(event);

      // Send notifications
      await this.sendMaintenanceNotifications(schedule, task);

      // Update schedule
      await this.repository.updateMaintenanceSchedule(schedule.id, {
        lastRunAt: new Date(),
        lastRunStatus: MaintenanceStatus.IN_PROGRESS,
        runCount: schedule.runCount + 1,
      });

      this.emit('scheduleExecuted', { schedule, task });

    } catch (error) {
      this.logger.error(`Failed to execute schedule ${schedule.id}:`, error);

      // Update schedule as failed
      await this.repository.updateMaintenanceSchedule(schedule.id, {
        lastRunStatus: MaintenanceStatus.FAILED,
        lastRunOutput: error instanceof Error ? error.message : String(error),
        failureCount: schedule.failureCount + 1,
      });

      this.emit('scheduleFailed', { schedule, error });
    }
  }

  /**
   * Complete a maintenance task
   * @param taskId - Task ID
   * @param success - Whether the task completed successfully
   * @param output - Task output
   */
  async completeMaintenanceTask(
    taskId: string,
    success: boolean,
    output?: string
  ): Promise<void> {
    const task = await this.repository.getMaintenanceTaskById(taskId);
    if (!task) {
      this.logger.warn(`Task not found: ${taskId}`);
      return;
    }

    this.logger.info(`Completing maintenance task: ${taskId}, Success: ${success}`);

    // Update task
    await this.repository.updateMaintenanceTask(taskId, {
      status: success ? MaintenanceStatus.COMPLETED : MaintenanceStatus.FAILED,
      completedAt: new Date(),
      metadata: {
        ...task.metadata,
        output,
        completedAt: new Date().toISOString(),
      },
    });

    // Remove from active tasks
    this.activeTasks.delete(taskId);

    // Update related schedule if exists
    if (task.metadata?.scheduleId) {
      const schedule = await this.repository.getMaintenanceScheduleById(task.metadata.scheduleId);
      if (schedule) {
        await this.repository.updateMaintenanceSchedule(schedule.id, {
          lastRunStatus: success ? MaintenanceStatus.COMPLETED : MaintenanceStatus.FAILED,
          lastRunOutput: output,
          successCount: success ? schedule.successCount + 1 : schedule.successCount,
          failureCount: success ? schedule.failureCount : schedule.failureCount + 1,
        });
      }
    }

    // Update scheduled event
    const event = this.scheduledEvents.find(e => e.taskId === taskId);
    if (event) {
      event.status = success ? 'completed' : 'failed';
    }

    this.emit('taskCompleted', { task, success, output });
  }

  /**
   * Check active tasks for timeouts
   */
  private async checkActiveTasks(): Promise<void> {
    const now = new Date();
    const timeoutThreshold = 4 * 60 * 60 * 1000; // 4 hours

    for (const [taskId, startTime] of this.activeTasks.entries()) {
      const elapsed = now.getTime() - startTime.getTime();

      if (elapsed > timeoutThreshold) {
        this.logger.warn(`Task ${taskId} has exceeded timeout threshold`);

        // Mark as failed
        await this.completeMaintenanceTask(taskId, false, 'Task timeout');
      }
    }
  }

  /**
   * Schedule a maintenance task
   * @param task - Maintenance task to schedule
   * @param scheduledFor - When to schedule the task
   * @returns Scheduled maintenance event
   */
  async scheduleMaintenanceTask(
    task: Partial<MaintenanceTask>,
    scheduledFor: Date
  ): Promise<ScheduledMaintenanceEvent> {
    this.logger.info(`Scheduling maintenance task for ${scheduledFor.toISOString()}`);

    // Create task with scheduled status
    const createdTask = await this.repository.createMaintenanceTask({
      ...task,
      status: MaintenanceStatus.SCHEDULED,
      scheduledAt: scheduledFor,
    });

    // Create scheduled event
    const event: ScheduledMaintenanceEvent = {
      scheduleId: `manual-${Date.now()}`,
      taskId: createdTask.id,
      type: createdTask.type!,
      scheduledFor,
      duration: createdTask.estimatedHours! * 60,
      priority: createdTask.priority!,
      status: 'scheduled',
      notificationsSent: [],
    };

    this.scheduledEvents.push(event);

    // Schedule notifications
    await this.scheduleMaintenanceNotifications(createdTask, scheduledFor);

    this.emit('taskScheduled', event);
    return event;
  }

  /**
   * Reschedule a task for the next maintenance window
   * @param schedule - Maintenance schedule
   */
  async rescheduleForNextWindow(schedule: MaintenanceSchedule): Promise<void> {
    const nextWindow = this.getNextMaintenanceWindow(new Date());

    if (!nextWindow) {
      this.logger.warn('No next maintenance window available');
      return;
    }

    this.logger.info(`Rescheduling ${schedule.id} for ${nextWindow.start.toISOString()}`);

    // Update schedule with next run time
    await this.repository.updateMaintenanceSchedule(schedule.id, {
      nextRunAt: nextWindow.start,
    });

    this.emit('scheduleRescheduled', { schedule, nextWindow: nextWindow.start });
  }

  /**
   * Get the next available maintenance window
   * @param from - Start date to search from
   * @returns Maintenance window or null
   */
  getNextMaintenanceWindow(from: Date = new Date()): MaintenanceWindow | null {
    const windowStart = this.parseTime(this.config.defaultMaintenanceWindowStart);
    const windowEnd = this.parseTime(this.config.defaultMaintenanceWindowEnd);

    const today = new Date(from);
    today.setHours(0, 0, 0, 0);

    // Try today's window first
    let windowDate = new Date(today);
    windowDate.setHours(windowStart.hours, windowStart.minutes, 0, 0);

    const windowEndDate = new Date(windowDate);
    windowEndDate.setHours(windowEnd.hours, windowEnd.minutes, 0, 0);

    // If window has passed for today, try tomorrow
    if (windowEndDate < from) {
      windowDate.setDate(windowDate.getDate() + 1);
      windowDate.setHours(windowStart.hours, windowStart.minutes, 0, 0);

      windowEndDate.setDate(windowEndDate.getDate() + 1);
      windowEndDate.setHours(windowEnd.hours, windowEnd.minutes, 0, 0);
    }

    return {
      start: windowDate,
      end: windowEndDate,
      timezone: this.config.defaultTimezone,
      available: true,
      scheduledTasks: this.scheduledEvents.filter(
        e => e.scheduledFor >= windowDate && e.scheduledFor <= windowEndDate
      ),
    };
  }

  /**
   * Get the current maintenance window
   * @param date - Date to check
   * @returns Maintenance window
   */
  getMaintenanceWindow(date: Date = new Date()): MaintenanceWindow {
    const windowStart = this.parseTime(this.config.defaultMaintenanceWindowStart);
    const windowEnd = this.parseTime(this.config.defaultMaintenanceWindowEnd);

    const today = new Date(date);
    today.setHours(0, 0, 0, 0);

    const windowStartDate = new Date(today);
    windowStartDate.setHours(windowStart.hours, windowStart.minutes, 0, 0);

    const windowEndDate = new Date(today);
    windowEndDate.setHours(windowEnd.hours, windowEnd.minutes, 0, 0);

    const inWindow = date >= windowStartDate && date <= windowEndDate;

    return {
      start: windowStartDate,
      end: windowEndDate,
      timezone: this.config.defaultTimezone,
      available: inWindow,
      scheduledTasks: this.scheduledEvents.filter(
        e => e.scheduledFor >= windowStartDate && e.scheduledFor <= windowEndDate
      ),
    };
  }

  /**
   * Parse time string to hours and minutes
   * @param time - Time string in HH:MM format
   * @returns Hours and minutes
   */
  private parseTime(time: string): { hours: number; minutes: number } {
    const [hours, minutes] = time.split(':').map(Number);
    return { hours, minutes };
  }

  /**
   * Send maintenance notifications
   * @param schedule - Maintenance schedule
   * @param task - Maintenance task
   */
  private async sendMaintenanceNotifications(
    schedule: MaintenanceSchedule,
    task: MaintenanceTask
  ): Promise<void> {
    if (this.config.notifyChannels.length === 0) {
      return;
    }

    const notificationsSent: number[] = [];

    for (const minutesBefore of this.config.notifyBeforeMinutes) {
      const notifyTime = new Date(task.scheduledAt!);
      notifyTime.setMinutes(notifyTime.getMinutes() - minutesBefore);

      if (notifyTime > new Date()) {
        // Schedule notification
        setTimeout(() => {
          this.sendNotification(schedule, task, minutesBefore);
        }, notifyTime.getTime() - Date.now());

        notificationsSent.push(minutesBefore);
      }
    }

    // Update event with sent notifications
    const event = this.scheduledEvents.find(e => e.taskId === task.id);
    if (event) {
      event.notificationsSent = notificationsSent;
    }
  }

  /**
   * Schedule maintenance notifications
   * @param task - Maintenance task
   * @param scheduledFor - When the task is scheduled for
   */
  private async scheduleMaintenanceNotifications(
    task: MaintenanceTask,
    scheduledFor: Date
  ): Promise<void> {
    if (this.config.notifyChannels.length === 0) {
      return;
    }

    for (const minutesBefore of this.config.notifyBeforeMinutes) {
      const notifyTime = new Date(scheduledFor);
      notifyTime.setMinutes(notifyTime.getMinutes() - minutesBefore);

      if (notifyTime > new Date()) {
        // Schedule notification
        setTimeout(() => {
          this.sendNotification(null, task, minutesBefore);
        }, notifyTime.getTime() - Date.now());
      }
    }
  }

  /**
   * Send a maintenance notification
   * @param schedule - Maintenance schedule (optional)
   * @param task - Maintenance task
   * @param minutesBefore - Minutes before the scheduled time
   */
  private sendNotification(
    schedule: MaintenanceSchedule | null,
    task: MaintenanceTask,
    minutesBefore: number
  ): void {
    const message = this.buildNotificationMessage(schedule, task, minutesBefore);

    this.logger.info(`Sending maintenance notification: ${message}`);

    // Emit notification event
    this.emit('notification', {
      channels: this.config.notifyChannels,
      message,
      schedule,
      task,
      minutesBefore,
    });
  }

  /**
   * Build notification message
   * @param schedule - Maintenance schedule (optional)
   * @param task - Maintenance task
   * @param minutesBefore - Minutes before the scheduled time
   * @returns Notification message
   */
  private buildNotificationMessage(
    schedule: MaintenanceSchedule | null,
    task: MaintenanceTask,
    minutesBefore: number
  ): string {
    const timeStr = minutesBefore === 0
      ? 'now'
      : `in ${minutesBefore} minute${minutesBefore > 1 ? 's' : ''}`;

    const typeStr = task.type.replace(/_/g, ' ').toUpperCase();

    return `🔧 **Maintenance Alert**\n\n` +
      `**${typeStr}** will begin ${timeStr}\n` +
      `**Title:** ${task.title}\n` +
      `**Priority:** ${task.priority.toUpperCase()}\n` +
      `**Estimated Duration:** ${task.estimatedHours || 'N/A'} hour(s)\n\n` +
      `Please save your work and expect temporary service interruptions.`;
  }

  /**
   * Get scheduled events
   * @param status - Optional status filter
   * @returns Array of scheduled maintenance events
   */
  getScheduledEvents(status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'): ScheduledMaintenanceEvent[] {
    if (status) {
      return this.scheduledEvents.filter(e => e.status === status);
    }
    return [...this.scheduledEvents];
  }

  /**
   * Get active tasks
   * @returns Array of active task IDs
   */
  getActiveTasks(): string[] {
    return Array.from(this.activeTasks.keys());
  }

  /**
   * Cancel a scheduled maintenance
   * @param eventId - Scheduled event ID
   * @param reason - Reason for cancellation
   */
  async cancelScheduledMaintenance(eventId: string, reason: string): Promise<void> {
    const event = this.scheduledEvents.find(e => e.scheduleId === eventId || e.taskId === eventId);
    if (!event) {
      this.logger.warn(`Scheduled event not found: ${eventId}`);
      return;
    }

    this.logger.info(`Cancelling scheduled maintenance: ${eventId}, Reason: ${reason}`);

    // Update event status
    event.status = 'cancelled';

    // Update task if exists
    if (event.taskId) {
      await this.repository.updateMaintenanceTask(event.taskId, {
        status: MaintenanceStatus.CANCELLED,
        metadata: {
          ...(await this.repository.getMaintenanceTaskById(event.taskId))?.metadata,
          cancellationReason: reason,
          cancelledAt: new Date().toISOString(),
        },
      });
    }

    // Update schedule if exists
    if (!event.taskId) {
      const schedule = await this.repository.getMaintenanceScheduleById(eventId);
      if (schedule) {
        await this.repository.updateMaintenanceSchedule(schedule.id, {
          enabled: false,
          lastRunStatus: MaintenanceStatus.CANCELLED,
          lastRunOutput: reason,
        });
      }
    }

    this.emit('maintenanceCancelled', { event, reason });
  }

  /**
   * Update configuration
   * @param newConfig - Partial configuration
   */
  updateConfig(newConfig: Partial<MaintenanceSchedulerConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Restart intervals if running
    if (this.isRunning) {
      this.stop();
      this.start();
    }

    this.logger.info('Maintenance scheduler configuration updated');
  }

  /**
   * Get current configuration
   * @returns Current configuration
   */
  getConfig(): MaintenanceSchedulerConfig {
    return { ...this.config };
  }

  /**
   * Check if scheduler is running
   * @returns True if running
   */
  isActive(): boolean {
    return this.isRunning;
  }
}

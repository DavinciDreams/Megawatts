import { Logger } from '../../utils/logger';
import { DiscordEvent } from '../../types';

export interface EventHandler {
  handle(event: DiscordEvent): Promise<void>;
}

export abstract class BaseEventHandler {
  protected logger: Logger;
  protected isReady = false;
  protected errorHandlers: Array<(error: Error, context?: Record<string, any>) => void> = [];
  protected metricsHandlers: Array<(type: string, data: Record<string, any>) => void> = [];

  constructor(logger: Logger) {
    this.logger = logger;
  }

  abstract handle(event: DiscordEvent): Promise<void>;

  public setReady(ready: boolean): void {
    this.isReady = ready;
  }

  public getReady(): boolean {
    return this.isReady;
  }

  public onError(handler: (error: Error, context?: Record<string, any>) => void): void {
    this.errorHandlers.push(handler);
  }

  public onMetrics(handler: (type: string, data: Record<string, any>) => void): void {
    this.metricsHandlers.push(handler);
  }

  protected emitError(error: Error, context?: Record<string, any>): void {
    this.errorHandlers.forEach(handler => handler(error, context));
    this.logger.error('Event handler error:', error, { context });
  }

  protected emitMetrics(type: string, data: Record<string, any>): void {
    this.metricsHandlers.forEach(handler => handler(type, data));
    this.logger.debug(`Event metrics emitted: ${type}`, data);
  }
}
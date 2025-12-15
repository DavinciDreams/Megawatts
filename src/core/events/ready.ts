import { BaseEventHandler } from './base';
import { DiscordEvent } from '../../types';
import { Logger } from '../../utils/logger';

export class ReadyEventHandler extends BaseEventHandler {
  constructor(logger: Logger) {
    super(logger);
  }

  async handle(event: DiscordEvent): Promise<void> {
    try {
      this.logger.info('Bot is ready - initializing systems...');
      
      // Emit ready status to any listeners
      this.emitMetrics('bot_ready', {
        timestamp: event.timestamp,
        guildCount: event.data?.guilds?.length || 0,
        userId: event.data?.user?.id,
        username: event.data?.user?.username,
      });

      // Set handler as ready
      this.setReady(true);
      
      this.logger.info('Bot ready event handled successfully');
    } catch (error) {
      this.emitError(error as Error, {
        event: 'ready',
        guildId: event.guildId,
        userId: event.userId,
      });
    }
  }
}
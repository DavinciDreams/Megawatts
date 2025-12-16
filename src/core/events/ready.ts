import { BaseEventHandler } from './base';
import { DiscordEvent } from '../../types';
import { Logger } from '../../utils/logger';

export class ClientReadyEventHandler extends BaseEventHandler {
  constructor(logger: Logger) {
    super(logger);
  }

  async handle(event: DiscordEvent): Promise<void> {
    try {
      this.logger.info('Bot client is ready - initializing systems...');
      
      // Emit ready status to any listeners
      this.emitMetrics('bot_client_ready', {
        timestamp: event.timestamp,
        guildCount: event.data?.guilds?.length || 0,
        userId: event.data?.user?.id,
        username: event.data?.user?.username,
      });

      // Set handler as ready
      this.setReady(true);
      
      this.logger.info('Bot client ready event handled successfully');
    } catch (error) {
      this.emitError(error as Error, {
        event: 'clientReady',
        guildId: event.guildId,
        userId: event.userId,
      });
    }
  }
}

// Export backward compatibility alias
export const ReadyEventHandler = ClientReadyEventHandler;
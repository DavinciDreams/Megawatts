import { BaseEventHandler } from './base';
import { DiscordEvent } from '../../types';
import { Logger } from '../../utils/logger';

export class InteractionCreateEventHandler extends BaseEventHandler {
  constructor(logger: Logger) {
    super(logger);
  }

  async handle(event: DiscordEvent): Promise<void> {
    try {
      const interaction = event.data;
      
      // Emit interaction metrics
      this.emitMetrics('interaction_received', {
        timestamp: event.timestamp,
        interactionId: interaction.id,
        interactionType: interaction.type,
        userId: interaction.user?.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
      });

      this.logger.debug(`Interaction ${interaction.type} from ${interaction.user?.username}`);
      
      // Handle different interaction types
      switch (interaction.type) {
        case 'APPLICATION_COMMAND':
          await this.handleCommandInteraction(interaction, event);
          break;
        case 'MESSAGE_COMPONENT':
          await this.handleComponentInteraction(interaction, event);
          break;
        case 'MODAL_SUBMIT':
          await this.handleModalInteraction(interaction, event);
          break;
        default:
          this.logger.debug(`Unhandled interaction type: ${interaction.type}`);
      }
      
    } catch (error) {
      this.emitError(error as Error, {
        event: 'interactionCreate',
        interactionId: event.data?.id,
        userId: event.data?.user?.id,
        guildId: event.guildId,
      });
    }
  }

  private async handleCommandInteraction(interaction: any, event: DiscordEvent): Promise<void> {
    this.emitMetrics('command_interaction', {
      commandName: interaction.commandName,
      options: interaction.options?.length || 0,
    });

    // Command will be processed by command system
    this.logger.debug(`Command interaction: ${interaction.commandName}`);
  }

  private async handleComponentInteraction(interaction: any, event: DiscordEvent): Promise<void> {
    this.emitMetrics('component_interaction', {
      componentType: interaction.componentType,
      customId: interaction.customId,
    });

    this.logger.debug(`Component interaction: ${interaction.customId}`);
  }

  private async handleModalInteraction(interaction: any, event: DiscordEvent): Promise<void> {
    this.emitMetrics('modal_interaction', {
      customId: interaction.customId,
    });

    this.logger.debug(`Modal interaction: ${interaction.customId}`);
  }
}
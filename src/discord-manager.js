import { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits, REST, Routes } from 'discord.js';

class DiscordManager {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
      ],
    });
    this.commands = new Map();
  }

  async login() {
    return new Promise((resolve, reject) => {
      this.client.once('ready', () => {
        this.logger.info(`Discord bot logged in as ${this.client.user.tag}`);
        resolve();
      });

      this.client.once('error', (error) => {
        this.logger.error('Discord client error:', error);
        reject(error);
      });

      this.client.login(this.config.token).catch(reject);
    });
  }

  async registerCommands(commands) {
    try {
      this.logger.info('Starting to register global slash commands...');
      
      const rest = new REST({ version: '10' }).setToken(this.config.token);
      const commandData = commands.map(cmd => cmd.data.toJSON());

      await rest.put(
        Routes.applicationCommands(this.config.clientId),
        { body: commandData }
      );

      this.logger.info(`Successfully registered ${commands.length} global slash commands`);
      
      // Store commands in map for handling
      commands.forEach(cmd => {
        this.commands.set(cmd.data.name, cmd);
      });
    } catch (error) {
      this.logger.error('Error registering commands:', error);
      throw error;
    }
  }

  setupInteractionHandler(handler) {
    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      const command = this.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await handler(interaction, command);
      } catch (error) {
        this.logger.error(`Error executing command ${interaction.commandName}:`, error);
        
        const errorMessage = 'There was an error executing this command.';
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content: errorMessage, ephemeral: true });
        } else {
          await interaction.reply({ content: errorMessage, ephemeral: true });
        }
      }
    });
  }

  async sendPresenceUpdate(channelId, presenceData, previousState) {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        this.logger.warn(`Channel ${channelId} not found or not text-based`);
        return false;
      }

      const embed = this.createPresenceEmbed(presenceData, previousState);
      await channel.send({ embeds: [embed] });
      return true;
    } catch (error) {
      this.logger.error(`Error sending presence update to channel ${channelId}:`, error);
      return false;
    }
  }

  createPresenceEmbed(presenceData, previousState) {
    const embed = new EmbedBuilder()
      .setTimestamp()
      .setFooter({ text: 'Steam Presence Update' });

    // Persona states mapping
    const stateNames = {
      0: 'Offline',
      1: 'Online',
      2: 'Busy',
      3: 'Away',
      4: 'Snooze',
      5: 'Looking to trade',
      6: 'Looking to play',
    };

    const currentState = stateNames[presenceData.personaState] || 'Unknown';
    const previousStateName = previousState ? stateNames[previousState.personaState] || 'Unknown' : null;

    // Set embed color based on state
    const stateColors = {
      0: 0x898989, // Offline - Gray
      1: 0x57cbde, // Online - Light Blue
      2: 0xc03030, // Busy - Red
      3: 0xc0c030, // Away - Yellow
      4: 0x5c7e10, // Snooze - Dark Green
      5: 0x5c7e10, // Looking to trade - Dark Green
      6: 0x5c7e10, // Looking to play - Dark Green
    };
    embed.setColor(stateColors[presenceData.personaState] || 0x000000);

    // Title and description
    embed.setTitle(`${presenceData.personaName}'s Steam Status`);

    let description = `**Status:** ${currentState}`;
    
    if (previousStateName && previousStateName !== currentState) {
      description += ` (was ${previousStateName})`;
    }

    if (presenceData.gameName) {
      description += `\n**Playing:** ${presenceData.gameName}`;
      
      if (previousState && previousState.gameName && previousState.gameName !== presenceData.gameName) {
        description += `\n**Previously:** ${previousState.gameName}`;
      }
    } else if (previousState && previousState.gameName) {
      description += `\n**Stopped playing:** ${previousState.gameName}`;
    }

    embed.setDescription(description);

    // Add profile link
    embed.addFields({
      name: 'Steam Profile',
      value: `[View Profile](https://steamcommunity.com/profiles/${presenceData.steamId})`,
      inline: true,
    });

    return embed;
  }

  getClient() {
    return this.client;
  }

  async destroy() {
    await this.client.destroy();
    this.logger.info('Discord client destroyed');
  }
}

export default DiscordManager;

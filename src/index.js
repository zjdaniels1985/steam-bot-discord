import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Logger from './logger.js';
import DatabaseManager from './database.js';
import SteamManager from './steam-manager.js';
import DiscordManager from './discord-manager.js';
import steamCommand from './commands/steam.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class SteamDiscordBot {
  constructor() {
    this.logger = new Logger(process.env.LOG_LEVEL || 'info');
    this.db = null;
    this.steamManager = null;
    this.discordManager = null;
    this.isShuttingDown = false;
  }

  async start() {
    try {
      this.logger.info('Starting Steam-Discord Bot...');

      // Validate environment variables
      this.validateConfig();

      // Initialize database
      const dbPath = process.env.DATABASE_PATH || join(__dirname, '../database/bot.db');
      this.db = new DatabaseManager(dbPath);
      this.logger.info('Database initialized');

      // Initialize Steam client
      this.steamManager = new SteamManager(
        {
          username: process.env.STEAM_USERNAME,
          password: process.env.STEAM_PASSWORD,
          sharedSecret: process.env.STEAM_SHARED_SECRET,
          twoFactorCode: process.env.STEAM_2FA_CODE,
        },
        this.logger
      );

      // Set up Steam event handlers
      this.steamManager.setupEventHandlers();
      this.steamManager.onPresenceChange(this.handlePresenceChange.bind(this));
      this.steamManager.onFriendsListLoaded(this.handleFriendsListLoaded.bind(this));

      // Login to Steam
      await this.steamManager.login();

      // Initialize Discord client
      this.discordManager = new DiscordManager(
        {
          token: process.env.DISCORD_TOKEN,
          clientId: process.env.DISCORD_CLIENT_ID,
        },
        this.logger
      );

      // Login to Discord
      await this.discordManager.login();

      // Register commands
      await this.discordManager.registerCommands([steamCommand]);

      // Set up interaction handler
      this.discordManager.setupInteractionHandler(this.handleInteraction.bind(this));

      this.logger.info('✅ Bot is now running!');
      this.logger.info(`Steam friends: ${this.steamManager.getFriendsCount()}`);
      this.logger.info(`Discord servers: ${this.discordManager.getClient().guilds.cache.size}`);

      // Set up graceful shutdown
      this.setupShutdownHandlers();

    } catch (error) {
      this.logger.error('Failed to start bot:', error);
      process.exit(1);
    }
  }

  validateConfig() {
    const required = [
      'DISCORD_TOKEN',
      'DISCORD_CLIENT_ID',
      'STEAM_USERNAME',
      'STEAM_PASSWORD',
    ];

    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}\nPlease check your .env file.`);
    }

    // Warn if no 2FA method is configured
    if (!process.env.STEAM_SHARED_SECRET && !process.env.STEAM_2FA_CODE) {
      this.logger.warn('⚠️  No 2FA method configured. If your Steam account has SteamGuard enabled, login may fail.');
      this.logger.warn('⚠️  Set STEAM_SHARED_SECRET for automatic 2FA or STEAM_2FA_CODE for one-time login.');
    }
  }

  async handleInteraction(interaction, command) {
    const context = {
      db: this.db,
      steamManager: this.steamManager,
      logger: this.logger,
    };

    await command.execute(interaction, context);
  }

  handleFriendsListLoaded(friendsCache) {
    this.logger.info(`Friends list loaded with ${friendsCache.size} friends`);
    
    // Log any linked users who are not friends
    const mappings = this.db.getAllMappings();
    const notFriends = mappings.filter(m => !friendsCache.has(m.steam_id));
    
    if (notFriends.length > 0) {
      this.logger.warn(`⚠️  ${notFriends.length} linked user(s) are not friends with the bot:`);
      notFriends.forEach(m => {
        this.logger.warn(`   Discord ID ${m.discord_id} -> Steam ID ${m.steam_id}`);
      });
      this.logger.warn('These users will not receive presence updates until they add the bot as a friend.');
    }
  }

  async handlePresenceChange(presenceData) {
    try {
      // Check if this Steam ID is linked to any Discord user
      const mapping = this.db.getMappingBySteamId(presenceData.steamId);
      if (!mapping) {
        // No one is monitoring this Steam account
        return;
      }

      // Get previous state from cache
      const previousState = this.db.getSteamCache(presenceData.steamId);

      // Check if state actually changed
      if (previousState) {
        const stateChanged = previousState.persona_state !== presenceData.personaState;
        const gameChanged = previousState.game_name !== presenceData.gameName;
        
        if (!stateChanged && !gameChanged) {
          // No meaningful change
          return;
        }
      }

      // Rate limiting: only send updates every 5 minutes per user
      if (!this.db.canUpdate(presenceData.steamId, 300)) {
        this.logger.debug(`Rate limited update for ${presenceData.steamId}`);
        // Still update cache but don't send notification
        this.db.updateSteamCache(presenceData.steamId, presenceData);
        return;
      }

      // Update cache
      this.db.updateSteamCache(presenceData.steamId, presenceData);

      // Record this update for rate limiting
      this.db.recordUpdate(presenceData.steamId);

      // Send updates to all configured servers
      const serverConfigs = this.db.getAllServerConfigs();
      let sentCount = 0;

      for (const config of serverConfigs) {
        const success = await this.discordManager.sendPresenceUpdate(
          config.update_channel_id,
          presenceData,
          previousState
        );
        
        if (success) {
          sentCount++;
        }
      }

      if (sentCount > 0) {
        this.logger.info(`Sent presence update for ${presenceData.personaName} to ${sentCount} channel(s)`);
      }

    } catch (error) {
      this.logger.error('Error handling presence change:', error);
    }
  }

  setupShutdownHandlers() {
    const shutdown = async (signal) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;

      this.logger.info(`Received ${signal}, shutting down gracefully...`);

      try {
        if (this.steamManager) {
          this.steamManager.logout();
        }
        
        if (this.discordManager) {
          await this.discordManager.destroy();
        }
        
        if (this.db) {
          this.db.close();
        }

        this.logger.info('Shutdown complete');
        process.exit(0);
      } catch (error) {
        this.logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught exception:', error);
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled rejection at:', promise, 'reason:', reason);
      shutdown('unhandledRejection');
    });
  }
}

// Start the bot
const bot = new SteamDiscordBot();
bot.start();

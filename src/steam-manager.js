import SteamUser from 'steam-user';
import SteamTotp from 'steam-totp';

class SteamManager {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.client = new SteamUser();
    this.friendsCache = new Set();
    this.isLoggedIn = false;
    this.eventHandlers = {
      presenceChange: null,
      friendsListLoaded: null,
    };
  }

  async login() {
    return new Promise((resolve, reject) => {
      const logOnOptions = {
        accountName: this.config.username,
        password: this.config.password,
      };

      // Handle 2FA
      if (this.config.sharedSecret) {
        logOnOptions.twoFactorCode = SteamTotp.generateAuthCode(this.config.sharedSecret);
        this.logger.info('Generated 2FA code from shared secret');
      } else if (this.config.twoFactorCode) {
        logOnOptions.twoFactorCode = this.config.twoFactorCode;
        this.logger.info('Using provided 2FA code');
      }

      // Set up event handlers before login attempt
      const onLoggedOn = () => {
        this.isLoggedIn = true;
        this.logger.info(`Logged into Steam as ${this.client.steamID}`);
        this.client.setPersona(SteamUser.EPersonaState.Online);
        this.client.gamesPlayed([]); // Not playing any games
        cleanup();
        resolve();
      };

      const onError = (err) => {
        this.logger.error('Steam login error:', err.message);
        
        if (err.eresult === SteamUser.EResult.InvalidPassword) {
          this.logger.error('Invalid Steam credentials. Please check STEAM_USERNAME and STEAM_PASSWORD.');
        } else if (err.eresult === SteamUser.EResult.AccountLogonDenied || 
                   err.eresult === SteamUser.EResult.TwoFactorCodeMismatch) {
          this.logger.error('2FA required or code invalid. Please provide STEAM_SHARED_SECRET or STEAM_2FA_CODE.');
          this.logger.error('To get STEAM_SHARED_SECRET, use a Steam Desktop Authenticator tool or extract it from your mobile authenticator.');
        }
        
        cleanup();
        reject(err);
      };

      const onSteamGuard = (domain, callback, lastCodeWrong) => {
        if (lastCodeWrong) {
          this.logger.error('Previous 2FA code was incorrect');
        }
        
        if (this.config.sharedSecret) {
          const code = SteamTotp.generateAuthCode(this.config.sharedSecret);
          this.logger.info('Generated new 2FA code from shared secret');
          callback(code);
        } else {
          const error = new Error('SteamGuard code required but no shared secret or code provided. Please set STEAM_SHARED_SECRET or STEAM_2FA_CODE in .env');
          cleanup();
          reject(error);
        }
      };

      const cleanup = () => {
        this.client.removeListener('loggedOn', onLoggedOn);
        this.client.removeListener('error', onError);
        this.client.removeListener('steamGuard', onSteamGuard);
      };

      this.client.once('loggedOn', onLoggedOn);
      this.client.once('error', onError);
      this.client.on('steamGuard', onSteamGuard);

      // Attempt login
      this.logger.info('Attempting to log into Steam...');
      this.client.logOn(logOnOptions);
    });
  }

  setupEventHandlers() {
    // Friends list loaded
    this.client.on('friendsList', () => {
      this.logger.info('Friends list received');
      this.updateFriendsCache();
      
      if (this.eventHandlers.friendsListLoaded) {
        this.eventHandlers.friendsListLoaded(this.friendsCache);
      }
    });

    // Relationship changes (friend added/removed)
    this.client.on('friendRelationship', (steamId, relationship) => {
      const steamIdStr = steamId.getSteamID64();
      
      if (relationship === SteamUser.EFriendRelationship.Friend) {
        this.friendsCache.add(steamIdStr);
        this.logger.info(`Added friend: ${steamIdStr}`);
      } else if (relationship === SteamUser.EFriendRelationship.None) {
        this.friendsCache.delete(steamIdStr);
        this.logger.info(`Removed friend: ${steamIdStr}`);
      }
    });

    // Persona state changes (presence updates)
    this.client.on('user', (steamId, user) => {
      const steamIdStr = steamId.getSteamID64();
      
      // Only process if this user is a friend
      if (!this.friendsCache.has(steamIdStr)) {
        return;
      }

      // Extract relevant presence data
      const presenceData = {
        steamId: steamIdStr,
        personaName: user.player_name || 'Unknown',
        personaState: user.persona_state || 0,
        gameId: user.gameid || null,
        gameName: user.game_name || null,
        richPresence: user.rich_presence || {},
      };

      this.logger.debug(`Presence update for ${presenceData.personaName}: state=${presenceData.personaState}, game=${presenceData.gameName}`);

      if (this.eventHandlers.presenceChange) {
        this.eventHandlers.presenceChange(presenceData);
      }
    });

    // Disconnection handling
    this.client.on('disconnected', (eresult, msg) => {
      this.isLoggedIn = false;
      this.logger.warn(`Disconnected from Steam: ${msg} (${eresult})`);
    });

    // Log trade offers, friend requests (but don't auto-accept per requirements)
    this.client.on('friendOrChatMessage', (steamId, message, room) => {
      if (!room) {
        this.logger.debug(`Message from ${steamId.getSteamID64()}: ${message}`);
      }
    });
  }

  updateFriendsCache() {
    this.friendsCache.clear();
    
    for (const [steamIdObj, relationship] of Object.entries(this.client.myFriends || {})) {
      if (relationship === SteamUser.EFriendRelationship.Friend) {
        this.friendsCache.add(steamIdObj);
      }
    }
    
    this.logger.info(`Cached ${this.friendsCache.size} friends`);
  }

  onPresenceChange(handler) {
    this.eventHandlers.presenceChange = handler;
  }

  onFriendsListLoaded(handler) {
    this.eventHandlers.friendsListLoaded = handler;
  }

  isFriend(steamId) {
    return this.friendsCache.has(steamId);
  }

  getFriendsCount() {
    return this.friendsCache.size;
  }

  logout() {
    if (this.isLoggedIn) {
      this.client.logOff();
      this.logger.info('Logged out of Steam');
    }
  }
}

export default SteamManager;

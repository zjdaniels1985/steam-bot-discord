import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class DatabaseManager {
  constructor(dbPath) {
    // Ensure database directory exists
    const dbDir = dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  initSchema() {
    // User mappings table: Discord user ID <-> Steam ID
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_mappings (
        discord_id TEXT PRIMARY KEY,
        steam_id TEXT NOT NULL UNIQUE,
        linked_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )
    `);

    // Server configurations table: per-guild update channel
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS server_configs (
        guild_id TEXT PRIMARY KEY,
        update_channel_id TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )
    `);

    // Rate limiting table: track last update per user
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rate_limits (
        steam_id TEXT PRIMARY KEY,
        last_update INTEGER NOT NULL,
        update_count INTEGER DEFAULT 0
      )
    `);

    // Steam cache table: store current state
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS steam_cache (
        steam_id TEXT PRIMARY KEY,
        persona_name TEXT,
        game_name TEXT,
        game_id TEXT,
        persona_state INTEGER,
        last_updated INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )
    `);
  }

  // User mapping methods
  linkUser(discordId, steamId) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO user_mappings (discord_id, steam_id, updated_at)
      VALUES (?, ?, strftime('%s', 'now'))
    `);
    return stmt.run(discordId, steamId);
  }

  unlinkUser(discordId) {
    const stmt = this.db.prepare('DELETE FROM user_mappings WHERE discord_id = ?');
    return stmt.run(discordId);
  }

  getUserMapping(discordId) {
    const stmt = this.db.prepare('SELECT * FROM user_mappings WHERE discord_id = ?');
    return stmt.get(discordId);
  }

  getMappingBySteamId(steamId) {
    const stmt = this.db.prepare('SELECT * FROM user_mappings WHERE steam_id = ?');
    return stmt.get(steamId);
  }

  getAllMappings() {
    const stmt = this.db.prepare('SELECT * FROM user_mappings');
    return stmt.all();
  }

  // Server config methods
  setUpdateChannel(guildId, channelId) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO server_configs (guild_id, update_channel_id, updated_at)
      VALUES (?, ?, strftime('%s', 'now'))
    `);
    return stmt.run(guildId, channelId);
  }

  getUpdateChannel(guildId) {
    const stmt = this.db.prepare('SELECT * FROM server_configs WHERE guild_id = ?');
    return stmt.get(guildId);
  }

  getAllServerConfigs() {
    const stmt = this.db.prepare('SELECT * FROM server_configs');
    return stmt.all();
  }

  // Rate limiting methods
  canUpdate(steamId, cooldownSeconds = 300) {
    const now = Math.floor(Date.now() / 1000);
    const stmt = this.db.prepare('SELECT * FROM rate_limits WHERE steam_id = ?');
    const record = stmt.get(steamId);

    if (!record) {
      return true;
    }

    return (now - record.last_update) >= cooldownSeconds;
  }

  recordUpdate(steamId) {
    const now = Math.floor(Date.now() / 1000);
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO rate_limits (steam_id, last_update, update_count)
      VALUES (?, ?, COALESCE((SELECT update_count FROM rate_limits WHERE steam_id = ?), 0) + 1)
    `);
    return stmt.run(steamId, now, steamId);
  }

  // Steam cache methods
  updateSteamCache(steamId, data) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO steam_cache (steam_id, persona_name, game_name, game_id, persona_state, last_updated)
      VALUES (?, ?, ?, ?, ?, strftime('%s', 'now'))
    `);
    return stmt.run(steamId, data.personaName, data.gameName, data.gameId, data.personaState);
  }

  getSteamCache(steamId) {
    const stmt = this.db.prepare('SELECT * FROM steam_cache WHERE steam_id = ?');
    return stmt.get(steamId);
  }

  close() {
    this.db.close();
  }
}

export default DatabaseManager;

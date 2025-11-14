# Steam Bot Discord

A production-ready Discord bot that monitors Steam presence changes in real-time and posts updates to Discord channels. Uses real-time Steam client connection (no polling), global slash commands, SQLite storage, rate-limiting safeguards, and rich embeds.

## Features

- **Real-time Steam Presence Monitoring**: Uses `steam-user` library to receive live presence/game updates
- **No Polling**: Event-driven architecture with Steam's real-time API
- **Discord Slash Commands**: Global slash commands using discord.js v14
- **SQLite Database**: Persistent storage for user mappings and configurations
- **Rate Limiting**: Built-in safeguards to prevent spam (5-minute cooldown per user)
- **Rich Embeds**: Beautiful, color-coded presence update notifications
- **SteamGuard 2FA Support**: Automatic TOTP generation or manual code entry
- **Docker Support**: Easy deployment with Docker and docker-compose
- **Graceful Shutdown**: Proper cleanup of connections and resources

## Requirements

- Node.js 18+ (or Docker)
- Discord Bot Token and Application Client ID
- Steam account for the bot (separate from your personal account recommended)
- Steam accounts to monitor must be friends with the bot account

## Installation

### Option 1: Docker (Recommended)

1. Clone the repository:
```bash
git clone https://github.com/zjdaniels1985/steam-bot-discord.git
cd steam-bot-discord
```

2. Copy `.env.example` to `.env` and configure:
```bash
cp .env.example .env
# Edit .env with your credentials
```

3. Run with docker-compose:
```bash
docker-compose up -d
```

4. View logs:
```bash
docker-compose logs -f
```

### Option 2: Direct Node.js

1. Clone and install dependencies:
```bash
git clone https://github.com/zjdaniels1985/steam-bot-discord.git
cd steam-bot-discord
npm install
```

2. Configure environment:
```bash
cp .env.example .env
# Edit .env with your credentials
```

3. Start the bot:
```bash
npm start
```

4. (Optional) Run health check to verify setup:
```bash
npm run healthcheck
```

## Configuration

### Environment Variables

Create a `.env` file with the following variables:

```env
# Discord Bot Configuration
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_application_client_id_here

# Steam Bot Configuration
STEAM_USERNAME=your_steam_bot_account_username
STEAM_PASSWORD=your_steam_bot_account_password

# Steam 2FA (choose one method)
# Method 1: Shared Secret (automatic TOTP generation - recommended)
STEAM_SHARED_SECRET=your_shared_secret_for_automatic_2fa

# Method 2: One-time 2FA code (if shared secret not available)
# STEAM_2FA_CODE=12345

# Database (optional, defaults to ./database/bot.db)
DATABASE_PATH=./database/bot.db

# Logging (optional, defaults to info)
LOG_LEVEL=info
```

### Getting Discord Credentials

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to the "Bot" tab and create a bot
4. Copy the bot token to `DISCORD_TOKEN`
5. Go to "OAuth2" > "General" and copy the Application ID to `DISCORD_CLIENT_ID`
6. Invite the bot to your server with the following permissions:
   - `applications.commands` (for slash commands)
   - `bot` with permissions: Send Messages, Embed Links

### Getting Steam Credentials

1. Create a dedicated Steam account for the bot (recommended)
2. Enable SteamGuard on the account
3. To get `STEAM_SHARED_SECRET`:
   - Use [Steam Desktop Authenticator](https://github.com/Jessecar96/SteamDesktopAuthenticator)
   - Or extract it from your mobile authenticator (advanced)
4. Users who want presence updates must add the bot's Steam account as a friend

## Commands

All commands are global slash commands:

### `/steam link <identifier>`
Link your Discord account to a Steam account.
- `identifier`: Your Steam ID64 (e.g., `76561198000000000`)
- You must be friends with the bot's Steam account first

### `/steam unlink`
Unlink your Steam account from Discord.

### `/steam status`
Check your linked Steam account status and last known presence.

### `/steam setchannel <channel>`
Set the channel where presence updates will be posted (Admin only).
- `channel`: The text channel to send updates to

## Usage

1. **Set up the update channel** (Admin):
   ```
   /steam setchannel #steam-updates
   ```

2. **Add bot's Steam account as friend**:
   - Check bot logs for the Steam ID: `Bot Steam ID: 76561198XXXXXXXXX`
   - Add this account as a friend on Steam

3. **Link your account**:
   ```
   /steam link 76561198000000000
   ```

4. **Receive updates**:
   - The bot will post updates when your Steam status or game changes
   - Updates are rate-limited to once every 5 minutes per user

## Rate Limiting

The bot implements rate limiting to prevent spam:
- Maximum 1 update per user every 5 minutes
- State changes are cached but notifications are throttled
- Ensures Discord channels aren't flooded with updates

## Architecture

```
src/
├── index.js           # Main entry point, bot orchestration
├── database.js        # SQLite database manager
├── steam-manager.js   # Steam client and presence monitoring
├── discord-manager.js # Discord client and message handling
├── logger.js          # Logging utility
└── commands/
    └── steam.js       # Slash command definitions and handlers
```

## Security Notes

- Never commit your `.env` file
- Use a dedicated Steam account for the bot
- The bot does NOT automatically accept friend requests
- The bot only monitors accounts that are already friends
- Use `STEAM_SHARED_SECRET` for automatic 2FA (most secure)

## Troubleshooting

### Bot won't log into Steam
- Check Steam credentials are correct
- Ensure 2FA is properly configured (shared secret or code)
- Check logs for specific error messages

### Not receiving presence updates
- Verify the Steam account is friends with the bot
- Check the update channel is set with `/steam setchannel`
- Verify bot has permissions in the channel
- Check rate limiting (5-minute cooldown)

### Commands not appearing
- Ensure `DISCORD_CLIENT_ID` is correct
- Wait a few minutes for Discord to sync global commands
- Check bot has `applications.commands` scope

## Docker Management

```bash
# Start the bot
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the bot
docker-compose down

# Rebuild after code changes
docker-compose up -d --build

# View database (while bot is running)
docker-compose exec steam-bot ls -la /app/database
```

## License

ISC

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

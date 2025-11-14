import { SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('steam')
    .setDescription('Steam integration commands')
    .addSubcommand(subcommand =>
      subcommand
        .setName('link')
        .setDescription('Link your Discord account to a Steam account')
        .addStringOption(option =>
          option
            .setName('identifier')
            .setDescription('Steam ID (64-bit), profile URL, or custom URL')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('unlink')
        .setDescription('Unlink your Steam account from Discord')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Check your linked Steam account status')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('setchannel')
        .setDescription('Set the channel for Steam presence updates (Admin only)')
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('The channel to send updates to')
            .setRequired(true)
        )
    ),

  async execute(interaction, { db, steamManager, logger }) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'link') {
      await handleLink(interaction, { db, steamManager, logger });
    } else if (subcommand === 'unlink') {
      await handleUnlink(interaction, { db, logger });
    } else if (subcommand === 'status') {
      await handleStatus(interaction, { db, steamManager, logger });
    } else if (subcommand === 'setchannel') {
      await handleSetChannel(interaction, { db, logger });
    }
  },
};

async function handleLink(interaction, { db, steamManager, logger }) {
  await interaction.deferReply({ ephemeral: true });

  const identifier = interaction.options.getString('identifier');
  const discordId = interaction.user.id;

  // Parse Steam ID from various formats
  let steamId64;
  try {
    steamId64 = parseSteamIdentifier(identifier);
  } catch (error) {
    await interaction.editReply({
      content: `❌ Invalid Steam identifier. Please provide a valid Steam ID64, profile URL, or custom URL.\n\nExamples:\n- Steam ID64: \`76561198000000000\`\n- Profile URL: \`https://steamcommunity.com/profiles/76561198000000000\`\n- Custom URL: \`https://steamcommunity.com/id/username\` (Note: You'll need to provide the Steam ID64 for custom URLs)`,
    });
    return;
  }

  // Check if this Steam account is friends with the bot
  if (!steamManager.isFriend(steamId64)) {
    await interaction.editReply({
      content: `❌ The Steam account \`${steamId64}\` is not friends with the bot.\n\nTo monitor your Steam presence, you must first add the bot's Steam account as a friend:\n\n**Bot Steam ID:** \`${steamManager.client.steamID ? steamManager.client.steamID.getSteamID64() : 'Not available'}\`\n\nAfter adding the bot as a friend, try linking again.`,
    });
    return;
  }

  // Check if user already has a mapping
  const existing = db.getUserMapping(discordId);
  if (existing && existing.steam_id !== steamId64) {
    await interaction.editReply({
      content: `⚠️ You are already linked to Steam ID \`${existing.steam_id}\`. Unlink first if you want to link a different account.`,
    });
    return;
  }

  // Check if this Steam ID is already linked to another Discord user
  const existingSteam = db.getMappingBySteamId(steamId64);
  if (existingSteam && existingSteam.discord_id !== discordId) {
    await interaction.editReply({
      content: `❌ This Steam account is already linked to another Discord user.`,
    });
    return;
  }

  // Link the accounts
  db.linkUser(discordId, steamId64);
  logger.info(`Linked Discord user ${discordId} to Steam ID ${steamId64}`);

  await interaction.editReply({
    content: `✅ Successfully linked your Discord account to Steam ID \`${steamId64}\`.\n\nYou will now receive presence updates in configured channels when your Steam status changes.`,
  });
}

async function handleUnlink(interaction, { db, logger }) {
  await interaction.deferReply({ ephemeral: true });

  const discordId = interaction.user.id;
  const existing = db.getUserMapping(discordId);

  if (!existing) {
    await interaction.editReply({
      content: '❌ You do not have a linked Steam account.',
    });
    return;
  }

  db.unlinkUser(discordId);
  logger.info(`Unlinked Discord user ${discordId} from Steam ID ${existing.steam_id}`);

  await interaction.editReply({
    content: `✅ Successfully unlinked your Discord account from Steam ID \`${existing.steam_id}\`.`,
  });
}

async function handleStatus(interaction, { db, steamManager, logger }) {
  await interaction.deferReply({ ephemeral: true });

  const discordId = interaction.user.id;
  const mapping = db.getUserMapping(discordId);

  if (!mapping) {
    await interaction.editReply({
      content: '❌ You do not have a linked Steam account. Use `/steam link` to link one.',
    });
    return;
  }

  const steamId = mapping.steam_id;
  const isFriend = steamManager.isFriend(steamId);
  const cache = db.getSteamCache(steamId);

  let statusText = `**Your Linked Steam Account:**\nSteam ID: \`${steamId}\`\n`;
  statusText += `Friend Status: ${isFriend ? '✅ Friends with bot' : '❌ Not friends with bot'}\n`;
  statusText += `Linked Since: <t:${mapping.linked_at}:R>\n\n`;

  if (cache) {
    statusText += `**Last Known Status:**\n`;
    statusText += `Name: ${cache.persona_name}\n`;
    
    const stateNames = {
      0: 'Offline',
      1: 'Online',
      2: 'Busy',
      3: 'Away',
      4: 'Snooze',
      5: 'Looking to trade',
      6: 'Looking to play',
    };
    
    statusText += `Status: ${stateNames[cache.persona_state] || 'Unknown'}\n`;
    
    if (cache.game_name) {
      statusText += `Playing: ${cache.game_name}\n`;
    }
    
    statusText += `Last Updated: <t:${cache.last_updated}:R>\n`;
  } else {
    statusText += `**Status:** No presence data cached yet.\n`;
  }

  await interaction.editReply({ content: statusText });
}

async function handleSetChannel(interaction, { db, logger }) {
  // Check if user has admin permissions
  if (!interaction.member.permissions.has('Administrator')) {
    await interaction.reply({
      content: '❌ You need Administrator permissions to use this command.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const channel = interaction.options.getChannel('channel');
  const guildId = interaction.guildId;

  // Verify it's a text channel
  if (!channel.isTextBased()) {
    await interaction.editReply({
      content: '❌ Please select a text channel.',
    });
    return;
  }

  // Check bot permissions in the channel
  const permissions = channel.permissionsFor(interaction.guild.members.me);
  if (!permissions.has('SendMessages') || !permissions.has('EmbedLinks')) {
    await interaction.editReply({
      content: '❌ I do not have permission to send messages and embeds in that channel.',
    });
    return;
  }

  db.setUpdateChannel(guildId, channel.id);
  logger.info(`Set update channel for guild ${guildId} to ${channel.id}`);

  await interaction.editReply({
    content: `✅ Steam presence updates will now be sent to ${channel}.`,
  });
}

function parseSteamIdentifier(identifier) {
  // Remove whitespace
  identifier = identifier.trim();

  // Check if it's a pure Steam ID64 (17 digits starting with 7656119)
  if (/^7656119\d{10}$/.test(identifier)) {
    return identifier;
  }

  // Try to extract from profile URL
  const profileMatch = identifier.match(/steamcommunity\.com\/profiles\/(\d+)/);
  if (profileMatch) {
    return profileMatch[1];
  }

  // For custom URLs, we can't resolve them without an API key
  // User needs to provide the Steam ID64 directly
  const customMatch = identifier.match(/steamcommunity\.com\/id\/([^\/]+)/);
  if (customMatch) {
    throw new Error('Custom URLs not supported. Please provide your Steam ID64 instead.');
  }

  throw new Error('Invalid Steam identifier format');
}

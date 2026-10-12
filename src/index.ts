import "dotenv/config";
import {
  Client,
  Collection,
  DiscordAPIError,
  GatewayIntentBits,
  MessageFlags,
  PermissionFlagsBits,
  RESTJSONErrorCodes,
} from "discord.js";
import { commands } from "./commands";
import { antiSpamService } from "./services/anti-spam";
import { handlePollButton } from "./services/poll";
import {
  getGoodbyeMessage,
  getRegistrationChannelAlertMessage,
  getRegistrationChannelCommandDeniedMessage,
  getWelcomeMessage,
} from "./personality";

const token = process.env.DISCORD_TOKEN;

if (!token) {
  throw new Error("DISCORD_TOKEN is not defined");
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
});

const commandCollection = new Collection<string, (typeof commands)[number]>();

for (const command of commands) {
  commandCollection.set(command.data.name, command);
}

client.once("clientReady", (client) => {
  console.log(`🦌 Nun! Noko is ready as ${client.user.tag}`);
});

client.on("error", (error) => {
  console.error("Discord client error:", error);
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isButton()) {
      await handlePollButton(interaction);
      return;
    }

    if (!interaction.isChatInputCommand()) {
      return;
    }

    const command = commandCollection.get(interaction.commandName);

    if (!command) {
      return;
    }

    const registrationChannelId =
      process.env.REGISTRATION_CHANNEL_ID?.trim() || "1557675408537813064";

    // Di channel pendaftaran, hanya command /daftar yang diizinkan (kecuali admin/moderator server)
    if (
      registrationChannelId &&
      interaction.channelId === registrationChannelId &&
      interaction.commandName !== "daftar"
    ) {
      const isStaff =
        interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
        interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);

      if (!isStaff) {
        await interaction.reply({
          content: getRegistrationChannelCommandDeniedMessage(),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }

    const spamCheck = await antiSpamService.handleCommand(interaction);

    if (!spamCheck.allowed) {
      return;
    }

    await command.execute(interaction);
  } catch (error) {
    const cmdName = interaction.isChatInputCommand()
      ? `/${interaction.commandName}`
      : interaction.isButton()
        ? `button:${interaction.customId}`
        : "interaksi";

    if (
      error instanceof DiscordAPIError &&
      (error.code === RESTJSONErrorCodes.InteractionHasAlreadyBeenAcknowledged ||
        error.code === RESTJSONErrorCodes.UnknownInteraction)
    ) {
      console.warn(
        `[Interaksi Diabaikan] ${cmdName} sudah di-acknowledge atau kedaluwarsa (${error.code}).`,
      );
      return;
    }

    console.error(`Gagal memproses interaksi (${cmdName}):`, error);

    if (!interaction.isRepliable()) {
      return;
    }

    try {
      if (interaction.deferred && !interaction.replied) {
        await interaction.editReply({
          content: "❌ Terjadi kesalahan saat menjalankan perintah ini.",
        });
      } else if (!interaction.replied) {
        await interaction.reply({
          content: "❌ Terjadi kesalahan saat menjalankan perintah ini.",
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (replyError) {
      if (
        !(
          replyError instanceof DiscordAPIError &&
          (replyError.code ===
            RESTJSONErrorCodes.InteractionHasAlreadyBeenAcknowledged ||
            replyError.code === RESTJSONErrorCodes.UnknownInteraction)
        )
      ) {
        console.error("Gagal mengirim respons error interaksi:", replyError);
      }
    }
  }
});

client.on("guildMemberAdd", async (member) => {
  const channelId = process.env.WELCOME_CHANNEL_ID;
  const roleId = process.env.MEMBER_ROLE_ID;

  if (channelId) {
    try {
      const channel = await member.guild.channels.fetch(channelId);

      if (!channel?.isTextBased()) {
        console.error(
          `Gagal mengirim pesan welcome: channel ${channelId} tidak ditemukan atau bukan channel teks.`,
        );
      } else {
        const rulesChannelId =
          process.env.RULES_CHANNEL_ID || "1557675333564633098";
        const registrationChannelId =
          process.env.REGISTRATION_CHANNEL_ID || "1557675408537813064";
        const roleMention = roleId ? `<@&${roleId}>` : "**Warga PKH**";

        await channel.send({
          content: getWelcomeMessage(
            `${member}`,
            member.guild.name,
            rulesChannelId,
            registrationChannelId,
            roleMention,
          ),
          allowedMentions: { parse: [], users: [member.id] },
        });
      }
    } catch (error) {
      console.error("Gagal mengirim pesan welcome:", error);
    }
  }
});

client.on("guildMemberRemove", async (member) => {
  const channelId = process.env.GOODBYE_CHANNEL_ID;

  if (!channelId) {
    return;
  }

  try {
    const channel = await member.guild.channels.fetch(channelId);

    if (!channel?.isTextBased()) {
      return;
    }

    await channel.send({
      content: getGoodbyeMessage(member.user.username, member.guild.name),
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    console.error("Gagal memproses member keluar:", error);
  }
});

client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) {
      return;
    }

    const registrationChannelId =
      process.env.REGISTRATION_CHANNEL_ID?.trim() || "1557675408537813064";

    // Filter khusus channel pendaftaran: tolak/hapus semua pesan teks biasa
    if (registrationChannelId && message.channelId === registrationChannelId) {
      const isStaff =
        message.member?.permissions.has(PermissionFlagsBits.Administrator) ||
        message.member?.permissions.has(PermissionFlagsBits.ManageGuild);

      if (!isStaff) {
        // Hapus pesan teks biasa yang bukan slash command
        await message.delete().catch(() => {});

        // Kirim peringatan sementara lalu hapus otomatis setelah 5 detik
        if (message.channel && "send" in message.channel) {
          const alertMsg = await message.channel
            .send({
              content: getRegistrationChannelAlertMessage(`${message.author}`),
              allowedMentions: { users: [message.author.id] },
            })
            .catch(() => null);

          if (alertMsg) {
            setTimeout(() => {
              alertMsg.delete().catch(() => {});
            }, 5000);
          }
        }
        return;
      }
    }

    await antiSpamService.handleMessage(message);
  } catch (error) {
    console.error("Gagal memproses pesan:", error);
  }
});

let isShuttingDown = false;

async function shutdown(signal: NodeJS.Signals) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`Menerima sinyal ${signal}, menghentikan Noko...`);

  antiSpamService.destroy();

  try {
    await client.destroy();
    process.exit(0);
  } catch (error) {
    console.error("Gagal menghentikan Discord client:", error);
    process.exit(1);
  }
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

client.login(token).catch((error) => {
  console.error("Gagal login ke Discord:", error);
  process.exit(1);
});

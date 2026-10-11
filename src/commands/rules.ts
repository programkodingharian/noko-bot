import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { getRulesFooter } from "../personality";

export const data = new SlashCommandBuilder()
  .setName("rules")
  .setDescription("Menampilkan peraturan server PKH");

export async function execute(
  interaction: ChatInputCommandInteraction,
) {
  await interaction.reply({
    content: [
      "📜 **Peraturan Server PKH**",
      "",
      "1. 🤝 Saling menghormati sesama member.",
      "2. 🚫 Dilarang melakukan spam, scam, atau promosi tanpa izin.",
      "3. 🔞 Dilarang mengirim konten NSFW.",
      "4. 💻 Gunakan channel sesuai topik.",
      "5. 🦌 Ikuti arahan moderator dan Discord ToS.",
      "",
      getRulesFooter(),
    ].join("\n"),
  });
}
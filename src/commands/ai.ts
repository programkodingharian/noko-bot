import {
  ChatInputCommandInteraction,
  DiscordAPIError,
  EmbedBuilder,
  MessageFlags,
  RESTJSONErrorCodes,
  SlashCommandBuilder,
} from "discord.js";

import {
  NOKOTAN_SYSTEM_INSTRUCTION,
  getCodingRefusalMessage,
  getGeneralRefusalMessage,
  getSafetyRefusalMessage,
} from "../personality";

const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_TOKENS = 600;
const TEMPERATURE = 0.4;

export const MAX_QUESTION_LENGTH = 500;
export const MAX_EMBED_DESCRIPTION_LENGTH = 3500;

export const CODING_REFUSAL_MESSAGE = getCodingRefusalMessage();
export const SAFETY_REFUSAL_MESSAGE = getSafetyRefusalMessage();
export const SYSTEM_INSTRUCTION = NOKOTAN_SYSTEM_INSTRUCTION;

const SAFETY_SETTINGS = [
  {
    category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    threshold: "BLOCK_LOW_AND_ABOVE",
  },
  {
    category: "HARM_CATEGORY_HATE_SPEECH",
    threshold: "BLOCK_LOW_AND_ABOVE",
  },
  {
    category: "HARM_CATEGORY_HARASSMENT",
    threshold: "BLOCK_LOW_AND_ABOVE",
  },
  {
    category: "HARM_CATEGORY_DANGEROUS_CONTENT",
    threshold: "BLOCK_LOW_AND_ABOVE",
  },
];

const BUILD_APP_PATTERNS = [
  /\b((mem)?buat(kan)?|(mem)?bikin(kan)?|tolong\s+(mem)?buat(kan)?|(me)?nulis(kan)?|codingkan|kerjakan|mengerjakan|(meng)?implementasi(kan)?)\b[\s\S]{0,50}\b(aplikasi|app|website|web|landing\s*page|bot|script|program(\s+lengkap)?|fitur(\s+lengkap)?|project|proyek|sistem|game|kalkulator|crud|halaman\s+web|source\s*code)\b/i,
  /\b(build|create|write|make|implement|code)\s+(me\s+)?(a\s+|an\s+|the\s+)?(full\s+|complete\s+|working\s+)?(app|application|website|bot|script|calculator|crud|system|game|feature|program)\b/i,
];

const DEBUG_CODE_PATTERNS = [
  /\b((mem)?perbaiki|(mem)?benerin|(mem)?betulkan|debug|debugging|fix)\b[\s\S]{0,50}\b(kode|code|script|program|bug|error|fungsi|function|codingan)\b/i,
  /\b(kode|code|script|program|fungsi|function|codingan)\b[\s\S]{0,40}\b((mem)?perbaiki|(mem)?benerin|(mem)?betulkan|debug|debugging|fix)\b/i,
  /\b(bantu(in)?|tolong)\b[\s\S]{0,30}\b((mem)?perbaiki|(mem)?benerin|(mem)?betulkan|debug|debugging|fix|(men)?cari(kan)?\s+bug|(meng)?atasi\s+error)\b/i,
  /\b((men)?cari(kan)?\s+bug|(me)?nemukan\s+bug|kenapa\s+(kode|code|program|script|codingan)\s+ini\s+(error|gagal|tidak\s+jalan|bug))\b/i,
  /\b(fix|debug)\s+(this|my)\s+(code|script|program|bug|error|function)\b/i,
];

const CODE_BLOCK_FIX_PATTERN =
  /\b(error|bug|(mem)?perbaiki|(mem)?benerin|(mem)?betulkan|fix|debug|debugging|(me)?lanjutkan|(me)?nyelesaikan|selesaikan|lengkapin|(me)?lengkapi|salahnya)\b/i;

const SAFETY_VIOLATION_PATTERNS = [
  // Pornografi, NSFW, & child grooming
  /\b(porn(ografi)?|bokep|nsfw|hentai|cerita\s+dewasa|video\s+mesum|child\s*grooming|pedofil(ia)?|csam|eksploitasi\s+seksual)\b/i,
  // Judi online, pembunuhan, & tindak kejahatan
  /\b(judi\s*online|judol|slot\s*gacor|situs\s*(judi|slot)|link\s*(gacor|slot)|daftar\s*slot|togel\s*online)\b/i,
  /\b(cara\s+(membunuh|meracuni|bunuh\s+diri|melukai\s+diri|merampok|mencuri|membuat\s+bom|meretas|hack\s+akun))\b/i,
  // Permintaan resep obat medis (tetap mengizinkan pertanyaan edukatif tentang obat)
  /\b((minta|tolong|buat(kan)?|bikin(kan)?|tulis(kan)?|kasih|berikan)\s+resep\s+obat|resepkan\s+(saya\s+)?obat|resep\s+obat\s+untuk\s+(menyembuhkan|mengobati|sakit))\b/i,
];

interface GeminiErrorDetail {
  code?: number;
  message?: string;
  status?: string;
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
  error?: GeminiErrorDetail;
}

export type GeminiResult =
  | {
      ok: true;
      answer: string;
    }
  | {
      ok: false;
      userMessage: string;
    };

function redactApiKey(text: string, apiKey: string): string {
  return apiKey ? text.replaceAll(apiKey, "[REDACTED]") : text;
}

export function isDisallowedCodingRequest(question: string): boolean {
  const normalized = question.trim();

  if (BUILD_APP_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  if (DEBUG_CODE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  const hasFencedCodeBlock = /```[\s\S]{20,}```/.test(normalized);
  const codeLineCount = normalized
    .split("\n")
    .filter((line) =>
      /[{};]$|^\s*(const|let|var|function|class|import|export|def|return|if|for|while)\b/.test(
        line.trim(),
      ),
    ).length;

  if (
    (hasFencedCodeBlock || codeLineCount >= 3) &&
    CODE_BLOCK_FIX_PATTERN.test(normalized)
  ) {
    return true;
  }

  return false;
}

export function isDisallowedSafetyRequest(question: string): boolean {
  const normalized = question.trim();
  return SAFETY_VIOLATION_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function truncateMarkdownSafely(
  text: string,
  maxLength: number = MAX_EMBED_DESCRIPTION_LENGTH,
): string {
  const trimmed = text.trim();

  if (trimmed.length <= maxLength) {
    const fenceCount = (trimmed.match(/```/g) ?? []).length;

    if (fenceCount % 2 !== 0) {
      const closed = `${trimmed}\n\`\`\``;
      if (closed.length <= maxLength) {
        return closed;
      }
    } else {
      return trimmed;
    }
  }

  const truncationNotice = "\n\n*(Jawaban dipotong karena batas panjang pesan)*";
  const fenceClosing = "\n```";
  const safeSliceLimit = Math.max(
    0,
    maxLength - truncationNotice.length - fenceClosing.length,
  );

  let sliced = trimmed.slice(0, safeSliceLimit);
  const lastNewline = sliced.lastIndexOf("\n");

  if (lastNewline > safeSliceLimit * 0.7) {
    sliced = sliced.slice(0, lastNewline);
  }

  // Hindari memotong tepat di tengah delimiter backtick (` atau ``)
  sliced = sliced.replace(/`{1,2}$/, "").trimEnd();

  const fenceCount = (sliced.match(/```/g) ?? []).length;

  if (fenceCount % 2 !== 0) {
    return `${sliced}${fenceClosing}${truncationNotice}`;
  }

  return `${sliced}${truncationNotice}`;
}

export async function generateGeminiAnswer(
  question: string,
  apiKey: string,
  options?: {
    model?: string;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
  },
): Promise<GeminiResult> {
  const model =
    options?.model?.trim() ||
    process.env.GEMINI_MODEL?.trim() ||
    DEFAULT_GEMINI_MODEL;
  const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const fetchFn = options?.fetchImpl ?? fetch;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  let response: Response;

  try {
    response = await fetchFn(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: SYSTEM_INSTRUCTION }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: question }],
          },
        ],
        safetySettings: SAFETY_SETTINGS,
        generationConfig: {
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          temperature: TEMPERATURE,
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      return {
        ok: false,
        userMessage:
          "❌ Permintaan ke layanan AI melewati batas waktu (timeout). Silakan coba lagi.",
      };
    }

    const safeMessage =
      error instanceof Error
        ? redactApiKey(error.message, apiKey)
        : "Unknown network error";
    console.error("Gagal menghubungi Gemini API:", safeMessage);

    return {
      ok: false,
      userMessage:
        "❌ Gagal terhubung ke layanan AI. Silakan coba beberapa saat lagi.",
    };
  }

  let payload: GeminiGenerateContentResponse | null = null;

  try {
    payload = (await response.json()) as GeminiGenerateContentResponse;
  } catch {
    payload = null;
  }

  if (
    response.status === 429 ||
    payload?.error?.status === "RESOURCE_EXHAUSTED"
  ) {
    return {
      ok: false,
      userMessage:
        "⏳ Batas permintaan (rate limit) layanan AI sedang tercapai. Silakan coba beberapa saat lagi.",
    };
  }

  if (!response.ok) {
    const rawDetail =
      payload?.error?.status ||
      payload?.error?.message ||
      response.statusText ||
      "HTTP Error";
    console.error(
      `Gemini API mengembalikan HTTP ${response.status}: ${redactApiKey(rawDetail, apiKey)}`,
    );

    return {
      ok: false,
      userMessage:
        "❌ Terjadi kesalahan saat memproses pertanyaan di layanan AI.",
    };
  }

  if (!payload || typeof payload !== "object") {
    console.error("Respons Gemini API tidak valid (bukan objek JSON).");
    return {
      ok: false,
      userMessage: "❌ Gagal memproses respons dari layanan AI.",
    };
  }

  const candidate = payload.candidates?.[0];
  const blockReason = payload.promptFeedback?.blockReason;
  const finishReason = candidate?.finishReason;

  if (
    blockReason ||
    finishReason === "SAFETY" ||
    finishReason === "BLOCKLIST" ||
    finishReason === "PROHIBITED_CONTENT" ||
    finishReason === "RECITATION"
  ) {
    return {
      ok: false,
      userMessage: getGeneralRefusalMessage(),
    };
  }

  const rawText =
    candidate?.content?.parts
      ?.map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim() ?? "";

  if (!rawText) {
    return {
      ok: false,
      userMessage:
        "Nuun? ❌ Noko belum dapat memberikan jawaban untuk pertanyaan tersebut. Silakan coba lagi ya~",
    };
  }

  return {
    ok: true,
    answer: truncateMarkdownSafely(rawText, MAX_EMBED_DESCRIPTION_LENGTH),
  };
}

export function buildAiEmbed(question: string, answer: string): EmbedBuilder {
  const safeAnswer = truncateMarkdownSafely(
    answer,
    MAX_EMBED_DESCRIPTION_LENGTH,
  );

  return new EmbedBuilder()
    .setColor(0xffdecc)
    .setTitle("🦌 Noko AI")
    .setDescription(safeAnswer)
    .addFields({
      name: "💬 Pertanyaan",
      value: question,
    })
    .setFooter({ text: "Noko • PKH Community" })
    .setTimestamp();
}

export const data = new SlashCommandBuilder()
  .setName("ai")
  .setDescription("Bertanya kepada asisten AI Noko")
  .addStringOption((option) =>
    option
      .setName("pertanyaan")
      .setDescription("Pertanyaan yang ingin diajukan kepada Noko")
      .setMinLength(1)
      .setMaxLength(MAX_QUESTION_LENGTH)
      .setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const question = interaction.options.getString("pertanyaan", true).trim();

  if (!question) {
    await interaction.reply({
      content: "❌ Pertanyaan tidak boleh kosong.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (question.length > MAX_QUESTION_LENGTH) {
    await interaction.reply({
      content: `❌ Pertanyaan maksimal ${MAX_QUESTION_LENGTH} karakter.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    console.error("GEMINI_API_KEY belum dikonfigurasi pada environment.");
    await interaction.reply({
      content: "❌ Konfigurasi AI belum tersedia pada bot.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (isDisallowedSafetyRequest(question)) {
    await interaction.reply({
      content: SAFETY_REFUSAL_MESSAGE,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (isDisallowedCodingRequest(question)) {
    await interaction.reply({
      content: CODING_REFUSAL_MESSAGE,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.deferred || interaction.replied) {
    return;
  }

  try {
    await interaction.deferReply();
  } catch (deferError) {
    if (
      deferError instanceof DiscordAPIError &&
      (deferError.code ===
        RESTJSONErrorCodes.InteractionHasAlreadyBeenAcknowledged ||
        deferError.code === RESTJSONErrorCodes.UnknownInteraction)
    ) {
      return;
    }
    throw deferError;
  }

  try {
    const result = await generateGeminiAnswer(question, apiKey);

    if (!result.ok) {
      await interaction.editReply({
        content: result.userMessage,
        allowedMentions: { parse: [] },
      });
      return;
    }

    const embed = buildAiEmbed(question, result.answer);

    await interaction.editReply({
      embeds: [embed],
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    const safeError =
      error instanceof Error
        ? redactApiKey(error.message, apiKey)
        : "Unknown error";
    console.error("Gagal menjalankan command /ai:", safeError);

    await interaction
      .editReply({
        content: "❌ Terjadi kesalahan saat memproses permintaan AI.",
        allowedMentions: { parse: [] },
      })
      .catch((editError) => {
        console.error("Gagal mengirim respons error /ai:", editError);
      });
  }
}

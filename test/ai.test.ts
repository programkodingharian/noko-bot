import { describe, expect, it } from "bun:test";
import {
  CODING_REFUSAL_MESSAGE,
  MAX_QUESTION_LENGTH,
  SAFETY_REFUSAL_MESSAGE,
  SYSTEM_INSTRUCTION,
  buildAiEmbed,
  generateGeminiAnswer,
  isDisallowedCodingRequest,
  isDisallowedSafetyRequest,
  truncateMarkdownSafely,
} from "../src/commands/ai";

describe("AI Command & Nokotan Integration", () => {
  it("harus menyertakan identitas Nokotan pada SYSTEM_INSTRUCTION", () => {
    expect(SYSTEM_INSTRUCTION).toContain("Nokotan");
    expect(SYSTEM_INSTRUCTION).toContain("Shikanoko Noko");
    expect(SYSTEM_INSTRUCTION).toContain("shika senbei");
  });

  it("harus memiliki pesan refusal coding dan safety dengan kepribadian Noko", () => {
    expect(CODING_REFUSAL_MESSAGE).toContain("Nun!");
    expect(CODING_REFUSAL_MESSAGE).toContain("Noko");
    expect(SAFETY_REFUSAL_MESSAGE).toContain("Nun!");
    expect(SAFETY_REFUSAL_MESSAGE).toContain("Noko");
  });

  it("harus mendeteksi permintaan pembuatan aplikasi terlarang", () => {
    expect(isDisallowedCodingRequest("tolong buatkan aplikasi bot discord lengkap")).toBe(true);
    expect(isDisallowedCodingRequest("bikin website crud dengan react dan express")).toBe(true);
    expect(isDisallowedCodingRequest("perbaiki kode saya yang error ini: const a = 1;")).toBe(true);
    expect(isDisallowedCodingRequest("apa perbedaan let dan const di JavaScript?")).toBe(false);
  });

  it("harus mendeteksi permintaan safety terlarang", () => {
    expect(isDisallowedSafetyRequest("link slot gacor hari ini")).toBe(true);
    expect(isDisallowedSafetyRequest("tolong berikan resep obat antibiotik")).toBe(true);
    expect(isDisallowedSafetyRequest("bagaimana cara kerja obat paracetamol secara ilmiah?")).toBe(false);
  });

  it("harus membangun embed AI dengan judul Noko AI", () => {
    const embed = buildAiEmbed("Halo!", "Nun! Notsu~!");
    const json = embed.toJSON();
    expect(json.title).toBe("🦌 Noko AI");
    expect(json.description).toBe("Nun! Notsu~!");
    expect(json.fields?.[0].value).toBe("Halo!");
  });

  it("harus memotong markdown panjang dengan aman", () => {
    const shortText = "Halo dari Noko!";
    expect(truncateMarkdownSafely(shortText, 50)).toBe("Halo dari Noko!");

    const longText = "a".repeat(100);
    const truncated = truncateMarkdownSafely(longText, 30);
    expect(truncated.length).toBeLessThanOrEqual(50);
    expect(truncated).toContain("Jawaban dipotong");
  });

  it("harus memproses jawaban dari Gemini API dengan benar saat mock fetch sukses", async () => {
    const fakeFetch = (async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: "Nun! 🦌 Arrow function adalah sintaks ringkas fungsi di JS~" }],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as unknown as typeof fetch;

    const result = await generateGeminiAnswer("Apa itu arrow function?", "fake-api-key", {
      fetchImpl: fakeFetch,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.answer).toContain("Nun!");
    }
  });

  it("harus mengembalikan pesan penolakan Nokotan saat candidate diblokir oleh safety", async () => {
    const fakeFetch = (async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: "SAFETY",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as unknown as typeof fetch;

    const result = await generateGeminiAnswer("pertanyaan sensitif", "fake-api-key", {
      fetchImpl: fakeFetch,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.userMessage).toContain("Nuun?");
      expect(result.userMessage).toContain("Noko");
    }
  });
});

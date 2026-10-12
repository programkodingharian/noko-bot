import { describe, expect, it } from "bun:test";
import {
  CATCHPHRASES,
  NOKOTAN_SYSTEM_INSTRUCTION,
  formatModerationAction,
  formatRateLimitMessage,
  formatSpamChannelAlert,
  formatSpamTimeoutMessage,
  formatSpamWarningMessage,
  getAnnounceSuccessMessage,
  getCodingRefusalMessage,
  getDaftarAlreadyRegisteredMessage,
  getDaftarSuccessMessage,
  getGeneralRefusalMessage,
  getGoodbyeMessage,
  getHelpHeader,
  getProjectSuccessMessage,
  getRegistrationChannelAlertMessage,
  getRegistrationChannelCommandDeniedMessage,
  getRemindConfirmation,
  getRemindNotification,
  getRulesFooter,
  getSafetyRefusalMessage,
  getWelcomeMessage,
} from "../src/personality";

describe("Nokotan Personality Module", () => {
  it("harus mendefinisikan catchphrase utama khas Nokotan", () => {
    expect(CATCHPHRASES.NUN).toBe("Nun!");
    expect(CATCHPHRASES.NOTSU).toBe("Notsu!");
    expect(CATCHPHRASES.CHANT).toBe("Shikanoko nokonoko koshitantan!");
    expect(CATCHPHRASES.EHEHE).toBe("Ehehe~");
    expect(CATCHPHRASES.NUUN_QUESTION).toBe("Nuun?");
    expect(CATCHPHRASES.DEER_HONESTY).toBe("Rusa tidak berbohong~");
  });

  it("harus menyertakan seluruh kepribadian, catchphrase, dan batasan pada NOKOTAN_SYSTEM_INSTRUCTION", () => {
    expect(NOKOTAN_SYSTEM_INSTRUCTION).toContain("Nokotan");
    expect(NOKOTAN_SYSTEM_INSTRUCTION).toContain("Shikanoko Noko");
    expect(NOKOTAN_SYSTEM_INSTRUCTION).toContain("Nun!");
    expect(NOKOTAN_SYSTEM_INSTRUCTION).toContain("Notsu!");
    expect(NOKOTAN_SYSTEM_INSTRUCTION).toContain("Shikanoko nokonoko koshitantan!");
    expect(NOKOTAN_SYSTEM_INSTRUCTION).toContain("shika senbei");
    expect(NOKOTAN_SYSTEM_INSTRUCTION).toContain("kerupuk rusa");
    expect(NOKOTAN_SYSTEM_INSTRUCTION).toContain("Deadpan humor");
    expect(NOKOTAN_SYSTEM_INSTRUCTION).toContain("Blak-blakan dan jahil");
    expect(NOKOTAN_SYSTEM_INSTRUCTION).toContain("Aturan pembatasan coding");
    expect(NOKOTAN_SYSTEM_INSTRUCTION).toContain("Aturan keamanan, hukum, & medis");
  });

  it("harus menghasilkan pesan welcome dengan identitas Nokotan dan data channel/role yang tepat", () => {
    const welcome = getWelcomeMessage(
      "<@123>",
      "PKH Community",
      "111222",
      "333444",
      "<@&555>",
    );
    expect(welcome).toContain("Notsu~!");
    expect(welcome).toContain("<@123>");
    expect(welcome).toContain("PKH Community");
    expect(welcome).toContain("<#111222>");
    expect(welcome).toContain("<#333444>");
    expect(welcome).toContain("<@&555>");
    expect(welcome).toContain("shika senbei");
  });

  it("harus menghasilkan pesan goodbye dengan identitas rusa", () => {
    const goodbye = getGoodbyeMessage("RusaKeren", "PKH Community");
    expect(goodbye).toContain("Notsu...");
    expect(goodbye).toContain("RusaKeren");
    expect(goodbye).toContain("PKH Community");
    expect(goodbye).toContain("Tanduk Noko");
  });

  it("harus menghasilkan header help dan footer rules yang sesuai", () => {
    const helpHeader = getHelpHeader();
    expect(helpHeader).toContain("Noko — PKH Community Bot");
    expect(helpHeader).toContain("Shikanoko nokonoko koshitantan!");

    const rulesFooter = getRulesFooter();
    expect(rulesFooter).toContain("Nun!");
    expect(rulesFooter).toContain("Rusa yang tertib");
  });

  it("harus menghasilkan pesan pendaftaran /daftar yang tepat", () => {
    const success = getDaftarSuccessMessage();
    expect(success).toContain("Nun!");
    expect(success).toContain("Warga PKH");
    expect(success).toContain("kerupuk rusa");

    const already = getDaftarAlreadyRegisteredMessage();
    expect(already).toContain("Nuun?");
    expect(already).toContain("Warga PKH");
  });

  it("harus menghasilkan pesan pengingat /remind yang tepat", () => {
    const confirm = getRemindConfirmation(15);
    expect(confirm).toContain("Nun!");
    expect(confirm).toContain("15 menit");

    const notif = getRemindNotification("999", "Beli shika senbei");
    expect(notif).toContain("<@999>");
    expect(notif).toContain("Beli shika senbei");
    expect(notif).toContain("Rusa tidak pernah lupa janji!");
  });

  it("harus menghasilkan konfirmasi /project dan /announce yang tepat", () => {
    const project = getProjectSuccessMessage("Web PKH", "<#123>");
    expect(project).toContain("Nun!");
    expect(project).toContain("Web PKH");
    expect(project).toContain("<#123>");

    const announce = getAnnounceSuccessMessage("<#456>");
    expect(announce).toContain("Nun!");
    expect(announce).toContain("<#456>");
  });

  it("harus menghasilkan pesan penolakan coding dan safety dengan gaya Noko", () => {
    const coding = getCodingRefusalMessage();
    expect(coding).toContain("Nun!");
    expect(coding).toContain("Noko");
    expect(coding).toContain("konsep pemrograman");

    const safety = getSafetyRefusalMessage();
    expect(safety).toContain("Nun!");
    expect(safety).toContain("Noko");

    const general = getGeneralRefusalMessage();
    expect(general).toContain("Nuun?");
    expect(general).toContain("Noko");
  });

  it("harus memformat respons moderasi secara presisi dan bernuansa Nokotan", () => {
    const ban = formatModerationAction("ban", "BadUser", "Spam parah");
    expect(ban).toContain("BadUser");
    expect(ban).toContain("Spam parah");
    expect(ban).toContain("Ketertiban server");

    const kick = formatModerationAction("kick", "RuleBreaker", "Tidak tertib");
    expect(kick).toContain("RuleBreaker");
    expect(kick).toContain("Tidak tertib");
    expect(kick).toContain("pelajaran yang baik");

    const timeout = formatModerationAction("timeout", "ChatterSpam", "Spam", 10);
    expect(timeout).toContain("ChatterSpam");
    expect(timeout).toContain("10 menit");
    expect(timeout).toContain("Spam");

    const warn = formatModerationAction("warn", "WarnedUser", "Peringatan 1");
    expect(warn).toContain("WarnedUser");
    expect(warn).toContain("Peringatan 1");
    expect(warn).toContain("rusa mengawasimu");
  });

  it("harus memformat notifikasi anti-spam secara jelas dan terukur", () => {
    const rateLimit = formatRateLimitMessage(5);
    expect(rateLimit).toContain("5 detik");
    expect(rateLimit).toContain("Nun!");

    const warn = formatSpamWarningMessage();
    expect(warn).toContain("Peringatan");
    expect(warn).toContain("timeout");

    const timeout = formatSpamTimeoutMessage("10 menit");
    expect(timeout).toContain("10 menit");

    const alertWarn = formatSpamChannelAlert("<@user>", true);
    expect(alertWarn).toContain("<@user>");
    expect(alertWarn).toContain("Nun!");

    const alertTimeout = formatSpamChannelAlert("<@user>", false, "1 menit");
    expect(alertTimeout).toContain("<@user>");
    expect(alertTimeout).toContain("1 menit");
  });

  it("harus memformat pesan peringatan channel pendaftaran dengan baik", () => {
    const alert = getRegistrationChannelAlertMessage("<@123>");
    expect(alert).toContain("<@123>");
    expect(alert).toContain("/daftar");

    const denied = getRegistrationChannelCommandDeniedMessage();
    expect(denied).toContain("/daftar");
  });
});

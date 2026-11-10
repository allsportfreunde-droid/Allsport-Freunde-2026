import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ batchSend: vi.fn(), send: vi.fn() }));
vi.mock("resend", () => ({
  Resend: class {
    batch = { send: mocks.batchSend };
    emails = { send: mocks.send };
  },
}));

const message = { from: "verein@example.com", to: "person@example.com", subject: "Bewertung", html: "<p>Bewertung</p>" };

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubEnv("RESEND_API_KEY", "nur-fuer-tests");
  vi.stubEnv("EMAIL_FROM", "verein@example.com");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Review-E-Mail-Erstellung", () => {
  it.each([false, true])("erstellt Betreff, Absender, Link und Berliner Datumsangaben (Erinnerung: %s)", async (isReminder) => {
    vi.stubEnv("TZ", "America/Los_Angeles");
    const { buildReviewRequestEmail } = await import("../lib/email");
    const result = await buildReviewRequestEmail({
      to: "person@example.com", firstName: "Ahmet", eventTitle: "Fußball", eventDate: "2026-07-01",
      statusToken: "geheimer-token", deadline: new Date("2026-07-15T22:30:00Z"), isReminder,
    });
    expect(result).toMatchObject({
      from: "verein@example.com", to: "person@example.com",
      subject: isReminder ? "Erinnerung: Wie war „Fußball“?" : "Wie war „Fußball“? Bewerte mit einem Klick",
    });
    expect(result.html).toContain("https://example.com/review/geheimer-token?rating=5");
    expect(result.html).toContain("Mittwoch, 1. Juli 2026");
    expect(result.html).toContain("Donnerstag, 16. Juli 2026");
    expect(result.html.replace(/<!--[\s\S]*?-->/g, "")).toContain("Assalamu Alaikum Ahmet,");
    expect(mocks.batchSend).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

describe("E-Mail-Batch-Versand", () => {
  it("übergibt Nachrichten und Idempotenzschlüssel und bestätigt erfolgreichen Versand", async () => {
    const { sendEmailBatch } = await import("../lib/email");
    mocks.batchSend.mockResolvedValue({ data: { data: [{ id: "mail-1" }] }, error: null });
    expect(await sendEmailBatch([message], "review-initial-7-1-1-1")).toBe(true);
    expect(mocks.batchSend).toHaveBeenCalledExactlyOnceWith([message], { idempotencyKey: "review-initial-7-1-1-1" });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it.each([
    { data: null, error: { message: "Versand abgelehnt." } },
    { data: null, error: null },
    { data: { data: [{ id: "mail-1" }] }, error: { message: "Versand abgelehnt." } },
  ])("behandelt fehlende Daten oder Provider-Fehler als fehlgeschlagenen Versand", async (response) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { sendEmailBatch } = await import("../lib/email");
    mocks.batchSend.mockResolvedValue(response);
    expect(await sendEmailBatch([message], "review-batch")).toBe(false);
    expect(error).toHaveBeenCalled();
  });

  it("fängt Ausnahmen des Versanddienstes ab", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { sendEmailBatch } = await import("../lib/email");
    mocks.batchSend.mockRejectedValue(new Error("Versanddienst nicht erreichbar."));
    expect(await sendEmailBatch([message], "review-batch")).toBe(false);
    expect(error).toHaveBeenCalled();
  });

  it.each(["nur-fuer-tests", ""])("weist mehr als 100 Nachrichten vor dem Versand zurück (Schlüssel: %s)", async (apiKey) => {
    vi.stubEnv("RESEND_API_KEY", apiKey);
    const { sendEmailBatch } = await import("../lib/email");
    await expect(sendEmailBatch(Array.from({ length: 101 }, () => message), "zu-gross")).rejects.toThrow("höchstens 100");
    expect(mocks.batchSend).not.toHaveBeenCalled();
  });

  it("akzeptiert genau 100 Nachrichten", async () => {
    const { sendEmailBatch } = await import("../lib/email");
    mocks.batchSend.mockResolvedValue({ data: { data: [] }, error: null });
    expect(await sendEmailBatch(Array.from({ length: 100 }, () => message), "voller-batch")).toBe(true);
    expect(mocks.batchSend.mock.calls[0][0]).toHaveLength(100);
  });

  it("loggt ohne API-Schlüssel jede Nachricht und zählt den Versand als erfolgreich", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { sendEmailBatch } = await import("../lib/email");
    expect(await sendEmailBatch([message, { ...message, to: "zweite@example.com" }], "lokaler-batch")).toBe(true);
    expect(log).toHaveBeenCalledWith("[Email] An: person@example.com");
    expect(log).toHaveBeenCalledWith("[Email] An: zweite@example.com");
    expect(log).toHaveBeenCalledWith("[Email] Betreff: Bewertung");
    expect(mocks.batchSend).not.toHaveBeenCalled();
  });

  it("sendet bei einer leeren Liste nichts", async () => {
    const { sendEmailBatch } = await import("../lib/email");
    expect(await sendEmailBatch([], "leer")).toBe(true);
    expect(mocks.batchSend).not.toHaveBeenCalled();
  });
});

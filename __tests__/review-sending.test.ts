import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@react-email/components";
import { ReviewRequestEmail } from "../emails/review-request";

const mocks = vi.hoisted(() => ({
  getEvent: vi.fn(), getEventReviewDashboard: vi.fn(), getReviewRecipients: vi.fn(),
  claimReviewRequests: vi.fn(), releaseReviewRequests: vi.fn(),
  claimReviewReminders: vi.fn(), releaseReviewReminders: vi.fn(),
  claimEventReviewReminder: vi.fn(), releaseEventReviewReminder: vi.fn(), logAudit: vi.fn(),
  buildReviewRequestEmail: vi.fn(), sendEmailBatch: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getEvent: mocks.getEvent, getEventReviewDashboard: mocks.getEventReviewDashboard,
  getReviewRecipients: mocks.getReviewRecipients,
  claimReviewRequests: mocks.claimReviewRequests, releaseReviewRequests: mocks.releaseReviewRequests,
  claimReviewReminders: mocks.claimReviewReminders, releaseReviewReminders: mocks.releaseReviewReminders,
  claimEventReviewReminder: mocks.claimEventReviewReminder, releaseEventReviewReminder: mocks.releaseEventReviewReminder,
  logAudit: mocks.logAudit,
}));
vi.mock("@/lib/email", () => ({
  buildReviewRequestEmail: mocks.buildReviewRequestEmail, sendEmailBatch: mocks.sendEmailBatch,
}));

const { sendEventReviewRequests } = await import("../lib/review-sending");

function recipients(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    registration_id: index + 1, email: `person${index + 1}@example.com`, status_token: `token-${index + 1}`,
    first_name: `Person ${index + 1}`, review_requested_at: "2026-07-01T10:00:00.000Z",
  }));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-02T10:00:00Z"));
  mocks.getEvent.mockResolvedValue({ id: 7, title: "Fußball", date: "2026-07-01", status: "published" });
  mocks.getEventReviewDashboard.mockResolvedValue({ requested: 3 });
  mocks.getReviewRecipients.mockResolvedValue(recipients(3));
  mocks.claimReviewRequests.mockImplementation(async (ids: number[]) => ids);
  mocks.claimReviewReminders.mockImplementation(async (ids: number[]) => ids);
  mocks.claimEventReviewReminder.mockResolvedValue(true);
  mocks.sendEmailBatch.mockResolvedValue(true);
  mocks.buildReviewRequestEmail.mockImplementation(async (data: { to: string; statusToken: string }) => ({
    from: "verein@example.com", to: data.to, subject: "Bewertung", html: `<p>${data.statusToken}</p>`,
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Review-Versand", () => {
  it("meldet ein unbekanntes Event mit 404", async () => {
    mocks.getEvent.mockResolvedValue(null);
    expect(await sendEventReviewRequests(99, "initial", null)).toEqual({ ok: false, status: 404, error: "Das Event wurde nicht gefunden." });
    expect(mocks.getReviewRecipients).not.toHaveBeenCalled();
  });

  it.each([
    ["2026-07-03", "published", "Der Versand ist ab dem Event-Tag möglich."],
    ["2026-07-01", "cancelled", "Das Event wurde abgesagt."],
  ])("sperrt %s / %s ohne Reservierung oder Versand", async (date, status, error) => {
    mocks.getEvent.mockResolvedValue({ id: 7, date, status });
    expect(await sendEventReviewRequests(7, "initial", null)).toEqual({ ok: false, status: 409, error });
    expect(mocks.getReviewRecipients).not.toHaveBeenCalled();
    expect(mocks.claimReviewRequests).not.toHaveBeenCalled();
    expect(mocks.claimReviewReminders).not.toHaveBeenCalled();
    expect(mocks.claimEventReviewReminder).not.toHaveBeenCalled();
    expect(mocks.sendEmailBatch).not.toHaveBeenCalled();
  });

  it("versendet am Eventtag nach Berliner Zeit bereits vor Mitternacht UTC", async () => {
    vi.setSystemTime(new Date("2026-07-01T22:30:00Z"));
    mocks.getEvent.mockResolvedValue({ id: 7, title: "Fußball", date: "2026-07-02", status: "published" });
    expect(await sendEventReviewRequests(7, "initial", null)).toMatchObject({ ok: true, result: { sent: 3 } });
    expect(mocks.buildReviewRequestEmail).toHaveBeenCalledWith(expect.objectContaining({ deadline: new Date("2026-07-15T22:30:00Z") }));
  });

  it("sendet ohne neue Empfänger nichts und reserviert nichts", async () => {
    mocks.getReviewRecipients.mockResolvedValue([]);
    expect(await sendEventReviewRequests(7, "initial", null)).toEqual({ ok: true, result: { kind: "initial", sent: 0, failed: 0 } });
    expect(mocks.claimReviewRequests).not.toHaveBeenCalled();
    expect(mocks.sendEmailBatch).not.toHaveBeenCalled();
  });

  it("sendet ausschließlich an erfolgreich reservierte IDs", async () => {
    mocks.claimReviewRequests.mockResolvedValue([2]);
    expect(await sendEventReviewRequests(7, "initial", "admin@example.com")).toEqual({ ok: true, result: { kind: "initial", sent: 1, failed: 0 } });
    expect(mocks.claimReviewRequests).toHaveBeenCalledWith([1, 2, 3]);
    expect(mocks.buildReviewRequestEmail).toHaveBeenCalledTimes(1);
    expect(mocks.buildReviewRequestEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: "person2@example.com", statusToken: "token-2", isReminder: false, deadline: new Date("2026-07-16T10:00:00Z"),
    }));
    expect(mocks.logAudit).toHaveBeenCalledWith("admin@example.com", "SEND_REVIEW_REQUESTS", "event", 7, { sent: 1, failed: 0 });
  });

  it("versendet bei parallelen Aufrufen nur einmal an dieselben IDs", async () => {
    mocks.claimReviewRequests.mockResolvedValueOnce([1, 2, 3]).mockResolvedValueOnce([]);
    const outcomes = await Promise.all([
      sendEventReviewRequests(7, "initial", null), sendEventReviewRequests(7, "initial", null),
    ]);
    expect(outcomes).toContainEqual({ ok: true, result: { kind: "initial", sent: 0, failed: 0 } });
    expect(mocks.sendEmailBatch).toHaveBeenCalledTimes(1);
  });

  it("teilt 230 Empfänger in Batches mit 100, 100 und 30 Nachrichten", async () => {
    mocks.getReviewRecipients.mockResolvedValue(recipients(230));
    expect(await sendEventReviewRequests(7, "initial", null)).toEqual({ ok: true, result: { kind: "initial", sent: 230, failed: 0 } });
    expect(mocks.sendEmailBatch.mock.calls.map(([messages]) => messages.length)).toEqual([100, 100, 30]);
    const keys = mocks.sendEmailBatch.mock.calls.map(([, key]) => key);
    expect(new Set(keys).size).toBe(3);
    expect(keys[0]).toMatch(/^review-initial-7-1-100-100-/);
  });

  it("verwendet für identische Batches denselben Idempotenzschlüssel, unabhängig von der Reihenfolge", async () => {
    await sendEventReviewRequests(7, "initial", null);
    mocks.getReviewRecipients.mockResolvedValue(recipients(3).reverse());
    await sendEventReviewRequests(7, "initial", null);
    expect(mocks.sendEmailBatch.mock.calls[1][1]).toBe(mocks.sendEmailBatch.mock.calls[0][1]);
  });

  it("unterscheidet verschiedene ID-Gruppen mit gleichen Rand-IDs und gleicher Größe", async () => {
    const all = recipients(4);
    mocks.getReviewRecipients.mockResolvedValue([all[0], all[1], all[3]]);
    await sendEventReviewRequests(7, "initial", null);
    mocks.getReviewRecipients.mockResolvedValue([all[0], all[2], all[3]]);
    await sendEventReviewRequests(7, "initial", null);
    expect(mocks.sendEmailBatch.mock.calls[1][1]).not.toBe(mocks.sendEmailBatch.mock.calls[0][1]);
  });

  it("verwendet bei geänderter Mail nach Freigabe einen anderen Idempotenzschlüssel", async () => {
    await sendEventReviewRequests(7, "initial", null);
    mocks.buildReviewRequestEmail.mockImplementation(async (data: { to: string }) => ({
      from: "verein@example.com", to: data.to, subject: "Bewertung", html: "<p>Neue Antwortfrist</p>",
    }));
    await sendEventReviewRequests(7, "initial", null);
    expect(mocks.sendEmailBatch.mock.calls[1][1]).not.toBe(mocks.sendEmailBatch.mock.calls[0][1]);
  });

  it("gibt genau die IDs eines fehlgeschlagenen Batches frei und sendet weitere Batches", async () => {
    mocks.getReviewRecipients.mockResolvedValue(recipients(230));
    mocks.sendEmailBatch.mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    expect(await sendEventReviewRequests(7, "initial", null)).toEqual({ ok: true, result: { kind: "initial", sent: 130, failed: 100 } });
    expect(mocks.releaseReviewRequests).toHaveBeenCalledExactlyOnceWith(Array.from({ length: 100 }, (_, i) => i + 101));
    expect(mocks.logAudit).toHaveBeenCalledWith(null, "SEND_REVIEW_REQUESTS", "event", 7, { sent: 130, failed: 100 });
  });

  it("gibt Reservierungen auch bei einem Renderfehler frei", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.buildReviewRequestEmail.mockRejectedValue(new Error("Vorlage konnte nicht erstellt werden."));
    expect(await sendEventReviewRequests(7, "initial", null)).toMatchObject({ result: { sent: 0, failed: 3 } });
    expect(mocks.releaseReviewRequests).toHaveBeenCalledWith([1, 2, 3]);
    expect(mocks.sendEmailBatch).not.toHaveBeenCalled();
  });
});

describe("Review-Erinnerung", () => {
  it("setzt mindestens eine frühere Review-Anfrage voraus", async () => {
    mocks.getEventReviewDashboard.mockResolvedValue({ requested: 0 });
    expect(await sendEventReviewRequests(7, "reminder", null)).toEqual({ ok: false, status: 409, error: "Bitte zuerst die Review-Anfrage senden." });
    expect(mocks.getReviewRecipients).not.toHaveBeenCalled();
    expect(mocks.claimEventReviewReminder).not.toHaveBeenCalled();
  });

  it("verbraucht ohne Kandidaten keinen Erinnerungslauf", async () => {
    mocks.getReviewRecipients.mockResolvedValue([]);
    expect(await sendEventReviewRequests(7, "reminder", null)).toEqual({ ok: false, status: 409, error: "Keine offenen Anfragen für eine Erinnerung." });
    expect(mocks.claimEventReviewReminder).not.toHaveBeenCalled();
  });

  it("reserviert nur einen Lauf und weist den zweiten Aufruf zurück", async () => {
    mocks.claimEventReviewReminder.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await sendEventReviewRequests(7, "reminder", null)).toMatchObject({ result: { sent: 3 } });
    expect(await sendEventReviewRequests(7, "reminder", null)).toEqual({ ok: false, status: 409, error: "Die Erinnerung wurde bereits verschickt." });
    expect(mocks.sendEmailBatch).toHaveBeenCalledTimes(1);
    expect(mocks.claimReviewReminders).toHaveBeenCalledTimes(1);
    expect(mocks.releaseEventReviewReminder).not.toHaveBeenCalled();
  });

  it("verwendet nur reservierte IDs und die individuelle ursprüngliche Frist", async () => {
    const candidates = recipients(2);
    candidates[1].review_requested_at = "2026-06-30T22:30:00Z";
    mocks.getReviewRecipients.mockResolvedValue(candidates);
    mocks.claimReviewReminders.mockResolvedValue([2]);
    expect(await sendEventReviewRequests(7, "reminder", "admin@example.com")).toMatchObject({ result: { sent: 1 } });
    expect(mocks.buildReviewRequestEmail).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      to: "person2@example.com", isReminder: true, deadline: new Date("2026-07-14T22:30:00Z"),
    }));
    expect(mocks.logAudit).toHaveBeenCalledWith("admin@example.com", "SEND_REVIEW_REMINDER", "event", 7, { sent: 1, failed: 0 });
  });

  it("gibt bei vollständigem Fehlschlag auch den Event-Erinnerungslauf frei", async () => {
    mocks.getReviewRecipients.mockResolvedValue(recipients(230));
    mocks.sendEmailBatch.mockResolvedValue(false);
    expect(await sendEventReviewRequests(7, "reminder", null)).toEqual({ ok: true, result: { kind: "reminder", sent: 0, failed: 230 } });
    expect(mocks.releaseReviewReminders.mock.calls.map(([ids]) => ids.length)).toEqual([100, 100, 30]);
    expect(mocks.releaseEventReviewReminder).toHaveBeenCalledExactlyOnceWith(7);
    expect(mocks.releaseReviewRequests).not.toHaveBeenCalled();
  });

  it("behält bei Teilerfolg den Event-Erinnerungslauf und gibt nur den fehlgeschlagenen Batch frei", async () => {
    mocks.getReviewRecipients.mockResolvedValue(recipients(101));
    mocks.sendEmailBatch.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    expect(await sendEventReviewRequests(7, "reminder", null)).toMatchObject({ result: { sent: 1, failed: 100 } });
    expect(mocks.releaseReviewReminders).toHaveBeenCalledExactlyOnceWith(Array.from({ length: 100 }, (_, i) => i + 1));
    expect(mocks.releaseEventReviewReminder).not.toHaveBeenCalled();
  });

  it("gibt einen ungenutzten Lauf nach verlorener Empfängerreservierung frei", async () => {
    mocks.claimReviewReminders.mockResolvedValue([]);
    expect(await sendEventReviewRequests(7, "reminder", null)).toMatchObject({ result: { sent: 0, failed: 0 } });
    expect(mocks.releaseEventReviewReminder).toHaveBeenCalledWith(7);
    expect(mocks.sendEmailBatch).not.toHaveBeenCalled();
  });

  it("gibt den Event-Lauf bei einem Reservierungsfehler frei", async () => {
    mocks.claimReviewReminders.mockRejectedValue(new Error("Reservierung fehlgeschlagen."));
    await expect(sendEventReviewRequests(7, "reminder", null)).rejects.toThrow("Reservierung fehlgeschlagen.");
    expect(mocks.releaseEventReviewReminder).toHaveBeenCalledWith(7);
  });
});

describe("Review-E-Mail-Vorlage", () => {
  it.each([false, true])("enthält fünf getrennte Sternlinks und einen Ersatzlink (Erinnerung: %s)", async (isReminder) => {
    const reviewUrl = "https://example.com/review/geheimer-token";
    const html = await render(ReviewRequestEmail({
      firstName: "Ahmet", eventTitle: "Fußball", eventDate: "1. Juli 2026", reviewUrl,
      deadlineDate: "15. Juli 2026", isReminder,
    }));
    const links = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    expect(links.filter((link) => link.includes("?rating="))).toEqual([1, 2, 3, 4, 5].map((rating) => `${reviewUrl}?rating=${rating}`));
    expect(links).toContain(reviewUrl);
    expect(html.match(/★/g)).toHaveLength(5);
    expect(html).toContain(isReminder ? "Kurze Erinnerung ⭐" : "Wie war&#x27;s? ⭐");
    expect(html).toContain("#f59e0b");
    expect(html).toContain("36px");
    expect(html).toContain("Bewertung abgeben");
    expect(html).toContain("15. Juli 2026");
    expect(html).toContain("1 = gar nicht · 5 = super");
    expect(html).toContain("Jazakallahu Khairan! 🤍");
    expect(html).not.toContain("<img");
  });
});

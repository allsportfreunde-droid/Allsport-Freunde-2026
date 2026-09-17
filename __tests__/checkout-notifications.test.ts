import { beforeEach, describe, expect, it, vi } from "vitest";
import { deliverCheckoutNotifications } from "../lib/checkout-notifications";
import type { CheckoutNotification } from "../lib/db/checkout";

const mocks = vi.hoisted(() => ({ list: vi.fn(), prepare: vi.fn(), sent: vi.fn(), registration: vi.fn(),
  event: vi.fn(), pricing: vi.fn(), create: vi.fn(), send: vi.fn(), qr: vi.fn(), cancel: vi.fn() }));
vi.mock("@/lib/db", () => ({ getCheckoutNotifications: mocks.list, prepareCheckoutMessage: mocks.prepare,
  markCheckoutNotificationSent: mocks.sent, getRegistrationDetail: mocks.registration, getEvent: mocks.event,
  getCheckoutPricing: mocks.pricing, cancelCheckoutNotification: mocks.cancel }));
vi.mock("@/lib/email", () => ({ createCheckoutEmail: mocks.create, sendCheckoutEmail: mocks.send }));
vi.mock("@/lib/checkin-qr", () => ({ generateAndSaveCheckinQR: mocks.qr }));

let notice: CheckoutNotification;
beforeEach(() => {
  vi.resetAllMocks();
  notice = { id: "approval/1", registration_id: 1, session_id: "cs_1", kind: "approval", data: {},
    message: null, first_attempt_at: null, sent_at: null };
  mocks.list.mockImplementation(async () => notice.sent_at ? [] : [{ ...notice }]);
  mocks.prepare.mockImplementation(async (_id, message) => {
    notice.message ??= message;
    notice.first_attempt_at ??= new Date().toISOString();
    return { ...notice };
  });
  mocks.sent.mockImplementation(async () => { notice.sent_at = new Date().toISOString(); });
  mocks.registration.mockResolvedValue({ id: 1, event_id: 1, status: "approved", first_name: "Test",
    email: "guest@example.com", status_token: "token", person_count: 2, qr_code: "saved-qr" });
  mocks.event.mockResolvedValue({ id: 1, title: "Sport", date: "2099-06-01", time: "12:00", location: "Halle" });
  mocks.create.mockImplementation(async (subject, to) => ({ from: "team@example.com", to, subject, html: "frozen" }));
});

describe("Dauerhafter Checkout-Versandnachweis", () => {
  it("versendet bei späteren und wiederholten Webhooks keine zweite Bestätigung", async () => {
    await deliverCheckoutNotifications(1);
    await deliverCheckoutNotifications(1);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.qr).not.toHaveBeenCalled();
  });

  it("wiederholt einen fehlgeschlagenen Versand mit identischem Inhalt und Idempotenzschlüssel", async () => {
    mocks.send.mockRejectedValueOnce(new Error("timeout"));
    await expect(deliverCheckoutNotifications(1)).rejects.toThrow("timeout");
    expect(mocks.sent).not.toHaveBeenCalled();
    await deliverCheckoutNotifications(1);
    expect(mocks.send.mock.calls[0]).toEqual(mocks.send.mock.calls[1]);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it("nutzt bei parallelen Zustellern denselben Provider-Schlüssel und eingefrorenen Inhalt", async () => {
    await Promise.all([deliverCheckoutNotifications(1), deliverCheckoutNotifications(1)]);
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls[0]).toEqual(mocks.send.mock.calls[1]);
  });

  it("wiederholt nach unbekanntem Ausgang außerhalb des Provider-Fensters nicht blind", async () => {
    notice.message = { from: "team@example.com", to: "guest@example.com", subject: "test", html: "frozen" };
    notice.first_attempt_at = new Date(Date.now() - 25 * 3600000).toISOString();
    await expect(deliverCheckoutNotifications(1)).rejects.toThrow("Idempotenzfenster");
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("versendet ohne QR-Code keine vermeintlich vollständige Bestätigung", async () => {
    mocks.registration.mockResolvedValue({ id: 1, event_id: 1, status: "approved", email: "guest@example.com" });
    mocks.qr.mockResolvedValue(undefined);
    await expect(deliverCheckoutNotifications(1)).rejects.toThrow("QR-Code fehlt");
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("bestätigt keine inzwischen stornierte Anmeldung", async () => {
    mocks.registration.mockResolvedValue({ id: 1, event_id: 1, status: "cancelled", email: "guest@example.com" });
    await deliverCheckoutNotifications(1);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.cancel).toHaveBeenCalledWith(notice.id);
  });

  it("adressiert einen Einzugsfehler ausschließlich an den Admin", async () => {
    vi.stubEnv("ADMIN_EMAIL", "admin@example.com");
    notice.kind = "payment_failed";
    notice.data = { amount: 14, reason: "Fehlgeschlagen" };
    await deliverCheckoutNotifications(1);
    expect(mocks.send.mock.calls[0][0].to).toBe("admin@example.com");
    vi.unstubAllEnvs();
  });

  it("meldet den Fehler dem Admin auch wenn eine ausstehende Teilnehmerbestätigung scheitert", async () => {
    vi.stubEnv("ADMIN_EMAIL", "admin@example.com");
    const failed = { ...notice, id: "failed/1", kind: "payment_failed", data: { amount: 14 } };
    mocks.list.mockResolvedValue([notice, failed]);
    mocks.create.mockImplementation(async (subject, to) => {
      if (to === "guest@example.com") throw new Error("participant delivery failed");
      return { from: "team@example.com", to, subject, html: "admin" };
    });
    await expect(deliverCheckoutNotifications(1)).rejects.toThrow("participant delivery failed");
    expect(mocks.send.mock.calls[0][0].to).toBe("admin@example.com");
    vi.unstubAllEnvs();
  });

  it("sendet eine schon vorbereitete Bestätigung nach zwischenzeitlicher Stornierung nicht mehr", async () => {
    notice.message = { from: "team@example.com", to: "guest@example.com", subject: "test", html: "frozen" };
    notice.first_attempt_at = new Date().toISOString();
    mocks.registration.mockResolvedValue({ id: 1, event_id: 1, status: "cancelled", email: "guest@example.com" });
    await deliverCheckoutNotifications(1);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.cancel).toHaveBeenCalledWith(notice.id);
  });
});

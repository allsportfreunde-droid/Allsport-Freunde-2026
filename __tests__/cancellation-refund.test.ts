import { beforeEach, describe, expect, it, vi } from "vitest";
import { refundAndNotifyCancellation, reconcileCheckoutRefund } from "../lib/cancellation-refund";
import { refundIdempotencyKey } from "../lib/stripe-refund";
import type { RefundContext } from "../lib/types";

const mocks = vi.hoisted(() => {
  // Wird beim Laden von lib/cancellation-refund gelesen – also vor den Imports setzen.
  process.env.ADMIN_EMAIL = "team@example.test";
  return {
    context: vi.fn(), announce: vi.fn(), mail: vi.fn(), adminMail: vi.fn(), queueRefund: vi.fn(),
    record: vi.fn(), cancelNotice: vi.fn(), noteFailure: vi.fn(), getStripe: vi.fn(), createRefund: vi.fn(),
  };
});
vi.mock("@/lib/db", () => ({
  getRefundContext: mocks.context, announceRefunds: mocks.announce, queueCheckoutRefund: mocks.queueRefund,
  recordRefundResult: mocks.record, cancelCheckoutNotification: mocks.cancelNotice,
  noteCheckoutRefundFailure: mocks.noteFailure, checkoutRefundNotificationId: (session: string) => `checkout-refund/${session}`,
}));
vi.mock("@/lib/email", () => ({ sendRegistrationCancelledEmail: mocks.mail, sendRefundDueAdminEmail: mocks.adminMail }));
vi.mock("@/lib/stripe", () => ({ stripePaymentUrl: () => null, getStripe: mocks.getStripe }));

function context(overrides: Partial<RefundContext> = {}): RefundContext {
  return {
    registration_id: 1, email: "test@example.com", status_token: "test", first_name: "Test",
    paid_at: "2026-09-15T10:00:00Z", amount_paid: 14, stripe_payment_intent_id: "pi_1",
    paid_persons: 3, announced_cents: 0, active_paid_persons: 2, active_persons: 2,
    paid_person_prices: { adult: 1000, child: 400, free: 0 },
    pending_persons: [{ id: "child", first_name: "Kind", last_name: "Test", cancelled_at: "2026-05-30T10:00:00Z" }],
    event_title: "Sport", event_date: "2099-06-01", event_time: "12:00", event_location: "Halle",
    event_cancellation_deadline: null, ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.context.mockResolvedValue(context());
  mocks.announce.mockImplementation(async (shares: Array<{ personId: string }>) => shares.map((share) => share.personId));
  mocks.queueRefund.mockImplementation(async (_id: number, _session: string, shares: Array<{ personId: string; amount: number }>) =>
    shares.map(({ personId, amount }) => ({ personId, amount })));
  mocks.getStripe.mockReturnValue({ refunds: { create: mocks.createRefund } });
  mocks.createRefund.mockResolvedValue({ id: "re_1", status: "succeeded" });
});

describe("Teilrückerstattung und Stornobestätigung", () => {
  it("meldet den bezahlten Kinderanteil nach einer rechtzeitigen Stornierung auch nach dem Event", async () => {
    mocks.context.mockResolvedValue(context({ stripe_session_id: "cs_1", event_date: "2026-06-01",
      paid_at: "2026-06-06T10:00:00Z",
      pending_persons: [{ id: "child", first_name: "Kind", last_name: "Test", cancelled_at: "2026-05-30T10:00:00Z" }],
    }));
    await reconcileCheckoutRefund(1, "cs_1");
    expect(mocks.queueRefund).toHaveBeenCalledWith(1, "cs_1", [{ personId: "child", amount: 4, name: "Kind Test" }]);
    expect(mocks.mail).not.toHaveBeenCalled();
  });

  it("sagt für eine verspätete Stornierung keine automatische Erstattung zu", async () => {
    mocks.context.mockResolvedValue(context({ stripe_session_id: "cs_1", event_date: "2026-06-01",
      pending_persons: [{ id: "child", first_name: "Kind", last_name: "Test", cancelled_at: "2026-06-01T11:00:00Z" }],
    }));
    await reconcileCheckoutRefund(1, "cs_1");
    expect(mocks.queueRefund).not.toHaveBeenCalled();
    expect(mocks.createRefund).not.toHaveBeenCalled();
  });

  it("verändert die Erstattungsaufteilung einer anderen bereits verbuchten Session nicht", async () => {
    mocks.context.mockResolvedValue(context({ stripe_session_id: "cs_original" }));
    await reconcileCheckoutRefund(1, "cs_other");
    expect(mocks.queueRefund).not.toHaveBeenCalled();
  });
  it("speichert und bestätigt den gezahlten Kinderpreis", async () => {
    expect(await refundAndNotifyCancellation(1)).toMatchObject({ amount: 4, persons: ["Kind Test"], partial: true });
    expect(mocks.announce).toHaveBeenCalledWith([{ personId: "child", amount: 4 }]);
    expect(mocks.mail).toHaveBeenCalledWith(expect.objectContaining({ refundAmount: 4 }));
  });

  it("bestätigt eine fristgerechte Stornierung auch bei verzögertem Nachlauf nach Fristablauf", async () => {
    mocks.context.mockResolvedValue(context({ event_date: "2026-06-01" }));
    expect(await refundAndNotifyCancellation(1)).toMatchObject({ amount: 4, persons: ["Kind Test"] });
  });

  it("schließt kostenlose Personen ohne Erstattungszusage ab", async () => {
    mocks.context.mockResolvedValue(context({ pending_persons: [{ id: "free", first_name: "Gratis", last_name: "Kind", cancelled_at: "2026-05-30T10:00:00Z" }] }));
    expect(await refundAndNotifyCancellation(1)).toMatchObject({ amount: 0, persons: ["Gratis Kind"] });
    expect(mocks.announce).toHaveBeenCalledWith([{ personId: "free", amount: 0 }]);
    expect(mocks.mail).toHaveBeenCalledWith(expect.objectContaining({ refundAmount: undefined }));
    expect(mocks.adminMail).not.toHaveBeenCalled();
    expect(mocks.createRefund).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("sagt einen bereits beanspruchten Anteil nicht erneut zu", async () => {
    mocks.announce.mockResolvedValue([]);
    expect(await refundAndNotifyCancellation(1)).toMatchObject({ amount: 0, persons: [] });
    expect(mocks.mail).toHaveBeenCalledWith(expect.objectContaining({ refundAmount: undefined }));
    expect(mocks.createRefund).not.toHaveBeenCalled();
  });
});

describe("Automatische Erstattung über Stripe", () => {
  it("erstattet den beanspruchten Anteil sofort und meldet dem Team nichts", async () => {
    await refundAndNotifyCancellation(1);
    expect(mocks.createRefund).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: "pi_1", amount: 400, reason: "requested_by_customer",
        metadata: { registration_id: "1", person_ids: "child" } }),
      { idempotencyKey: refundIdempotencyKey(1, ["child"]) }
    );
    expect(mocks.record).toHaveBeenCalledWith(["child"], { ok: true, refundId: "re_1" });
    expect(mocks.adminMail).not.toHaveBeenCalled();
    expect(mocks.mail).toHaveBeenCalledWith(expect.objectContaining({ refundAmount: 4 }));
  });

  it("fasst mehrere Personen einer Stornierung zu einer Erstattung zusammen", async () => {
    mocks.context.mockResolvedValue(context({ active_paid_persons: 0, active_persons: 0, pending_persons: [
      { id: "adult", first_name: "Erw", last_name: "Test", cancelled_at: "2026-05-30T10:00:00Z" },
      { id: "child", first_name: "Kind", last_name: "Test", cancelled_at: "2026-05-30T10:00:00Z" },
      { id: "free", first_name: "Gratis", last_name: "Kind", cancelled_at: "2026-05-30T10:00:00Z" },
    ] }));
    expect(await refundAndNotifyCancellation(1)).toMatchObject({ amount: 14, partial: false });
    expect(mocks.createRefund).toHaveBeenCalledTimes(1);
    expect(mocks.createRefund.mock.calls[0][0]).toMatchObject({ amount: 1400 });
    // Die kostenlose Person gehört nicht zur Erstattung.
    expect(mocks.record).toHaveBeenCalledWith(["adult", "child"], { ok: true, refundId: "re_1" });
  });

  it("bittet das Team mit Grund um eine Erstattung von Hand, wenn Stripe ablehnt", async () => {
    mocks.createRefund.mockRejectedValue(new Error("Refund amount exceeds the remaining charge."));
    expect(await refundAndNotifyCancellation(1)).toMatchObject({ amount: 4 });
    expect(mocks.record).toHaveBeenCalledWith(["child"], { ok: false, reason: "Refund amount exceeds the remaining charge." });
    expect(mocks.adminMail).toHaveBeenCalledWith(expect.objectContaining({
      adminEmail: "team@example.test", amount: 4, personNames: ["Kind Test"],
      failureReason: "Refund amount exceeds the remaining charge.",
    }));
    // Die Zusage an den Teilnehmer bleibt bestehen.
    expect(mocks.mail).toHaveBeenCalledWith(expect.objectContaining({ refundAmount: 4 }));
  });

  it("behandelt eine von Stripe als fehlgeschlagen gemeldete Erstattung wie eine Ablehnung", async () => {
    mocks.createRefund.mockResolvedValue({ id: "re_1", status: "failed", failure_reason: "charge_for_pending_refund_disputed" });
    await refundAndNotifyCancellation(1);
    expect(mocks.record).toHaveBeenCalledWith(["child"], { ok: false, reason: expect.stringContaining("fehlgeschlagen") });
    expect(mocks.adminMail).toHaveBeenCalledTimes(1);
  });

  it("zählt eine laufende SEPA-Erstattung als ausgelöst", async () => {
    mocks.createRefund.mockResolvedValue({ id: "re_sepa", status: "pending" });
    await refundAndNotifyCancellation(1);
    expect(mocks.record).toHaveBeenCalledWith(["child"], { ok: true, refundId: "re_sepa" });
    expect(mocks.adminMail).not.toHaveBeenCalled();
  });

  it("fällt ohne Stripe-Schlüssel auf die Erstattung von Hand zurück", async () => {
    mocks.getStripe.mockReturnValue(null);
    await refundAndNotifyCancellation(1);
    expect(mocks.record).toHaveBeenCalledWith(["child"], { ok: false, reason: "Stripe ist nicht konfiguriert." });
    expect(mocks.adminMail).toHaveBeenCalledTimes(1);
  });

  it("fällt ohne hinterlegte Zahlung auf die Erstattung von Hand zurück", async () => {
    mocks.context.mockResolvedValue(context({ stripe_payment_intent_id: null }));
    await refundAndNotifyCancellation(1);
    expect(mocks.createRefund).not.toHaveBeenCalled();
    expect(mocks.adminMail).toHaveBeenCalledWith(expect.objectContaining({
      failureReason: expect.stringContaining("keine Stripe-Zahlung"),
    }));
  });

  it("verwendet für dieselben Personen denselben Idempotenzschlüssel", () => {
    expect(refundIdempotencyKey(1, ["b", "a"])).toBe(refundIdempotencyKey(1, ["a", "b"]));
    expect(refundIdempotencyKey(1, ["a"])).not.toBe(refundIdempotencyKey(2, ["a"]));
    expect(refundIdempotencyKey(1, Array.from({ length: 20 }, (_, i) => `${i}`.padStart(36, "0"))).length).toBeLessThan(255);
  });
});

describe("Erstattung nach später eingegangener SEPA-Zahlung", () => {
  beforeEach(() => {
    mocks.context.mockResolvedValue(context({ stripe_session_id: "cs_1" }));
  });

  it("erstattet automatisch und storniert den Admin-Auftrag", async () => {
    await reconcileCheckoutRefund(1, "cs_1");
    expect(mocks.createRefund).toHaveBeenCalledWith(expect.objectContaining({ payment_intent: "pi_1", amount: 400 }), expect.anything());
    expect(mocks.record).toHaveBeenCalledWith(["child"], { ok: true, refundId: "re_1" });
    expect(mocks.cancelNotice).toHaveBeenCalledWith("checkout-refund/cs_1");
    expect(mocks.noteFailure).not.toHaveBeenCalled();
  });

  it("lässt den Admin-Auftrag mit Grund stehen, wenn Stripe ablehnt", async () => {
    mocks.createRefund.mockRejectedValue(new Error("Insufficient funds in Stripe balance."));
    await reconcileCheckoutRefund(1, "cs_1");
    expect(mocks.noteFailure).toHaveBeenCalledWith("cs_1", "Insufficient funds in Stripe balance.");
    expect(mocks.cancelNotice).not.toHaveBeenCalled();
  });

  it("erstattet nicht, wenn ein paralleler Lauf die Personen schon beansprucht hat", async () => {
    mocks.queueRefund.mockResolvedValue([]);
    await reconcileCheckoutRefund(1, "cs_1");
    expect(mocks.createRefund).not.toHaveBeenCalled();
    expect(mocks.cancelNotice).not.toHaveBeenCalled();
  });
});

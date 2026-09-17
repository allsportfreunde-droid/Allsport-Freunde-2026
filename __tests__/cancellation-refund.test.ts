import { beforeEach, describe, expect, it, vi } from "vitest";
import { refundAndNotifyCancellation, reconcileCheckoutRefund } from "../lib/cancellation-refund";
import type { RefundContext } from "../lib/types";

const mocks = vi.hoisted(() => ({ context: vi.fn(), announce: vi.fn(), mail: vi.fn(), adminMail: vi.fn(), queueRefund: vi.fn() }));
vi.mock("@/lib/db", () => ({ getRefundContext: mocks.context, announceRefunds: mocks.announce, queueCheckoutRefund: mocks.queueRefund }));
vi.mock("@/lib/email", () => ({ sendRegistrationCancelledEmail: mocks.mail, sendRefundDueAdminEmail: mocks.adminMail }));
vi.mock("@/lib/stripe", () => ({ stripePaymentUrl: () => null }));

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
  });

  it("sagt einen bereits beanspruchten Anteil nicht erneut zu", async () => {
    mocks.announce.mockResolvedValue([]);
    expect(await refundAndNotifyCancellation(1)).toMatchObject({ amount: 0, persons: [] });
    expect(mocks.mail).toHaveBeenCalledWith(expect.objectContaining({ refundAmount: undefined }));
  });
});

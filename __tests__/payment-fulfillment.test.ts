import { beforeEach, describe, expect, it, vi } from "vitest";
import { fulfillCheckout } from "../lib/checkout-fulfillment";

const mocks = vi.hoisted(() => ({
  retrieve: vi.fn(), getPricing: vi.fn(), markPaid: vi.fn(), getRegistration: vi.fn(),
  getEvent: vi.fn(), sendMail: vi.fn(), generateQR: vi.fn(),
  recordState: vi.fn(), approve: vi.fn(), failure: vi.fn(), deliver: vi.fn(), refund: vi.fn(),
}));
vi.mock("@/lib/stripe", () => ({ getStripe: () => ({ checkout: { sessions: { retrieve: mocks.retrieve } } }) }));
vi.mock("@/lib/db", () => ({
  getCheckoutPricing: mocks.getPricing, markRegistrationPaid: mocks.markPaid,
  getRegistrationWithEvent: mocks.getRegistration, getEvent: mocks.getEvent,
  recordCheckoutState: mocks.recordState, approveCheckoutRegistration: mocks.approve,
  queueCheckoutFailure: mocks.failure,
}));
vi.mock("@/lib/checkout-notifications", () => ({ deliverCheckoutNotifications: mocks.deliver }));
vi.mock("@/lib/cancellation-refund", () => ({ reconcileCheckoutRefund: mocks.refund }));
vi.mock("@/lib/email", () => ({ sendRegistrationApprovedEmail: mocks.sendMail }));
vi.mock("@/lib/checkin-qr", () => ({ generateAndSaveCheckinQR: mocks.generateQR }));

const prices = { adult: 1000, child: 400, free: 0 };
const session = {
  id: "cs_1", mode: "payment", status: "complete", payment_status: "paid", amount_total: 1400, currency: "eur",
  client_reference_id: "1", payment_intent: "pi_1", metadata: { pricing_version: "1" },
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.retrieve.mockResolvedValue(session);
  mocks.getPricing.mockResolvedValue(prices);
  mocks.markPaid.mockResolvedValue(true);
  mocks.getRegistration.mockResolvedValue({ email: "test@example.com", event_id: 1, status_token: "token" });
  // Der aktuelle Eventpreis ist inzwischen geändert. Die Zahlung muss beim alten Betrag bleiben.
  mocks.getEvent.mockResolvedValue({ title: "Sport", entry_price: 99, child_entry_price: 88 });
  mocks.generateQR.mockResolvedValue("qr");
  mocks.recordState.mockImplementation(async (_session, _registration, state) => state);
});

describe("Zahlung mit unveränderlicher Personenaufteilung", () => {
  it("verbucht die Aufteilung der bezahlten Session trotz geänderter Eventpreise", async () => {
    expect(await fulfillCheckout("cs_1")).toBe(true);
    expect(mocks.getPricing).toHaveBeenCalledWith("cs_1", 1);
    expect(mocks.markPaid).toHaveBeenCalledWith(1, "cs_1", 14, "pi_1", prices);
    expect(mocks.approve).toHaveBeenCalledWith(1, "cs_1");
    expect(mocks.deliver).toHaveBeenCalledWith(1);
  });

  it("holt ausstehenden Versand auch nach bereits verbuchter Zahlung nach", async () => {
    mocks.markPaid.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await fulfillCheckout("cs_1");
    await fulfillCheckout("cs_1");
    expect(mocks.deliver).toHaveBeenCalledTimes(2);
  });

  it("lässt alte Sessions ohne Aufteilung auf dem bisherigen Weg zu", async () => {
    mocks.retrieve.mockResolvedValue({ ...session, metadata: {} });
    mocks.getPricing.mockResolvedValue(null);
    expect(await fulfillCheckout("cs_1")).toBe(true);
    expect(mocks.markPaid).toHaveBeenCalledWith(1, "cs_1", 14, "pi_1", null);
  });

  it("fordert bei fehlender Aufteilung einer neuen Session einen erneuten Webhook-Versuch an", async () => {
    mocks.getPricing.mockResolvedValue(null);
    await expect(fulfillCheckout("cs_1")).rejects.toThrow("Preisaufteilung fehlt");
    expect(mocks.markPaid).not.toHaveBeenCalled();
  });

  it("verbucht keine abweichende Zahlung", async () => {
    mocks.retrieve.mockResolvedValue({ ...session, amount_total: 1800 });
    await expect(fulfillCheckout("cs_1")).rejects.toThrow("Zahlungsbetrag");
    expect(mocks.markPaid).not.toHaveBeenCalled();
  });

  it.each(["unpaid", "no_payment_required"])("bestätigt %s nicht automatisch", async (paymentStatus) => {
    mocks.retrieve.mockResolvedValue({ ...session, payment_status: paymentStatus });
    expect(await fulfillCheckout("cs_1")).toBe(false);
    expect(mocks.markPaid).not.toHaveBeenCalled();
  });

  it("bestätigt gestartetes SEPA ohne den Betrag als bezahlt zu verbuchen", async () => {
    mocks.retrieve.mockResolvedValue({ ...session, payment_status: "unpaid", payment_intent: {
      id: "pi_1", status: "processing", payment_method: { type: "sepa_debit" },
    } });
    expect(await fulfillCheckout("cs_1")).toBe(false);
    expect(mocks.recordState).toHaveBeenCalledWith("cs_1", 1, "processing", "pi_1");
    expect(mocks.approve).toHaveBeenCalledWith(1, "cs_1");
    expect(mocks.markPaid).not.toHaveBeenCalled();
  });

  it.each(["requires_action", "requires_payment_method", "requires_confirmation"])("bestätigt SEPA-Status %s nicht vorzeitig", async status => {
    mocks.retrieve.mockResolvedValue({ ...session, payment_status: "unpaid", payment_intent: {
      id: "pi_1", status, payment_method: { type: "sepa_debit" },
    } });
    await fulfillCheckout("cs_1");
    expect(mocks.approve).not.toHaveBeenCalled();
    expect(mocks.recordState).not.toHaveBeenCalled();
  });

  it("verwechselt erlaubte Verfahren nicht mit der tatsächlich verwendeten Zahlungsart", async () => {
    mocks.retrieve.mockResolvedValue({ ...session, payment_status: "unpaid", payment_intent: {
      id: "pi_1", status: "processing", payment_method_types: ["card", "sepa_debit"], payment_method: { type: "card" },
    } });
    await fulfillCheckout("cs_1");
    expect(mocks.approve).not.toHaveBeenCalled();
  });

  it("meldet nur dem Admin einen von Stripe bestätigten Fehlschlag", async () => {
    mocks.retrieve.mockResolvedValue({ ...session, payment_status: "unpaid", payment_intent: {
      id: "pi_1", status: "requires_payment_method", payment_method: null,
      latest_charge: { payment_method_details: { type: "sepa_debit" } }, last_payment_error: { message: "Insufficient funds" },
    } });
    await fulfillCheckout("cs_1", true);
    expect(mocks.failure).toHaveBeenCalledWith(1, "cs_1", "Insufficient funds", 14, "pi_1");
    expect(mocks.approve).not.toHaveBeenCalled();
    expect(mocks.markPaid).not.toHaveBeenCalled();
    expect(mocks.deliver).toHaveBeenCalledWith(1);
  });

  it("wertet einen verspäteten Fehler-Webhook anhand des aktuellen erfolgreichen Zahlungsstands aus", async () => {
    await fulfillCheckout("cs_1", true);
    expect(mocks.failure).not.toHaveBeenCalled();
    expect(mocks.markPaid).toHaveBeenCalled();
  });

  it("bestätigt bei verspätetem processing nach gespeichertem Fehlschlag nicht erneut", async () => {
    mocks.retrieve.mockResolvedValue({ ...session, payment_status: "unpaid", payment_intent: {
      id: "pi_1", status: "processing", payment_method: { type: "sepa_debit" },
    } });
    mocks.recordState.mockResolvedValue("failed");
    await fulfillCheckout("cs_1");
    expect(mocks.approve).not.toHaveBeenCalled();
  });

  it("holt Erstattungen bei späterem Zahlungseingang nach", async () => {
    await fulfillCheckout("cs_1");
    expect(mocks.refund).toHaveBeenCalledWith(1, "cs_1");
  });

  it("gibt Versandfehler an den Webhook zurück", async () => {
    mocks.deliver.mockRejectedValue(new Error("Versand fehlgeschlagen"));
    await expect(fulfillCheckout("cs_1")).rejects.toThrow("Versand fehlgeschlagen");
  });
});

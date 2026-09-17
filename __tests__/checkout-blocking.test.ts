import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../app/api/checkout/route";
import type { CheckoutInfo } from "../lib/types";

/**
 * Der Checkout-Start gegen frühere Stripe-Sessions: alte Links schließen,
 * laufende Einzüge und bezahlte Sessions erkennen, unterbrochene Anlagen
 * wiederaufnehmen. Stripe wird durch einen kleinen Session-Speicher ersetzt;
 * Sperre, Abgleich und Wiederaufnahme laufen mit dem echten Code.
 */
const mocks = vi.hoisted(() => ({
  info: vi.fn(), savePricing: vi.fn(), claim: vi.fn(), stage: vi.fn(), release: vi.fn(),
  savedCheckouts: vi.fn(), recordState: vi.fn(), limit: vi.fn(),
  create: vi.fn(), retrieve: vi.fn(), expire: vi.fn(), list: vi.fn(), fulfill: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  getCheckoutInfo: mocks.info, saveCheckoutPricing: mocks.savePricing,
  claimCheckoutCreation: mocks.claim, stageCheckoutCreation: mocks.stage, releaseCheckoutCreation: mocks.release,
  getRegistrationCheckouts: mocks.savedCheckouts, recordCheckoutState: mocks.recordState,
}));
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({ checkout: { sessions: { create: mocks.create, retrieve: mocks.retrieve, expire: mocks.expire, list: mocks.list } } }),
}));
vi.mock("@/lib/checkout-fulfillment", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/checkout-fulfillment")>()), fulfillCheckout: mocks.fulfill,
}));
vi.mock("@/lib/ratelimit", () => ({ checkRateLimit: mocks.limit, getClientIp: () => "test", RATE_LIMITS: { checkout: {} } }));

type StripeSession = Record<string, unknown>;
let stripeSessions: Map<string, StripeSession>;
function stripeSession(id: string, overrides: StripeSession = {}): StripeSession {
  return {
    id, mode: "payment", status: "open", payment_status: "unpaid", currency: "eur", amount_total: 1000,
    client_reference_id: "1", metadata: { registration_id: "1" }, payment_intent: null,
    url: `https://checkout.stripe.com/${id}`, ...overrides,
  };
}
const sepaProcessing = { status: "complete", payment_intent: { id: "pi_1", status: "processing", payment_method: { type: "sepa_debit" } } };
const info = (): CheckoutInfo => ({
  registration_id: 1, event_id: 1, event_title: "Sport", event_date: "2099-06-01", email: "test@example.com",
  status: "pending", is_waitlist: false, paid_at: null, price: "10 €", entry_price: 10, stripe_price_id: null,
  child_entry_price: null, stripe_child_price_id: null, person_count: 1, child_count: 0, persons: [{ id: "p1", is_child: false }],
});
const request = () => new NextRequest("http://localhost/api/checkout", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status_token: "token" }),
});
const stripeError = (message: string, extra: object = {}) => Object.assign(new Error(message), extra);

beforeEach(() => {
  vi.resetAllMocks();
  stripeSessions = new Map();
  let counter = 0;
  mocks.list.mockImplementation(() => ({ async *[Symbol.asyncIterator]() { yield* stripeSessions.values(); } }));
  mocks.retrieve.mockImplementation(async (id: string) => {
    const session = stripeSessions.get(id);
    if (!session) throw stripeError(`No such checkout.session: ${id}`);
    return session;
  });
  mocks.expire.mockImplementation(async (id: string) => {
    const session = { ...stripeSessions.get(id)!, status: "expired" };
    stripeSessions.set(id, session);
    return session;
  });
  mocks.create.mockImplementation(async (params: { metadata?: Record<string, string> }) => {
    const session = stripeSession(`cs_new_${++counter}`, { metadata: { registration_id: "1", ...params.metadata } });
    stripeSessions.set(session.id as string, session);
    return session;
  });
  mocks.limit.mockReturnValue(true);
  mocks.info.mockResolvedValue(info());
  mocks.claim.mockResolvedValue({ request_key: "key-1", request_params: null, person_prices: null, request_started_at: null });
  mocks.release.mockResolvedValue(true);
  mocks.savedCheckouts.mockResolvedValue([]);
  mocks.fulfill.mockResolvedValue(false);
});

describe("Checkout-Start gegen frühere Zahlungsvorgänge", () => {
  it("schließt einen alten offenen Zahlungslink, bevor ein neuer entsteht", async () => {
    stripeSessions.set("cs_old", stripeSession("cs_old"));
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.expire).toHaveBeenCalledWith("cs_old");
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(await response.json()).toEqual({ url: "https://checkout.stripe.com/cs_new_1" });
    // Der Idempotenzschlüssel steht auch in der Session, damit eine Wiederaufnahme sie wiederfindet.
    const [params, options] = mocks.create.mock.calls[0];
    expect(options.idempotencyKey).toBe(params.metadata.checkout_request_id);
    expect(mocks.release).toHaveBeenCalledWith(1, options.idempotencyKey);
  });

  it("verweigert einen zweiten Checkout, solange ein SEPA-Einzug läuft, und gibt die Sperre frei", async () => {
    stripeSessions.set("cs_old", stripeSession("cs_old", sepaProcessing));
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ payment_state: "processing" });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.expire).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });

  it("verbucht eine schon bezahlte Session, statt erneut zu kassieren", async () => {
    stripeSessions.set("cs_old", stripeSession("cs_old", { status: "complete", payment_status: "paid" }));
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ payment_state: "paid" });
    expect(mocks.fulfill).toHaveBeenCalledWith("cs_old", false);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("findet alte Sessions auch, wenn die Datenbank nichts mehr von ihnen weiß", async () => {
    // Nur bei Stripe bekannt (Alt-Session vor checkout_pricing); Zuordnung über client_reference_id.
    stripeSessions.set("cs_legacy", stripeSession("cs_legacy", sepaProcessing));
    expect((await POST(request())).status).toBe(409);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("übergeht fremde Sessions in der Stripe-Liste", async () => {
    stripeSessions.set("cs_other", stripeSession("cs_other", { ...sepaProcessing, client_reference_id: "2", metadata: { registration_id: "2" } }));
    expect((await POST(request())).status).toBe(200);
    expect(mocks.expire).not.toHaveBeenCalled();
    expect(mocks.fulfill).not.toHaveBeenCalled();
  });

  it("startet keinen Checkout, solange ein anderer Aufruf die Anlage hält", async () => {
    mocks.claim.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(409);
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it("hält die Sperre nach unklarer Stripe-Antwort, damit der Vorgang wiederaufgenommen wird", async () => {
    mocks.create.mockRejectedValue(stripeError("socket hang up"));
    expect((await POST(request())).status).toBe(500);
    expect(mocks.stage).toHaveBeenCalledWith(1, expect.any(String), expect.objectContaining({ mode: "payment" }), { p1: 1000 });
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it("gibt die Sperre nach einem Stripe-Validierungsfehler frei", async () => {
    mocks.create.mockRejectedValue(stripeError("Invalid price", { type: "StripeInvalidRequestError", statusCode: 400 }));
    expect((await POST(request())).status).toBe(500);
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });

  it("gibt keinen Link heraus und schließt die Session, wenn Stripe einen anderen Betrag berechnet", async () => {
    mocks.create.mockImplementationOnce(async () => {
      const session = stripeSession("cs_wrong", { amount_total: 999 });
      stripeSessions.set("cs_wrong", session);
      return session;
    });
    expect((await POST(request())).status).toBe(500);
    expect(mocks.expire).toHaveBeenCalledWith("cs_wrong");
    expect(mocks.savePricing).not.toHaveBeenCalled();
  });

  describe("Wiederaufnahme einer unterbrochenen Anlage", () => {
    const interrupted = {
      request_key: "key-old",
      request_params: { mode: "payment", client_reference_id: "1", metadata: { registration_id: "1", checkout_request_id: "key-old" } },
      person_prices: { p1: 1000 }, request_started_at: new Date().toISOString(),
    };

    it("wiederholt den alten Vorgang mit demselben Idempotenzschlüssel und kassiert nicht doppelt", async () => {
      mocks.claim.mockResolvedValue(interrupted);
      expect((await POST(request())).status).toBe(200);
      expect(mocks.create).toHaveBeenCalledTimes(2);
      expect(mocks.create.mock.calls[0][1]).toEqual({ idempotencyKey: "key-old" });
      expect(mocks.create.mock.calls[1][1].idempotencyKey).not.toBe("key-old");
      // Die wiedergefundene Session wird gespeichert und geschlossen; nur der neue Link geht raus.
      expect(mocks.savePricing).toHaveBeenNthCalledWith(1, "cs_new_1", 1, { p1: 1000 });
      expect(mocks.expire).toHaveBeenCalledWith("cs_new_1");
    });

    it("erkennt, dass der alte Vorgang inzwischen bezahlt wurde", async () => {
      mocks.claim.mockResolvedValue(interrupted);
      mocks.create.mockImplementationOnce(async () => {
        const session = stripeSession("cs_recovered", { status: "complete", payment_status: "paid", metadata: interrupted.request_params.metadata });
        stripeSessions.set("cs_recovered", session);
        return session;
      });
      const response = await POST(request());
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ payment_state: "paid" });
      expect(mocks.create).toHaveBeenCalledTimes(1);
      expect(mocks.savePricing).toHaveBeenCalledWith("cs_recovered", 1, { p1: 1000 });
      expect(mocks.fulfill).toHaveBeenCalledWith("cs_recovered", false);
    });

    it("nutzt eine bei Stripe wiedergefundene Session, statt den Schlüssel erneut zu senden", async () => {
      mocks.claim.mockResolvedValue(interrupted);
      stripeSessions.set("cs_found", stripeSession("cs_found", { ...sepaProcessing, metadata: interrupted.request_params.metadata }));
      expect((await POST(request())).status).toBe(409);
      expect(mocks.create).not.toHaveBeenCalled();
      expect(mocks.savePricing).toHaveBeenCalledWith("cs_found", 1, { p1: 1000 });
    });

    it("legt nach unklarem Ausgang eines alten Vorgangs nichts Neues an und behält die Sperre", async () => {
      mocks.claim.mockResolvedValue({ ...interrupted, request_started_at: new Date(Date.now() - 24 * 3600000).toISOString() });
      const response = await POST(request());
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: expect.stringContaining("unklar") });
      expect(mocks.create).not.toHaveBeenCalled();
      expect(mocks.release).not.toHaveBeenCalled();
    });

    it("verweigert die Wiederaufnahme ohne gespeicherte Preisaufteilung", async () => {
      mocks.claim.mockResolvedValue({ ...interrupted, person_prices: null });
      expect((await POST(request())).status).toBe(409);
      expect(mocks.create).not.toHaveBeenCalled();
    });

    it("weist eine wiedergefundene Session mit abweichendem Betrag dem Team zu", async () => {
      mocks.claim.mockResolvedValue({ ...interrupted, person_prices: { p1: 500 } });
      const response = await POST(request());
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: expect.stringContaining("Team") });
      expect(mocks.savePricing).not.toHaveBeenCalled();
    });
  });

  it("bremst Dauerklicks, bevor die Datenbank befragt wird", async () => {
    mocks.limit.mockReturnValue(false);
    expect((await POST(request())).status).toBe(429);
    expect(mocks.info).not.toHaveBeenCalled();
  });
});

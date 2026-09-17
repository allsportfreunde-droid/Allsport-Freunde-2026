import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../app/api/checkout/route";
import type { CheckoutInfo, EventCreateInput } from "../lib/types";
import {
  createLocalEvent, createLocalWalkInRegistration, getLocalCheckoutInfo,
  getLocalRegistrationByToken, resetLocalData, updateLocalEvent,
} from "../lib/local-data";

const { checkoutInfo, createSession, stripeClient, savePricing } = vi.hoisted(() => ({
  checkoutInfo: vi.fn(), createSession: vi.fn(), stripeClient: vi.fn(), savePricing: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  getCheckoutInfo: checkoutInfo, saveCheckoutPricing: savePricing,
  // Anlagesperre ohne offenen Vorgang; keine früheren Checkouts vorhanden.
  claimCheckoutCreation: async () => ({ request_key: "k", request_params: null, person_prices: null, request_started_at: null }),
  stageCheckoutCreation: async () => undefined,
  releaseCheckoutCreation: async () => true,
  getRegistrationCheckouts: async () => [],
}));
vi.mock("@/lib/stripe", () => ({ getStripe: stripeClient }));
vi.mock("@/lib/ratelimit", () => ({ checkRateLimit: () => true, getClientIp: () => "test", RATE_LIMITS: { checkout: {} } }));

function info(overrides: Partial<CheckoutInfo> = {}): CheckoutInfo {
  return {
    registration_id: 1, event_id: 1, event_title: "Sport", event_date: "2099-06-01",
    email: "test@example.com", status: "pending", is_waitlist: false, paid_at: null,
    price: "10 €", entry_price: 10, stripe_price_id: "price_adult",
    child_entry_price: 4, stripe_child_price_id: "price_child",
    person_count: 3, child_count: 1, ...overrides,
    persons: overrides.persons ?? Array.from({ length: overrides.person_count ?? 3 }, (_, index) => ({
      id: `person-${index}`, is_child: index < (overrides.child_count ?? 1),
    })),
  };
}

function request(overrides: object = {}) {
  return new NextRequest("http://localhost/api/checkout", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status_token: "test-token", ...overrides }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  checkoutInfo.mockResolvedValue(info());
  savePricing.mockResolvedValue(undefined);
  createSession.mockImplementation(async (params) => {
    const amounts: Record<string, number> = { price_adult: 1000, price_child: 400, price_free: 0, price_new: 200 };
    const items = params.line_items as Array<{ price?: string; price_data?: { unit_amount?: number }; quantity: number }>;
    return {
      id: "cs_test", url: "https://checkout.stripe.com/test", currency: "eur",
      amount_total: items.reduce((sum, item) => sum + item.quantity * (item.price ? amounts[item.price] : item.price_data?.unit_amount ?? 0), 0),
    };
  });
  stripeClient.mockReturnValue({ checkout: { sessions: {
    create: createSession, expire: async (id: string) => ({ id, status: "expired" }),
    list: () => ({ async *[Symbol.asyncIterator]() {} }),
  } } });
  resetLocalData([]);
});

describe("Checkout mit Erwachsenen und Kindern", () => {
  it("verwendet ohne Kinder-Stripe-ID den manuell hinterlegten Kinderbetrag", async () => {
    checkoutInfo.mockResolvedValue(info({ stripe_child_price_id: null }));
    expect((await POST(request())).status).toBe(200);
    expect(createSession.mock.calls[0][0].line_items[1]).toMatchObject({
      quantity: 1, price_data: { currency: "eur", unit_amount: 400 },
    });
  });
  it("verwendet getrennte Price-IDs und ausschließlich die DB-Mengen", async () => {
    const response = await POST(request({ person_count: 1, child_count: 3, entry_price: 0, stripe_price_id: "price_fake" }));
    expect(response.status).toBe(200);
    expect(checkoutInfo).toHaveBeenCalledWith("test-token");
    // Zweites Argument ist der Idempotenzschlüssel – hier zählen nur die Session-Parameter.
    expect(createSession.mock.calls[0][0]).toEqual(expect.objectContaining({
      mode: "payment", line_items: [{ price: "price_adult", quantity: 2 }, { price: "price_child", quantity: 1 }],
      client_reference_id: "1",
    }));
    expect(savePricing).toHaveBeenCalledWith("cs_test", 1, { "person-0": 400, "person-1": 1000, "person-2": 1000 });
  });

  it("verwendet ohne Kinderpreis den Erwachsenenpreis für alle", async () => {
    checkoutInfo.mockResolvedValue(info({ child_entry_price: null, stripe_child_price_id: null }));
    await POST(request());
    expect(createSession.mock.calls[0][0].line_items).toEqual([{ price: "price_adult", quantity: 3 }]);
  });

  it("behält die kostenlose Kinder-Price-ID in einer gemischten Anmeldung", async () => {
    checkoutInfo.mockResolvedValue(info({ child_entry_price: 0, stripe_child_price_id: "price_free" }));
    await POST(request());
    expect(createSession.mock.calls[0][0].line_items).toEqual([
      { price: "price_adult", quantity: 2 }, { price: "price_free", quantity: 1 },
    ]);
    expect(savePricing).toHaveBeenCalledWith("cs_test", 1, { "person-0": 0, "person-1": 1000, "person-2": 1000 });
  });

  it("gibt keinen Zahlungslink aus, wenn die Preisaufteilung nicht gespeichert werden kann", async () => {
    savePricing.mockRejectedValueOnce(new Error("Datenbank nicht erreichbar"));
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.json()).not.toHaveProperty("url");
  });

  it("verhindert eine Zahlung, wenn die Stripe-ID einen anderen Betrag ergibt", async () => {
    createSession.mockResolvedValueOnce({ id: "cs_test", url: "https://checkout.stripe.com/test", currency: "eur", amount_total: 9999 });
    expect((await POST(request())).status).toBe(500);
    expect(savePricing).not.toHaveBeenCalled();
  });

  it.each([{ person_count: 2, child_count: 0 }, { person_count: 2, child_count: 2 }])(
    "erzeugt keine Position mit Menge 0: %j", async (counts) => {
      checkoutInfo.mockResolvedValue(info(counts));
      await POST(request());
      expect(createSession.mock.calls[0][0].line_items).toEqual([
        { price: counts.child_count ? "price_child" : "price_adult", quantity: 2 },
      ]);
    }
  );

  it("lässt eine kostenlose Anmeldung offen und erzeugt keine Stripe-Session", async () => {
    const registration = info({ person_count: 2, child_count: 2, child_entry_price: 0 });
    checkoutInfo.mockResolvedValue(registration);
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(registration.status).toBe("pending");
    expect(createSession).not.toHaveBeenCalled();
  });

  it("unterstützt weiterhin einen manuell gepflegten Erwachsenenpreis", async () => {
    checkoutInfo.mockResolvedValue(info({ stripe_price_id: null }));
    await POST(request());
    expect(createSession.mock.calls[0][0].line_items[0]).toMatchObject({
      quantity: 2, price_data: { currency: "eur", unit_amount: 1000 },
    });
  });

  it.each([
    { is_waitlist: true }, { status: "cancelled" as const }, { status: "rejected" as const },
    { paid_at: "2026-09-15T10:00:00Z" }, { person_count: 0, child_count: 0 },
    { price: "Spende willkommen", child_entry_price: null },
  ])("verhindert eine Zahlung bei %j", async (overrides) => {
    checkoutInfo.mockResolvedValue(info(overrides));
    expect((await POST(request())).status).toBe(409);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("zählt gespeicherte Kinder und schließt stornierte Personen aus", async () => {
    const event: EventCreateInput = {
      title: "Sport", category: "fussball", description: "", date: "2099-06-01", time: "12:00",
      location: "Halle", dress_code: "Sport", max_participants: 10,
      price: "10 €", entry_price: 10, stripe_price_id: "price_adult",
      child_entry_price: 4, stripe_child_price_id: "price_child",
    };
    const { id } = createLocalEvent(event);
    const registration = createLocalWalkInRegistration({
      event_id: id, email: "test@example.com", phone: null, notes: null, checked_in_by: null,
      persons: [
        { firstName: "A", lastName: "Test", isChild: false },
        { firstName: "B", lastName: "Test", isChild: true },
        { firstName: "C", lastName: "Test", isChild: true },
      ],
    });
    getLocalRegistrationByToken(registration.status_token)!.persons[2].cancelled_at = new Date().toISOString();
    checkoutInfo.mockImplementation(getLocalCheckoutInfo);
    await POST(request({ status_token: registration.status_token }));
    expect(createSession.mock.calls[0][0].line_items).toEqual([
      { price: "price_adult", quantity: 1 }, { price: "price_child", quantity: 1 },
    ]);
    // Die Anmeldung bleibt bestehen; der nächste Checkout nutzt den geänderten Eventpreis.
    updateLocalEvent(id, { ...event, child_entry_price: 2, stripe_child_price_id: "price_new" });
    await POST(request({ status_token: registration.status_token }));
    expect(createSession.mock.calls[1][0].line_items).toEqual([
      { price: "price_adult", quantity: 1 }, { price: "price_new", quantity: 1 },
    ]);
    expect(getLocalRegistrationByToken(registration.status_token)!.event_child_entry_price).toBe(2);
  });
});

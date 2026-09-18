import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../app/api/checkout/confirm/route";
import { GET } from "../app/api/status/[token]/route";
import type { CheckoutCreation } from "../lib/db/checkout-creation";
import type { SavedCheckout } from "../lib/db/checkout";

// Confirm, Wiederaufnahme, SQL-Sperrfunktionen, Abgleich und Statusanzeige laufen echt.
// Nur die externen Stripe- und Datenbankantworten werden vorgegeben.
const mocks = vi.hoisted(() => ({
  sql: vi.fn(), saved: vi.fn(), savePricing: vi.fn(), create: vi.fn(), retrieve: vi.fn(), list: vi.fn(), fulfill: vi.fn(),
}));
vi.mock("@/lib/db/utils", () => ({ getSQL: () => mocks.sql, isPostgresConfigured: () => true }));
vi.mock("@/lib/db", async () => ({
  ...(await import("../lib/db/checkout-creation")),
  getCheckoutInfo: async () => ({ registration_id: 7 }),
  getRegistrationByToken: async () => ({ id: 7, paid_at: null }),
  getRegistrationCheckouts: mocks.saved,
  saveCheckoutPricing: mocks.savePricing,
  recordCheckoutState: vi.fn(),
}));
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({ checkout: { sessions: { create: mocks.create, retrieve: mocks.retrieve, list: mocks.list } } }),
}));
vi.mock("@/lib/checkout-fulfillment", async (original) => ({
  ...(await original<typeof import("@/lib/checkout-fulfillment")>()), fulfillCheckout: mocks.fulfill,
}));
vi.mock("@/lib/ratelimit", () => ({
  checkRateLimit: () => true, getClientIp: () => "test", RATE_LIMITS: { checkoutStatus: {} },
}));

let lock: CheckoutCreation | null;
let expired: boolean;
let saved: SavedCheckout[];
const request = () => new NextRequest("http://localhost/api/checkout/confirm", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status_token: "token" }),
});
const getStatus = () => GET(new NextRequest("http://localhost/api/status/token"), { params: Promise.resolve({ token: "token" }) });
const session = () => ({
  id: "cs_recovered", mode: "payment", status: "open", payment_status: "unpaid", payment_intent: null,
  amount_total: 1000, currency: "eur", client_reference_id: "7",
  metadata: { registration_id: "7", checkout_request_id: "old-key" },
});

beforeEach(() => {
  vi.resetAllMocks();
  expired = true;
  saved = [];
  lock = {
    request_key: "old-key", request_started_at: new Date().toISOString(), person_prices: { p1: 1000 },
    request_params: { mode: "payment", client_reference_id: "7", metadata: { registration_id: "7", checkout_request_id: "old-key" } },
  };
  mocks.sql.mockImplementation(async (strings: TemplateStringsArray) => {
    const query = strings.join("?");
    if (query.startsWith("UPDATE checkout_creation")) {
      expect(query).toContain("locked_until < NOW()");
      if (!expired || !lock) return [];
      expired = false;
      return [lock];
    }
    if (query.startsWith("DELETE FROM checkout_creation")) {
      expect(query).toContain("owner =");
      lock = null;
      return [{ registration_id: 7 }];
    }
    if (query.startsWith("SELECT registration_id FROM checkout_creation")) return lock ? [{ registration_id: 7 }] : [];
    throw new Error(`Unerwartete SQL-Abfrage: ${query}`);
  });
  mocks.saved.mockImplementation(async () => saved);
  mocks.savePricing.mockImplementation(async (id, _registration, prices) => {
    saved.push({ session_id: id, person_prices: prices, payment_state: "open" });
  });
  mocks.list.mockImplementation(() => ({ async *[Symbol.asyncIterator]() {} }));
  mocks.create.mockResolvedValue(session());
  mocks.retrieve.mockResolvedValue(session());
});

describe("Wiederherstellung auf der Statusseite ohne Session-ID", () => {
  it("nimmt eine abgelaufene Anlage mit dem ursprünglichen Schlüssel wieder auf und entsperrt den Status", async () => {
    expect(await (await getStatus()).json()).toMatchObject({ payment_state: "checking" });
    const params = lock!.request_params;
    expect((await POST(request())).status).toBe(200);
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith(params, { idempotencyKey: "old-key" });
    expect(mocks.create.mock.calls[0][0]).not.toHaveProperty("payment_method_types");
    expect(mocks.savePricing).toHaveBeenCalledWith("cs_recovered", 7, { p1: 1000 });
    expect(lock).toBeNull();
    const response = await getStatus();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ payment_state: "open" });
  });

  it("findet eine bereits angelegte Stripe-Session ohne einen neuen Create-Aufruf", async () => {
    mocks.list.mockImplementation(() => ({ async *[Symbol.asyncIterator]() { yield session(); } }));
    expect((await POST(request())).status).toBe(200);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.savePricing).toHaveBeenCalledWith("cs_recovered", 7, { p1: 1000 });
    expect(lock).toBeNull();
  });

  it("entfernt eine abgelaufene Sperre ohne begonnenen Stripe-Vorgang", async () => {
    lock = { request_key: "old-key", request_params: null, person_prices: null, request_started_at: null };
    expect((await POST(request())).status).toBe(200);
    expect(lock).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
    expect(await (await getStatus()).json()).toMatchObject({ payment_state: "open" });
  });

  it("behält eine aktive Sperre und übernimmt sie erst beim späteren Abgleich nach Ablauf", async () => {
    expired = false;
    expect((await POST(request())).status).toBe(200);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(await (await getStatus()).json()).toMatchObject({ payment_state: "checking" });
    expired = true;
    expect((await POST(request())).status).toBe(200);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(await (await getStatus()).json()).toMatchObject({ payment_state: "open" });
  });

  it("behält bei unklarer Stripe-Antwort die Sperre und verwendet beim nächsten Versuch denselben Schlüssel", async () => {
    mocks.create.mockRejectedValueOnce(new Error("timeout"));
    expect((await POST(request())).status).toBe(503);
    expect(lock?.request_key).toBe("old-key");
    expect(await (await getStatus()).json()).toMatchObject({ payment_state: "checking" });
    expired = true;
    expect((await POST(request())).status).toBe(200);
    expect(mocks.create.mock.calls.map(call => call[1])).toEqual([
      { idempotencyKey: "old-key" }, { idempotencyKey: "old-key" },
    ]);
    expect(lock).toBeNull();
  });

  it("behält einen zu alten unklaren Vorgang zur manuellen Prüfung gesperrt", async () => {
    lock!.request_started_at = new Date(Date.now() - 24 * 3600000).toISOString();
    expect((await POST(request())).status).toBe(503);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(lock).not.toBeNull();
    expect(await (await getStatus()).json()).toMatchObject({ payment_state: "checking" });
  });
});

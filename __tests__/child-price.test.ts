import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type Stripe from "stripe";
import { loadChildPrice } from "../lib/child-price";
import { POST } from "../app/api/admin/events/route";
import { GET, PUT } from "../app/api/admin/events/[id]/route";
import { GET as getPrice } from "../app/api/admin/stripe/price/route";
import { getLocalEventFull, resetLocalData } from "../lib/local-data";

const { retrieve, getStripe } = vi.hoisted(() => ({ retrieve: vi.fn(), getStripe: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ getStripe }));
vi.mock("@/lib/db", async () => {
  const local = await import("../lib/local-data");
  return {
    createEvent: local.createLocalEvent,
    updateEvent: local.updateLocalEvent,
    getEventFull: local.getLocalEventFull,
    getAllEvents: local.getLocalAllEvents,
    deleteEvent: local.deleteLocalEvent,
  };
});

const eventInput = {
  title: "Kinderpreis-Test", category: "fussball", description: "Test",
  date: "2099-06-01", time: "15:00", location: "Sporthalle", price: "10 €",
  entry_price: 10, stripe_price_id: "price_adult", dress_code: "Sportkleidung",
  max_participants: 20,
};

function request(body: object, method = "POST") {
  return new NextRequest("http://localhost/api/admin/events", {
    method, body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
  });
}

function stripePrice(overrides: Partial<Stripe.Price> = {}) {
  return {
    id: "price_child", active: true, currency: "eur", type: "one_time",
    unit_amount: 0, transform_quantity: null, ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetLocalData([]);
  getStripe.mockReturnValue({ prices: { retrieve } });
  retrieve.mockResolvedValue(stripePrice());
});

describe("Kinderpreis aus Stripe", () => {
  it.each([null, undefined, "", "   "])("verwendet ohne ID den Erwachsenenpreis (%s)", async (id) => {
    expect(await loadChildPrice(id)).toEqual({ child_entry_price: null, stripe_child_price_id: null });
    expect(retrieve).not.toHaveBeenCalled();
  });

  it.each([0, 450])("übernimmt %i Cent einschließlich kostenlos", async (cents) => {
    retrieve.mockResolvedValue(stripePrice({ unit_amount: cents }));
    expect(await loadChildPrice(" price_child ")).toEqual({
      child_entry_price: cents / 100, stripe_child_price_id: "price_child",
    });
    expect(retrieve).toHaveBeenCalledWith("price_child");
  });

  it.each([
    { active: false }, { currency: "usd" }, { type: "recurring" as const },
    { unit_amount: null }, { transform_quantity: { divide_by: 2, round: "up" as const } },
  ])("weist einen ungeeigneten Preis zurück: %j", async (overrides) => {
    retrieve.mockResolvedValue(stripePrice(overrides));
    await expect(loadChildPrice("price_child")).rejects.toThrow();
  });

  it("weist ungültige IDs vor dem Stripe-Aufruf zurück", async () => {
    await expect(loadChildPrice("prod_invalid")).rejects.toThrow();
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("meldet fehlende Stripe-Konfiguration", async () => {
    getStripe.mockReturnValue(null);
    await expect(loadChildPrice("price_child")).rejects.toThrow("nicht konfiguriert");
  });

  it("liefert 0 Cent für die Admin-Vorschau", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_placeholder");
    try {
      const response = await getPrice(new NextRequest("http://localhost/api/admin/stripe/price?kind=child&id=price_child"));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ unit_amount: 0, stripe_price_id: "price_child" });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("Kinderpreis im Admin speichern und erneut laden", () => {
  it.each([0, 4.5])("speichert einen manuellen Kinderbetrag von %s Euro ohne Stripe", async (amount) => {
    const response = await POST(request({ ...eventInput, stripe_child_price_id: null, child_entry_price: amount }));
    expect(response.status).toBe(201);
    const { id } = await response.json();
    expect(getLocalEventFull(id)).toMatchObject({ child_entry_price: amount, stripe_child_price_id: null, child_price: null });
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("speichert Freitext zusammen mit dem festen Kinderbetrag", async () => {
    const response = await POST(request({ ...eventInput, stripe_child_price_id: null, child_entry_price: 3, child_price: "Kinderbeitrag" }));
    expect(response.status).toBe(201);
    const { id } = await response.json();
    expect(getLocalEventFull(id)).toMatchObject({ child_entry_price: 3, child_price: "Kinderbeitrag", stripe_child_price_id: null });
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("verlangt für Freitext einen gültigen festen Betrag", async () => {
    for (const amount of [null, -1, "kein Betrag"]) {
      const response = await POST(request({ ...eventInput, child_price: "Kinderbeitrag", child_entry_price: amount }));
      expect(response.status).toBe(400);
    }
  });

  async function create() {
    const response = await POST(request({
      ...eventInput, stripe_child_price_id: "price_child", child_entry_price: 999,
    }));
    expect(response.status).toBe(201);
    return (await response.json()).id as number;
  }

  it("entfernt die Stripe-ID beim Wechsel auf einen manuellen Kinderbetrag", async () => {
    const id = await create();
    retrieve.mockClear();
    const response = await PUT(request({ ...eventInput, stripe_child_price_id: null, child_entry_price: 2, child_price: "Kinderbeitrag" }, "PUT"), { params: Promise.resolve({ id: String(id) }) });
    expect(response.status).toBe(200);
    expect(getLocalEventFull(id)).toMatchObject({ child_entry_price: 2, stripe_child_price_id: null, child_price: "Kinderbeitrag" });
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("speichert den Stripe-Betrag statt des Browserbetrags und liefert 0 beim erneuten Laden", async () => {
    const id = await create();
    const response = await GET(new NextRequest("http://localhost/api/admin/events"), { params: Promise.resolve({ id: String(id) }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      child_entry_price: 0, stripe_child_price_id: "price_child",
      entry_price: 10, stripe_price_id: "price_adult",
    });
  });

  it("speichert eine geänderte Kinder-ID mit ihrem neuen Betrag", async () => {
    const id = await create();
    retrieve.mockResolvedValue(stripePrice({ id: "price_new", unit_amount: 450 }));
    const response = await PUT(request({ ...eventInput, stripe_child_price_id: "price_new" }, "PUT"), { params: Promise.resolve({ id: String(id) }) });
    expect(response.status).toBe(200);
    expect(getLocalEventFull(id)).toMatchObject({ child_entry_price: 4.5, stripe_child_price_id: "price_new" });
  });

  it("löscht beim Leeren der ID auch den Kinderbetrag", async () => {
    const id = await create();
    const response = await PUT(request({ ...eventInput, stripe_child_price_id: "" }, "PUT"), { params: Promise.resolve({ id: String(id) }) });
    expect(response.status).toBe(200);
    expect(getLocalEventFull(id)).toMatchObject({ child_entry_price: null, stripe_child_price_id: null, entry_price: 10 });
  });

  it("erhält den Kinderpreis bei einem älteren Formular ohne Kinderfeld", async () => {
    const id = await create();
    retrieve.mockClear();
    const response = await PUT(request(eventInput, "PUT"), { params: Promise.resolve({ id: String(id) }) });
    expect(response.status).toBe(200);
    expect(getLocalEventFull(id)).toMatchObject({ child_entry_price: 0, stripe_child_price_id: "price_child" });
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("erhält den gespeicherten Preis, wenn die neue Stripe-ID nicht geladen werden kann", async () => {
    const id = await create();
    retrieve.mockRejectedValue(new Error("Preis nicht gefunden"));
    const response = await PUT(request({ ...eventInput, stripe_child_price_id: "price_missing" }, "PUT"), { params: Promise.resolve({ id: String(id) }) });
    expect(response.status).toBe(400);
    expect(getLocalEventFull(id)).toMatchObject({ child_entry_price: 0, stripe_child_price_id: "price_child" });
  });
});

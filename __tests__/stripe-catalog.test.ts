import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../app/api/admin/events/route";
import { DELETE, GET, PUT } from "../app/api/admin/events/[id]/route";
import { getLocalEventFull, resetLocalData } from "../lib/local-data";
import { productName } from "../lib/stripe-catalog";

interface FakePrice {
  id: string; product: string; active: boolean; currency: string; type: string;
  unit_amount: number; transform_quantity: null; nickname: string; metadata: Record<string, string>;
}
interface FakeProduct { id: string; name: string; active: boolean; metadata: Record<string, string> }

/** Ein kleines Stripe im Speicher – genug für Produkte und Preise samt Idempotenz. */
function createFakeStripe() {
  const products = new Map<string, FakeProduct>();
  const prices: FakePrice[] = [];
  const idempotent = new Map<string, unknown>();
  let seq = 0;
  const missing = () => Object.assign(new Error("No such product"), { code: "resource_missing" });
  const once = <T>(key: string | undefined, create: () => T): T => {
    if (key && idempotent.has(key)) return idempotent.get(key) as T;
    const result = create();
    if (key) idempotent.set(key, result);
    return result;
  };
  return {
    products,
    prices,
    client: {
      products: {
        create: vi.fn(async (params: { name: string; metadata: Record<string, string> }, options?: { idempotencyKey?: string }) =>
          once(options?.idempotencyKey, () => {
            const product = { id: `prod_${++seq}`, active: true, ...params };
            products.set(product.id, product);
            return product;
          })),
        update: vi.fn(async (id: string, params: Partial<FakeProduct>) => {
          const product = products.get(id);
          if (!product) throw missing();
          return Object.assign(product, params);
        }),
      },
      prices: {
        list: vi.fn((params: { product: string; active?: boolean }) => {
          if (!products.has(params.product)) throw missing();
          return prices
            .filter((price) => price.product === params.product && (params.active === undefined || price.active === params.active))
            .map((price) => ({ ...price }));
        }),
        create: vi.fn(async (params: Omit<FakePrice, "id" | "active" | "type" | "transform_quantity">, options?: { idempotencyKey?: string }) =>
          once(options?.idempotencyKey, () => {
            const price: FakePrice = { id: `price_${++seq}`, active: true, type: "one_time", transform_quantity: null, ...params };
            prices.push(price);
            return { ...price };
          })),
        update: vi.fn(async (id: string, params: { active: boolean }) => {
          const price = prices.find((p) => p.id === id)!;
          return Object.assign(price, params);
        }),
      },
    },
  };
}

const { stripeState } = vi.hoisted(() => ({ stripeState: { current: null as unknown } }));
vi.mock("@/lib/stripe", () => ({
  getStripe: () => stripeState.current,
  stripeProductUrl: (id: string | null | undefined) => (id ? `https://dashboard.stripe.com/test/products/${id}` : null),
}));
vi.mock("@/lib/db", async () => {
  const local = await import("../lib/local-data");
  return {
    createEvent: local.createLocalEvent,
    updateEvent: local.updateLocalEvent,
    getEventFull: local.getLocalEventFull,
    getAllEvents: local.getLocalAllEvents,
    deleteEvent: local.deleteLocalEvent,
    saveEventStripeCatalog: local.saveLocalEventStripeCatalog,
  };
});

const eventInput = {
  title: "Hallenfußball", category: "fussball", description: "",
  date: "2099-06-01", time: "18:00", location: "Sporthalle", price: "12,00 €",
  entry_price: 12, child_entry_price: 6, dress_code: "Sport", max_participants: 20,
};

function request(body: object, method = "POST") {
  return new NextRequest("http://localhost/api/admin/events", {
    method, body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
  });
}
const params = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

let stripe: ReturnType<typeof createFakeStripe>;

beforeEach(() => {
  resetLocalData([]);
  stripe = createFakeStripe();
  stripeState.current = stripe.client;
});


async function create(body: object = eventInput) {
  const response = await POST(request(body));
  expect(response.status).toBe(201);
  return response.json() as Promise<{ id: number; stripe: { status: string; error?: string } }>;
}

async function update(id: number, body: object) {
  const response = await PUT(request(body, "PUT"), params(id));
  expect(response.status).toBe(200);
  return (await response.json()).stripe as { status: string; error?: string };
}

const event = (id: number) => getLocalEventFull(id)!;
const products = (id: number) => event(id).stripe_tier_products ?? {};

/** Aktive Preise aller Produkte als { tier: Cent }. */
function activeAmounts() {
  return Object.fromEntries(stripe.prices.filter((p) => p.active).map((p) => [p.metadata.tier, p.unit_amount]));
}

/** Namen der aktiven Produkte, sortiert. */
function activeProductNames() {
  return [...stripe.products.values()].filter((p) => p.active).map((p) => p.name).sort();
}

const ALL_TIERS = ["adult", "child", "adult_reduced_30", "adult_reduced_50", "child_reduced_30", "child_reduced_50"];

describe("Stripe-Produkte je Preisstufe", () => {
  it("legt mit Kinderpreis sechs Produkte mit je einem Preis an und speichert die IDs", async () => {
    const { id, stripe: result } = await create();
    expect(result).toEqual({ status: "synced" });

    expect(Object.keys(products(id)).sort()).toEqual([...ALL_TIERS].sort());
    expect(activeProductNames()).toEqual([
      "Hallenfußball · 01.06.2099 – Erwachsene",
      "Hallenfußball · 01.06.2099 – Erwachsene (30 % ermäßigt)",
      "Hallenfußball · 01.06.2099 – Erwachsene (50 % ermäßigt)",
      "Hallenfußball · 01.06.2099 – Kinder",
      "Hallenfußball · 01.06.2099 – Kinder (30 % ermäßigt)",
      "Hallenfußball · 01.06.2099 – Kinder (50 % ermäßigt)",
    ]);
    expect(activeAmounts()).toEqual({
      adult: 1200, child: 600, adult_reduced_30: 840, adult_reduced_50: 600, child_reduced_30: 420, child_reduced_50: 300,
    });

    // Jeder Preis hängt am Produkt seiner Stufe, und die Price ID steht in der passenden Spalte.
    const priceOf = (tier: string) => stripe.prices.find((p) => p.metadata.tier === tier)!;
    for (const tier of ALL_TIERS) {
      expect(priceOf(tier).product).toBe(products(id)[tier as keyof ReturnType<typeof products>]);
      expect(stripe.products.get(priceOf(tier).product)!.metadata).toEqual({ event_id: String(id), tier });
    }
    expect(event(id)).toMatchObject({
      stripe_price_id: priceOf("adult").id,
      stripe_child_price_id: priceOf("child").id,
      stripe_adult_reduced_50_price_id: priceOf("adult_reduced_50").id,
      stripe_child_reduced_30_price_id: priceOf("child_reduced_30").id,
    });
  });

  it("legt ohne Kinderpreis nur die drei Eintrittsprodukte an", async () => {
    const { id } = await create({ ...eventInput, child_entry_price: null });
    expect(Object.keys(products(id)).sort()).toEqual(["adult", "adult_reduced_30", "adult_reduced_50"]);
    expect(activeProductNames()).toEqual([
      "Hallenfußball · 01.06.2099 – Eintritt",
      "Hallenfußball · 01.06.2099 – Eintritt (30 % ermäßigt)",
      "Hallenfußball · 01.06.2099 – Eintritt (50 % ermäßigt)",
    ]);
    expect(event(id)).toMatchObject({ stripe_child_price_id: null, stripe_child_reduced_50_price_id: null });
    expect(event(id).stripe_price_id).toMatch(/^price_/);
  });

  it("ignoriert Price IDs aus dem Browser", async () => {
    const { id } = await create({ ...eventInput, stripe_price_id: "price_fremd", stripe_child_price_id: "price_fremd" });
    expect(event(id).stripe_price_id).not.toBe("price_fremd");
    expect(event(id).stripe_child_price_id).not.toBe("price_fremd");
  });

  it("legt bei unverändertem Preis nichts neu an und benennt bei neuem Titel alle Produkte um", async () => {
    const { id } = await create();
    const before = { ...event(id) };
    stripe.client.prices.create.mockClear();
    stripe.client.products.create.mockClear();

    expect((await update(id, { ...eventInput, title: "Hallenfußball Mixed" })).status).toBe("synced");
    expect(stripe.client.prices.create).not.toHaveBeenCalled();
    expect(stripe.client.products.create).not.toHaveBeenCalled();
    expect(event(id)).toMatchObject({
      stripe_tier_products: before.stripe_tier_products,
      stripe_price_id: before.stripe_price_id,
      stripe_child_reduced_50_price_id: before.stripe_child_reduced_50_price_id,
    });
    expect(activeProductNames().every((name) => name.startsWith("Hallenfußball Mixed · 01.06.2099 – "))).toBe(true);
  });

  it("legt bei geändertem Erwachsenenpreis nur an den Erwachsenenprodukten neue Preise an", async () => {
    const { id } = await create();
    const before = { ...event(id) };
    stripe.client.prices.create.mockClear();
    stripe.client.products.create.mockClear();

    expect((await update(id, { ...eventInput, price: "15,00 €", entry_price: 15 })).status).toBe("synced");
    const after = event(id);

    expect(stripe.client.products.create).not.toHaveBeenCalled();
    expect(stripe.client.prices.create).toHaveBeenCalledTimes(3);
    expect(after.stripe_tier_products).toEqual(before.stripe_tier_products);
    expect(activeAmounts()).toEqual({
      adult: 1500, child: 600, adult_reduced_30: 1050, adult_reduced_50: 750, child_reduced_30: 420, child_reduced_50: 300,
    });
    expect(after.stripe_child_price_id).toBe(before.stripe_child_price_id);
    expect(after.stripe_price_id).not.toBe(before.stripe_price_id);
    expect(stripe.prices.find((p) => p.id === before.stripe_price_id)!.active).toBe(false);
  });

  it("reaktiviert alte Preise, wenn der frühere Betrag zurückkehrt", async () => {
    const { id } = await create();
    const original = { ...event(id) };
    await update(id, { ...eventInput, price: "15,00 €", entry_price: 15 });
    stripe.client.prices.create.mockClear();

    expect((await update(id, eventInput)).status).toBe("synced");
    expect(stripe.client.prices.create).not.toHaveBeenCalled();
    expect(event(id).stripe_price_id).toBe(original.stripe_price_id);
    expect(stripe.prices.filter((p) => p.active)).toHaveLength(6);
  });

  it("archiviert die Kinderprodukte, wenn der Kinderpreis entfällt, und holt sie zurück", async () => {
    const { id } = await create();
    const childProduct = products(id).child!;

    expect((await update(id, { ...eventInput, child_entry_price: null })).status).toBe("synced");
    expect(stripe.products.get(childProduct)!.active).toBe(false);
    expect(stripe.prices.filter((p) => p.active && p.metadata.tier.startsWith("child"))).toHaveLength(0);
    expect(event(id)).toMatchObject({ stripe_child_price_id: null, stripe_child_reduced_30_price_id: null });
    expect(activeProductNames()).toEqual([
      "Hallenfußball · 01.06.2099 – Eintritt",
      "Hallenfußball · 01.06.2099 – Eintritt (30 % ermäßigt)",
      "Hallenfußball · 01.06.2099 – Eintritt (50 % ermäßigt)",
    ]);

    // Wieder mit Kinderpreis: dieselben Produkte werden reaktiviert, keine neuen.
    stripe.client.products.create.mockClear();
    expect((await update(id, eventInput)).status).toBe("synced");
    expect(stripe.client.products.create).not.toHaveBeenCalled();
    expect(products(id).child).toBe(childProduct);
    expect(stripe.products.get(childProduct)!.active).toBe(true);
  });

  it("archiviert alles, wenn nichts mehr zu kassieren ist, und reaktiviert dieselben Produkte", async () => {
    const { id } = await create();
    const tierProducts = { ...products(id) };

    const result = await update(id, { ...eventInput, price: "Spende willkommen", entry_price: null, child_entry_price: null });
    expect(result.status).toBe("archived");
    expect(stripe.prices.some((p) => p.active)).toBe(false);
    expect([...stripe.products.values()].some((p) => p.active)).toBe(false);
    expect(event(id)).toMatchObject({ stripe_tier_products: tierProducts, stripe_price_id: null, stripe_child_reduced_50_price_id: null });

    expect((await update(id, eventInput)).status).toBe("synced");
    expect(stripe.products.size).toBe(6);
    expect(products(id)).toEqual(tierProducts);
  });

  it("legt für ein kostenloses Event keine Produkte an", async () => {
    const { id, stripe: result } = await create({ ...eventInput, price: "Kostenlos", entry_price: null, child_entry_price: null });
    expect(result.status).toBe("archived");
    expect(stripe.client.products.create).not.toHaveBeenCalled();
    expect(event(id).stripe_tier_products ?? null).toBeNull();
  });

  it("archiviert das frühere Einzelprodukt je Event und leert die Spalte", async () => {
    // Stand vor dem Umbau: ein Produkt mit allen Preisen, keine Stufenprodukte.
    const legacy = await stripe.client.products.create({ name: "Hallenfußball · 01.06.2099", metadata: { event_id: "1" } });
    const oldPrice = await stripe.client.prices.create({
      product: legacy.id, currency: "eur", unit_amount: 1200, nickname: "Erwachsene", metadata: { tier: "adult" },
    });
    resetLocalData([{
      ...eventInput, id: 1, category: "fussball", parking_location: null, max_per_email: 5, status: "published",
      cancellation_reason: null, published_at: null, created_at: "2026-11-01T10:00:00Z", current_participants: 0,
      stripe_product_id: legacy.id, stripe_price_id: oldPrice.id,
    }]);

    expect((await update(1, eventInput)).status).toBe("synced");
    expect(stripe.products.get(legacy.id)!.active).toBe(false);
    expect(stripe.prices.filter((p) => p.product === legacy.id).every((p) => !p.active)).toBe(true);
    expect(event(1).stripe_product_id).toBeNull();
    expect(event(1).stripe_price_id).not.toBe(oldPrice.id);
    expect(Object.keys(products(1))).toHaveLength(6);
  });

  it("speichert das Event auch, wenn Stripe scheitert, und versucht es beim nächsten Speichern erneut", async () => {
    stripe.client.prices.create.mockRejectedValueOnce(new Error("Stripe nicht erreichbar"));
    const { id, stripe: result } = await create();
    expect(result).toEqual({ status: "failed", error: "Stripe nicht erreichbar" });
    expect(event(id)).toMatchObject({ title: "Hallenfußball", entry_price: 12 });
    expect(event(id).stripe_price_id ?? null).toBeNull();

    expect((await update(id, eventInput)).status).toBe("synced");
    expect(event(id).stripe_price_id).toMatch(/^price_/);
    // Die beim ersten Versuch angelegten Produkte werden über den Idempotency-Key wiederverwendet.
    expect(stripe.products.size).toBe(6);
  });

  it("legt ein im Dashboard gelöschtes Produkt neu an", async () => {
    const { id } = await create();
    const oldAdult = products(id).adult!;
    stripe.products.delete(oldAdult);

    expect((await update(id, eventInput)).status).toBe("synced");
    const newAdult = products(id).adult!;
    expect(newAdult).not.toBe(oldAdult);
    expect(stripe.prices.find((p) => p.product === newAdult && p.active)!.unit_amount).toBe(1200);
  });

  it("überspringt den Abgleich ohne Stripe-Schlüssel", async () => {
    stripeState.current = null;
    const { id, stripe: result } = await create();
    expect(result).toEqual({ status: "skipped" });
    expect(event(id).stripe_tier_products ?? null).toBeNull();
  });

  it("liefert dem Formular je Stufe einen Link zum Produkt", async () => {
    const { id } = await create();
    const response = await GET(new NextRequest("http://localhost/api/admin/events"), params(id));
    const body = await response.json();
    expect(Object.keys(body.stripe_product_urls).sort()).toEqual([...ALL_TIERS].sort());
    expect(body.stripe_product_urls.adult).toBe(`https://dashboard.stripe.com/test/products/${body.stripe_tier_products.adult}`);
  });

  it("archiviert beim Löschen des Events alle Produkte", async () => {
    await create();
    const { id } = await create({ ...eventInput, title: "Zweites Event" });
    const second = Object.values(products(id));
    const response = await DELETE(new NextRequest("http://localhost/api/admin/events", { method: "DELETE" }), params(id));
    expect(response.status).toBe(200);
    for (const productId of second) expect(stripe.products.get(productId!)!.active).toBe(false);
    // Das andere Event bleibt unberührt.
    expect([...stripe.products.values()].filter((p) => p.active)).toHaveLength(6);
  });
});

describe("productName", () => {
  it("hängt Datum und Stufe an", () => {
    expect(productName({ title: "Yoga", date: "2026-11-14" })).toBe("Yoga · 14.11.2026");
    expect(productName({ title: "Yoga", date: "2026-11-14" }, "Kinder (50 % ermäßigt)")).toBe("Yoga · 14.11.2026 – Kinder (50 % ermäßigt)");
  });

  it("kürzt sehr lange Titel", () => {
    const name = productName({ title: "x".repeat(300), date: "2026-11-14" }, "Eintritt");
    expect(name).toBe(`${"x".repeat(199)}… · 14.11.2026 – Eintritt`);
  });
});

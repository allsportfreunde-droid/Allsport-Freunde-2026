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
  return response.json() as Promise<{ id: number; stripe: { status: string; error?: string; product_url?: string } }>;
}

async function update(id: number, body: object) {
  const response = await PUT(request(body, "PUT"), params(id));
  expect(response.status).toBe(200);
  return (await response.json()).stripe as { status: string; error?: string };
}

/** Aktive Preise des Produkts als { tier: Cent }. */
function activeAmounts(productId: string) {
  return Object.fromEntries(
    stripe.prices.filter((p) => p.product === productId && p.active).map((p) => [p.metadata.tier, p.unit_amount])
  );
}

describe("Stripe-Produkt beim Speichern eines Events", () => {
  it("legt ein Produkt mit sechs Preisen an und speichert die IDs", async () => {
    const { id, stripe: result } = await create();
    const event = getLocalEventFull(id)!;

    expect(result).toEqual({ status: "synced", product_url: `https://dashboard.stripe.com/test/products/${event.stripe_product_id}` });
    expect(stripe.products.get(event.stripe_product_id!)).toMatchObject({
      name: "Hallenfußball · 01.06.2099", active: true, metadata: { event_id: String(id) },
    });
    expect(activeAmounts(event.stripe_product_id!)).toEqual({
      adult: 1200, child: 600, adult_reduced_30: 840, adult_reduced_50: 600, child_reduced_30: 420, child_reduced_50: 300,
    });
    const byTier = (tier: string) => stripe.prices.find((p) => p.metadata.tier === tier)!.id;
    expect(event).toMatchObject({
      stripe_price_id: byTier("adult"),
      stripe_child_price_id: byTier("child"),
      stripe_adult_reduced_30_price_id: byTier("adult_reduced_30"),
      stripe_adult_reduced_50_price_id: byTier("adult_reduced_50"),
      stripe_child_reduced_30_price_id: byTier("child_reduced_30"),
      stripe_child_reduced_50_price_id: byTier("child_reduced_50"),
    });
    expect(stripe.prices.every((p) => p.currency === "eur" && p.metadata.event_id === String(id))).toBe(true);
  });

  it("ignoriert Price IDs aus dem Browser", async () => {
    const { id } = await create({ ...eventInput, stripe_price_id: "price_fremd", stripe_child_price_id: "price_fremd" });
    expect(getLocalEventFull(id)!.stripe_price_id).not.toBe("price_fremd");
    expect(getLocalEventFull(id)!.stripe_child_price_id).not.toBe("price_fremd");
  });

  it("legt bei unverändertem Preis nichts neu an und übernimmt einen neuen Titel", async () => {
    const { id } = await create();
    const before = { ...getLocalEventFull(id)! };
    stripe.client.prices.create.mockClear();

    expect((await update(id, { ...eventInput, title: "Hallenfußball Mixed" })).status).toBe("synced");
    expect(stripe.client.prices.create).not.toHaveBeenCalled();
    expect(getLocalEventFull(id)).toMatchObject({
      stripe_product_id: before.stripe_product_id,
      stripe_price_id: before.stripe_price_id,
      stripe_child_reduced_50_price_id: before.stripe_child_reduced_50_price_id,
    });
    expect(stripe.products.get(before.stripe_product_id!)!.name).toBe("Hallenfußball Mixed · 01.06.2099");
  });

  it("legt bei geändertem Erwachsenenpreis nur die Erwachsenenstufen neu an und archiviert die alten", async () => {
    const { id } = await create();
    const before = { ...getLocalEventFull(id)! };
    stripe.client.prices.create.mockClear();

    expect((await update(id, { ...eventInput, price: "15,00 €", entry_price: 15 })).status).toBe("synced");
    const after = getLocalEventFull(id)!;

    expect(stripe.client.prices.create).toHaveBeenCalledTimes(3);
    expect(activeAmounts(after.stripe_product_id!)).toEqual({
      adult: 1500, child: 600, adult_reduced_30: 1050, adult_reduced_50: 750, child_reduced_30: 420, child_reduced_50: 300,
    });
    expect(after.stripe_product_id).toBe(before.stripe_product_id);
    expect(after.stripe_child_price_id).toBe(before.stripe_child_price_id);
    expect(after.stripe_price_id).not.toBe(before.stripe_price_id);
    expect(stripe.prices.find((p) => p.id === before.stripe_price_id)!.active).toBe(false);
  });

  it("reaktiviert alte Preise, wenn der frühere Betrag zurückkehrt", async () => {
    const { id } = await create();
    const original = { ...getLocalEventFull(id)! };
    await update(id, { ...eventInput, price: "15,00 €", entry_price: 15 });
    stripe.client.prices.create.mockClear();

    expect((await update(id, eventInput)).status).toBe("synced");
    expect(stripe.client.prices.create).not.toHaveBeenCalled();
    expect(getLocalEventFull(id)!.stripe_price_id).toBe(original.stripe_price_id);
    expect(stripe.prices.filter((p) => p.active)).toHaveLength(6);
  });

  it("archiviert Produkt und Preise, wenn nichts mehr zu kassieren ist", async () => {
    const { id } = await create();
    const productId = getLocalEventFull(id)!.stripe_product_id!;

    const result = await update(id, { ...eventInput, price: "Spende willkommen", entry_price: null, child_entry_price: null });
    expect(result.status).toBe("archived");
    expect(stripe.prices.some((p) => p.active)).toBe(false);
    expect(stripe.products.get(productId)!.active).toBe(false);
    expect(getLocalEventFull(id)).toMatchObject({ stripe_product_id: productId, stripe_price_id: null, stripe_child_reduced_50_price_id: null });

    // Wieder mit Preis: dasselbe Produkt wird reaktiviert.
    expect((await update(id, eventInput)).status).toBe("synced");
    expect(stripe.products.size).toBe(1);
    expect(stripe.products.get(productId)!.active).toBe(true);
  });

  it("legt für ein kostenloses Event kein Produkt an", async () => {
    const { id, stripe: result } = await create({ ...eventInput, price: "Kostenlos", entry_price: null, child_entry_price: null });
    expect(result.status).toBe("archived");
    expect(stripe.client.products.create).not.toHaveBeenCalled();
    expect(getLocalEventFull(id)!.stripe_product_id ?? null).toBeNull();
  });

  it("speichert das Event auch, wenn Stripe scheitert, und versucht es beim nächsten Speichern erneut", async () => {
    stripe.client.prices.create.mockRejectedValueOnce(new Error("Stripe nicht erreichbar"));
    const { id, stripe: result } = await create();
    expect(result).toEqual({ status: "failed", error: "Stripe nicht erreichbar" });
    expect(getLocalEventFull(id)).toMatchObject({ title: "Hallenfußball", entry_price: 12 });
    expect(getLocalEventFull(id)!.stripe_price_id ?? null).toBeNull();

    expect((await update(id, eventInput)).status).toBe("synced");
    expect(getLocalEventFull(id)!.stripe_price_id).toMatch(/^price_/);
    expect(stripe.products.size).toBe(1);
  });

  it("legt ein im Dashboard gelöschtes Produkt neu an", async () => {
    const { id } = await create();
    const oldProduct = getLocalEventFull(id)!.stripe_product_id!;
    stripe.products.delete(oldProduct);

    expect((await update(id, eventInput)).status).toBe("synced");
    const newProduct = getLocalEventFull(id)!.stripe_product_id!;
    expect(newProduct).not.toBe(oldProduct);
    expect(activeAmounts(newProduct)).toMatchObject({ adult: 1200, child_reduced_50: 300 });
  });

  it("überspringt den Abgleich ohne Stripe-Schlüssel", async () => {
    stripeState.current = null;
    const { id, stripe: result } = await create();
    expect(result).toEqual({ status: "skipped" });
    expect(getLocalEventFull(id)!.stripe_product_id ?? null).toBeNull();
  });

  it("liefert dem Formular den Link zum Produkt", async () => {
    const { id } = await create();
    const response = await GET(new NextRequest("http://localhost/api/admin/events"), params(id));
    const body = await response.json();
    expect(body.stripe_product_url).toBe(`https://dashboard.stripe.com/test/products/${body.stripe_product_id}`);
  });

  it("archiviert das Produkt beim Löschen des Events", async () => {
    const { id } = await create();
    const productId = getLocalEventFull(id)!.stripe_product_id!;
    const response = await DELETE(new NextRequest("http://localhost/api/admin/events", { method: "DELETE" }), params(id));
    expect(response.status).toBe(200);
    expect(stripe.products.get(productId)!.active).toBe(false);
    expect(stripe.prices.some((p) => p.active)).toBe(false);
  });
});

describe("productName", () => {
  it("hängt das Datum deutsch formatiert an", () => {
    expect(productName({ title: "Yoga", date: "2026-11-14" })).toBe("Yoga · 14.11.2026");
  });
});

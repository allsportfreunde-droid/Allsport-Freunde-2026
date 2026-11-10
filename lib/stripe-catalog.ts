/**
 * Gleicht ein Event mit Stripe ab: ein Produkt je Event, darin ein Preis je
 * Preisstufe (siehe lib/price-tiers.ts).
 *
 * Stripe-Preise sind unveränderlich. Ändert sich ein Betrag, entsteht ein neuer
 * Preis und der alte wird archiviert – nie gelöscht, denn bezahlte Sessions
 * verweisen weiter auf ihn. Kehrt ein Betrag zurück, wird der alte Preis
 * reaktiviert statt dupliziert. Der Abgleich ist idempotent und läuft bei
 * jedem Speichern.
 *
 * Zugeordnet wird über die gespeicherte Produkt-ID und `metadata.tier` – nicht
 * über lookup_keys. Die sind kontoweit eindeutig, und Umgebungen, die sich ein
 * Stripe-Testkonto teilen, haben dieselben Event-IDs: Sie würden sich
 * gegenseitig die Preise wegnehmen.
 */

import type Stripe from "stripe";
import { getStripe, stripeProductUrl } from "./stripe";
import { calculateTierPrices, PRICE_TIERS, TIER_PRICE_COLUMNS, type PriceTier } from "./price-tiers";
import { getEventFull, saveEventStripeCatalog } from "./db";
import type { EventStripeCatalog } from "./types";

/** Was der Abgleich von einem Event braucht. */
export interface CatalogEvent {
  id: number;
  title: string;
  /** "YYYY-MM-DD" */
  date: string;
  created_at?: string | Date | null;
  price: string;
  entry_price?: number | null;
  child_entry_price?: number | null;
  stripe_product_id?: string | null;
}

export type CatalogSyncResult =
  /** Produkt und alle sechs Preise passen zum Event. */
  | { status: "synced"; catalog: EventStripeCatalog }
  /** Nichts zu kassieren (Freitext/kostenlos): Preise archiviert, IDs leer. */
  | { status: "archived"; catalog: EventStripeCatalog }
  /** Stripe ist nicht konfiguriert (lokale Entwicklung). */
  | { status: "skipped" }
  | { status: "failed"; error: string };

/** Was die Admin-Routen dem Formular zurückmelden. */
export interface StripeSyncSummary {
  status: CatalogSyncResult["status"];
  error?: string;
  product_url?: string | null;
}

const tierLabels = Object.fromEntries(PRICE_TIERS.map(({ tier, label }) => [tier, label])) as Record<PriceTier, string>;

export async function syncEventStripeCatalog(event: CatalogEvent): Promise<CatalogSyncResult> {
  const stripe = getStripe();
  if (!stripe) return { status: "skipped" };

  try {
    const amounts = calculateTierPrices(event);
    if (!amounts) {
      if (event.stripe_product_id) await archiveProduct(stripe, event.stripe_product_id);
      return { status: "archived", catalog: emptyCatalog(event.stripe_product_id ?? null) };
    }

    const productId = await ensureProduct(stripe, event);
    const existing: Stripe.Price[] = [];
    for await (const price of stripe.prices.list({ product: productId, limit: 100 })) existing.push(price);
    // Aktive zuerst, damit ein bestehender aktiver Preis Vorrang vor einem archivierten hat.
    existing.sort((a, b) => Number(b.active) - Number(a.active));

    const ids = {} as Record<PriceTier, string>;
    for (const { tier } of PRICE_TIERS) {
      const cents = amounts[tier];
      const match = existing.find((price) =>
        price.metadata?.tier === tier && price.unit_amount === cents &&
        price.currency === "eur" && price.type === "one_time" && !price.transform_quantity
      );
      if (match) {
        if (!match.active) await stripe.prices.update(match.id, { active: true });
        ids[tier] = match.id;
        continue;
      }
      const created = await stripe.prices.create(
        {
          product: productId,
          currency: "eur",
          unit_amount: cents,
          nickname: tierLabels[tier],
          metadata: { event_id: String(event.id), tier },
        },
        // Doppelt abgeschickte Speichervorgänge bekommen denselben Preis.
        { idempotencyKey: `event-price:${productId}:${tier}:${cents}` }
      );
      if (!created.active) await stripe.prices.update(created.id, { active: true });
      ids[tier] = created.id;
    }

    const keep = new Set(Object.values(ids));
    for (const price of existing) {
      if (price.active && !keep.has(price.id)) await stripe.prices.update(price.id, { active: false });
    }

    const catalog = emptyCatalog(productId);
    for (const { tier } of PRICE_TIERS) catalog[TIER_PRICE_COLUMNS[tier]] = ids[tier];
    return { status: "synced", catalog };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : "Unbekannter Stripe-Fehler." };
  }
}

/**
 * Lädt das gespeicherte Event, gleicht es ab und speichert die IDs. Wirft nie:
 * Das Event ist zu diesem Zeitpunkt bereits gespeichert, ein Stripe-Problem
 * wird nur gemeldet. Ohne IDs rechnet der Checkout mit dem Betrag selbst ab.
 */
export async function syncStoredEventCatalog(eventId: number): Promise<StripeSyncSummary> {
  try {
    const event = await getEventFull(eventId);
    if (!event) return { status: "failed", error: "Event nicht gefunden." };

    const result = await syncEventStripeCatalog(event);
    if (result.status === "skipped") return { status: "skipped" };
    if (result.status === "failed") {
      console.error(`Stripe-Abgleich für Event ${eventId} fehlgeschlagen:`, result.error);
      return { status: "failed", error: result.error };
    }

    const saved = await saveEventStripeCatalog(eventId, result.catalog, event);
    if (!saved) {
      return { status: "failed", error: "Das Event wurde währenddessen erneut geändert. Bitte noch einmal speichern." };
    }
    return { status: result.status, product_url: stripeProductUrl(result.catalog.stripe_product_id) };
  } catch (error) {
    console.error(`Stripe-Abgleich für Event ${eventId} fehlgeschlagen:`, error);
    return { status: "failed", error: error instanceof Error ? error.message : "Unbekannter Fehler." };
  }
}

/**
 * Archiviert Produkt und Preise eines gelöschten Events. Stripe erlaubt kein
 * Löschen von Produkten mit Preisen. Fehler werden nur protokolliert.
 */
export async function archiveEventStripeProduct(productId: string | null | undefined): Promise<void> {
  const stripe = getStripe();
  if (!stripe || !productId) return;
  try {
    await archiveProduct(stripe, productId);
  } catch (error) {
    console.error(`Stripe-Produkt ${productId} konnte nicht archiviert werden:`, error);
  }
}

async function ensureProduct(stripe: Stripe, event: CatalogEvent): Promise<string> {
  const name = productName(event);
  if (event.stripe_product_id) {
    try {
      await stripe.products.update(event.stripe_product_id, { name, active: true });
      return event.stripe_product_id;
    } catch (error) {
      // Im Dashboard gelöscht oder aus dem anderen Modus (Test/Live): neu anlegen.
      if (!isMissingResource(error)) throw error;
    }
  }
  const createdAt = event.created_at ? new Date(event.created_at).getTime() : 0;
  const product = await stripe.products.create(
    { name, metadata: { event_id: String(event.id) } },
    { idempotencyKey: `event-product:${event.id}:${createdAt}:${event.stripe_product_id ?? "neu"}` }
  );
  return product.id;
}

async function archiveProduct(stripe: Stripe, productId: string): Promise<void> {
  try {
    const active: Stripe.Price[] = [];
    for await (const price of stripe.prices.list({ product: productId, active: true, limit: 100 })) active.push(price);
    for (const price of active) await stripe.prices.update(price.id, { active: false });
    await stripe.products.update(productId, { active: false });
  } catch (error) {
    if (!isMissingResource(error)) throw error;
  }
}

/** "Fußball im Park · 14.11.2026" – so erscheint das Event im Dashboard und im Checkout. */
export function productName(event: Pick<CatalogEvent, "title" | "date">): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(event.date ?? "");
  return match ? `${event.title} · ${match[3]}.${match[2]}.${match[1]}` : event.title;
}

function emptyCatalog(productId: string | null): EventStripeCatalog {
  return {
    stripe_product_id: productId,
    stripe_price_id: null,
    stripe_child_price_id: null,
    stripe_adult_reduced_30_price_id: null,
    stripe_adult_reduced_50_price_id: null,
    stripe_child_reduced_30_price_id: null,
    stripe_child_reduced_50_price_id: null,
  };
}

function isMissingResource(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "resource_missing";
}

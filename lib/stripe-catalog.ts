/**
 * Gleicht ein Event mit Stripe ab: ein Produkt je Preisstufe, jeweils mit
 * seinem aktuellen Preis (siehe lib/price-tiers.ts).
 *
 * Warum ein Produkt je Stufe: Stripe Checkout zeigt bei Price IDs nur den
 * Produktnamen, nie den Namen des Preises. Hingen alle Stufen an einem Produkt,
 * stünde im Checkout mehrmals derselbe Eventname. So steht dort
 * "Schwimmen · 15.11.2026 – Erwachsene (50 % ermäßigt)".
 *
 * Stripe-Preise sind unveränderlich. Ändert sich ein Betrag, entsteht am selben
 * Produkt ein neuer Preis und der alte wird archiviert – nie gelöscht, denn
 * bezahlte Sessions verweisen weiter auf ihn. Kehrt ein Betrag zurück, wird der
 * alte Preis reaktiviert. Der Abgleich ist idempotent und läuft bei jedem Speichern.
 *
 * Zugeordnet wird über die am Event gemerkten Produkt-IDs – nicht über
 * lookup_keys oder die Suche. Umgebungen, die sich ein Stripe-Testkonto teilen,
 * haben dieselben Event-IDs und würden sich sonst gegenseitig Preise wegnehmen.
 */

import type Stripe from "stripe";
import { getStripe } from "./stripe";
import {
  activeTiers, calculateTierPrices, PRICE_TIERS, TIER_PRICE_COLUMNS, tierLineLabel, type PriceTier,
} from "./price-tiers";
import { getEventFull, saveEventStripeCatalog } from "./db";
import type { EventStripeCatalog } from "./types";

type TierProducts = Partial<Record<PriceTier, string>>;

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
  stripe_tier_products?: TierProducts | null;
  /** Früheres Einzelprodukt je Event – wird beim Abgleich archiviert. */
  stripe_product_id?: string | null;
}

export type CatalogSyncResult =
  /** Für jede benötigte Stufe gibt es ein Produkt mit passendem Preis. */
  | { status: "synced"; catalog: EventStripeCatalog }
  /** Nichts zu kassieren (Freitext/kostenlos): alles archiviert, Price IDs leer. */
  | { status: "archived"; catalog: EventStripeCatalog }
  /** Stripe ist nicht konfiguriert (lokale Entwicklung). */
  | { status: "skipped" }
  | { status: "failed"; error: string };

/** Was die Admin-Routen dem Formular zurückmelden. */
export interface StripeSyncSummary {
  status: CatalogSyncResult["status"];
  error?: string;
}

export async function syncEventStripeCatalog(event: CatalogEvent): Promise<CatalogSyncResult> {
  const stripe = getStripe();
  if (!stripe) return { status: "skipped" };

  try {
    const known: TierProducts = { ...(event.stripe_tier_products ?? {}) };
    const amounts = calculateTierPrices(event);
    const needed = amounts ? activeTiers(event) : [];
    const separateChildPrice = event.child_entry_price != null;

    // Die Stufen sind unabhängig voneinander – parallel, damit Speichern nicht spürbar länger dauert.
    const synced = await Promise.all(
      needed.map((tier) => syncTier(stripe, event, tier, amounts![tier], known[tier] ?? null, separateChildPrice))
    );

    // Stufen, die nicht mehr gebraucht werden (etwa Kinderpreis entfernt), samt
    // früherem Einzelprodukt archivieren. Die IDs bleiben gemerkt, damit eine
    // zurückkehrende Stufe ihr altes Produkt wiederbekommt.
    const obsolete = PRICE_TIERS.map(({ tier }) => tier).filter((tier) => !needed.includes(tier) && known[tier]);
    await Promise.all([
      ...obsolete.map((tier) => archiveProduct(stripe, known[tier]!)),
      ...(event.stripe_product_id ? [archiveProduct(stripe, event.stripe_product_id)] : []),
    ]);

    const catalog = emptyCatalog({ ...known, ...Object.fromEntries(synced.map((s) => [s.tier, s.productId])) });
    for (const { tier, priceId } of synced) catalog[TIER_PRICE_COLUMNS[tier]] = priceId;
    return { status: amounts ? "synced" : "archived", catalog };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : "Unbekannter Stripe-Fehler." };
  }
}

/** Produkt und Preis einer Stufe sicherstellen; übrige aktive Preise archivieren. */
async function syncTier(
  stripe: Stripe,
  event: CatalogEvent,
  tier: PriceTier,
  cents: number,
  knownProductId: string | null,
  separateChildPrice: boolean
): Promise<{ tier: PriceTier; productId: string; priceId: string }> {
  const label = tierLineLabel(tier, separateChildPrice);
  const productId = await ensureTierProduct(stripe, event, tier, productName(event, label), knownProductId);

  const existing: Stripe.Price[] = [];
  for await (const price of stripe.prices.list({ product: productId, limit: 100 })) existing.push(price);
  // Aktive zuerst, damit ein bestehender aktiver Preis Vorrang vor einem archivierten hat.
  existing.sort((a, b) => Number(b.active) - Number(a.active));

  let priceId: string;
  const match = existing.find((price) =>
    price.unit_amount === cents && price.currency === "eur" && price.type === "one_time" && !price.transform_quantity
  );
  if (match) {
    if (!match.active) await stripe.prices.update(match.id, { active: true });
    priceId = match.id;
  } else {
    const created = await stripe.prices.create(
      {
        product: productId,
        currency: "eur",
        unit_amount: cents,
        nickname: label,
        metadata: { event_id: String(event.id), tier },
      },
      // Doppelt abgeschickte Speichervorgänge bekommen denselben Preis.
      { idempotencyKey: `event-price:${productId}:${cents}` }
    );
    if (!created.active) await stripe.prices.update(created.id, { active: true });
    priceId = created.id;
  }

  for (const price of existing) {
    if (price.active && price.id !== priceId) await stripe.prices.update(price.id, { active: false });
  }
  return { tier, productId, priceId };
}

async function ensureTierProduct(
  stripe: Stripe,
  event: CatalogEvent,
  tier: PriceTier,
  name: string,
  knownProductId: string | null
): Promise<string> {
  if (knownProductId) {
    try {
      await stripe.products.update(knownProductId, { name, active: true });
      return knownProductId;
    } catch (error) {
      // Im Dashboard gelöscht oder aus dem anderen Modus (Test/Live): neu anlegen.
      if (!isMissingResource(error)) throw error;
    }
  }
  const createdAt = event.created_at ? new Date(event.created_at).getTime() : 0;
  const product = await stripe.products.create(
    { name, metadata: { event_id: String(event.id), tier } },
    { idempotencyKey: `event-product:${event.id}:${createdAt}:${tier}:${knownProductId ?? "neu"}` }
  );
  return product.id;
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
    return { status: result.status };
  } catch (error) {
    console.error(`Stripe-Abgleich für Event ${eventId} fehlgeschlagen:`, error);
    return { status: "failed", error: error instanceof Error ? error.message : "Unbekannter Fehler." };
  }
}

/**
 * Archiviert alle Produkte und Preise eines gelöschten Events. Stripe erlaubt
 * kein Löschen von Produkten mit Preisen. Fehler werden nur protokolliert.
 */
export async function archiveEventStripeProducts(
  event: Pick<CatalogEvent, "stripe_tier_products" | "stripe_product_id">
): Promise<void> {
  const stripe = getStripe();
  if (!stripe) return;
  const productIds = [...Object.values(event.stripe_tier_products ?? {}), event.stripe_product_id]
    .filter((id): id is string => !!id);
  await Promise.all(productIds.map(async (productId) => {
    try {
      await archiveProduct(stripe, productId);
    } catch (error) {
      console.error(`Stripe-Produkt ${productId} konnte nicht archiviert werden:`, error);
    }
  }));
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

/** Längere Titel werden gekürzt, damit der Name in Stripe handhabbar bleibt. */
const MAX_TITLE_LENGTH = 200;

/**
 * "Fußball im Park · 14.11.2026 – Erwachsene (50 % ermäßigt)" – so erscheint
 * die Stufe im Dashboard, im Checkout und auf dem Zahlungsbeleg.
 */
export function productName(event: Pick<CatalogEvent, "title" | "date">, label?: string): string {
  const title = event.title.length > MAX_TITLE_LENGTH ? `${event.title.slice(0, MAX_TITLE_LENGTH - 1)}…` : event.title;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(event.date ?? "");
  const base = match ? `${title} · ${match[3]}.${match[2]}.${match[1]}` : title;
  return label ? `${base} – ${label}` : base;
}

function emptyCatalog(tierProducts: TierProducts): EventStripeCatalog {
  return {
    stripe_tier_products: Object.keys(tierProducts).length ? tierProducts : null,
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

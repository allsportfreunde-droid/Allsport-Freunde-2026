/**
 * Die sechs Preisstufen eines Events: Erwachsene und Kinder, jeweils voll und
 * ermäßigt nach § 3 der Beitragsordnung.
 *
 * Gepflegt werden nur die beiden Grundpreise (Erwachsene, Kind). Die
 * ermäßigten Preise entstehen immer hier daraus – so kann keiner von ihnen von
 * seinem Grundpreis abweichen, weder im Formular noch in Stripe.
 */

import { calculateRegistrationPrice, registrationUnitCents, type RegistrationPriceFields } from "./price";
import { formatEuro } from "./finance";
import { DISCOUNTS, discountedCents, type Discount } from "./discounts";
import type { EventStripeCatalog } from "./types";

export { DISCOUNTS, discountedCents, type Discount };

export const PRICE_TIERS = [
  { tier: "adult", base: "adult", discount: null, label: "Erwachsene" },
  { tier: "child", base: "child", discount: null, label: "Kind" },
  { tier: "adult_reduced_30", base: "adult", discount: "reduced_30", label: "Erwachsene (30 % ermäßigt)" },
  { tier: "adult_reduced_50", base: "adult", discount: "reduced_50", label: "Erwachsene (50 % ermäßigt)" },
  { tier: "child_reduced_30", base: "child", discount: "reduced_30", label: "Kind (30 % ermäßigt)" },
  { tier: "child_reduced_50", base: "child", discount: "reduced_50", label: "Kind (50 % ermäßigt)" },
] as const satisfies ReadonlyArray<{
  tier: string;
  base: "adult" | "child";
  discount: Discount | null;
  label: string;
}>;

export type PriceTier = (typeof PRICE_TIERS)[number]["tier"];

/** Betrag je Stufe in Cent. */
export type TierPrices = Record<PriceTier, number>;

/** In welcher Event-Spalte die Stripe Price ID einer Stufe liegt. */
export const TIER_PRICE_COLUMNS = {
  adult: "stripe_price_id",
  child: "stripe_child_price_id",
  adult_reduced_30: "stripe_adult_reduced_30_price_id",
  adult_reduced_50: "stripe_adult_reduced_50_price_id",
  child_reduced_30: "stripe_child_reduced_30_price_id",
  child_reduced_50: "stripe_child_reduced_50_price_id",
} as const satisfies Record<PriceTier, Exclude<keyof EventStripeCatalog, "stripe_tier_products">>;

/**
 * Die Stufen, die ein Event in Stripe braucht. Ohne eigenen Kinderpreis zahlen
 * Kinder wie Erwachsene (siehe personTier) – dann gibt es keine Kinderstufen.
 */
export function activeTiers(event: { child_entry_price?: number | null }): PriceTier[] {
  const separateChildPrice = event.child_entry_price != null;
  return PRICE_TIERS.filter(({ base }) => separateChildPrice || base === "adult").map(({ tier }) => tier);
}

/**
 * Die Beträge aller sechs Stufen in Cent – oder null, wenn es nichts zu
 * kassieren gibt: kein verbindlicher Preis (Freitext) oder alles kostenlos.
 * Ein Kind ohne eigenen Preis zahlt wie bisher den Erwachsenenpreis.
 */
export function calculateTierPrices(event: RegistrationPriceFields): TierPrices | null {
  const { adult, child } = registrationUnitCents(event);
  if (adult == null || child == null || (adult === 0 && child === 0)) return null;
  const units = { adult, child };
  return Object.fromEntries(
    PRICE_TIERS.map(({ tier, base: from, discount }) => [
      tier,
      discount ? discountedCents(units[from], DISCOUNTS[discount].percent) : units[from],
    ])
  ) as TierPrices;
}

// ── Preis einer Anmeldung, Person für Person ─────────────────────────────────

/** Was über den Preis einer Person entscheidet. */
export interface PricedPerson {
  is_child: boolean;
  /** Serverseitig aus der Ermäßigungsliste übernommen; null = voller Preis. */
  discount?: Discount | null;
}

/**
 * Die Stufe, nach der eine Person bezahlt. Ohne eigenen Kinderpreis zahlen
 * Kinder wie Erwachsene – dann fallen ihre Stufen auf die der Erwachsenen,
 * und der Checkout behält seine bisherige einzelne "Eintritt"-Zeile.
 */
export function personTier(person: PricedPerson, separateChildPrice: boolean): PriceTier {
  const base = person.is_child && separateChildPrice ? "child" : "adult";
  return person.discount ? `${base}_${person.discount}` : base;
}

/** Wer in einer Stufe zahlt, ohne Ermäßigungszusatz: [Einzahl, Mehrzahl]. */
function personNames(tier: PriceTier, separateChildPrice: boolean): [string, string] {
  const def = PRICE_TIERS.find((t) => t.tier === tier)!;
  if (!separateChildPrice) return ["Person", "Personen"];
  return def.base === "child" ? ["Kind", "Kinder"] : ["Erwachsener", "Erwachsene"];
}

/**
 * Bezeichnung einer Stufe für Kunden – im Checkout und als Stripe-Produktname:
 * "Eintritt", "Erwachsene", "Kinder", "Erwachsene (50 % ermäßigt)".
 */
export function tierLineLabel(tier: PriceTier, separateChildPrice: boolean): string {
  const def = PRICE_TIERS.find((t) => t.tier === tier)!;
  const name = !separateChildPrice ? "Eintritt" : def.base === "child" ? "Kinder" : "Erwachsene";
  return def.discount ? `${name} (${DISCOUNTS[def.discount].percent} % ermäßigt)` : name;
}

export interface PriceGroup {
  tier: PriceTier;
  count: number;
  unitCents: number;
  /** Bezeichnung der Checkout-Zeile, etwa "Erwachsene (50 % ermäßigt)". */
  lineLabel: string;
  /** Für Anzeigen: "Erwachsener" / "Erwachsene", ohne Ermäßigungszusatz. */
  names: [one: string, many: string];
  discount: Discount | null;
}

export interface PersonsPrice {
  /** Je Stufe eine Gruppe, in der Reihenfolge von PRICE_TIERS. */
  groups: PriceGroup[];
  totalCents: number;
  /** Was ohne Ermäßigungen zu zahlen wäre – für "statt …" in der Anzeige. */
  undiscountedCents: number;
  /** "2 Erwachsene × 12,00 € + 1 Erwachsener (−50 %) × 6,00 €" */
  breakdown: string;
  hasDiscount: boolean;
  /** Betrag dieser Person in Cent – Grundlage für die Zahlungsaufteilung. */
  centsFor(person: PricedPerson): number;
}

/**
 * Preis einer Anmeldung aus ihren Personen. null = kein verbindlicher Betrag
 * (dieselbe Regel wie calculateRegistrationPrice). Ohne Ermäßigung ist das
 * Ergebnis mit calculateRegistrationPrice identisch, auch die Aufschlüsselung.
 */
export function calculatePersonsPrice(
  event: RegistrationPriceFields,
  persons: ReadonlyArray<PricedPerson>
): PersonsPrice | null {
  if (persons.length < 1) return null;
  const separateChildPrice = event.child_entry_price != null;
  const unit = registrationUnitCents(event);

  const unitFor = (tier: PriceTier): number | null => {
    const def = PRICE_TIERS.find((t) => t.tier === tier)!;
    const base = def.base === "adult" ? unit.adult : unit.child;
    if (base == null) return null;
    return def.discount ? discountedCents(base, DISCOUNTS[def.discount].percent) : base;
  };

  const counts = new Map<PriceTier, number>();
  for (const person of persons) {
    const tier = personTier(person, separateChildPrice);
    counts.set(tier, (counts.get(tier) ?? 0) + 1);
  }

  const groups: PriceGroup[] = [];
  for (const { tier, discount } of PRICE_TIERS) {
    const count = counts.get(tier);
    if (!count) continue;
    const unitCents = unitFor(tier);
    if (unitCents == null) return null;
    groups.push({
      tier, count, unitCents, discount,
      lineLabel: tierLineLabel(tier, separateChildPrice),
      names: personNames(tier, separateChildPrice),
    });
  }

  const totalCents = groups.reduce((sum, group) => sum + group.count * group.unitCents, 0);
  // Die Grundstufe einer ermäßigten Person hat immer einen Betrag, wenn die ermäßigte einen hat.
  const undiscountedCents = persons.reduce(
    (sum, person) => sum + (unitFor(personTier({ ...person, discount: null }, separateChildPrice)) ?? 0), 0
  );
  const hasDiscount = persons.some((person) => person.discount);
  const breakdown = hasDiscount
    ? groups
        .map(({ count, unitCents, names: [one, many], discount }) => {
          const suffix = discount ? ` (−${DISCOUNTS[discount].percent} %)` : "";
          return `${count} ${count === 1 ? one : many}${suffix} × ${formatEuro(unitCents / 100)}`;
        })
        .join(" + ")
    : calculateRegistrationPrice(event, persons.length, persons.filter((p) => p.is_child).length)?.breakdown ?? "";

  return {
    groups,
    totalCents,
    undiscountedCents,
    breakdown,
    hasDiscount,
    centsFor: (person) => unitFor(personTier(person, separateChildPrice)) ?? 0,
  };
}

/** "2 Erwachsene × 12,00 € + 1 Erwachsener (−50 %) × 6,00 € = 30,00 €" – oder null. */
export function formatPersonsPriceLabel(
  event: RegistrationPriceFields,
  persons: ReadonlyArray<PricedPerson>
): string | null {
  const result = calculatePersonsPrice(event, persons);
  return result && result.totalCents > 0 ? `${result.breakdown} = ${formatEuro(result.totalCents / 100)}` : null;
}

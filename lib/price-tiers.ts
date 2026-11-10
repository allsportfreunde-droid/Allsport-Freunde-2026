/**
 * Die sechs Preisstufen eines Events: Erwachsene und Kinder, jeweils voll und
 * ermäßigt nach § 3 der Beitragsordnung.
 *
 * Gepflegt werden nur die beiden Grundpreise (Erwachsene, Kind). Die
 * ermäßigten Preise entstehen immer hier daraus – so kann keiner von ihnen von
 * seinem Grundpreis abweichen, weder im Formular noch in Stripe.
 */

import { registrationUnitCents, type RegistrationPriceFields } from "./price";
import type { EventStripeCatalog } from "./types";

/** Ermäßigungen nach § 3 – die eine Stelle, an der Satz, Grund und Nachweis stehen. */
export const DISCOUNTS = {
  reduced_30: {
    percent: 30,
    reason: "Bezug von Sozialleistungen (Bürgergeld, Sozialhilfe, Grundsicherung, AsylbLG, Wohngeld, BAföG o. Ä.)",
    proof: "aktueller Leistungsbescheid",
  },
  reduced_50: {
    percent: 50,
    reason: "Behinderung (GdB mindestens 50)",
    proof: "Schwerbehindertenausweis",
  },
} as const;

export type Discount = keyof typeof DISCOUNTS;

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
} as const satisfies Record<PriceTier, Exclude<keyof EventStripeCatalog, "stripe_product_id">>;

/** Ermäßigter Betrag, auf ganze Cent gerundet: 7,25 € − 50 % = 3,63 €. */
export function discountedCents(cents: number, percent: number): number {
  return Math.round((cents * (100 - percent)) / 100);
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

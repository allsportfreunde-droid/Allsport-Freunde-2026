/**
 * Ermäßigungen nach § 3 – die eine Stelle, an der Satz, Grund und Nachweis
 * stehen. Bewusst ohne Abhängigkeiten, damit auch lib/finance.ts sie nutzen
 * kann, ohne einen Importkreis zu bilden. Weiterexportiert von lib/price-tiers.ts.
 */
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

/** Ermäßigter Betrag, auf ganze Cent gerundet: 7,25 € − 50 % = 3,63 €. */
export function discountedCents(cents: number, percent: number): number {
  return Math.round((cents * (100 - percent)) / 100);
}

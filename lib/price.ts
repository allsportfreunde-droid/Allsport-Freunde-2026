/**
 * Die eine Stelle, an der ein Preis entsteht.
 *
 * Ein Event hat zwei Preis-Felder, die nie auseinanderlaufen dürfen:
 *
 *   price       – Freitext, den der Teilnehmer bei der Anmeldung sieht
 *   entry_price – Zahl in Euro, Grundlage für Umsatz- und Bilanzberechnung
 *
 * Regel: `entry_price` ist immer maßgeblich für die Berechnung. Der Anzeigetext
 * wird daraus abgeleitet – außer der Admin hat bewusst echten Freitext
 * eingegeben ("Spende willkommen"), dann bleibt der erhalten und der Betrag
 * dient weiterhin als Berechnungsgrundlage.
 *
 * Damit ist der schädliche Fall ausgeschlossen: dass eine reine Zahl angezeigt
 * wird, die von der gerechneten Zahl abweicht.
 */

import { formatEuro } from "./finance";

/** Anzeigetext, wenn kein Betrag hinterlegt ist. */
export const FREE_PRICE_LABEL = "Kostenlos";

export interface PriceFields {
  /** Anzeigetext für den Teilnehmer. Nie leer. */
  price: string;
  /** Betrag pro Person in Euro. null = keine Berechnungsgrundlage. */
  entry_price: number | null;
}

/**
 * Erkennt, ob ein Anzeigetext ein reiner Betrag ist ("5 €", "1.234,56 €", "12").
 * Gibt den Betrag zurück, sonst null für echten Freitext ("Spende willkommen").
 */
export function parsePriceText(text: string): number | null {
  const stripped = text
    .trim()
    .replace(/^€\s*/, "")
    .replace(/\s*(?:€|EUR)$/i, "")
    .trim();

  // Deutsche Tausendertrennung: 1.234 / 1.234,56
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(stripped)) {
    return parseFloat(stripped.replace(/\./g, "").replace(",", "."));
  }
  // Einfache Zahl: 5 / 5,00 / 5.00
  if (/^\d+(?:[.,]\d{1,2})?$/.test(stripped)) {
    return parseFloat(stripped.replace(",", "."));
  }
  return null;
}

/** Betrag → beide Felder. Der Weg für Zahleneingabe und Stripe. */
export function priceFromAmount(amount: number | null | undefined): PriceFields {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) {
    return { price: FREE_PRICE_LABEL, entry_price: null };
  }
  const rounded = Math.round(amount * 100) / 100;
  return { price: formatEuro(rounded), entry_price: rounded };
}

/**
 * Freitext → beide Felder. Ist der Text in Wahrheit ein Betrag, wird er als
 * Betrag behandelt, damit die Berechnungsgrundlage nicht verloren geht.
 */
export function priceFromText(text: string): PriceFields {
  const trimmed = text.trim();
  if (!trimmed) return priceFromAmount(null);

  const amount = parsePriceText(trimmed);
  if (amount != null) return priceFromAmount(amount);

  return { price: trimmed, entry_price: null };
}

/** Wandelt einen beliebigen Eingabewert in einen Betrag um. */
function toAmount(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalisiert, was von einem Client kommt, bevor es in die DB geht.
 * Jede schreibende Route muss hier durch – so kann kein Weg an der
 * Synchronisierung vorbeiführen.
 */
export function normalizePrice(input: {
  price?: unknown;
  entry_price?: unknown;
}): PriceFields {
  const amount = toAmount(input.entry_price);
  const text = typeof input.price === "string" ? input.price.trim() : "";
  const textAmount = text ? parsePriceText(text) : null;

  // Echter Freitext bleibt erhalten, der Betrag bleibt Berechnungsgrundlage.
  if (text && textAmount == null) {
    return { price: text, entry_price: amount != null && amount > 0 ? amount : null };
  }

  // Sonst gewinnt der Betrag; fehlt er, wird er aus dem Anzeigetext gerettet.
  return priceFromAmount(amount ?? textAmount);
}

/**
 * Der Betrag pro Person, der wirklich eingefordert werden darf – oder null.
 *
 * Verbindlich ist er nur, wenn ein Betrag hinterlegt ist *und* der Anzeigetext
 * ein reiner Betrag ist. Bei echtem Freitext ("Spende willkommen") bleibt
 * `entry_price` Berechnungsgrundlage, aber niemand bekommt eine Zahlungs-
 * aufforderung über eine Summe, die so nie ausgeschrieben war.
 *
 * Dieselbe Bedingung, die `formatPriceLabel` intern anwendet – hier als eigene
 * Frage, weil Formular und Route sie vor dem Label brauchen.
 */
export function bindingEntryPrice(event: {
  price?: string | null;
  entry_price?: number | null;
}): number | null {
  const amount = event.entry_price ?? null;
  if (amount == null || amount <= 0) return null;
  return parsePriceText(event.price ?? "") == null ? null : amount;
}

/**
 * Beschriftung eines fälligen Betrags: "3 × 8,00 € = 24,00 €".
 *
 * Gibt null zurück, wenn kein verbindlicher Betrag vorliegt – also bei
 * kostenlosen Events und bei echtem Freitext wie "Spende willkommen". Damit
 * nennt keine E-Mail eine Summe, die die Status-Seite nicht auch zeigt.
 */
export function formatPriceLabel(
  entryPrice: number | null | undefined,
  personCount: number,
  priceText: string | null | undefined,
  childEntryPrice?: number | null,
  childCount = 0
): string | null {
  const result = calculateRegistrationPrice(
    { entry_price: entryPrice, price: priceText, child_entry_price: childEntryPrice },
    personCount,
    childCount
  );
  return result && result.totalCents > 0 ? `${result.breakdown} = ${formatEuro(result.totalCents / 100)}` : null;
}

interface RegistrationPriceFields {
  price?: string | null;
  entry_price?: number | null;
  child_entry_price?: number | null;
  child_price?: string | null;
}

/** Gemeinsame Cent-Rechnung für Anzeige und Checkout. null = kein verbindlicher Betrag. */
export function calculateRegistrationPrice(
  event: RegistrationPriceFields,
  personCount: number,
  childCount = 0
) {
  if (!Number.isInteger(personCount) || !Number.isInteger(childCount) ||
      personCount < 1 || childCount < 0 || childCount > personCount) return null;
  const adultCount = personCount - childCount;
  const text = (event.price ?? "").trim();
  const adultAmount = bindingEntryPrice(event) ?? (
    (event.entry_price == null || event.entry_price === 0) &&
    (text === FREE_PRICE_LABEL || parsePriceText(text) === 0) ? 0 : null
  );
  const childAmount = event.child_entry_price ?? adultAmount;
  if ((adultCount > 0 && adultAmount == null) || (childCount > 0 && childAmount == null)) return null;
  const adultUnitCents = Math.round((adultAmount ?? 0) * 100);
  const childUnitCents = Math.round((childAmount ?? 0) * 100);
  if (![adultUnitCents, childUnitCents].every((value) => Number.isSafeInteger(value) && value >= 0)) return null;
  const totalCents = adultCount * adultUnitCents + childCount * childUnitCents;
  const separateChildPrice = event.child_entry_price != null && childCount > 0;
  const breakdown = separateChildPrice
    ? [
        adultCount > 0 ? `${adultCount} ${adultCount === 1 ? "Erwachsener" : "Erwachsene"} × ${formatEuro(adultUnitCents / 100)}` : null,
        `${childCount} ${childCount === 1 ? "Kind" : "Kinder"} × ${formatEuro(childUnitCents / 100)}`,
      ].filter(Boolean).join(" + ")
    : `${personCount} × ${formatEuro(adultUnitCents / 100)}`;
  return { adultCount, childCount, adultUnitCents, childUnitCents, totalCents, breakdown };
}

export function formatEventPrice(event: RegistrationPriceFields): string {
  if (event.child_entry_price == null) return event.price ?? FREE_PRICE_LABEL;
  const childLabel = event.child_price
    ? `${event.child_price} (${formatEuro(event.child_entry_price)})`
    : formatEuro(event.child_entry_price);
  return `Erwachsene: ${event.price ?? FREE_PRICE_LABEL} · Kinder: ${childLabel}`;
}

/** Manuell gepflegter Kinderbetrag: null übernimmt Erwachsene; 0 bedeutet kostenlos. */
export function normalizeManualChildPrice(input: { child_entry_price?: unknown; child_price?: unknown }) {
  const raw = input.child_entry_price;
  const text = typeof input.child_price === "string" ? input.child_price.trim() : "";
  if (text.length > 100) throw new Error("Der Kinderpreis-Text darf höchstens 100 Zeichen lang sein.");
  if (raw == null || raw === "") {
    if (text) throw new Error("Bitte zum Kinderpreis-Text einen festen Betrag hinterlegen (auch 0 € möglich).");
    return { child_entry_price: null, child_price: null, stripe_child_price_id: null };
  }
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0 || raw > MAX_PRICE_CENTS / 100) {
    throw new Error("Bitte einen gültigen Kinderbetrag ab 0 € eingeben.");
  }
  return {
    child_entry_price: Math.round(raw * 100) / 100,
    child_price: text && parsePriceText(text) == null ? text : null,
    stripe_child_price_id: null,
  };
}

// ── Cent-Rechnung für die Kassenterminal-Eingabe ─────────────────────────────
//
// Intern wird beim Tippen in Cent gerechnet – ganzzahlig, damit beim Schieben
// der Ziffern nichts rundet. Cent ist außerdem exakt das, was Stripe als
// `unit_amount` liefert und erwartet.

/** Obergrenze der Eingabe: 99.999,99 € */
export const MAX_PRICE_CENTS = 9_999_999;

/** Cent → Euro-Betrag. */
export function amountFromCents(cents: number): number {
  return Math.round(cents) / 100;
}

/** Euro-Betrag → Cent. */
export function centsFromAmount(amount: number | null | undefined): number {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return 0;
  return Math.min(Math.round(amount * 100), MAX_PRICE_CENTS);
}

/**
 * Ziffernfolge einer Kassenterminal-Eingabe → Cent.
 * "5" → 5 Cent, "500" → 5,00 €. Zu lange Eingaben werden abgelehnt (null),
 * damit der Aufrufer den vorherigen Wert stehen lassen kann.
 */
export function centsFromDigits(digits: string): number | null {
  const onlyDigits = digits.replace(/\D/g, "");
  if (onlyDigits === "") return 0;
  if (onlyDigits.replace(/^0+/, "").length > String(MAX_PRICE_CENTS).length) return null;
  const cents = parseInt(onlyDigits, 10);
  if (!Number.isFinite(cents) || cents > MAX_PRICE_CENTS) return null;
  return cents;
}

/** Cent → "5,00" (ohne Währungszeichen, für das Eingabefeld). */
export function formatAmountPlain(cents: number): string {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountFromCents(cents));
}

/**
 * Eine Stripe Price ID gehört untrennbar zum Betrag, aus dem sie stammt.
 * Ohne Betrag ist sie bedeutungslos, und eine ID, die zu einem inzwischen
 * von Hand geänderten Betrag stehen bleibt, wäre genau der Drift, den dieses
 * Modul verhindern soll. Deshalb wird sie hier gemeinsam mit dem Betrag
 * normalisiert und fällt weg, sobald keiner mehr da ist.
 */
export function normalizeStripePriceId(
  value: unknown,
  entryPrice: number | null
): string | null {
  if (entryPrice == null || typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^price_[A-Za-z0-9]+$/.test(trimmed) ? trimmed : null;
}

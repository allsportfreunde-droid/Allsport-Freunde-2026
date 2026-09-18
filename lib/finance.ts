/**
 * Format a number as German Euro currency string.
 * Examples: 1234.5 → "1.234,50 €", 0 → "0,00 €"
 */
export function formatEuro(amount: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Parse a German-formatted decimal string to a JS number.
 * Accepts both "1.234,56" and "1234.56" forms.
 */
export function parseDecimal(value: string): number {
  // If it contains a comma, treat as German format
  if (value.includes(",")) {
    // Remove thousands dots, replace decimal comma with dot
    return parseFloat(value.replace(/\./g, "").replace(",", "."));
  }
  return parseFloat(value);
}

/** Berechneter Eintritt je Person; ein gespeicherter Zahlungsanteil hat Vorrang. */
export function personRevenueCents(
  event: { entry_price?: number | null; child_entry_price?: number | null },
  person: { id: string; is_child: boolean },
  paidPrices?: Record<string, number> | null
): number {
  return paidPrices?.[person.id] ?? Math.round((
    person.is_child ? event.child_entry_price ?? event.entry_price ?? 0 : event.entry_price ?? 0
  ) * 100);
}

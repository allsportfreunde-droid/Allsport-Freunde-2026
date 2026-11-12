/** Betrag je Person in Cent, festgehalten für genau eine Checkout-Session. */
export type PersonPrices = Record<string, number>;

export function personPricesTotal(prices: PersonPrices): number {
  const amounts = Object.values(prices);
  if (!amounts.length || amounts.some((amount) => !Number.isSafeInteger(amount) || amount < 0)) {
    throw new Error("Ungültige Zahlungsaufteilung.");
  }
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  if (!Number.isSafeInteger(total)) throw new Error("Ungültige Zahlungssumme.");
  return total;
}

/** Betrag je Person aus `centsFor` – etwa calculatePersonsPrice(…).centsFor. */
export function createPersonPrices<P extends { id: string }>(
  persons: ReadonlyArray<P>,
  centsFor: (person: P) => number
): PersonPrices {
  const prices = Object.fromEntries(persons.map((person) => [person.id, centsFor(person)]));
  if (Object.keys(prices).length !== persons.length) throw new Error("Doppelte Person im Checkout.");
  personPricesTotal(prices);
  return prices;
}

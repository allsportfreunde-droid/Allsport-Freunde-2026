/**
 * Wie viel Geld bei einer Stornierung zurückgeht.
 *
 * Neue Zahlungen haben festgehaltene Beträge je Person. Nur ältere Zahlungen
 * ohne diese Aufteilung werden weiterhin gleichmäßig auf Personen verteilt.
 *
 * Gerechnet wird durchgängig in Cent und ganzzahlig. Ein Betrag, der sich
 * nicht glatt teilen lässt (25,00 € auf drei Personen), darf weder Cent
 * verlieren noch welche erfinden: die Anteile werden abgerundet, und die
 * letzte Person, die ihren Anteil bekommt, erhält den verbliebenen Rest.
 *
 * Dieses Modul rechnet nur. Es kennt weder Datenbank noch Zahlungsanbieter –
 * dadurch ist jede Aufteilung ohne Geldbewegung prüfbar.
 */

import { centsFromAmount } from "./price";
import { personPricesTotal, type PersonPrices } from "./payment-prices";

/** Was über die Zahlung bekannt sein muss, um einen Anteil zu berechnen. */
export interface RefundBasis {
  /** Gezahlter Gesamtbetrag in Euro. null = nicht bezahlt. */
  amountPaid: number | null;
  /** Personen, für die damals gezahlt wurde. */
  paidPersons: number;
  /** Was von dieser Zahlung bereits als Erstattung zugesagt ist, in Cent. */
  announcedCents: number;
}

/** Anteil einer einzelnen Person am gezahlten Betrag, abgerundet auf Cent. */
export function personShareCents(amountPaidCents: number, paidPersons: number): number {
  if (amountPaidCents <= 0 || paidPersons < 1) return 0;
  return Math.floor(amountPaidCents / paidPersons);
}

/**
 * Der Betrag, der für `refundPersons` Personen jetzt zurückgeht.
 *
 * `remainingAfter` sind die bezahlten Personen, die danach noch angemeldet
 * sind. Ist niemand mehr übrig, geht der gesamte Rest der Zahlung zurück; so
 * bleibt nach der letzten Teilstornierung kein Rundungs-Cent bei uns liegen.
 *
 * Mehr als gezahlt wurde kann nie zurückgehen: die Obergrenze ist immer der
 * noch nicht zugesagte Teil.
 */
export function refundAmountCents(
  basis: RefundBasis,
  refundPersons: number,
  remainingAfter: number
): number {
  const paidCents = centsFromAmount(basis.amountPaid);
  const openCents = paidCents - Math.max(0, basis.announcedCents);

  if (refundPersons < 1 || openCents <= 0) return 0;
  if (remainingAfter <= 0) return openCents;

  const share = personShareCents(paidCents, basis.paidPersons);
  return Math.min(share * refundPersons, openCents);
}

/**
 * Verteilt einen Erstattungsbetrag auf die beteiligten Personen.
 *
 * Nur für die Buchführung: dem Teilnehmer wird eine Summe genannt, in der
 * Datenbank soll aber an jeder Person stehen, was auf sie entfällt. Die Summe
 * der Anteile ergibt exakt den Betrag – der Rest der Division landet bei der
 * ersten Person.
 */
export function splitRefundCents(totalCents: number, personCount: number): number[] {
  if (personCount < 1) return [];
  if (totalCents <= 0) return new Array(personCount).fill(0);
  const base = Math.floor(totalCents / personCount);
  const shares = new Array(personCount).fill(base);
  shares[0] += totalCents - base * personCount;
  return shares;
}

/** Erstattung nach gezahltem Personenpreis, mit dem bisherigen Weg für Altzahlungen. */
export function refundSharesCents(
  basis: RefundBasis,
  personIds: string[],
  remainingAfter: number,
  paidPersonPrices?: PersonPrices | null
): number[] {
  if (paidPersonPrices == null) {
    return splitRefundCents(refundAmountCents(basis, personIds.length, remainingAfter), personIds.length);
  }
  if (personPricesTotal(paidPersonPrices) !== Math.round((basis.amountPaid ?? 0) * 100)) {
    throw new Error("Gezahlter Betrag und Personenpreise stimmen nicht überein.");
  }
  if (new Set(personIds).size !== personIds.length) throw new Error("Doppelte Person bei der Erstattung.");
  const shares = personIds.map((id) => {
    if (!Object.hasOwn(paidPersonPrices, id)) throw new Error("Kein gezahlter Preis für diese Person.");
    return paidPersonPrices[id];
  });
  const openCents = Math.round((basis.amountPaid ?? 0) * 100) - Math.max(0, basis.announcedCents);
  if (shares.reduce((sum, value) => sum + value, 0) > openCents) {
    throw new Error("Die Erstattung übersteigt den noch offenen Zahlungsbetrag.");
  }
  return shares;
}

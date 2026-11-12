import { getSQL } from "./utils";
import { calculateTierPrices, type Discount } from "../price-tiers";

export type SetPersonDiscountResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "cancelled" | "no_price" | "paid_or_busy" };

/**
 * Ermäßigung einer Person nachträglich setzen oder entfernen (null = voller
 * Preis) – durch das Team, aus der Detailansicht einer Anmeldung.
 *
 * Nur solange nichts bezahlt ist und keine Zahlung läuft (SEPA-Einzug, in
 * Prüfung): Danach steht der Betrag fest, eine Differenz erstattet das Team
 * von Hand in Stripe. Die Bedingungen stehen im UPDATE selbst, damit eine
 * gleichzeitig eingehende Zahlung nicht übergangen wird.
 */
export async function setPersonDiscount(
  registrationId: number,
  personId: string,
  discount: Discount | null
): Promise<SetPersonDiscountResult> {
  const sql = getSQL();
  const rows = await sql`
    SELECT rp.cancelled_at IS NOT NULL AS cancelled,
      e.price, e.entry_price::float8 AS entry_price, e.child_entry_price::float8 AS child_entry_price
    FROM registration_persons rp
    JOIN registrations r ON r.id = rp.registration_id
    JOIN events e ON e.id = r.event_id
    WHERE rp.id::text = ${personId} AND rp.registration_id = ${registrationId}
  `;
  const target = rows[0] as
    | { cancelled: boolean; price: string | null; entry_price: number | null; child_entry_price: number | null }
    | undefined;
  if (!target) return { ok: false, reason: "not_found" };
  if (target.cancelled) return { ok: false, reason: "cancelled" };
  // Ohne verbindlichen Betrag (Freitext, kostenlos) gibt es nichts zu ermäßigen.
  if (!calculateTierPrices(target)) return { ok: false, reason: "no_price" };

  const updated = await sql`
    UPDATE registration_persons rp SET discount = ${discount}
    FROM registrations r
    WHERE rp.id::text = ${personId} AND rp.registration_id = ${registrationId}
      AND r.id = rp.registration_id
      AND rp.cancelled_at IS NULL
      AND r.paid_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM checkout_pricing cp
        WHERE cp.registration_id = r.id AND cp.payment_state IN ('processing', 'paid', 'checking'))
    RETURNING rp.id
  `;
  return updated.length > 0 ? { ok: true } : { ok: false, reason: "paid_or_busy" };
}

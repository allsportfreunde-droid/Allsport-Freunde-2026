import { getSQL, isPostgresConfigured } from "./utils";
import type { Discount } from "../price-tiers";

/** Eine offene, unbezahlte Anmeldung, die bei einem frei gewordenen Platz benachrichtigt wird. */
export interface WaitlistRecipient {
  registration_id: number;
  email: string;
  status_token: string;
  persons: Array<{ first_name: string; last_name: string; is_child: boolean; discount: Discount | null }>;
}

/**
 * Wer bekommt die Mail "Ein Platz ist frei – jetzt bezahlen"? Alle offenen,
 * unbezahlten Anmeldungen des Events – egal, ob sie sich vor oder nach dem
 * Ausbuchen eingetragen haben, gesperrt sind sie jetzt alle gleich.
 *
 * Ausgenommen: Anmeldungen, deren Zahlung gerade geprüft wird oder als
 * SEPA-Einzug läuft, und solche mit angebotenem Platz – die können ohnehin
 * schon zahlen und haben ihre eigene Mail bekommen.
 */
export async function getWaitlistRecipients(eventId: number): Promise<WaitlistRecipient[]> {
  if (!isPostgresConfigured()) return [];

  const sql = getSQL();
  const rows = await sql`
    SELECT
      r.id AS registration_id, r.email, r.status_token,
      (SELECT jsonb_agg(jsonb_build_object('first_name', rp.first_name, 'last_name', rp.last_name,
          'is_child', rp.is_child, 'discount', rp.discount) ORDER BY rp.created_at, rp.id)
        FROM registration_persons rp
        WHERE rp.registration_id = r.id AND rp.cancelled_at IS NULL) AS persons
    FROM registrations r
    WHERE r.event_id = ${eventId}
      AND r.status = 'pending'
      AND r.paid_at IS NULL
      AND r.spot_offered_at IS NULL
      AND NULLIF(BTRIM(r.email), '') IS NOT NULL
      AND r.status_token IS NOT NULL
      AND EXISTS (SELECT 1 FROM registration_persons rp
        WHERE rp.registration_id = r.id AND rp.cancelled_at IS NULL)
      AND NOT EXISTS (SELECT 1 FROM checkout_pricing cp
        WHERE cp.registration_id = r.id AND cp.payment_state IN ('processing', 'paid', 'checking'))
    ORDER BY r.created_at ASC
  `;
  return rows as WaitlistRecipient[];
}

/**
 * Offene Stripe-Bezahlfenster unbezahlter, offener Anmeldungen eines Events.
 * Ist das Event voll, werden sie geschlossen – den Platz hat dann schon
 * jemand anderes bezahlt.
 *
 * Ein angebotener Platz bleibt offen: Diese Anmeldung darf trotz vollem Event
 * zahlen. Sonst schlösse jede Belegungsänderung bei vollem Event (etwa eine
 * Stornierung, nach der es voll bleibt) ihr Bezahlfenster mitten im Bezahlen.
 */
export async function getOpenEventCheckouts(
  eventId: number
): Promise<Array<{ session_id: string; registration_id: number }>> {
  if (!isPostgresConfigured()) return [];

  const sql = getSQL();
  const rows = await sql`
    SELECT cp.session_id, cp.registration_id
    FROM checkout_pricing cp
    JOIN registrations r ON r.id = cp.registration_id
    WHERE r.event_id = ${eventId}
      AND r.status = 'pending'
      AND r.paid_at IS NULL
      AND r.spot_offered_at IS NULL
      AND cp.payment_state = 'open'
  `;
  return rows as Array<{ session_id: string; registration_id: number }>;
}

/**
 * Das Team bietet einer offenen, unbezahlten Anmeldung einen Platz an: Sie
 * darf dann bezahlen, auch wenn das Event ausgebucht ist. Gewollte
 * Überbuchung – wer bezahlt, ist dabei. Das Angebot läuft nicht ab.
 *
 * true nur für den Aufruf, der das Angebot gesetzt hat. So verschickt bei zwei
 * Klicks (oder zwei Admins) nur der erste die Mail.
 */
export async function offerSpot(registrationId: number): Promise<boolean> {
  const sql = getSQL();
  const rows = await sql`
    UPDATE registrations SET spot_offered_at = NOW()
    WHERE id = ${registrationId} AND status = 'pending' AND paid_at IS NULL
      AND spot_offered_at IS NULL
    RETURNING id
  `;
  return rows.length > 0;
}

/**
 * Zieht ein Angebot zurück – nur solange keine Zahlung läuft. Wer gerade per
 * SEPA zahlt oder schon bezahlt hat, behält den Platz. Offene Bezahlfenster
 * schließt der Aufrufer.
 *
 * Gibt an, ob ein Angebot zurückgezogen wurde. Läuft eine Zahlung, kommt
 * "payment_running"; gab es kein Angebot (mehr), "not_offered".
 */
export async function withdrawSpotOffer(
  registrationId: number
): Promise<{ ok: true } | { ok: false; reason: "payment_running" | "not_offered" }> {
  const sql = getSQL();
  const rows = await sql`
    WITH target AS (
      SELECT r.id, r.spot_offered_at, r.paid_at,
        EXISTS (SELECT 1 FROM checkout_pricing cp WHERE cp.registration_id = r.id
          AND cp.payment_state IN ('processing', 'paid', 'checking')) AS payment_running
      FROM registrations r WHERE r.id = ${registrationId}
    ), withdrawn AS (
      UPDATE registrations r SET spot_offered_at = NULL
      FROM target t
      WHERE r.id = t.id AND t.spot_offered_at IS NOT NULL AND t.paid_at IS NULL
        AND NOT t.payment_running AND r.status = 'pending'
      RETURNING r.id
    )
    SELECT
      (SELECT COUNT(*) FROM withdrawn)::int AS withdrawn,
      COALESCE((SELECT payment_running OR paid_at IS NOT NULL FROM target), FALSE) AS payment_running
  `;
  const row = rows[0] as { withdrawn: number; payment_running: boolean } | undefined;
  if (row?.withdrawn) return { ok: true };
  return { ok: false, reason: row?.payment_running ? "payment_running" : "not_offered" };
}

/** Event einer Anmeldung – für Stellen, die nur die Anmeldungs-ID kennen. */
export async function getRegistrationEventId(registrationId: number): Promise<number | null> {
  if (!isPostgresConfigured()) return null;
  const sql = getSQL();
  const rows = await sql`SELECT event_id FROM registrations WHERE id = ${registrationId}`;
  return (rows[0] as { event_id: number } | undefined)?.event_id ?? null;
}

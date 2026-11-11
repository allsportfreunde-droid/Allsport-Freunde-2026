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
 * Ausgenommen: offene Ermäßigungsanträge (dürfen noch nicht zahlen und
 * bekommen ohnehin die Entscheidungsmail) und Anmeldungen, deren Zahlung
 * gerade geprüft wird oder als SEPA-Einzug läuft.
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
      AND NULLIF(BTRIM(r.email), '') IS NOT NULL
      AND r.status_token IS NOT NULL
      AND EXISTS (SELECT 1 FROM registration_persons rp
        WHERE rp.registration_id = r.id AND rp.cancelled_at IS NULL)
      AND NOT EXISTS (SELECT 1 FROM discount_requests dr
        JOIN registration_persons rp ON rp.id = dr.person_id
        WHERE dr.registration_id = r.id AND dr.status = 'pending' AND rp.cancelled_at IS NULL)
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
      AND cp.payment_state = 'open'
  `;
  return rows as Array<{ session_id: string; registration_id: number }>;
}

/** Event einer Anmeldung – für Stellen, die nur die Anmeldungs-ID kennen. */
export async function getRegistrationEventId(registrationId: number): Promise<number | null> {
  if (!isPostgresConfigured()) return null;
  const sql = getSQL();
  const rows = await sql`SELECT event_id FROM registrations WHERE id = ${registrationId}`;
  return (rows[0] as { event_id: number } | undefined)?.event_id ?? null;
}

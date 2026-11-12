import { randomUUID } from "node:crypto";
import { getEvent, getOpenEventCheckouts, getWaitlistRecipients, isEventFull } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { expireOpenCheckouts } from "@/lib/checkout-expire";
import { buildWaitlistSpotFreedEmail, sendEmailBatch } from "@/lib/email";
import { calculateTierPrices, formatPersonsPriceLabel } from "@/lib/price-tiers";
import { berlinToday } from "@/lib/review";
import { invalidateCache } from "@/lib/cache";

/**
 * Kapazitätsmodell (siehe auch getApprovedPersonCount):
 * - Plätze belegen nur bestätigte Anmeldungen. Eine offene Anmeldung
 *   reserviert nichts.
 * - Ist das Event voll, kann eine offene Anmeldung nicht bezahlen.
 * - Wird wieder ein Platz frei, bekommen alle offenen, unbezahlten
 *   Anmeldungen eine Mail. Den Platz bekommt, wer zuerst bezahlt.
 *
 * Diese Funktion läuft nach jeder Aktion, die die Belegung ändern kann
 * (Stornierung, Bestätigung, Zahlung, Walk-in, geänderte Kapazität). `wasFull`
 * ist der Stand *vor* der Aktion – nur der Übergang von voll zu frei löst die
 * Mail aus. Wer sich angemeldet hat, solange noch Platz war, hat seinen
 * Bezahllink schon mit der Eingangsmail bekommen.
 *
 * Fehler werden nur geloggt: eine Stornierung oder Zahlung darf daran nie
 * scheitern.
 */
export async function onCapacityChanged(eventId: number, wasFull: boolean): Promise<void> {
  // Die öffentliche Belegungsanzeige soll den neuen Stand sofort zeigen.
  invalidateCache("events:");
  try {
    const full = await isEventFull(eventId);
    if (full) {
      await closeOpenEventCheckouts(eventId);
    } else if (wasFull) {
      await notifyWaitlistSpotFreed(eventId);
    }
  } catch (error) {
    console.error(`Kapazitätsabgleich für Event ${eventId} fehlgeschlagen:`, error);
  }
}

/**
 * Das Event ist voll: Offene Bezahlfenster der übrigen Anmeldungen schließen,
 * damit niemand mehr für einen Platz zahlt, den es nicht mehr gibt. Wer im
 * selben Moment abschließt, ist trotzdem dabei – der Webhook verbucht die
 * Zahlung wie gewohnt (akzeptierte, seltene Überbuchung).
 */
async function closeOpenEventCheckouts(eventId: number): Promise<void> {
  const sessions = await getOpenEventCheckouts(eventId);
  if (sessions.length === 0) return;
  const stripe = getStripe();
  if (!stripe) return;
  await expireOpenCheckouts(stripe, sessions.map(({ session_id }) => session_id));
}

/**
 * Ein Platz ist frei geworden: alle offenen, unbezahlten Anmeldungen
 * benachrichtigen. Nur bei kostenpflichtigen, noch anstehenden Events –
 * bei kostenlosen bestätigt das Team wie bisher von Hand.
 */
async function notifyWaitlistSpotFreed(eventId: number): Promise<void> {
  const event = await getEvent(eventId);
  if (!event || event.status !== "published" || event.date < berlinToday()) return;
  if (!calculateTierPrices(event)) return;

  const recipients = await getWaitlistRecipients(eventId);
  const messages = [];
  for (const recipient of recipients) {
    const priceLabel = formatPersonsPriceLabel(event, recipient.persons);
    const first = recipient.persons[0];
    if (!priceLabel || !first) continue;
    messages.push(await buildWaitlistSpotFreedEmail({
      to: recipient.email,
      firstName: first.first_name,
      lastName: first.last_name,
      eventTitle: event.title,
      eventDate: event.date,
      eventTime: event.time,
      eventLocation: event.location,
      statusToken: recipient.status_token,
      persons: recipient.persons.map((p) => ({ firstName: p.first_name, lastName: p.last_name })),
      priceLabel,
    }));
  }

  const round = randomUUID();
  for (let i = 0; i < messages.length; i += 100) {
    await sendEmailBatch(messages.slice(i, i + 100), `waitlist-spot-freed/${eventId}/${round}/${i}`);
  }
}

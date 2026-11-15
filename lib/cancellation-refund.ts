import {
  announceRefunds, getRefundContext, queueCheckoutRefund, recordRefundResult,
  cancelCheckoutNotification, noteCheckoutRefundFailure, checkoutRefundNotificationId,
} from "@/lib/db";
import { amountFromCents, centsFromAmount } from "@/lib/price";
import { refundSharesCents } from "@/lib/refund";
import { isCancellationOpen } from "@/lib/cancellation";
import { sendRefundDueAdminEmail, sendRegistrationCancelledEmail } from "@/lib/email";
import { stripePaymentUrl } from "@/lib/stripe";
import { issueStripeRefund } from "@/lib/stripe-refund";
import type { RefundContext } from "@/lib/types";

/**
 * Wohin die Erstattungs-Meldung geht. Ohne ADMIN_EMAIL fällt sie auf die
 * Absenderadresse zurück – dieselbe Regel wie bei den Kontaktanfragen.
 */
const ADMIN_EMAIL =
  process.env.ADMIN_EMAIL || process.env.EMAIL_FROM?.match(/<(.+)>/)?.[1] || "";

/**
 * Der eine Weg von einer Stornierung zu Erstattungsbetrag und E-Mail.
 *
 * Drei Stellen stornieren: die Status-Seite (ganze Anmeldung), die
 * Status-Seite (einzelne Person) und der Stornolink aus der E-Mail. Alle drei
 * rufen danach diese Funktion auf, und nur sie verschickt die
 * Stornobestätigung. Dadurch kann keine Stornierung entstehen, in deren
 * E-Mail die Erstattung fehlt – und keine zweite E-Mail ohne sie daneben.
 *
 * Hier entsteht die Zahl – was dem Teilnehmer zusteht, schriftlich zugesagt
 * und an der Person festgehalten – und Stripe zahlt sie sofort zurück. Nur
 * wenn Stripe ablehnt, bekommt das Team eine Mail und erstattet von Hand.
 *
 * Was zu erstatten ist, ergibt sich aus dem, was in der Datenbank steht: alle
 * bezahlten Personen, die storniert sind und für die noch nichts zugesagt
 * wurde. Die Funktion ist damit nachholbar und darf mehrfach laufen; beim
 * zweiten Mal findet sie nichts mehr vor.
 */

/** Angaben für die Stornobestätigung, falls die Datenbank nichts liefert. */
export interface CancellationNotice {
  to: string;
  firstName: string;
  lastName: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  eventLocation: string;
  statusToken: string;
}

export interface RefundOutcome {
  /** Zugesagter Betrag in Euro (0 = nichts zu erstatten) */
  amount: number;
  /** Namen der Personen, deren Anteil zurückgeht */
  persons: string[];
  /** Es bleiben Personen dieser Anmeldung angemeldet */
  partial: boolean;
}

/**
 * Eine fristgerechte Stornierung bleibt erstattungsfähig, auch wenn SEPA erst
 * Tage später erfolgreich wird. Der Admin-Auftrag entsteht zusammen mit der
 * Zusage und wird erst storniert, wenn Stripe die Erstattung angenommen hat.
 */
export async function reconcileCheckoutRefund(registrationId: number, sessionId: string): Promise<void> {
  const context = await getRefundContext(registrationId);
  if (!context?.paid_at || context.stripe_session_id !== sessionId) return;
  const persons = context.pending_persons.filter((person) => {
    if (!person.cancelled_at) return false;
    const cancelled = new Date(person.cancelled_at);
    return isCancellationOpen({ event_date: context.event_date, event_time: context.event_time,
      cancellation_deadline: context.event_cancellation_deadline }, cancelled);
  });
  if (!persons.length) return;
  const shares = refundSharesCents({ amountPaid: context.amount_paid, paidPersons: context.paid_persons,
    announcedCents: context.announced_cents }, persons.map(p => p.id),
    context.active_paid_persons + context.pending_persons.length - persons.length, context.paid_person_prices);
  const claimed = await queueCheckoutRefund(registrationId, sessionId, persons.map((person, i) => ({
    personId: person.id, amount: amountFromCents(shares[i]), name: `${person.first_name} ${person.last_name}`.trim(),
  })));

  const paidFor = claimed.filter((share) => share.amount > 0);
  if (!paidFor.length) return;
  const personIds = paidFor.map((share) => share.personId);
  const result = await issueStripeRefund({
    registrationId,
    paymentIntentId: context.stripe_payment_intent_id,
    personIds,
    cents: paidFor.reduce((sum, share) => sum + centsFromAmount(share.amount), 0),
  });
  await recordRefundResult(personIds, result);
  if (result.ok) await cancelCheckoutNotification(checkoutRefundNotificationId(sessionId));
  else await noteCheckoutRefundFailure(sessionId, result.reason);
}

/**
 * Berechnet die offene Erstattung einer Anmeldung, hält sie fest und
 * verschickt die Stornobestätigung.
 *
 * `fallback` wird nur gebraucht, wenn zur Anmeldung nichts aus der Datenbank
 * kommt – im Entwicklungsmodus ohne Postgres. Dann geht die E-Mail ohne
 * Erstattungsangabe raus, denn dort gibt es auch keine Zahlungen.
 */
export async function refundAndNotifyCancellation(
  registrationId: number,
  fallback?: CancellationNotice
): Promise<RefundOutcome> {
  const context = await getRefundContext(registrationId);
  if (!context) {
    if (fallback) sendRegistrationCancelledEmail(fallback);
    return { amount: 0, persons: [], partial: false };
  }

  const { claimed, ...outcome } = await announceOpenShares(context);

  // Erst zurückzahlen, dann bestätigen: die Mail sagt den Betrag ohnehin zu,
  // aber das Ergebnis entscheidet, ob das Team eingreifen muss.
  const paidFor = claimed.filter(({ cents }) => cents > 0);
  const refund = paidFor.length
    ? await issueStripeRefund({
        registrationId: context.registration_id,
        paymentIntentId: context.stripe_payment_intent_id,
        personIds: paidFor.map(({ id }) => id),
        cents: paidFor.reduce((sum, { cents }) => sum + cents, 0),
      })
    : null;
  if (refund) {
    try {
      await recordRefundResult(paidFor.map(({ id }) => id), refund);
    } catch (error) {
      // Die Stornierung ist gespeichert und das Geld (vielleicht) unterwegs –
      // die Bestätigung darf daran nicht scheitern. Ohne Ergebnis erscheint
      // der Betrag nach 15 Minuten in der Anmeldung als "Zu erstatten".
      console.error(`Erstattungsergebnis für Anmeldung ${context.registration_id} nicht gespeichert:`, error);
    }
  }

  const to = context.email ?? fallback?.to ?? "";
  if (to) {
    sendRegistrationCancelledEmail({
      to,
      firstName: context.first_name || fallback?.firstName || "",
      lastName: fallback?.lastName ?? "",
      eventTitle: context.event_title,
      eventDate: context.event_date,
      eventTime: context.event_time,
      eventLocation: context.event_location,
      statusToken: context.status_token,
      cancelledPersons: outcome.persons,
      remainingPersons: context.active_persons,
      refundAmount: outcome.amount > 0 ? outcome.amount : undefined,
    });
  }

  // Hat Stripe abgelehnt, steht die Zusage beim Teilnehmer, aber das Geld ist
  // nicht unterwegs. Dann muss sie bei uns ankommen – sonst wartet jemand auf
  // Geld, von dem hier niemand weiß.
  if (refund && !refund.ok && ADMIN_EMAIL) {
    sendRefundDueAdminEmail({
      adminEmail: ADMIN_EMAIL,
      eventTitle: context.event_title,
      eventDate: context.event_date,
      participantEmail: context.email ?? "",
      personNames: outcome.persons,
      amount: outcome.amount,
      remainingPersons: context.active_persons,
      stripeUrl: stripePaymentUrl(context.stripe_payment_intent_id),
      statusToken: context.status_token,
      failureReason: refund.reason,
    });
  } else if (refund && !refund.ok) {
    console.warn(
      `Erstattung über ${outcome.amount} € fehlgeschlagen (${refund.reason}), aber ADMIN_EMAIL ist nicht gesetzt (Anmeldung ${context.registration_id}).`
    );
  }

  return outcome;
}

/** Rechnet die Anteile der stornierten Personen aus und sagt sie zu. */
async function announceOpenShares(
  context: RefundContext
): Promise<RefundOutcome & { claimed: Array<{ id: string; cents: number }> }> {
  const partial = context.active_persons > 0;
  const nothing = { amount: 0, persons: [], partial, claimed: [] };

  if (!context.paid_at || context.pending_persons.length === 0) return nothing;

  // Maßgeblich ist die geschützte Stornoentscheidung, nicht der Zeitpunkt,
  // zu dem dieser Nachlauf (oder ein späterer SEPA-Erfolg) verarbeitet wird.
  const persons = context.pending_persons.filter(person => person.cancelled_at && isCancellationOpen({
    event_date: context.event_date, event_time: context.event_time,
    cancellation_deadline: context.event_cancellation_deadline,
  }, new Date(person.cancelled_at)));
  if (!persons.length) return nothing;

  const shares = refundSharesCents(
    {
      amountPaid: context.amount_paid,
      paidPersons: context.paid_persons,
      announcedCents: context.announced_cents,
    },
    persons.map((person) => person.id),
    context.active_paid_persons + context.pending_persons.length - persons.length,
    context.paid_person_prices
  );
  // Auch kostenlose Personen abschließen, damit sie nicht erneut als offen erscheinen.
  if (shares.every((cents) => cents === 0) && context.paid_person_prices == null) return nothing;

  // Erst festhalten, dann zusagen: nur die Personen, die dieser Aufruf für
  // sich verbucht hat, kommen in die E-Mail. Ein Doppelklick auf "stornieren"
  // nennt den Betrag deshalb genau einmal.
  const claimedIds = await announceRefunds(
    persons.map((person, i) => ({
      personId: person.id,
      amount: amountFromCents(shares[i]),
    }))
  );

  const claimed = persons
    .map((person, i) => ({ person, cents: shares[i] }))
    .filter(({ person }) => claimedIds.includes(person.id));
  if (claimed.length === 0) return nothing;

  return {
    amount: amountFromCents(claimed.reduce((sum, { cents: c }) => sum + c, 0)),
    persons: claimed.map(({ person }) => `${person.first_name} ${person.last_name}`.trim()),
    partial,
    claimed: claimed.map(({ person, cents }) => ({ id: person.id, cents })),
  };
}

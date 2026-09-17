import { announceRefunds, getRefundContext, queueCheckoutRefund } from "@/lib/db";
import { amountFromCents } from "@/lib/price";
import { refundSharesCents } from "@/lib/refund";
import { isCancellationOpen } from "@/lib/cancellation";
import { sendRefundDueAdminEmail, sendRegistrationCancelledEmail } from "@/lib/email";
import { stripePaymentUrl } from "@/lib/stripe";
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
 * Zurücküberwiesen wird von Hand im Stripe-Dashboard. Hier entsteht nur die
 * Zahl: was dem Teilnehmer zusteht, schriftlich zugesagt und an der Person
 * festgehalten, damit der Admin sie in der Anmeldung nachlesen kann.
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

/** Eine fristgerechte Stornierung bleibt erstattungsfähig, auch wenn SEPA erst Tage später erfolgreich wird. */
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
  await queueCheckoutRefund(registrationId, sessionId, persons.map((person, i) => ({
    personId: person.id, amount: amountFromCents(shares[i]), name: `${person.first_name} ${person.last_name}`.trim(),
  })));
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

  const outcome = await announceOpenShares(context);

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

  // Die Zusage steht beim Teilnehmer, gezahlt wird sie von Hand. Also muss
  // sie auch bei uns ankommen – sonst wartet jemand auf Geld, von dem hier
  // niemand weiß.
  if (outcome.amount > 0 && ADMIN_EMAIL) {
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
    });
  } else if (outcome.amount > 0) {
    console.warn(
      `Erstattung über ${outcome.amount} € fällig, aber ADMIN_EMAIL ist nicht gesetzt (Anmeldung ${context.registration_id}).`
    );
  }

  return outcome;
}

/** Rechnet die Anteile der stornierten Personen aus und sagt sie zu. */
async function announceOpenShares(context: RefundContext): Promise<RefundOutcome> {
  const partial = context.active_persons > 0;
  const nothing: RefundOutcome = { amount: 0, persons: [], partial };

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
  };
}

import { createHash } from "node:crypto";
import { getStripe } from "@/lib/stripe";

/**
 * Zahlt den zugesagten Anteil einer fristgerechten Stornierung über Stripe
 * zurück – auf demselben Weg, auf dem bezahlt wurde.
 *
 * Wirft nie: die Stornierung ist zu diesem Zeitpunkt bereits gespeichert und
 * der Betrag zugesagt. Lehnt Stripe ab (schon von Hand erstattet, Guthaben zu
 * niedrig, Zahlung angefochten …), erstattet das Team von Hand; dafür kommt
 * der Grund zurück.
 */

export type RefundResult = { ok: true; refundId: string } | { ok: false; reason: string };

export interface RefundRequest {
  registrationId: number;
  paymentIntentId: string | null;
  /** Die Personen, deren Anteil diese Erstattung abdeckt */
  personIds: string[];
  /** Summe der Anteile in Cent */
  cents: number;
}

/**
 * Derselbe Schlüssel für dieselben Personen: ein wiederholter Aufruf (Netz-
 * Retry, Doppelklick) erzeugt bei Stripe keine zweite Erstattung. Gehasht,
 * weil viele UUIDs die Längengrenze von Stripe sprengen würden.
 */
export function refundIdempotencyKey(registrationId: number, personIds: string[]): string {
  const persons = createHash("sha256").update([...personIds].sort().join(",")).digest("hex").slice(0, 40);
  return `cancel-refund:${registrationId}:${persons}`;
}

export async function issueStripeRefund(request: RefundRequest): Promise<RefundResult> {
  const { registrationId, paymentIntentId, personIds, cents } = request;
  if (cents <= 0 || personIds.length === 0) return { ok: false, reason: "Kein Betrag zu erstatten." };

  const stripe = getStripe();
  if (!stripe) return { ok: false, reason: "Stripe ist nicht konfiguriert." };
  if (!paymentIntentId) return { ok: false, reason: "Zu dieser Anmeldung ist keine Stripe-Zahlung hinterlegt." };

  try {
    const refund = await stripe.refunds.create(
      {
        payment_intent: paymentIntentId,
        amount: cents,
        reason: "requested_by_customer",
        metadata: { registration_id: String(registrationId), person_ids: personIds.join(",").slice(0, 500) },
      },
      { idempotencyKey: refundIdempotencyKey(registrationId, personIds) }
    );
    // pending ist der Normalfall bei SEPA: ausgelöst, das Geld ist unterwegs.
    if (refund.status === "failed" || refund.status === "canceled") {
      return { ok: false, reason: `Stripe meldet die Erstattung als ${refund.status === "failed" ? "fehlgeschlagen" : "abgebrochen"}${refund.failure_reason ? ` (${refund.failure_reason})` : ""}.` };
    }
    return { ok: true, refundId: refund.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Automatische Erstattung für Anmeldung ${registrationId} fehlgeschlagen:`, message);
    return { ok: false, reason: message || "Stripe hat die Erstattung abgelehnt." };
  }
}

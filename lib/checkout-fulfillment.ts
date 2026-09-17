import {
  markRegistrationPaid,
  getCheckoutPricing,
  recordCheckoutState,
  approveCheckoutRegistration,
  queueCheckoutFailure,
} from "@/lib/db";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { personPricesTotal } from "@/lib/payment-prices";
import { deliverCheckoutNotifications } from "@/lib/checkout-notifications";
import { reconcileCheckoutRefund } from "@/lib/cancellation-refund";

/**
 * Teilnahme und Zahlung getrennt verarbeiten. true bedeutet ausschließlich bezahlt.
 * Webhook und Rückkehrseite fragen denselben tatsächlichen Stripe-Zustand ab.
 * Auch ein nachgeholter Fehlerabgleich prüft immer den tatsächlichen Stripe-Zustand.
 */
export async function fulfillCheckout(sessionId: string, asyncPaymentFailed = false): Promise<boolean> {
  const stripe = getStripe();
  if (!stripe) {
    console.error("fulfillCheckout: Stripe ist nicht konfiguriert.");
    return false;
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["payment_intent.payment_method", "payment_intent.latest_charge"],
  });

  // Kostenlose und nicht abgeschlossene Checkouts bestätigen keine Teilnahme.
  if (session.status !== "complete" || session.mode !== "payment" ||
      session.currency !== "eur" || !session.amount_total || session.amount_total < 0 ||
      session.payment_status === "no_payment_required") return false;

  const intent = typeof session.payment_intent === "object" ? session.payment_intent : null;
  const paid = session.payment_status === "paid";
  const sepa = isSepaDebit(intent);
  const processing = !paid && sepa && intent?.status === "processing";
  const failed = !paid && sepa && asyncPaymentFailed && intent?.status === "requires_payment_method";
  if (!paid && !processing && !failed) return false;

  const registrationId = Number(
    session.client_reference_id ?? session.metadata?.registration_id
  );
  if (!Number.isSafeInteger(registrationId) || registrationId <= 0) {
    console.error("fulfillCheckout: keine Anmeldung in der Session", sessionId);
    return false;
  }

  const personPrices = await getCheckoutPricing(sessionId, registrationId);
  if (session.metadata?.pricing_version === "1" && !personPrices) {
    throw new Error(`Preisaufteilung fehlt für Checkout ${sessionId}.`);
  }
  if (personPrices && (session.currency !== "eur" || personPricesTotal(personPrices) !== session.amount_total)) {
    throw new Error(`Zahlungsbetrag passt nicht zur Preisaufteilung für Checkout ${sessionId}.`);
  }
  const amount = (session.amount_total ?? 0) / 100;
  // payment_intent ist je nach Abruf eine ID oder das ausgeklappte Objekt.
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;
  // Shares the registration row lock with cancellation. Cancellation also reads
  // checkout 'paid', so the gap before paid_at is written cannot reopen it.
  const state = await recordCheckoutState(sessionId, registrationId,
    paid ? "paid" : processing ? "processing" : "failed", paymentIntentId);
  if (paid) {
    await markRegistrationPaid(registrationId, sessionId, amount, paymentIntentId, personPrices);
    await approveCheckoutRegistration(registrationId, sessionId);
    await reconcileCheckoutRefund(registrationId, sessionId);
  } else if (processing && state === "processing") {
    await approveCheckoutRegistration(registrationId, sessionId);
  } else if (failed && state === "failed") {
    await queueCheckoutFailure(registrationId, sessionId,
      intent?.last_payment_error?.message ?? "Stripe meldet einen fehlgeschlagenen SEPA-Einzug.", amount, paymentIntentId);
  }
  // Auch nach bereits verbuchter Zahlung ausstehende Versandaufträge nachholen.
  await deliverCheckoutNotifications(registrationId);
  return paid;
}

export function isSepaDebit(intent: Stripe.PaymentIntent | null): boolean {
  if (!intent) return false;
  const method = typeof intent.payment_method === "object" ? intent.payment_method : null;
  const charge = typeof intent.latest_charge === "object" ? intent.latest_charge : null;
  // Die Liste payment_method_types beschreibt nur erlaubte Verfahren, nicht das verwendete.
  if (method) return method.type === "sepa_debit";
  if (charge?.payment_method_details) return charge.payment_method_details.type === "sepa_debit";
  return intent.status === "requires_payment_method" && intent.last_payment_error?.payment_method?.type === "sepa_debit";
}

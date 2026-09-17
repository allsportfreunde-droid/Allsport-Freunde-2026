import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { fulfillCheckout, isSepaDebit } from "@/lib/checkout-fulfillment";
import { getRegistrationCheckouts, recordCheckoutState, hasCheckoutCreation } from "@/lib/db";
import type { CheckoutPaymentState, SavedCheckout } from "@/lib/db/checkout";
import { personPricesTotal } from "@/lib/payment-prices";

export class CheckoutBlockedError extends Error {
  constructor(message: string, public readonly paymentState: CheckoutPaymentState = "checking") { super(message); }
}

export function assertCheckoutOwner(session: Stripe.Checkout.Session, registrationId: number) {
  const references = [session.client_reference_id, session.metadata?.registration_id].filter(value => value != null);
  if (!references.length || references.some(value => Number(value) !== registrationId) || session.mode !== "payment") {
    throw new Error("Checkout gehört nicht zu dieser Anmeldung.");
  }
}

export function stripeCheckoutState(session: Stripe.Checkout.Session): CheckoutPaymentState {
  if (session.payment_status === "paid") return "paid";
  const intent = typeof session.payment_intent === "object" ? session.payment_intent : null;
  if (session.status === "complete" && intent?.status === "processing" && isSepaDebit(intent)) return "processing";
  if (intent && ["processing", "succeeded", "requires_capture"].includes(intent.status)) return "checking";
  if (session.status === "expired") return "open";
  if (session.status === "open") return "open";
  if (session.status === "complete" && intent?.status === "requires_payment_method" && isSepaDebit(intent)) return "failed";
  return "checking";
}

export async function retrieveRegistrationCheckout(stripe: Stripe, sessionId: string, registrationId: number) {
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["payment_intent.payment_method", "payment_intent.latest_charge"],
  });
  assertCheckoutOwner(session, registrationId);
  return session;
}

async function synchronizeSession(session: Stripe.Checkout.Session, registrationId: number) {
  const state = stripeCheckoutState(session);
  if (state === "paid" || state === "processing" || state === "failed") {
    await fulfillCheckout(session.id, state === "failed");
  } else if (state === "checking") {
    const intentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
    await recordCheckoutState(session.id, registrationId, "checking", intentId);
  }
  return state;
}

/** Rückkehr und Neuladen funktionieren auch ohne URL-Parameter und ohne bereits zugestellten Webhook. */
export async function synchronizeRegistrationCheckouts(registrationId: number, requestedSessionId?: string) {
  const saved = await getRegistrationCheckouts(registrationId);
  const ids = new Set(saved.map(session => session.session_id));
  if (requestedSessionId) ids.add(requestedSessionId);
  if (!ids.size) return;
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe-Abgleich ist derzeit nicht verfügbar.");
  // Zuerst die angegebene Session prüfen: ein fremder Rückkehrlink darf keine Anmeldung auslösen.
  if (requestedSessionId) {
    await retrieveRegistrationCheckout(stripe, requestedSessionId, registrationId);
  }
  for (const id of ids) {
    await synchronizeSession(await retrieveRegistrationCheckout(stripe, id, registrationId), registrationId);
  }
}

export function checkoutDisplayState(paidAt: string | null, saved: SavedCheckout[], creationPending = false) {
  if (paidAt) return { payment_state: "paid" as const, checkout_amount: null };
  const processing = saved.filter(session => session.payment_state === "processing");
  if (processing.length) return {
    payment_state: "processing" as const,
    checkout_amount: processing.every(session => session.person_prices != null)
      ? processing.reduce((total, session) => total + personPricesTotal(session.person_prices!), 0) / 100 : null,
  };
  if (creationPending || saved.some(session => session.payment_state === "paid" || session.payment_state === "checking")) {
    return { payment_state: "checking" as const, checkout_amount: null };
  }
  return { payment_state: saved[0]?.payment_state === "failed" ? "failed" as const : "open" as const, checkout_amount: null };
}

export async function getCheckoutDisplay(registrationId: number, paidAt: string | null) {
  const [saved, creationPending] = await Promise.all([
    getRegistrationCheckouts(registrationId), hasCheckoutCreation(registrationId),
  ]);
  return checkoutDisplayState(paidAt, saved, creationPending);
}

/** Alte offene Links schließen. Gewinnt gleichzeitig die Zahlung, wird kein neuer Checkout eröffnet. */
export async function closePreviousCheckouts(stripe: Stripe, registrationId: number, sessionIds: Iterable<string>) {
  let blocked: CheckoutBlockedError | null = null;
  for (const id of sessionIds) {
    let session = await retrieveRegistrationCheckout(stripe, id, registrationId);
    if (session.status === "open" && stripeCheckoutState(session) === "open") {
      try {
        session = await stripe.checkout.sessions.expire(id);
        assertCheckoutOwner(session, registrationId);
        if (session.status !== "expired") throw new Error("Alter Zahlungslink wurde nicht geschlossen.");
      } catch {
        session = await retrieveRegistrationCheckout(stripe, id, registrationId);
        if (session.status === "open") throw new CheckoutBlockedError("Ein vorhandener Zahlungslink konnte noch nicht geschlossen werden. Bitte erneut versuchen.");
      }
    }
    const state = await synchronizeSession(session, registrationId);
    if (state === "paid") blocked = new CheckoutBlockedError("Diese Anmeldung wurde bereits bezahlt.", "paid");
    else if (state === "processing" && blocked?.paymentState !== "paid") {
      blocked = new CheckoutBlockedError("Der SEPA-Einzug läuft bereits. Bitte nicht erneut bezahlen.", "processing");
    } else if (state === "checking" && !blocked) {
      blocked = new CheckoutBlockedError("Eine Zahlung wird noch geprüft. Ein weiterer Checkout ist derzeit nicht möglich.");
    }
  }
  if (blocked) throw blocked;
}

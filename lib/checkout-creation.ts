import type Stripe from "stripe";
import type { CheckoutInfo } from "@/lib/types";
import type { CheckoutCreation } from "@/lib/db/checkout-creation";
import { getRegistrationCheckouts, saveCheckoutPricing, claimCheckoutRecovery, releaseCheckoutCreation } from "@/lib/db";
import { randomUUID } from "node:crypto";
import { personPricesTotal } from "@/lib/payment-prices";
import { assertCheckoutOwner, CheckoutBlockedError, retrieveRegistrationCheckout } from "@/lib/checkout-status";

/** Auch Alt-Sessions vor Einführung von checkout_pricing berücksichtigen. Die Stripe-Liste wird vollständig paginiert. */
export async function discoverRegistrationCheckouts(stripe: Stripe, info: CheckoutInfo) {
  const sessions = new Map<string, Stripe.Checkout.Session | null>(
    (await getRegistrationCheckouts(info.registration_id)).map(session => [session.session_id, null]),
  );
  for await (const session of stripe.checkout.sessions.list({
    limit: 100,
    // Zeitpuffer für alte Zeitstempel ohne Zeitzone; gespeicherte IDs werden ohnehin immer geprüft.
    ...(info.registration_created_unix != null ? { created: { gte: Math.max(0, Math.floor(info.registration_created_unix) - 86400) } } : {}),
  })) {
    if (Number(session.client_reference_id ?? session.metadata?.registration_id) === info.registration_id) {
      assertCheckoutOwner(session, info.registration_id);
      sessions.set(session.id, session);
    }
  }
  return sessions;
}

/** Nach unklarer Stripe-Antwort zuerst denselben Vorgang wiederfinden/wiederholen, niemals blind neu anlegen. */
export async function recoverCheckoutCreation(stripe: Stripe, info: CheckoutInfo, request: CheckoutCreation,
  sessions: Map<string, Stripe.Checkout.Session | null>) {
  if (!request.request_params) return;
  if (!request.person_prices) throw new CheckoutBlockedError("Ein vorheriger Zahlungsvorgang muss vom Team geprüft werden.");
  const known = [...sessions.values()].find(session => session?.metadata?.checkout_request_id === request.request_key);
  let session;
  if (known) {
    session = await retrieveRegistrationCheckout(stripe, known.id, info.registration_id);
  } else {
    if (!request.request_started_at || Date.now() - new Date(request.request_started_at).getTime() >= 23 * 3600000) {
      throw new CheckoutBlockedError("Der Ausgang eines früheren Zahlungsvorgangs ist unklar. Bitte kontaktiere das Team.");
    }
    session = await stripe.checkout.sessions.create(request.request_params, { idempotencyKey: request.request_key });
    assertCheckoutOwner(session, info.registration_id);
  }
  if (session.amount_total !== personPricesTotal(request.person_prices) || session.currency !== "eur") {
    throw new CheckoutBlockedError("Der vorherige Zahlungsvorgang muss vom Team geprüft werden.");
  }
  await saveCheckoutPricing(session.id, info.registration_id, request.person_prices);
  sessions.set(session.id, session);
}

export async function recoverAbandonedCheckout(stripe: Stripe, info: CheckoutInfo) {
  const owner = randomUUID();
  const request = await claimCheckoutRecovery(info.registration_id, owner);
  if (!request) return;
  // Bei unklarem Ausgang stehen lassen, damit niemals ein neuer Schlüssel blind verwendet wird.
  if (request.request_params) {
    const sessions = await discoverRegistrationCheckouts(stripe, info);
    await recoverCheckoutCreation(stripe, info, request, sessions);
  }
  await releaseCheckoutCreation(info.registration_id, owner);
}

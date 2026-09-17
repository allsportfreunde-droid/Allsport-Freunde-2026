import Stripe from "stripe";

/**
 * Der Stripe-Client. Gibt null zurück, wenn kein Schlüssel konfiguriert ist –
 * was das für einen Endpunkt bedeutet, entscheidet der Aufrufer selbst.
 *
 * Der Schlüssel darf ausschließlich serverseitig gelesen werden. Er heißt
 * bewusst nicht NEXT_PUBLIC_*, damit Next ihn niemals ins Bundle schreibt.
 */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  return key ? new Stripe(key) : null;
}

/**
 * Link zur Zahlung im Stripe-Dashboard.
 *
 * Test- und Live-Modus sind im Dashboard getrennte Welten mit eigenen URLs;
 * der Modus steckt im Schlüssel. Deshalb entsteht der Link hier auf dem
 * Server und nicht im Browser – dort ist der Schlüssel zu Recht unbekannt.
 */
export function stripePaymentUrl(paymentIntentId: string | null): string | null {
  if (!paymentIntentId) return null;
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  const prefix = key.startsWith("sk_live") ? "" : "test/";
  return `https://dashboard.stripe.com/${prefix}payments/${paymentIntentId}`;
}
import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { fulfillCheckout } from "@/lib/checkout-fulfillment";

/**
 * Stripes Meldung, dass bezahlt wurde – der verbindliche Kanal.
 *
 * Auf die Rückleitung im Browser ist kein Verlass: der Kunde kann erfolgreich
 * bezahlen und danach die Verbindung verlieren. Nur was hier ankommt, zählt.
 */
export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !secret) {
    console.error("Stripe-Webhook: Schlüssel fehlt.");
    return NextResponse.json({ error: "Nicht konfiguriert." }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Keine Signatur." }, { status: 400 });
  }

  // Der rohe Text, nicht request.json(): die Signatur wird über genau diese
  // Bytes gerechnet. Jedes Umformatieren lässt die Prüfung scheitern.
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (error) {
    // Ohne diese Prüfung könnte jeder per curl eine Zahlung behaupten.
    const message = error instanceof Error ? error.message : "unbekannt";
    console.error("Stripe-Webhook: Signaturprüfung fehlgeschlagen:", message);
    return NextResponse.json({ error: "Ungültige Signatur." }, { status: 400 });
  }

  try {
    switch (event.type) {
      // Checkout-Abschluss kann bei SEPA zunächst einen laufenden Einzug bedeuten.
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        await fulfillCheckout(session.id);
        break;
      }
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await fulfillCheckout(session.id, true);
        break;
      }
    }
  } catch (error) {
    // 5xx lässt Stripe erneut zustellen – das ist hier erwünscht, denn die
    // Verbuchung ist gegen Mehrfachausführung abgesichert.
    console.error("Stripe-Webhook: Verarbeitung fehlgeschlagen:", error);
    return NextResponse.json({ error: "Verarbeitung fehlgeschlagen." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

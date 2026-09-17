import { getCheckoutInfo, saveCheckoutPricing, claimCheckoutCreation, stageCheckoutCreation, releaseCheckoutCreation } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/ratelimit";
import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { calculateRegistrationPrice } from "@/lib/price";
import { createPersonPrices, personPricesTotal } from "@/lib/payment-prices";
import { randomUUID } from "node:crypto";
import { CheckoutBlockedError, closePreviousCheckouts } from "@/lib/checkout-status";
import { discoverRegistrationCheckouts, recoverCheckoutCreation } from "@/lib/checkout-creation";

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/**
 * Startet eine Stripe-Zahlung für eine bestehende Anmeldung.
 *
 * Aus dem Browser kommt ausschließlich der status_token. Betrag und
 * Personenanzahl entstehen hier aus der Datenbank – käme der Preis vom
 * Client, könnte jeder bezahlen, was er möchte.
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  if (!checkRateLimit(ip, RATE_LIMITS.checkout)) {
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte warte einige Minuten." },
      { status: 429 }
    );
  }

  let lockedRegistrationId: number | null = null;
  const owner = randomUUID();
  let safeToRelease = false;
  try {
    const body = await request.json();
    const token = typeof body.status_token === "string" ? body.status_token.trim() : "";
    if (!token) {
      return NextResponse.json({ error: "Keine Anmeldung angegeben." }, { status: 400 });
    }

    let info = await getCheckoutInfo(token);
    if (!info) {
      return NextResponse.json({ error: "Anmeldung nicht gefunden." }, { status: 404 });
    }
    if (info.status === "cancelled" || info.status === "rejected") {
      return NextResponse.json(
        { error: "Diese Anmeldung ist nicht mehr aktiv." },
        { status: 409 }
      );
    }
    // Wer keinen Platz hat, darf auch nicht zahlen – sonst kassieren wir für
    // etwas, das es noch nicht gibt. Der Button wird ohnehin nicht angezeigt;
    // diese Prüfung gilt dem direkten Aufruf der Route.
    if (info.is_waitlist) {
      return NextResponse.json(
        { error: "Für Wartelisten-Anmeldungen ist noch keine Zahlung möglich." },
        { status: 409 }
      );
    }
    if (info.paid_at) {
      return NextResponse.json({ error: "Diese Anmeldung wurde bereits bezahlt." }, { status: 409 });
    }
    if (info.person_count < 1) {
      return NextResponse.json(
        { error: "Für diese Anmeldung ist keine Person mehr eingetragen." },
        { status: 409 }
      );
    }
    let pricing = calculateRegistrationPrice(info, info.person_count, info.child_count);
    if (!pricing || pricing.totalCents === 0) {
      return NextResponse.json(
        { error: "Für diese Anmeldung ist keine Zahlung erforderlich. Die Bestätigung erfolgt durch das Team." },
        { status: 409 }
      );
    }

    const stripe = getStripe();
    if (!stripe) {
      return NextResponse.json(
        { error: "Zahlungen sind derzeit nicht verfügbar." },
        { status: 503 }
      );
    }

    const creation = await claimCheckoutCreation(info.registration_id, owner);
    if (!creation) throw new CheckoutBlockedError("Ein Zahlungsvorgang wird bereits vorbereitet. Bitte kurz warten und erneut versuchen.");
    lockedRegistrationId = info.registration_id;
    safeToRelease = creation.request_params == null;
    const sessions = await discoverRegistrationCheckouts(stripe, info);
    await recoverCheckoutCreation(stripe, info, creation, sessions);
    safeToRelease = true;
    await closePreviousCheckouts(stripe, info.registration_id, sessions.keys());

    // Nach dem Abgleich erneut lesen: Webhook, Stornierung oder Preisänderung können inzwischen erfolgt sein.
    info = await getCheckoutInfo(token);
    if (!info || info.registration_id !== lockedRegistrationId || info.status === "cancelled" || info.status === "rejected" || info.is_waitlist) {
      throw new CheckoutBlockedError("Diese Anmeldung kann derzeit nicht bezahlt werden.", "open");
    }
    if (info.paid_at) throw new CheckoutBlockedError("Diese Anmeldung wurde bereits bezahlt.", "paid");
    pricing = calculateRegistrationPrice(info, info.person_count, info.child_count);
    if (!pricing || pricing.totalCents === 0) {
      throw new CheckoutBlockedError("Für diese Anmeldung ist keine Zahlung erforderlich. Die Bestätigung erfolgt durch das Team.", "open");
    }

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
    const addItem = (quantity: number, unitAmount: number, priceId: string | null, label: string) => {
      if (quantity === 0) return;
      lineItems.push(priceId ? { price: priceId, quantity } : {
          price_data: {
            currency: "eur",
            unit_amount: unitAmount,
            product_data: { name: `${info.event_title} – ${label}` },
          },
          quantity,
        });
    };
    if (info.child_entry_price == null) {
      addItem(info.person_count, pricing.adultUnitCents, info.stripe_price_id, "Eintritt");
    } else {
      addItem(pricing.adultCount, pricing.adultUnitCents, info.stripe_price_id, "Erwachsene");
      addItem(pricing.childCount, pricing.childUnitCents, info.stripe_child_price_id, "Kinder");
    }

    const personPrices = createPersonPrices(info.persons, pricing.adultUnitCents, pricing.childUnitCents);
    if (info.persons.length !== info.person_count || personPricesTotal(personPrices) !== pricing.totalCents) {
      throw new Error("Personen und Checkout-Summe stimmen nicht überein.");
    }
    const statusUrl = `${appUrl}/status/${encodeURIComponent(token)}`;
    const params: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      line_items: lineItems,
      // Beides für die spätere Zuordnung im Webhook.
      client_reference_id: String(info.registration_id),
      metadata: {
        registration_id: String(info.registration_id),
        event_id: String(info.event_id),
        pricing_version: "1",
        checkout_request_id: owner,
      },
      customer_email: info.email ?? undefined,
      // Der Zahlungsbeleg von Stripe hängt sonst an einem Schalter im
      // Dashboard ("Customer emails → Successful payments"), den niemand mehr
      // auf dem Schirm hat. Mit receipt_email schickt Stripe ihn unabhängig
      // davon. Im Testmodus verschickt Stripe grundsätzlich keine E-Mails –
      // dort bleibt der Beleg aus, und das ist kein Fehler.
      payment_intent_data: info.email ? { receipt_email: info.email } : undefined,
      locale: "de",
      submit_type: "pay",
      // {CHECKOUT_SESSION_ID} ersetzt Stripe beim Weiterleiten – damit kann
      // die Status-Seite die Zahlung sofort verbuchen, ohne auf den Webhook
      // zu warten.
      success_url: `${statusUrl}?zahlung=erfolg&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${statusUrl}?zahlung=abbruch`,
    };
    // Den vollständigen unveränderlichen Request sichern, bevor die Netzwerkantwort unklar werden kann.
    safeToRelease = false;
    await stageCheckoutCreation(info.registration_id, owner, params, personPrices);
    let session;
    try {
      session = await stripe.checkout.sessions.create(params, { idempotencyKey: owner });
    } catch (error) {
      // Validierungsfehler erzeugen keine Session; Netzwerkfehler/5xx behalten den Wiederaufnahmestand.
      if (error instanceof Error && "type" in error && error.type === "StripeInvalidRequestError" &&
          "statusCode" in error && error.statusCode === 400) safeToRelease = true;
      throw error;
    }

    if (!session.url) {
      return NextResponse.json(
        { error: "Zahlung konnte nicht gestartet werden." },
        { status: 502 }
      );
    }

    if (session.amount_total !== pricing.totalCents || session.currency !== "eur") {
      await stripe.checkout.sessions.expire(session.id);
      safeToRelease = true;
      throw new Error("Stripe-Preis und hinterlegter Eventpreis stimmen nicht überein.");
    }
    // Erst wenn die Aufteilung gespeichert ist, erhält der Gast den Zahlungslink.
    await saveCheckoutPricing(session.id, info.registration_id, personPrices);

    if (!await releaseCheckoutCreation(info.registration_id, owner)) {
      throw new CheckoutBlockedError("Der Zahlungsvorgang wurde zwischenzeitlich aktualisiert. Bitte lade die Statusseite erneut.");
    }
    lockedRegistrationId = null;

    return NextResponse.json({ url: session.url });
  } catch (error) {
    if (error instanceof CheckoutBlockedError) {
      return NextResponse.json({ error: error.message, payment_state: error.paymentState }, { status: 409 });
    }
    console.error("Fehler beim Starten der Zahlung:", error);
    return NextResponse.json(
      { error: "Zahlung konnte nicht gestartet werden." },
      { status: 500 }
    );
  } finally {
    if (lockedRegistrationId != null && safeToRelease) {
      await releaseCheckoutCreation(lockedRegistrationId, owner).catch(error => {
        console.error("Checkout-Anlagesperre konnte nicht freigegeben werden:", error);
      });
    }
  }
}

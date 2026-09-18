import { NextRequest, NextResponse } from "next/server";
import { getCheckoutInfo } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { synchronizeRegistrationCheckouts } from "@/lib/checkout-status";
import { recoverAbandonedCheckout } from "@/lib/checkout-creation";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/ratelimit";

/**
 * Verbucht eine Zahlung sofort, wenn der Kunde von Stripe zurückkommt – damit
 * er nicht auf den Webhook warten muss.
 *
 * Status-Token und Session müssen zu derselben Anmeldung gehören.
 * Ohne Session-ID werden die bereits gespeicherten Checkouts abgeglichen.
 */
export async function POST(request: NextRequest) {
  if (!checkRateLimit(getClientIp(request.headers), RATE_LIMITS.checkoutStatus)) {
    return NextResponse.json({ error: "Bitte warte kurz vor der nächsten Zahlungsprüfung." }, { status: 429 });
  }
  try {
    const body = await request.json();
    const sessionId = typeof body.session_id === "string" ? body.session_id.trim() : "";
    const token = typeof body.status_token === "string" ? body.status_token.trim() : "";
    if (!token || (sessionId && !sessionId.startsWith("cs_"))) {
      return NextResponse.json({ error: "Ungültige Session." }, { status: 400 });
    }

    const info = await getCheckoutInfo(token);
    if (!info) return NextResponse.json({ error: "Anmeldung nicht gefunden." }, { status: 404 });
    const stripe = getStripe();
    if (stripe) await recoverAbandonedCheckout(stripe, info);
    await synchronizeRegistrationCheckouts(info.registration_id, sessionId || undefined);
    return NextResponse.json({ synchronized: true });
  } catch (error) {
    console.error("Fehler beim Verbuchen der Zahlung:", error);
    return NextResponse.json({ error: "Der Zahlungsstatus konnte noch nicht vollständig geprüft werden." }, { status: 503 });
  }
}

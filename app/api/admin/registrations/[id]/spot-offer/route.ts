import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getEvent,
  getRegistrationByToken,
  getRegistrationCheckouts,
  getRegistrationWithEvent,
  isPostgresConfigured,
  logAudit,
  offerSpot,
  withdrawSpotOffer,
} from "@/lib/db";
import { sendWaitlistSpotOfferedEmail } from "@/lib/email";
import { calculateTierPrices, formatPersonsPriceLabel } from "@/lib/price-tiers";
import { getStripe } from "@/lib/stripe";
import { expireOpenCheckouts } from "@/lib/checkout-expire";

const headers = { "Cache-Control": "no-store" };

type Params = { params: Promise<{ id: string }> };

type Authorized =
  | { ok: false; response: NextResponse }
  | { ok: true; adminEmail: string | null; registrationId: number };

/** Gemeinsamer Auftakt: angemeldeter Admin, Datenbank, gültige ID. */
async function authorize(params: Params["params"]): Promise<Authorized> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: "Nicht autorisiert." }, { status: 401, headers }) };
  if (!isPostgresConfigured()) {
    return { ok: false, response: NextResponse.json({ error: "Platz anbieten benötigt eine Datenbank (POSTGRES_URL)." }, { status: 503, headers }) };
  }
  const registrationId = Number((await params).id);
  if (!Number.isInteger(registrationId) || registrationId <= 0) {
    return { ok: false, response: NextResponse.json({ error: "Ungültige ID." }, { status: 400, headers }) };
  }
  return { ok: true, adminEmail: user.email ?? null, registrationId };
}

const conflict = (error: string) => NextResponse.json({ error }, { status: 409, headers });

/**
 * Bietet einer offenen Anmeldung einen Platz an: Sie darf bezahlen, auch wenn
 * das Event ausgebucht ist (gewollte Überbuchung). Verbindlich wird der Platz
 * erst mit der Zahlung – die bestätigt die Anmeldung wie gewohnt.
 *
 * Bei kostenlosen Events gibt es nichts zu bezahlen; dort bestätigt das Team
 * direkt. Nur der Aufruf, der das Angebot setzt, verschickt die Mail.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  const auth = await authorize(params);
  if (!auth.ok) return auth.response;
  const { adminEmail, registrationId } = auth;

  try {
    const registration = await getRegistrationWithEvent(registrationId);
    const info = registration ? await getRegistrationByToken(registration.status_token) : null;
    if (!registration || !info) {
      return NextResponse.json({ error: "Anmeldung nicht gefunden." }, { status: 404, headers });
    }
    if (info.status !== "pending") return conflict("Nur offenen Anmeldungen lässt sich ein Platz anbieten.");
    if (info.paid_at || info.payment_in_progress) return conflict("Diese Anmeldung ist bereits bezahlt oder eine Zahlung läuft.");

    const pricing = {
      price: info.event_price,
      entry_price: info.event_entry_price,
      child_entry_price: info.event_child_entry_price,
      child_price: info.event_child_price,
    };
    if (!calculateTierPrices(pricing)) {
      return conflict("Für dieses Event gibt es nichts zu bezahlen – bitte die Anmeldung direkt bestätigen.");
    }
    const email = info.email?.trim();
    if (!email) return conflict("Für diese Anmeldung ist keine E-Mail hinterlegt – bitte direkt bestätigen.");

    const offered = await offerSpot(registrationId);
    if (offered) {
      await logAudit(adminEmail, "OFFER_SPOT", "REGISTRATION", registrationId);

      const event = await getEvent(info.event_id);
      const persons = info.persons.filter((p) => !p.cancelled_at);
      if (event && persons.length > 0) {
        // Derselbe Betrag wie auf der Statusseite und im Checkout – je Person,
        // mit Ermäßigungen.
        const priceLabel = formatPersonsPriceLabel(pricing, persons) ?? undefined;
        // Fire-and-forget: das Angebot steht, auch wenn die Mail hängt – die
        // Statusseite zeigt den Bezahlbutton ohnehin.
        sendWaitlistSpotOfferedEmail({
          to: email,
          firstName: persons[0].first_name,
          lastName: persons[0].last_name,
          eventTitle: event.title,
          eventDate: event.date,
          eventTime: event.time,
          eventLocation: event.location,
          statusToken: registration.status_token,
          persons: persons.map((p) => ({ firstName: p.first_name, lastName: p.last_name })),
          priceLabel,
        });
      }
    }

    return NextResponse.json({ offered }, { headers });
  } catch (error) {
    console.error(`[admin/registrations/${registrationId}/spot-offer] POST error:`, error);
    return NextResponse.json({ error: "Ein Fehler ist aufgetreten." }, { status: 500, headers });
  }
}

/**
 * Zieht ein Angebot zurück, solange keine Zahlung läuft. Ein offener
 * Zahlungslink wird geschlossen; die Person steht wieder auf der Warteliste.
 * Es geht keine Mail raus.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await authorize(params);
  if (!auth.ok) return auth.response;
  const { adminEmail, registrationId } = auth;

  try {
    const result = await withdrawSpotOffer(registrationId);
    if (!result.ok) {
      return conflict(result.reason === "payment_running"
        ? "Die Anmeldung ist bereits bezahlt oder eine Zahlung läuft – das Angebot bleibt bestehen."
        : "Für diese Anmeldung besteht kein Angebot (mehr).");
    }
    await logAudit(adminEmail, "WITHDRAW_SPOT_OFFER", "REGISTRATION", registrationId);

    const stripe = getStripe();
    if (stripe) {
      const open = (await getRegistrationCheckouts(registrationId))
        .filter((checkout) => checkout.payment_state === "open")
        .map((checkout) => checkout.session_id);
      await expireOpenCheckouts(stripe, open);
    }

    return NextResponse.json({ withdrawn: true }, { headers });
  } catch (error) {
    console.error(`[admin/registrations/${registrationId}/spot-offer] DELETE error:`, error);
    return NextResponse.json({ error: "Ein Fehler ist aufgetreten." }, { status: 500, headers });
  }
}

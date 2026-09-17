import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getCheckoutInfo,
  getEvent,
  getRegistrationWithEvent,
  offerWaitlistSpot,
} from "@/lib/db";
import { sendWaitlistSpotOfferedEmail } from "@/lib/email";
import { formatPriceLabel } from "@/lib/price";

/**
 * Bietet einer Wartelisten-Anmeldung einen frei gewordenen Platz an.
 *
 * Bewusst getrennt vom Bestätigen: hier wird nur das Wartelisten-Flag
 * entfernt, die Anmeldung bleibt 'pending'. Verbindlich wird der Platz erst
 * mit der Zahlung. Wer direkt bestätigen will – etwa bei Barzahlung an der
 * Tür – nimmt weiterhin /api/checkin/waitlist.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  try {
    const { registrationId } = (await request.json()) as { registrationId?: number };

    if (!registrationId || typeof registrationId !== "number") {
      return NextResponse.json({ error: "registrationId fehlt." }, { status: 400 });
    }

    const registration = await getRegistrationWithEvent(registrationId);
    if (!registration) {
      return NextResponse.json({ error: "Anmeldung nicht gefunden." }, { status: 404 });
    }
    if (registration.status !== "pending") {
      return NextResponse.json(
        { error: "Diese Anmeldung steht nicht mehr auf der Warteliste." },
        { status: 409 }
      );
    }

    // Nur der Aufruf, der das Flag tatsächlich entfernt, verschickt die Mail –
    // zwei Klicks (oder zwei Admins) mailen so nie doppelt.
    const offered = await offerWaitlistSpot(registrationId);

    if (offered && registration.email) {
      const event = await getEvent(registration.event_id);
      if (event) {
        // Betrag wie auf der Status-Seite: nur wenn der Anzeigetext ein reiner
        // Betrag ist, wird eine Summe genannt. Siehe lib/price.ts.
        const checkout = await getCheckoutInfo(registration.status_token);
        const priceLabel =
          formatPriceLabel(
            checkout?.entry_price,
            checkout?.person_count ?? 0,
            event.price,
            checkout?.child_entry_price,
            checkout?.child_count ?? 0
          ) ?? undefined;

        // Fire-and-forget email
        sendWaitlistSpotOfferedEmail({
          to: registration.email,
          firstName: registration.first_name,
          lastName: registration.last_name,
          eventTitle: event.title,
          eventDate: event.date,
          eventTime: event.time,
          eventLocation: event.location,
          statusToken: registration.status_token,
          priceLabel,
        });
      }
    }

    return NextResponse.json({ success: true, offered });
  } catch (error) {
    console.error("Fehler beim Anbieten des Platzes:", error);
    return NextResponse.json({ error: "Ein Fehler ist aufgetreten." }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRegistrationDetail, moveToWaitlist } from "@/lib/db";
import { sendWaitlistMovedEmail } from "@/lib/email";

/**
 * Setzt eine offene, unbezahlte Anmeldung zurück auf die Warteliste.
 *
 * Gedacht für Anmeldungen, die nicht online zahlen und den Platz sonst
 * blockieren: das Event wirkt öffentlich ausgebucht, obwohl der Platz nie
 * bezahlt wird. Gegenstück zu /api/checkin/waitlist/offer.
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

    const registration = await getRegistrationDetail(registrationId);
    if (!registration) {
      return NextResponse.json({ error: "Anmeldung nicht gefunden." }, { status: 404 });
    }
    if (registration.status !== "pending" || registration.is_waitlist) {
      return NextResponse.json(
        { error: "Nur offene Anmeldungen können auf die Warteliste gesetzt werden." },
        { status: 409 }
      );
    }
    if (registration.paid_at) {
      return NextResponse.json(
        { error: "Diese Anmeldung ist bereits bezahlt." },
        { status: 409 }
      );
    }

    // Nur der Aufruf, der das Flag tatsächlich setzt, verschickt die Mail –
    // zwei Klicks (oder zwei Admins) mailen so nie doppelt.
    const moved = await moveToWaitlist(registrationId);

    if (moved && registration.email) {
      // Fire-and-forget email
      sendWaitlistMovedEmail({
        to: registration.email,
        firstName: registration.first_name,
        lastName: registration.last_name,
        eventTitle: registration.event_title,
        eventDate: registration.event_date,
        eventTime: registration.event_time,
        eventLocation: registration.event_location,
        statusToken: registration.status_token,
        persons: registration.persons?.map((p) => ({ firstName: p.first_name, lastName: p.last_name })),
      });
    }

    return NextResponse.json({ success: true, moved });
  } catch (error) {
    console.error("Fehler beim Verschieben auf die Warteliste:", error);
    return NextResponse.json({ error: "Ein Fehler ist aufgetreten." }, { status: 500 });
  }
}

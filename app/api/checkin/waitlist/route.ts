import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  approvePendingRegistration,
  checkinPersonsForRegistration,
  getEvent,
  getRegistrationWithEvent,
  markCheckedIn,
} from "@/lib/db";
import { sendRegistrationApprovedEmail } from "@/lib/email";
import { generateAndSaveCheckinQR } from "@/lib/checkin-qr";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Body {
  registrationId: number;
  /** Persons to check in right away – must belong to the registration */
  personIds?: string[];
  /** Check in every person of the registration */
  checkinAll?: boolean;
}

/**
 * Confirm a waitlist (pending) registration from the check-in dashboard.
 *
 * The registration is approved – which sends the usual approval email with the
 * check-in QR code – and, optionally, single persons (or everyone) are checked
 * in with the same request. That way a waitlist guest standing at the door is
 * handled in one tap.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  try {
    const { registrationId, personIds, checkinAll } = (await request.json()) as Body;

    if (!registrationId || typeof registrationId !== "number") {
      return NextResponse.json({ error: "registrationId fehlt." }, { status: 400 });
    }

    // Person IDs are UUIDs – validate up front so a malformed value never
    // reaches Postgres as a cast error after the registration was approved.
    if (personIds !== undefined) {
      if (!Array.isArray(personIds) || personIds.some((id) => !UUID_PATTERN.test(id))) {
        return NextResponse.json({ error: "Ungültige Person-ID." }, { status: 400 });
      }
    }

    const registration = await getRegistrationWithEvent(registrationId);
    if (!registration) {
      return NextResponse.json({ error: "Anmeldung nicht gefunden." }, { status: 404 });
    }

    if (registration.status === "rejected" || registration.status === "cancelled") {
      return NextResponse.json(
        { error: "Diese Anmeldung wurde abgelehnt oder storniert." },
        { status: 409 }
      );
    }

    // Only the call that actually flips pending → approved sends the email, so
    // a double tap (or two admins at once) never mails twice.
    const approved = await approvePendingRegistration(registrationId);

    if (approved && registration.email) {
      const event = await getEvent(registration.event_id);
      if (event) {
        const qrCode = await generateAndSaveCheckinQR(registrationId, event);
        // Fire-and-forget email
        sendRegistrationApprovedEmail({
          to: registration.email,
          firstName: registration.first_name,
          lastName: registration.last_name,
          eventTitle: event.title,
          eventDate: event.date,
          eventTime: event.time,
          eventLocation: event.location,
          statusToken: registration.status_token,
          qrCode,
        });
      }
    }

    const checkedInBy = user.email ?? "admin";
    if (checkinAll) {
      await markCheckedIn(registrationId, checkedInBy);
    } else if (personIds && personIds.length > 0) {
      await checkinPersonsForRegistration(registrationId, personIds, checkedInBy);
    }

    return NextResponse.json({ success: true, approved });
  } catch (error) {
    console.error("Fehler beim Bestätigen der Warteliste:", error);
    return NextResponse.json({ error: "Ein Fehler ist aufgetreten." }, { status: 500 });
  }
}

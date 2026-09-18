import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createWalkInRegistration, getEvent, getCheckoutInfo } from "@/lib/db";
import { sendWaitlistSpotOfferedEmail } from "@/lib/email";
import { formatPriceLabel } from "@/lib/price";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      event_id: number;
      persons: Array<{ firstName: string; lastName: string; isChild?: boolean }>;
      email: string;
      phone?: string;
      notes?: string;
      /** Steuert das Haekchen im Walk-in-Formular. Fehlt es, wird nichts verschickt. */
      sendEmail?: boolean;
    };

    const { event_id, persons, email, phone, notes, sendEmail } = body;

    if (!event_id || typeof event_id !== "number") {
      return NextResponse.json({ error: "event_id fehlt oder ungültig." }, { status: 400 });
    }

    if (!email?.trim()) {
      return NextResponse.json({ error: "E-Mail-Adresse ist erforderlich." }, { status: 400 });
    }

    const emailTrimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      return NextResponse.json({ error: "Ungültige E-Mail-Adresse." }, { status: 400 });
    }

    if (!Array.isArray(persons) || persons.length === 0) {
      return NextResponse.json({ error: "Mindestens eine Person ist erforderlich." }, { status: 400 });
    }

    for (const p of persons) {
      if (!p.firstName?.trim() || !p.lastName?.trim()) {
        return NextResponse.json({ error: "Alle Personen benötigen Vor- und Nachname." }, { status: 400 });
      }
    }

    const adminName = user.email ?? "admin";
    const result = await createWalkInRegistration({
      event_id,
      persons: persons.map((p) => ({ firstName: p.firstName.trim(), lastName: p.lastName.trim(), isChild: p.isChild === true })),
      email: emailTrimmed,
      phone: phone?.trim() || null,
      notes: notes?.trim() || null,
      // Geht ein Zahlungslink raus, ist der Platz noch nicht bezahlt – dann
      // wird auch niemand eingecheckt. Das Team hakt ab, sobald das Geld da
      // ist. Ohne Link gilt der Walk-in wie bisher als sofort vor Ort.
      checked_in_by: sendEmail ? null : adminName,
    });

    if (result.alreadyExists) {
      return NextResponse.json(
        { error: "Eine Registrierung mit dieser E-Mail-Adresse existiert bereits für dieses Event." },
        { status: 409 }
      );
    }

    // Der Walk-in ist bereits bestaetigt und eingecheckt – zu tun bleibt die
    // Zahlung. Verschickt wird dieselbe Mail wie beim Nachruecken von der
    // Warteliste: sie nennt den Betrag und fuehrt auf die Status-Seite, wo der
    // Bezahlen-Button steht. Ohne status_token gibt es keine Seite zum
    // Verlinken, dann bleibt die Mail aus.
    if (sendEmail && result.status_token) {
      const event = await getEvent(event_id);
      if (event) {
        // Betrag wie auf der Status-Seite: nur ein reiner Betrag wird als
        // Summe genannt. Siehe lib/price.ts.
        const checkout = await getCheckoutInfo(result.status_token);
        const priceLabel =
          formatPriceLabel(
            checkout?.entry_price,
            checkout?.person_count ?? 0,
            event.price,
            checkout?.child_entry_price,
            checkout?.child_count ?? 0
          ) ?? undefined;

        // Fire-and-forget: eine gescheiterte Mail darf den Check-in nicht
        // umwerfen, der Teilnehmer steht ja schon vor Ort.
        sendWaitlistSpotOfferedEmail({
          to: emailTrimmed,
          firstName: persons[0].firstName.trim(),
          lastName: persons[0].lastName.trim(),
          eventTitle: event.title,
          eventDate: event.date,
          eventTime: event.time,
          eventLocation: event.location,
          statusToken: result.status_token,
          persons: persons.map((pp) => ({
            firstName: pp.firstName.trim(),
            lastName: pp.lastName.trim(),
          })),
          priceLabel,
        });
      }
    }

    return NextResponse.json({ success: true, id: result.id });
  } catch (error) {
    console.error("Fehler beim Walk-in Check-In:", error);
    return NextResponse.json({ error: "Ein Fehler ist aufgetreten." }, { status: 500 });
  }
}

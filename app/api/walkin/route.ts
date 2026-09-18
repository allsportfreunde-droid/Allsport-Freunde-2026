import { NextRequest, NextResponse } from "next/server";
import { verifyWalkInToken } from "@/lib/checkin";
import { createWalkInRegistration, getEvent } from "@/lib/db";
import { formatPriceLabel } from "@/lib/price";
import { sendWaitlistSpotOfferedEmail } from "@/lib/email";

// Rate limiter: 10 self-service registrations per minute per IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte warte eine Minute." },
      { status: 429 }
    );
  }

  try {
    const body = (await request.json()) as {
      eventId: number;
      token: string;
      persons: Array<{ firstName: string; lastName: string; isChild?: boolean }>;
      email?: string;
      phone?: string;
      notes?: string;
      privacy_accepted: boolean;
      terms_accepted: boolean;
    };

    const { eventId, token, persons, email, phone, notes } = body;

    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Token fehlt." }, { status: 400 });
    }
    const tokenPayload = verifyWalkInToken(token);
    if (!tokenPayload) {
      return NextResponse.json(
        { error: "Ungültiger oder abgelaufener QR-Code." },
        { status: 400 }
      );
    }
    if (tokenPayload.eventId !== eventId) {
      return NextResponse.json(
        { error: "Token passt nicht zu diesem Event." },
        { status: 400 }
      );
    }

    if (!Array.isArray(persons) || persons.length === 0) {
      return NextResponse.json(
        { error: "Mindestens eine Person ist erforderlich." },
        { status: 400 }
      );
    }
    for (const p of persons) {
      if (!p.firstName?.trim() || !p.lastName?.trim()) {
        return NextResponse.json(
          { error: "Alle Personen benötigen Vor- und Nachname." },
          { status: 400 }
        );
      }
    }

    const emailTrimmed = email?.trim() || null;
    if (emailTrimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      return NextResponse.json({ error: "Ungültige E-Mail-Adresse." }, { status: 400 });
    }

    if (!body.privacy_accepted) {
      return NextResponse.json(
        { error: "Bitte akzeptiere die Datenschutzerklärung." },
        { status: 400 }
      );
    }
    if (!body.terms_accepted) {
      return NextResponse.json(
        { error: "Bitte akzeptiere die Teilnahmebedingungen." },
        { status: 400 }
      );
    }

    const event = await getEvent(eventId);
    if (!event || event.status !== "published") {
      return NextResponse.json(
        { error: "Dieses Event ist nicht mehr verfügbar." },
        { status: 404 }
      );
    }

    const maxPersons = event.max_per_email ?? 5;
    if (persons.length > maxPersons) {
      return NextResponse.json(
        { error: `Maximal ${maxPersons} ${maxPersons === 1 ? "Person" : "Personen"} pro Anmeldung erlaubt.` },
        { status: 400 }
      );
    }

    // Nur ein verbindlicher Betrag wird eingefordert – bei "Spende willkommen"
    // bleibt es beim Eintragen. Siehe lib/price.ts.
    const priceLabel = formatPriceLabel(event.entry_price, persons.length, event.price, event.child_entry_price, persons.filter((p) => p.isChild === true).length);

    // Der Zahlungslink führt auf die Status-Seite, und die erreicht den Gast
    // nur per E-Mail. Ohne Adresse gäbe es keinen Weg zu zahlen.
    if (priceLabel && !emailTrimmed) {
      return NextResponse.json(
        {
          error:
            "Für dieses Event wird ein Teilnahmebetrag fällig – bitte gib eine E-Mail-Adresse an, damit wir dir den Zahlungslink schicken können.",
        },
        { status: 400 }
      );
    }

    const result = await createWalkInRegistration({
      event_id: eventId,
      persons: persons.map((p) => ({
        firstName: p.firstName.trim(),
        lastName: p.lastName.trim(),
        isChild: p.isChild === true,
      })),
      email: emailTrimmed,
      phone: phone?.trim() || null,
      notes: notes?.trim() || null,
      checked_in_by: null,
    });

    if (result.alreadyExists) {
      return NextResponse.json(
        { error: "Du bist bereits für dieses Event registriert." },
        { status: 409 }
      );
    }

    // Der Platz steht, offen ist die Zahlung. Es geht dieselbe Mail raus wie
    // beim Walk-in über das Check-In-Dashboard: sie nennt den Betrag und führt
    // auf die Status-Seite mit dem Bezahlen-Button. Ohne Betrag verlinkt sie
    // nur den Status – zum Ansehen und Stornieren. Fire-and-forget: eine
    // gescheiterte Mail darf den Eintrag nicht umwerfen, der Gast steht ja
    // schon vor Ort.
    if (emailTrimmed && result.status_token) {
      sendWaitlistSpotOfferedEmail({
        to: emailTrimmed,
        firstName: persons[0].firstName.trim(),
        lastName: persons[0].lastName.trim(),
        eventTitle: event.title,
        eventDate: event.date,
        eventTime: event.time,
        eventLocation: event.location,
        statusToken: result.status_token,
        persons: persons.map((p) => ({
          firstName: p.firstName.trim(),
          lastName: p.lastName.trim(),
        })),
        priceLabel: priceLabel ?? undefined,
      });
    }

    // Der Betrag geht zurück an das Formular, damit die Bestätigungsseite
    // sagen kann, was noch offen ist und wo der Link landet.
    return NextResponse.json({ success: true, priceLabel: priceLabel ?? undefined });
  } catch (error) {
    console.error("Fehler bei Walk-in Self-Service Registrierung:", error);
    return NextResponse.json({ error: "Ein Fehler ist aufgetreten." }, { status: 500 });
  }
}

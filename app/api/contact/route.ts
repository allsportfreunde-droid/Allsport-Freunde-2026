import { NextRequest, NextResponse } from "next/server";
import { createContactInquiry } from "@/lib/db";
import {
  sendContactReceivedEmail,
  sendContactAdminEmail,
} from "@/lib/email";
import { getEvents } from "@/lib/db";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/ratelimit";
import { honeypotFailure } from "@/lib/honeypot";

const ADMIN_EMAIL =
  process.env.ADMIN_EMAIL || process.env.EMAIL_FROM?.match(/<(.+)>/)?.[1] || "";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  if (!checkRateLimit(ip, RATE_LIMITS.contact)) {
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte warte einige Minuten." },
      { status: 429 }
    );
  }

  try {
    const body = await req.json();

    const abgewiesen = honeypotFailure({ _hp: body?._hp, _ts: body?._ts });
    if (abgewiesen) {
      console.warn(`Kontaktanfrage abgewiesen (${abgewiesen}), IP ${ip}`);
      return NextResponse.json(
        {
          error:
            abgewiesen === "too_fast"
              ? "Das ging zu schnell. Bitte sende das Formular gleich noch einmal ab."
              : "Ungültige Anfrage",
        },
        { status: 400 }
      );
    }

    const { first_name, last_name, email, whatsapp_number, message, event_id, consent_to_store } =
      body as {
        first_name?: string;
        last_name?: string;
        email: string;
        whatsapp_number?: string;
        message: string;
        event_id?: number | null;
        consent_to_store?: boolean;
      };

    if (!email || !message) {
      return NextResponse.json(
        { error: "E-Mail und Nachricht sind erforderlich." },
        { status: 400 }
      );
    }

    if(message.length > 2000) {
      return NextResponse.json(
        { error: "Die Nachricht darf maximal 1000 Zeichen lang sein." },
        { status: 400 }
      );
    }

    if (email.length > 254) {
      return NextResponse.json(
        { error: "Die E-Mail-Adresse darf maximal 254 Zeichen lang sein." },
        { status: 400 }
      );
    }

    if (whatsapp_number && whatsapp_number.length > 20) {
      return NextResponse.json(
        { error: "Die WhatsApp-Nummer darf maximal 20 Zeichen lang sein." },
        { status: 400 }
      );
    }

    if (first_name && first_name.length > 50) {
      return NextResponse.json(
        { error: "Der Vorname darf maximal 50 Zeichen lang sein." },
        { status: 400 }
      );
    }

    if (last_name && last_name.length > 50) {
      return NextResponse.json(
        { error: "Der Nachname darf maximal 50 Zeichen lang sein." },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Ungültige E-Mail-Adresse." },
        { status: 400 }
      );
    }

    const { randomUUID } = await import("crypto");
    const conversationToken = randomUUID();

    const { id, conversation_token } = await createContactInquiry({
      first_name,
      last_name,
      email,
      whatsapp_number,
      message,
      event_id: event_id ?? null,
      consent_to_store: consent_to_store ?? false,
      conversation_token: conversationToken,
    });

    // Resolve event title for emails (fire-and-forget)
    let eventTitle: string | undefined;
    if (event_id) {
      try {
        const events = await getEvents();
        const ev = events.find((e) => e.id === event_id);
        eventTitle = ev?.title;
      } catch {
        // non-critical
      }
    }

    const senderName =
      [first_name, last_name].filter(Boolean).join(" ") || email;

    sendContactReceivedEmail({
      to: email,
      firstName: first_name,
      eventTitle,
      conversationToken: conversation_token,
    });

    if (ADMIN_EMAIL) {
      sendContactAdminEmail({
        adminEmail: ADMIN_EMAIL,
        senderName,
        senderEmail: email,
        eventTitle,
        messagePreview: message,
        inquiryId: id,
      });
    }

    return NextResponse.json({ success: true, conversationToken: conversation_token });
  } catch (error) {
    console.error("[contact] POST error:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

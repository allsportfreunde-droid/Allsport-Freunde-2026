import { cancelRegistrationByToken } from "@/lib/db";
import { CancellationBlockedError } from "@/lib/cancellation";
import { refundAndNotifyCancellation } from "@/lib/cancellation-refund";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const info = await cancelRegistrationByToken(token);

    if (!info) {
      return NextResponse.json(
        { error: "Anmeldung nicht gefunden oder kann nicht storniert werden." },
        { status: 404 }
      );
    }

    // Verschickt die Bestätigung – mit dem Erstattungsbetrag, falls bezahlt
    // wurde. Beides gehört zusammen und passiert deshalb an einer Stelle.
    const refund = info.alreadyCancelled ? { amount: 0 } : await refundAndNotifyCancellation(info.id, {
      to: info.email,
      firstName: info.first_name,
      lastName: info.last_name,
      eventTitle: info.event_title,
      eventDate: info.event_date,
      eventTime: info.event_time,
      eventLocation: info.event_location,
      statusToken: token,
    });

    return NextResponse.json({
      message: "Anmeldung erfolgreich storniert.",
      refundAmount: refund.amount,
    });
  } catch (error) {
    if (error instanceof CancellationBlockedError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Fehler beim Stornieren der Anmeldung:", error);
    return NextResponse.json(
      { error: "Ein Fehler ist aufgetreten." },
      { status: 500 }
    );
  }
}

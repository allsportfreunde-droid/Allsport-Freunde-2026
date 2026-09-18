import { cancelPersonByToken } from "@/lib/db";
import { CancellationBlockedError } from "@/lib/cancellation";
import { refundAndNotifyCancellation } from "@/lib/cancellation-refund";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string; personId: string }> }
) {
  try {
    const { token, personId } = await params;
    const result = await cancelPersonByToken(token, personId);

    if (!result) {
      return NextResponse.json(
        { error: "Person nicht gefunden oder kann nicht storniert werden." },
        { status: 404 }
      );
    }

    // Auch eine einzelne Abmeldung wird bestätigt – und wer bezahlt hat,
    // erfährt hier, welcher Anteil zurückgeht. Vorher ging aus dieser Route
    // gar keine E-Mail raus.
    const existing = result.registration;
    const refund = existing && !result.alreadyCancelled
      ? await refundAndNotifyCancellation(existing.id, {
          to: existing.email,
          firstName: existing.first_name,
          lastName: existing.last_name,
          eventTitle: existing.event_title,
          eventDate: existing.event_date,
          eventTime: existing.event_time,
          eventLocation: existing.event_location,
          statusToken: token,
        })
      : null;

    return NextResponse.json({
      ok: true,
      allCancelled: result.allCancelled,
      refundAmount: refund?.amount ?? 0,
    });
  } catch (error) {
    if (error instanceof CancellationBlockedError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Fehler beim Stornieren der Person:", error);
    return NextResponse.json(
      { error: "Ein Fehler ist aufgetreten." },
      { status: 500 }
    );
  }
}

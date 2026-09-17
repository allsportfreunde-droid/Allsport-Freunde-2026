import { updateRegistrationStatus, getRegistrationWithEvent, getEvent } from "@/lib/db";
import {
  sendRegistrationApprovedEmail,
  sendRegistrationRejectedEmail,
} from "@/lib/email";
import { generateAndSaveCheckinQR } from "@/lib/checkin-qr";
import { NextRequest, NextResponse } from "next/server";
import type { RegistrationStatus } from "@/lib/types";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const regId = Number(id);
    const body = await request.json();
    const { status, note } = body as { status: RegistrationStatus; note?: string };

    if (!["pending", "approved", "rejected"].includes(status)) {
      return NextResponse.json(
        { error: "Ungültiger Status." },
        { status: 400 }
      );
    }

    // Get registration before update for email data
    const regBefore = await getRegistrationWithEvent(regId);
    if (!regBefore) {
      return NextResponse.json(
        { error: "Anmeldung nicht gefunden." },
        { status: 404 }
      );
    }

    const result = await updateRegistrationStatus(regId, status, note);
    if (!result) {
      return NextResponse.json(
        { error: "Fehler beim Aktualisieren." },
        { status: 500 }
      );
    }

    // Get event details for email and QR code
    const event = await getEvent(regBefore.event_id);

    if (event && regBefore.email && result.status_changed !== false) {
      let qrCodeBase64: string | undefined;

      // Generate QR code when approving
      if (status === "approved") {
        qrCodeBase64 = await generateAndSaveCheckinQR(regId, event);
      }

      const emailData = {
        to: regBefore.email,
        firstName: regBefore.first_name,
        lastName: regBefore.last_name,
        eventTitle: event.title,
        eventDate: event.date,
        eventTime: event.time,
        eventLocation: event.location,
        statusToken: regBefore.status_token,
      };      

      // Fire-and-forget email
      if (status === "approved") {
        sendRegistrationApprovedEmail({ ...emailData, qrCode: qrCodeBase64 });
      } else if (status === "rejected") {
        sendRegistrationRejectedEmail({ ...emailData, note });
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Fehler beim Statuswechsel:", error);
    return NextResponse.json(
      { error: "Ein Fehler ist aufgetreten." },
      { status: 500 }
    );
  }
}

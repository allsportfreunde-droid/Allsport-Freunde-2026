import {
  getCancellationTokenInfo,
  cancelRegistrationByCancellationToken,
} from "@/lib/db";
import { refundAndNotifyCancellation } from "@/lib/cancellation-refund";
import { NextRequest, NextResponse } from "next/server";
import { CancellationBlockedError } from "@/lib/cancellation";

// GET /api/cancel-registration?token=xxx
// Returns preview data so the page can show name + event before confirming.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Token fehlt." }, { status: 400 });
  }

  try {
    const info = await getCancellationTokenInfo(token);
    if (!info) {
      return NextResponse.json({ tokenStatus: "not_found" });
    }

    let tokenStatus: "valid" | "expired" | "already_cancelled";
    if (info.usedAt !== null || info.registrationStatus === "cancelled") {
      tokenStatus = "already_cancelled";
    } else if (new Date(info.expiresAt) <= new Date()) {
      tokenStatus = "expired";
    } else {
      tokenStatus = "valid";
    }

    return NextResponse.json({
      tokenStatus,
      firstName: info.firstName,
      lastName: info.lastName,
      eventTitle: info.eventTitle,
      eventDate: info.eventDate,
      eventTime: info.eventTime,
      eventLocation: info.eventLocation,
    });
  } catch (error) {
    console.error("Fehler beim Laden des Stornierungslinks:", error);
    return NextResponse.json({ error: "Ein Fehler ist aufgetreten." }, { status: 500 });
  }
}

// POST /api/cancel-registration?token=xxx
// Validates token, cancels registration, sends confirmation email.
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Token fehlt." }, { status: 400 });
  }

  try {
    const result = await cancelRegistrationByCancellationToken(token);
    if (result.status !== 'cancelled') {
      return NextResponse.json({ status: result.status }, { status: result.status === 'not_found' ? 404 : 200 });
    }
    const { info } = result;

    if (info.email) {
      await refundAndNotifyCancellation(info.registrationId, {
        to: info.email,
        firstName: info.firstName,
        lastName: info.lastName,
        eventTitle: info.eventTitle,
        eventDate: info.eventDate,
        eventTime: info.eventTime,
        eventLocation: info.eventLocation,
        statusToken: info.statusToken,
      });
    }

    return NextResponse.json({
      status: "cancelled",
      registrationId: info.registrationId,
      statusToken: info.statusToken,
    });
  } catch (error) {
    if (error instanceof CancellationBlockedError) {
      return NextResponse.json({ status: "deadline_passed", reason: error.message });
    }
    console.error("Fehler beim Stornieren via Token:", error);
    return NextResponse.json({ error: "Ein Fehler ist aufgetreten." }, { status: 500 });
  }
}

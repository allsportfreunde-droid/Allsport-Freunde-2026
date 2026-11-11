import { getRegistrationByToken, getRegistrationDiscountRequests, isPostgresConfigured } from "@/lib/db";
import { getCheckoutDisplay } from "@/lib/checkout-status";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const info = await getRegistrationByToken(token);

    if (!info) {
      return NextResponse.json(
        { error: "Anmeldung nicht gefunden." },
        { status: 404 }
      );
    }

    const payment = await getCheckoutDisplay(info.id, info.paid_at);
    // Ermäßigungsanträge ohne Datei – nur Status und Begründung.
    const discount_requests = isPostgresConfigured() ? await getRegistrationDiscountRequests(info.id) : [];
    return NextResponse.json({ ...info, ...payment, discount_requests }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Fehler beim Laden des Status:", error);
    return NextResponse.json(
      { error: "Ein Fehler ist aufgetreten." },
      { status: 500 }
    );
  }
}

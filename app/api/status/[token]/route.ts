import { getRegistrationByToken } from "@/lib/db";
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
    return NextResponse.json({ ...info, ...payment }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Fehler beim Laden des Status:", error);
    return NextResponse.json(
      { error: "Ein Fehler ist aufgetreten." },
      { status: 500 }
    );
  }
}

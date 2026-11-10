import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isPostgresConfigured } from "@/lib/db";
import { sendEventReviewRequests } from "@/lib/review-sending";

export const maxDuration = 60;

const headers = { "Cache-Control": "no-store" };

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401, headers });
    if (!isPostgresConfigured()) {
      return NextResponse.json({ error: "Reviews benötigen eine Datenbank (POSTGRES_URL)." }, { status: 503, headers });
    }

    const { id } = await params;
    const eventId = Number(id);
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(eventId) || eventId <= 0) {
      return NextResponse.json({ error: "Ungültige Event-ID." }, { status: 400, headers });
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Ungültige Versandart." }, { status: 400, headers });
    }
    if (typeof body !== "object" || body === null || Array.isArray(body) || !("kind" in body)
      || (body.kind !== "initial" && body.kind !== "reminder")) {
      return NextResponse.json({ error: "Ungültige Versandart." }, { status: 400, headers });
    }
    const result = await sendEventReviewRequests(eventId, body.kind, user.email ?? null);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status, headers });
    return NextResponse.json(result.result, { headers });
  } catch (error) {
    console.error("Fehler beim Versenden der Review-Anfragen:", error);
    return NextResponse.json({ error: "Ein Fehler ist aufgetreten." }, { status: 500, headers });
  }
}

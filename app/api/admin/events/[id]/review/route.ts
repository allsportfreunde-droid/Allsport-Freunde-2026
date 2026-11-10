import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEventReviewDashboard, isPostgresConfigured } from "@/lib/db";

const headers = { "Cache-Control": "no-store" };

export async function GET(
  _request: NextRequest,
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
    const dashboard = await getEventReviewDashboard(eventId);
    if (!dashboard) return NextResponse.json({ error: "Event nicht gefunden." }, { status: 404, headers });
    return NextResponse.json(dashboard, { headers });
  } catch (error) {
    console.error("Fehler beim Laden des Review-Dashboards:", error);
    return NextResponse.json({ error: "Ein Fehler ist aufgetreten." }, { status: 500, headers });
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getReviewOverview, isPostgresConfigured } from "@/lib/db";

const headers = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401, headers });
    if (!isPostgresConfigured()) {
      return NextResponse.json({ error: "Reviews benötigen eine Datenbank (POSTGRES_URL)." }, { status: 503, headers });
    }
    return NextResponse.json(await getReviewOverview(), { headers });
  } catch (error) {
    console.error("Fehler beim Laden der Review-Übersicht:", error);
    return NextResponse.json({ error: "Ein Fehler ist aufgetreten." }, { status: 500, headers });
  }
}

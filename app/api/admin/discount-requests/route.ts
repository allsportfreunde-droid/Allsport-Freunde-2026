import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDiscountRequestsForAdmin, isPostgresConfigured, purgeDiscountProofs } from "@/lib/db";

const headers = { "Cache-Control": "no-store" };

/** Ermäßigungsanträge für den Admin – offene zuerst, ohne Nachweis-Dateien. */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401, headers });
  if (!isPostgresConfigured()) {
    return NextResponse.json({ error: "Ermäßigungsanträge benötigen eine Datenbank (POSTGRES_URL)." }, { status: 503, headers });
  }

  try {
    // Fällige Nachweise auch hier löschen – für Umgebungen ohne täglichen Cron.
    await purgeDiscountProofs();
    return NextResponse.json(await getDiscountRequestsForAdmin(), { headers });
  } catch (error) {
    console.error("[admin/discount-requests] GET error:", error);
    return NextResponse.json({ error: "Interner Serverfehler." }, { status: 500, headers });
  }
}

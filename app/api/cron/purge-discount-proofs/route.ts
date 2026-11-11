import { NextRequest, NextResponse } from "next/server";
import { isPostgresConfigured, purgeDiscountProofs } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Täglich: Nachweise löschen, die nicht mehr gebraucht werden – älter als die
 * Frist, Person storniert oder Anmeldung storniert/abgelehnt. Nach einer
 * Entscheidung sind sie ohnehin schon gelöscht. Siehe lib/db/discount-requests.ts.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isPostgresConfigured()) return NextResponse.json({ purged: 0 });

  try {
    const purged = await purgeDiscountProofs();
    console.log(`[Cron] purge-discount-proofs: ${purged} Nachweis(e) gelöscht`);
    return NextResponse.json({ purged });
  } catch (error) {
    console.error("[Cron] purge-discount-proofs fehlgeschlagen:", error);
    return NextResponse.json({ error: "Löschen fehlgeschlagen." }, { status: 500 });
  }
}

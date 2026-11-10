import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isPostgresConfigured, logAudit, setReviewPublished } from "@/lib/db";
import { invalidateCache } from "@/lib/cache";

const headers = { "Cache-Control": "no-store" };

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ reviewId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401, headers });
    if (!isPostgresConfigured()) {
      return NextResponse.json({ error: "Reviews benötigen eine Datenbank (POSTGRES_URL)." }, { status: 503, headers });
    }

    const { reviewId } = await params;
    const id = Number(reviewId);
    if (!/^\d+$/.test(reviewId) || !Number.isSafeInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Ungültige Review-ID." }, { status: 400, headers });
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Ungültiger Veröffentlichungsstatus." }, { status: 400, headers });
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)
      || !("published" in body) || typeof body.published !== "boolean") {
      return NextResponse.json({ error: "Ungültiger Veröffentlichungsstatus." }, { status: 400, headers });
    }

    const result = await setReviewPublished(id, body.published, user.email ?? null);
    if (!result.ok) {
      const errors = {
        not_found: { status: 404, error: "Review nicht gefunden." },
        no_consent: { status: 409, error: "Ohne Einwilligung darf der Kommentar nicht veröffentlicht werden." },
        no_comment: { status: 409, error: "Ohne Kommentar gibt es nichts zu veröffentlichen." },
      };
      const failure = errors[result.reason];
      return NextResponse.json({ error: failure.error }, { status: failure.status, headers });
    }
    invalidateCache("testimonials");
    await logAudit(user.email ?? null, body.published ? "PUBLISH_REVIEW" : "UNPUBLISH_REVIEW", "event_review", id);
    return NextResponse.json({ review: result.review }, { headers });
  } catch (error) {
    console.error("Fehler beim Ändern der Review-Veröffentlichung:", error);
    return NextResponse.json({ error: "Ein Fehler ist aufgetreten." }, { status: 500, headers });
  }
}

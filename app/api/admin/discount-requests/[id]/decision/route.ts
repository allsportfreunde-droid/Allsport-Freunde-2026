import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decideDiscountRequest, isPostgresConfigured, logAudit } from "@/lib/db";
import { DISCOUNTS } from "@/lib/discounts";
import { sendDiscountDecisionEmail } from "@/lib/email";
import { berlinToday } from "@/lib/review";

const headers = { "Cache-Control": "no-store" };
const MAX_NOTE_LENGTH = 500;

type Params = { params: Promise<{ id: string }> };

/**
 * Bestätigt oder lehnt einen Ermäßigungsantrag ab. Der Nachweis wird dabei in
 * jedem Fall gelöscht; die Person bekommt eine Mail mit Link zur Zahlung.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401, headers });
  if (!isPostgresConfigured()) return NextResponse.json({ error: "Keine Datenbank." }, { status: 503, headers });

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Ungültige ID." }, { status: 400, headers });

  const body = await request.json().catch(() => null) as { decision?: unknown; note?: unknown } | null;
  const decision = body?.decision === "approve" ? "approved" : body?.decision === "reject" ? "rejected" : null;
  if (!decision) return NextResponse.json({ error: "Bitte bestätigen oder ablehnen." }, { status: 400, headers });
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  if (note.length > MAX_NOTE_LENGTH) {
    return NextResponse.json({ error: `Der Hinweis darf höchstens ${MAX_NOTE_LENGTH} Zeichen lang sein.` }, { status: 400, headers });
  }

  try {
    const result = await decideDiscountRequest(id, decision, note || null, user.email ?? user.id, berlinToday());
    if (!result.ok) {
      return result.reason === "not_found"
        ? NextResponse.json({ error: "Antrag nicht gefunden." }, { status: 404, headers })
        : result.reason === "proof_missing"
          ? NextResponse.json({ error: "Eine Ermäßigung kann nur mit hinterlegtem Nachweis bestätigt werden." }, { status: 409, headers })
        : NextResponse.json({ error: "Über diesen Antrag wurde bereits entschieden." }, { status: 409, headers });
    }

    // Ohne Namen oder Ermäßigungsart – das Log soll keinen Gesundheitsbezug enthalten.
    await logAudit(user.email ?? null, decision === "approved" ? "APPROVE_DISCOUNT_REQUEST" : "REJECT_DISCOUNT_REQUEST", "DISCOUNT_REQUEST", id);

    const { mail } = result;
    if (mail.to) {
      sendDiscountDecisionEmail({
        to: mail.to,
        firstName: mail.firstName,
        lastName: "",
        personName: mail.personName,
        percent: DISCOUNTS[mail.discount].percent,
        approved: decision === "approved",
        note: note || undefined,
        eventTitle: mail.eventTitle,
        eventDate: mail.eventDate,
        eventTime: mail.eventTime,
        eventLocation: mail.eventLocation,
        statusToken: mail.statusToken,
      });
    }

    return NextResponse.json(
      { status: decision, applied: result.applied, remembered: result.remembered, mailed: !!mail.to },
      { headers }
    );
  } catch (error) {
    console.error(`[admin/discount-requests/${id}/decision] POST error:`, error);
    return NextResponse.json({ error: "Interner Serverfehler." }, { status: 500, headers });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getProofUploadTarget, isPostgresConfigured, saveDiscountProof } from "@/lib/db";
import { detectProofType, MAX_PROOF_BYTES } from "@/lib/discount-requests";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/ratelimit";

const headers = { "Cache-Control": "no-store" };

/**
 * Nimmt den Nachweis zu einem Ermäßigungsantrag entgegen.
 *
 * Autorisiert über den status_token der Anmeldung – nur wer die Anmeldung
 * abgeschickt hat (oder den Link aus der Mail hat), kann hochladen. Der Typ
 * wird an den Bytes erkannt, nicht an Endung oder Browserangabe. Gespeichert
 * wird nur Inhalt und Typ, kein Dateiname. Protokolliert wird nichts über die Datei.
 */
export async function POST(request: NextRequest) {
  const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers });

  if (!checkRateLimit(getClientIp(request.headers), RATE_LIMITS.discountProof)) {
    return fail("Zu viele Uploads. Bitte warte einige Minuten.", 429);
  }
  if (!isPostgresConfigured()) return fail("Uploads sind derzeit nicht möglich.", 503);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("Ungültige Anfrage.", 400);
  }

  const token = form.get("status_token");
  const requestId = Number(form.get("request_id"));
  const file = form.get("file");
  if (typeof token !== "string" || !token || !Number.isInteger(requestId) || requestId <= 0) {
    return fail("Ungültige Anfrage.", 400);
  }
  if (!(file instanceof Blob) || file.size === 0) return fail("Bitte eine Datei auswählen.", 400);
  if (file.size > MAX_PROOF_BYTES) return fail("Die Datei ist zu groß (höchstens 4 MB).", 400);

  try {
    const target = await getProofUploadTarget(token, requestId);
    if (!target) return fail("Antrag nicht gefunden.", 404);
    if (target.status !== "pending") return fail("Über diesen Antrag wurde bereits entschieden.", 409);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = detectProofType(bytes);
    if (!type) return fail("Bitte ein Foto (JPEG, PNG, WebP) oder ein PDF hochladen.", 400);

    if (!await saveDiscountProof(requestId, bytes, type)) {
      return fail("Über diesen Antrag wurde bereits entschieden.", 409);
    }
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    console.error(`Nachweis-Upload für Antrag ${requestId} fehlgeschlagen:`, error instanceof Error ? error.message : "unbekannt");
    return fail("Der Nachweis konnte nicht gespeichert werden.", 500);
  }
}

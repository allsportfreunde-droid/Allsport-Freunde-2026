import { NextRequest, NextResponse } from "next/server";
import { getRecognizableDiscounts, isPostgresConfigured } from "@/lib/db";
import { matchDiscount } from "@/lib/discount-holders";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/ratelimit";
import { berlinToday } from "@/lib/review";
import type { Discount } from "@/lib/price-tiers";

const headers = { "Cache-Control": "no-store" };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Vorschau für das Anmeldeformular: Gilt für diese Person eine Ermäßigung?
 *
 * Verbindlich ist das nicht – beim Absenden gleicht der Server erneut ab.
 * Die Antwort enthält nur den Schlüssel, nie Grund oder Listendaten, und
 * unterscheidet nicht zwischen "nicht gefunden" und "ungültige Eingabe".
 * POST statt GET, damit Namen und E-Mail nicht in URLs und Logs landen.
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  if (!checkRateLimit(ip, RATE_LIMITS.discountCheck)) {
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte warte einige Minuten." },
      { status: 429, headers }
    );
  }

  const none = () => NextResponse.json({ discount: null }, { headers });

  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const firstName = typeof body?.first_name === "string" ? body.first_name : "";
    const lastName = typeof body?.last_name === "string" ? body.last_name : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!firstName.trim() || !lastName.trim() || !EMAIL_RE.test(email) || email.length > 255) return none();
    if (!isPostgresConfigured()) return none();

    const entries = await getRecognizableDiscounts(email, berlinToday());
    const discount: Discount | null = matchDiscount(entries, firstName, lastName);
    return NextResponse.json({ discount }, { headers });
  } catch (error) {
    console.error("Ermäßigungsvorschau fehlgeschlagen:", error);
    return none();
  }
}

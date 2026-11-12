import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRegistrationCheckouts, isPostgresConfigured, logAudit, setPersonDiscount } from "@/lib/db";
import { isDiscount } from "@/lib/discount-holders";
import { getStripe } from "@/lib/stripe";
import { expireOpenCheckouts } from "@/lib/checkout-expire";

const headers = { "Cache-Control": "no-store" };

type Params = { params: Promise<{ id: string; personId: string }> };

const REASONS = {
  not_found: { status: 404, error: "Person nicht gefunden." },
  cancelled: { status: 409, error: "Die Person ist storniert." },
  no_price: { status: 409, error: "Für dieses Event gibt es keinen verbindlichen Preis – es gibt nichts zu ermäßigen." },
  paid_or_busy: {
    status: 409,
    error: "Die Anmeldung ist bereits bezahlt oder eine Zahlung läuft. Eine Differenz bitte von Hand in Stripe erstatten.",
  },
} as const;

/**
 * Setzt die Ermäßigung einer Person nachträglich (null = voller Preis) – nur
 * bei unbezahlten Anmeldungen. Offene Zahlungslinks mit dem alten Betrag
 * werden geschlossen; der nächste Checkout rechnet mit dem neuen Preis.
 * Die Person bekommt keine Mail.
 */
export async function PUT(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401, headers });
  if (!isPostgresConfigured()) {
    return NextResponse.json({ error: "Ermäßigungen benötigen eine Datenbank (POSTGRES_URL)." }, { status: 503, headers });
  }

  const { id, personId } = await params;
  const registrationId = Number(id);
  if (!Number.isInteger(registrationId) || registrationId <= 0 || !personId) {
    return NextResponse.json({ error: "Ungültige ID." }, { status: 400, headers });
  }

  const body = await request.json().catch(() => null) as { discount?: unknown } | null;
  // null = voller Preis; ein fehlendes Feld ist ungültig.
  const discount = body?.discount;
  if (discount !== null && !isDiscount(discount)) {
    return NextResponse.json({ error: "Bitte eine gültige Ermäßigung wählen." }, { status: 400, headers });
  }

  try {
    const result = await setPersonDiscount(registrationId, personId, discount);
    if (!result.ok) {
      const { status, error } = REASONS[result.reason];
      return NextResponse.json({ error }, { status, headers });
    }

    // Ohne Namen oder Ermäßigungsart – das Log soll keinen Gesundheitsbezug enthalten.
    await logAudit(user.email ?? null, "SET_PERSON_DISCOUNT", "REGISTRATION", registrationId);

    // Alte Zahlungslinks mit dem bisherigen Betrag schließen.
    const stripe = getStripe();
    if (stripe) {
      const open = (await getRegistrationCheckouts(registrationId))
        .filter((checkout) => checkout.payment_state === "open")
        .map((checkout) => checkout.session_id);
      await expireOpenCheckouts(stripe, open);
    }

    return NextResponse.json({ discount }, { headers });
  } catch (error) {
    console.error(`[admin/registrations/${registrationId}/persons/discount] PUT error:`, error);
    return NextResponse.json({ error: "Interner Serverfehler." }, { status: 500, headers });
  }
}

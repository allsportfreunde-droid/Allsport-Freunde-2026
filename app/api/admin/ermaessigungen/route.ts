import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createDiscountHolder, getDiscountHolders, isPostgresConfigured, logAudit } from "@/lib/db";
import { DuplicateDiscountHolderError, validateDiscountHolderInput } from "@/lib/discount-holders";

const headers = { "Cache-Control": "no-store" };

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401, headers });
  if (!isPostgresConfigured()) {
    return NextResponse.json({ error: "Die Ermäßigungsliste benötigt eine Datenbank (POSTGRES_URL)." }, { status: 503, headers });
  }

  try {
    return NextResponse.json(await getDiscountHolders(), { headers });
  } catch (error) {
    console.error("[admin/ermaessigungen] GET error:", error);
    return NextResponse.json({ error: "Interner Serverfehler." }, { status: 500, headers });
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401, headers });
  if (!isPostgresConfigured()) {
    return NextResponse.json({ error: "Die Ermäßigungsliste benötigt eine Datenbank (POSTGRES_URL)." }, { status: 503, headers });
  }

  try {
    const result = validateDiscountHolderInput(await request.json().catch(() => null));
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400, headers });

    const holder = await createDiscountHolder(result.data, user.email ?? user.id);
    // Bewusst ohne Namen oder Ermäßigungsart: Das Log soll keinen Gesundheitsbezug enthalten.
    await logAudit(user.email ?? null, "CREATE_DISCOUNT_HOLDER", "DISCOUNT_HOLDER", holder.id);
    return NextResponse.json(holder, { status: 201, headers });
  } catch (error) {
    if (error instanceof DuplicateDiscountHolderError) {
      return NextResponse.json({ error: error.message }, { status: 409, headers });
    }
    console.error("[admin/ermaessigungen] POST error:", error);
    return NextResponse.json({ error: "Interner Serverfehler." }, { status: 500, headers });
  }
}

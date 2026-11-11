import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteDiscountHolder, isPostgresConfigured, logAudit, updateDiscountHolder } from "@/lib/db";
import { DuplicateDiscountHolderError, validateDiscountHolderInput } from "@/lib/discount-holders";

const headers = { "Cache-Control": "no-store" };

type Params = { params: Promise<{ id: string }> };

/** Gemeinsame Vorprüfung: Session, Datenbank, ID. */
async function prepare(params: Params["params"]) {
  const fail = (error: string, status: number) =>
    ({ ok: false as const, response: NextResponse.json({ error }, { status, headers }) });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("Nicht autorisiert.", 401);
  if (!isPostgresConfigured()) return fail("Die Ermäßigungsliste benötigt eine Datenbank (POSTGRES_URL).", 503);
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return fail("Ungültige ID.", 400);
  return { ok: true as const, user, id };
}

export async function PUT(request: NextRequest, { params }: Params) {
  const prepared = await prepare(params);
  if (!prepared.ok) return prepared.response;
  const { user, id } = prepared;

  try {
    const result = validateDiscountHolderInput(await request.json().catch(() => null));
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400, headers });

    const holder = await updateDiscountHolder(id, result.data, user.email ?? user.id);
    if (!holder) return NextResponse.json({ error: "Eintrag nicht gefunden." }, { status: 404, headers });
    await logAudit(user.email ?? null, "UPDATE_DISCOUNT_HOLDER", "DISCOUNT_HOLDER", id);
    return NextResponse.json(holder, { headers });
  } catch (error) {
    if (error instanceof DuplicateDiscountHolderError) {
      return NextResponse.json({ error: error.message }, { status: 409, headers });
    }
    console.error("[admin/ermaessigungen/[id]] PUT error:", error);
    return NextResponse.json({ error: "Interner Serverfehler." }, { status: 500, headers });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const prepared = await prepare(params);
  if (!prepared.ok) return prepared.response;
  const { user, id } = prepared;

  try {
    if (!await deleteDiscountHolder(id)) {
      return NextResponse.json({ error: "Eintrag nicht gefunden." }, { status: 404, headers });
    }
    await logAudit(user.email ?? null, "DELETE_DISCOUNT_HOLDER", "DISCOUNT_HOLDER", id);
    return NextResponse.json({ message: "Eintrag gelöscht." }, { headers });
  } catch (error) {
    console.error("[admin/ermaessigungen/[id]] DELETE error:", error);
    return NextResponse.json({ error: "Interner Serverfehler." }, { status: 500, headers });
  }
}

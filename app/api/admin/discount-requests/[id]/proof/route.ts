import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDiscountProof, isPostgresConfigured, logAudit } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

/**
 * Zeigt einen Nachweis – nur mit Admin-Session.
 *
 * Der Typ stammt aus der Prüfung beim Upload (Magic Bytes). nosniff und die
 * Sandbox-CSP verhindern, dass ein Browser die Datei als etwas anderes
 * ausführt; no-store, dass sie in einem Cache liegen bleibt.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  if (!isPostgresConfigured()) return NextResponse.json({ error: "Keine Datenbank." }, { status: 503 });

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Ungültige ID." }, { status: 400 });

  try {
    const proof = await getDiscountProof(id);
    if (!proof) {
      return NextResponse.json({ error: "Kein Nachweis vorhanden – bereits gelöscht oder nie hochgeladen." }, { status: 404 });
    }
    // Wer wann einen Nachweis angesehen hat, ohne Inhalt.
    await logAudit(user.email ?? null, "VIEW_DISCOUNT_PROOF", "DISCOUNT_REQUEST", id);
    const extension = proof.type === "application/pdf" ? "pdf" : proof.type.split("/")[1];
    return new NextResponse(new Uint8Array(proof.data), {
      headers: {
        "Content-Type": proof.type,
        "Content-Disposition": `inline; filename="nachweis-${id}.${extension}"`,
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch (error) {
    console.error(`[admin/discount-requests/${id}/proof] GET error:`, error);
    return NextResponse.json({ error: "Interner Serverfehler." }, { status: 500 });
  }
}

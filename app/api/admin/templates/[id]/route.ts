import { getTemplate, updateTemplate, deleteTemplate, touchTemplate } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import type { EventTemplateInput } from "@/lib/types";
import { normalizePrice } from "@/lib/price";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tpl = await getTemplate(Number(id));
    if (!tpl) return NextResponse.json({ error: "Vorlage nicht gefunden." }, { status: 404 });
    return NextResponse.json(tpl);
  } catch (error) {
    console.error("Fehler beim Laden der Vorlage:", error);
    return NextResponse.json({ error: "Vorlage konnte nicht geladen werden." }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tplId = Number(id);
    const existing = await getTemplate(tplId);
    if (!existing) return NextResponse.json({ error: "Vorlage nicht gefunden." }, { status: 404 });

    const body: EventTemplateInput = await request.json();
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Bitte gib einen Vorlagennamen an." }, { status: 400 });
    }
    if (!body.title?.trim() || !body.category || !body.location?.trim() || !body.max_participants) {
      return NextResponse.json({ error: "Bitte fülle alle Pflichtfelder aus." }, { status: 400 });
    }

    const price = normalizePrice(body);
    await updateTemplate(tplId, {
      name: body.name.trim(),
      title: body.title.trim(),
      category: body.category,
      description: (body.description || "").trim(),
      location: body.location.trim(),
      price: price.price,
      entry_price: price.entry_price,
      dress_code: (body.dress_code || "").trim(),
      max_participants: body.max_participants,
      images: Array.isArray(body.images) ? body.images : undefined,
      template_costs: Array.isArray(body.template_costs) ? body.template_costs : [],
    });
    return NextResponse.json({ message: "Vorlage aktualisiert!" });
  } catch (error) {
    console.error("Fehler beim Aktualisieren der Vorlage:", error);
    return NextResponse.json({ error: "Vorlage konnte nicht aktualisiert werden." }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tplId = Number(id);
    const existing = await getTemplate(tplId);
    if (!existing) return NextResponse.json({ error: "Vorlage nicht gefunden." }, { status: 404 });
    await deleteTemplate(tplId);
    return NextResponse.json({ message: "Vorlage gelöscht!" });
  } catch (error) {
    console.error("Fehler beim Löschen der Vorlage:", error);
    return NextResponse.json({ error: "Vorlage konnte nicht gelöscht werden." }, { status: 500 });
  }
}

/** PATCH /api/admin/templates/[id] with { action: "touch" } to record last usage */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (body.action === "touch") {
      await touchTemplate(Number(id));
      return NextResponse.json({ message: "OK" });
    }
    return NextResponse.json({ error: "Unbekannte Aktion." }, { status: 400 });
  } catch (error) {
    console.error("Fehler beim Aktualisieren der Vorlage:", error);
    return NextResponse.json({ error: "Fehler." }, { status: 500 });
  }
}

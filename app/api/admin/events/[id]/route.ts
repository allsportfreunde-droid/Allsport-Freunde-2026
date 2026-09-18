import { getEventFull, updateEvent, deleteEvent } from "@/lib/db";
import { invalidateCache } from "@/lib/cache";
import { NextRequest, NextResponse } from "next/server";
import type { EventCreateInput } from "@/lib/types";
import { normalizePrice, normalizeStripePriceId } from "@/lib/price";
import { validateCancellationDeadline } from "@/lib/cancellation";
import { resolveChildPrice } from "@/lib/child-price";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const event = await getEventFull(Number(id));
    if (!event) {
      return NextResponse.json({ error: "Event nicht gefunden." }, { status: 404 });
    }
    return NextResponse.json(event);
  } catch (error) {
    console.error("Fehler beim Laden des Events:", error);
    return NextResponse.json({ error: "Event konnte nicht geladen werden." }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const eventId = Number(id);
    const existing = await getEventFull(eventId);
    if (!existing) {
      return NextResponse.json({ error: "Event nicht gefunden." }, { status: 404 });
    }

    const body: EventCreateInput = await request.json();

    if (!body.title?.trim() || !body.category || !body.date || !body.time || !body.location?.trim() || !body.max_participants) {
      return NextResponse.json({ error: "Bitte fülle alle Pflichtfelder aus." }, { status: 400 });
    }

    const deadlineError = validateCancellationDeadline(body);
    if (deadlineError) {
      return NextResponse.json({ error: deadlineError }, { status: 400 });
    }

    const price = normalizePrice(body);
    // Ältere Formulare ohne Kinderfeld dürfen einen hinterlegten Preis nicht löschen.
    let childPrice = {
      child_entry_price: existing.child_entry_price ?? null,
      child_price: existing.child_price ?? null,
      stripe_child_price_id: existing.stripe_child_price_id ?? null,
    };
    if (body.stripe_child_price_id !== undefined || body.child_entry_price !== undefined || body.child_price !== undefined) {
      try {
        childPrice = await resolveChildPrice(body);
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Kinderpreis konnte nicht geladen werden." }, { status: 400 });
      }
    }
    await updateEvent(eventId, {
      title: body.title.trim(),
      category: body.category,
      description: (body.description || "").trim(),
      date: body.date,
      time: body.time,
      location: body.location.trim(),
      parking_location: body.parking_location?.trim() || undefined,
      price: price.price,
      entry_price: price.entry_price,
      stripe_price_id: normalizeStripePriceId(body.stripe_price_id, price.entry_price),
      ...childPrice,
      dress_code: (body.dress_code || "").trim(),
      max_participants: body.max_participants,
      max_per_email: body.max_per_email,
      survey_url: body.survey_url?.trim() || null,
      cancellation_deadline: body.cancellation_deadline?.trim() || null,
      images: Array.isArray(body.images) ? body.images : undefined,
    });

    // Geändertes Event kann die öffentliche Liste betreffen → Cache invalidieren
    invalidateCache("events:");
    return NextResponse.json({ message: "Event aktualisiert!" });
  } catch (error) {
    console.error("Fehler beim Aktualisieren:", error);
    return NextResponse.json({ error: "Event konnte nicht aktualisiert werden." }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const eventId = Number(id);
    const existing = await getEventFull(eventId);
    if (!existing) {
      return NextResponse.json({ error: "Event nicht gefunden." }, { status: 404 });
    }

    await deleteEvent(eventId);
    // Gelöschtes Event aus öffentlicher Liste entfernen → Cache invalidieren
    invalidateCache("events:");
    return NextResponse.json({ message: "Event gelöscht!" });
  } catch (error) {
    console.error("Fehler beim Löschen:", error);
    return NextResponse.json({ error: "Event konnte nicht gelöscht werden." }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { loadChildPrice } from "@/lib/child-price";

export async function GET(request: NextRequest) {
  const priceId = request.nextUrl.searchParams.get("id")?.trim();
  if (!priceId) {
    return NextResponse.json({ error: "Keine Price ID angegeben." }, { status: 400 });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({ error: "STRIPE_SECRET_KEY ist nicht konfiguriert." }, { status: 500 });
  }

  try {
    if (request.nextUrl.searchParams.get("kind") === "child") {
      const childPrice = await loadChildPrice(priceId);
      return NextResponse.json({
        unit_amount: Math.round(childPrice.child_entry_price! * 100),
        stripe_price_id: childPrice.stripe_child_price_id,
      });
    }
    const stripe = new Stripe(secretKey);
    const price = await stripe.prices.retrieve(priceId);

    if (price.unit_amount == null) {
      return NextResponse.json({ error: "Dieser Preis hat keinen festen Betrag." }, { status: 400 });
    }

    const amount = price.unit_amount / 100;
    const formatted = new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: price.currency.toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);

    // unit_amount ist der Cent-Betrag – das interne Format der Preiseingabe.
    // Der formatierte Text kommt nur zur Anzeige mit.
    return NextResponse.json({
      unit_amount: price.unit_amount,
      price: formatted,
      stripe_price_id: price.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Preis konnte nicht geladen werden.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

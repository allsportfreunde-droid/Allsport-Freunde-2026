import { getStripe } from "./stripe";
import { normalizeManualChildPrice } from "./price";

export async function resolveChildPrice(input: {
  stripe_child_price_id?: unknown;
  child_entry_price?: unknown;
  child_price?: unknown;
}) {
  const id = input.stripe_child_price_id;
  if (id != null && id !== "" && !(typeof id === "string" && !id.trim())) {
    return { ...await loadChildPrice(id), child_price: null };
  }
  return normalizeManualChildPrice(input);
}

/** Ohne Kinder-ID gilt der Erwachsenenpreis. Eine Stripe-ID mit 0 Euro bleibt erhalten. */
export async function loadChildPrice(value: unknown): Promise<{
  child_entry_price: number | null;
  stripe_child_price_id: string | null;
}> {
  if (value == null || (typeof value === "string" && !value.trim())) {
    return { child_entry_price: null, stripe_child_price_id: null };
  }
  if (typeof value !== "string" || !/^price_[A-Za-z0-9]+$/.test(value.trim())) {
    throw new Error("Bitte eine gültige Stripe-Preis-ID für Kinder eingeben.");
  }

  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe ist derzeit nicht konfiguriert.");

  const price = await stripe.prices.retrieve(value.trim());
  if (!price.active) throw new Error("Der Kinderpreis ist in Stripe nicht aktiv.");
  if (price.currency !== "eur" || price.type !== "one_time") {
    throw new Error("Der Kinderpreis muss ein einmaliger Preis in Euro sein.");
  }
  if (price.unit_amount == null || price.unit_amount < 0 || price.transform_quantity) {
    throw new Error("Der Kinderpreis muss einen festen Betrag pro Person haben.");
  }

  return {
    child_entry_price: price.unit_amount / 100,
    stripe_child_price_id: price.id,
  };
}

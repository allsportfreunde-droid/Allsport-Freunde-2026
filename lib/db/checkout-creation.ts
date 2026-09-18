import type Stripe from "stripe";
import type { PersonPrices } from "../payment-prices";
import { getSQL, isPostgresConfigured } from "./utils";

export interface CheckoutCreation {
  request_key: string;
  request_params: Stripe.Checkout.SessionCreateParams | null;
  person_prices: PersonPrices | null;
  request_started_at: string | null;
}

/** Instanzübergreifende Sperre; abgebrochene Vorgänge behalten ihren Stripe-Idempotenzschlüssel. */
export async function claimCheckoutCreation(registrationId: number, owner: string): Promise<CheckoutCreation | null> {
  const sql = getSQL();
  const rows = await sql`INSERT INTO checkout_creation (registration_id, owner, locked_until, request_key)
    VALUES (${registrationId}, ${owner}::uuid, NOW() + INTERVAL '2 minutes', ${owner}::uuid)
    ON CONFLICT (registration_id) DO UPDATE SET owner = EXCLUDED.owner, locked_until = EXCLUDED.locked_until
    WHERE checkout_creation.locked_until < NOW()
    RETURNING request_key, request_params, person_prices, request_started_at`;
  return (rows[0] as CheckoutCreation | undefined) ?? null;
}

export async function stageCheckoutCreation(registrationId: number, owner: string,
  params: Stripe.Checkout.SessionCreateParams, prices: PersonPrices) {
  const sql = getSQL();
  const rows = await sql`UPDATE checkout_creation SET request_key = ${owner}::uuid,
    request_params = ${JSON.stringify(params)}::jsonb, person_prices = ${JSON.stringify(prices)}::jsonb,
    request_started_at = NOW(), locked_until = NOW() + INTERVAL '2 minutes'
    WHERE registration_id = ${registrationId} AND owner = ${owner}::uuid RETURNING registration_id`;
  if (!rows[0]) throw new Error("Checkout-Anlage wurde inzwischen von einem anderen Aufruf übernommen.");
}

/** Statusabrufe übernehmen nur einen verwaisten Vorgang und legen selbst keinen neuen an. */
export async function claimCheckoutRecovery(registrationId: number, owner: string): Promise<CheckoutCreation | null> {
  const sql = getSQL();
  const rows = await sql`UPDATE checkout_creation SET owner = ${owner}::uuid, locked_until = NOW() + INTERVAL '2 minutes'
    WHERE registration_id = ${registrationId} AND locked_until < NOW()
    RETURNING request_key, request_params, person_prices, request_started_at`;
  return (rows[0] as CheckoutCreation | undefined) ?? null;
}

export async function releaseCheckoutCreation(registrationId: number, owner: string): Promise<boolean> {
  const sql = getSQL();
  const rows = await sql`DELETE FROM checkout_creation
    WHERE registration_id = ${registrationId} AND owner = ${owner}::uuid RETURNING registration_id`;
  return rows.length > 0;
}

export async function hasCheckoutCreation(registrationId: number): Promise<boolean> {
  if (!isPostgresConfigured()) return false;
  const sql = getSQL();
  const rows = await sql`SELECT registration_id FROM checkout_creation WHERE registration_id = ${registrationId}`;
  return rows.length > 0;
}

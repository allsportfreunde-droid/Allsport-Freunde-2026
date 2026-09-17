import type { getSQL } from "./utils";

/** Ergänzt nur Zustand und Versandnachweis; vorhandene Preise bleiben erhalten. */
export async function migrateCheckoutFulfillment(sql: ReturnType<typeof getSQL>) {
  // Alte Stripe-Sessions können noch ohne gespeicherte Preisaufteilung existieren.
  await sql`ALTER TABLE checkout_pricing ALTER COLUMN person_prices DROP NOT NULL`;
  await sql`ALTER TABLE checkout_pricing ADD COLUMN IF NOT EXISTS payment_state TEXT NOT NULL DEFAULT 'open'
    CHECK (payment_state IN ('open', 'processing', 'paid', 'failed', 'checking'))`;
  await sql`ALTER TABLE checkout_pricing DROP CONSTRAINT IF EXISTS checkout_pricing_payment_state_check`;
  await sql`ALTER TABLE checkout_pricing ADD CONSTRAINT checkout_pricing_payment_state_check
    CHECK (payment_state IN ('open', 'processing', 'paid', 'failed', 'checking'))`;
  await sql`ALTER TABLE checkout_pricing ADD COLUMN IF NOT EXISTS payment_intent_id TEXT`;
  await sql`CREATE INDEX IF NOT EXISTS idx_checkout_pricing_registration ON checkout_pricing(registration_id)`;
  await sql`
    CREATE TABLE IF NOT EXISTS checkout_notifications (
      id TEXT PRIMARY KEY,
      registration_id INTEGER NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('approval', 'payment_failed', 'refund_due')),
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      message JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      first_attempt_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      cancelled_at TIMESTAMPTZ
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_checkout_notifications_registration ON checkout_notifications(registration_id)`;
  // Vor der Stripe-Antwort existiert noch keine session_id für checkout_pricing.
  await sql`CREATE TABLE IF NOT EXISTS checkout_creation (
    registration_id INTEGER PRIMARY KEY REFERENCES registrations(id) ON DELETE CASCADE,
    owner UUID NOT NULL,
    locked_until TIMESTAMPTZ NOT NULL,
    request_key UUID NOT NULL,
    request_params JSONB,
    person_prices JSONB,
    request_started_at TIMESTAMPTZ
  )`;
}

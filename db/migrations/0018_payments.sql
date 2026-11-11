-- Zahlungen an der Anmeldung (bisher scripts/migrate-payments.ts)
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(10,2);
-- Die Session-ID ist der Schlüssel gegen Doppelbuchung – eindeutig, damit
-- eine zweite Meldung desselben Ereignisses ins Leere läuft.
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS stripe_session_id VARCHAR(255);
-- Die PaymentIntent-ID führt im Stripe-Dashboard direkt zur Zahlung.
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS stripe_payment_intent_id VARCHAR(255);
CREATE UNIQUE INDEX IF NOT EXISTS idx_registrations_stripe_session
  ON registrations(stripe_session_id) WHERE stripe_session_id IS NOT NULL;

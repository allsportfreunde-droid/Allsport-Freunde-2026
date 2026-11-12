-- Stripe Price IDs ("price_1AbC…"). Leer bei kostenlosen Events und manuell
-- gepflegten Preisen (bisher scripts/migrate-stripe.ts)
ALTER TABLE events ADD COLUMN IF NOT EXISTS stripe_price_id VARCHAR(255);

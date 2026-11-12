-- Preisaufteilung je Person beim Checkout (bisher scripts/migrate-person-prices.ts).
-- NULL bleibt für bestehende Zahlungen erhalten: ihre bisherige Aufteilung gilt weiter.
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS paid_person_prices JSONB;
CREATE TABLE IF NOT EXISTS checkout_pricing (
  session_id VARCHAR(255) PRIMARY KEY,
  registration_id INTEGER NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  person_prices JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

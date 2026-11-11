-- Stripe-Produkte und ermäßigte Preise (bisher scripts/migrate-stripe-catalog.ts).
-- Erwachsene und Kind nutzen weiter stripe_price_id / stripe_child_price_id.
-- Bestehende Events erhalten ihre IDs beim nächsten Speichern im Admin.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS stripe_product_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS stripe_adult_reduced_30_price_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS stripe_adult_reduced_50_price_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS stripe_child_reduced_30_price_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS stripe_child_reduced_50_price_id VARCHAR(255);
-- Ein Produkt je Preisstufe ({ tier: productId }). stripe_product_id (früher
-- ein Produkt je Event) wird beim nächsten Abgleich archiviert und geleert.
ALTER TABLE events ADD COLUMN IF NOT EXISTS stripe_tier_products JSONB;

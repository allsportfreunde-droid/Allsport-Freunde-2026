-- Kinderpreis (bisher scripts/migrate-child-price.ts). Bestehende Events
-- behalten ohne Kinderpreis den Erwachsenenpreis; eine hinterlegte 0 bleibt
-- von NULL unterscheidbar.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS child_entry_price NUMERIC(10, 2)
    CHECK (child_entry_price >= 0),
  ADD COLUMN IF NOT EXISTS stripe_child_price_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS child_price VARCHAR(100);

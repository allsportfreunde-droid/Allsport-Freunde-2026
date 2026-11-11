-- Walk-ins (bisher scripts/migrate-walkin.ts)
-- Walk-ins haben nicht unbedingt eine E-Mail-Adresse.
ALTER TABLE registrations ALTER COLUMN email DROP NOT NULL;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS is_walk_in BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS notes TEXT;
CREATE INDEX IF NOT EXISTS idx_registrations_is_walk_in ON registrations(is_walk_in) WHERE is_walk_in = TRUE;

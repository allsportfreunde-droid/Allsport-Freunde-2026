-- Warteliste von offenen Anmeldungen unterscheidbar machen (bisher scripts/migrate-waitlist.ts).
-- Seit dem Kapazitätsmodell (lib/waitlist.ts) nur noch Info: "bei der Anmeldung ausgebucht".
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS is_waitlist BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_registrations_is_waitlist ON registrations(is_waitlist) WHERE is_waitlist = TRUE;

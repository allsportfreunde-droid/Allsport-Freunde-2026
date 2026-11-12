-- Eigener Stornozeitpunkt (bisher scripts/migrate-cancellation.ts). Leer = es
-- gilt "24 Stunden vor Beginn"; ein Wert setzt einen festen Zeitpunkt.
ALTER TABLE events ADD COLUMN IF NOT EXISTS cancellation_deadline TIMESTAMP;

-- Erstattungen je Person (bisher scripts/migrate-refunds.ts). Wer 5 Plätze
-- bezahlt und einen storniert, bekommt ein Fünftel zurück – deshalb steht der
-- Anteil an der Person, nicht an der Anmeldung.
ALTER TABLE registration_persons ADD COLUMN IF NOT EXISTS refund_amount DECIMAL(10,2);
-- Sperre gegen eine doppelte Zusage: geschrieben wird nur, solange leer.
ALTER TABLE registration_persons ADD COLUMN IF NOT EXISTS refund_announced_at TIMESTAMPTZ;

-- Ermäßigung je Person (bisher scripts/migrate-person-discount.ts), bei der
-- Anmeldung serverseitig aus der Ermäßigungsliste übernommen. NULL = voller Preis.
ALTER TABLE registration_persons
  ADD COLUMN IF NOT EXISTS discount VARCHAR(20)
    CHECK (discount IN ('reduced_30', 'reduced_50'));

-- Ermäßigungsliste nach § 3 (bisher scripts/migrate-discount-holders.ts).
-- Der Nachweis wird nur vermerkt (geprüft am / von), nie gespeichert.
CREATE TABLE IF NOT EXISTS discount_holders (
  id               SERIAL PRIMARY KEY,
  first_name       VARCHAR(50)  NOT NULL,
  last_name        VARCHAR(50)  NOT NULL,
  email            VARCHAR(255) NOT NULL,
  phone            VARCHAR(50),
  discount         VARCHAR(20)  NOT NULL CHECK (discount IN ('reduced_30', 'reduced_50')),
  proof_checked_at DATE         NOT NULL,
  proof_checked_by VARCHAR(255) NOT NULL,
  valid_until      DATE,
  notes            TEXT,
  consented_at     TIMESTAMP,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);
-- Einwilligung zur automatischen Erkennung bei der Online-Anmeldung (Art. 9 DSGVO).
ALTER TABLE discount_holders ADD COLUMN IF NOT EXISTS consented_at TIMESTAMP;
-- Eine Person = Vorname + Nachname + E-Mail; zugleich der Abgleich mit Anmeldungen.
CREATE UNIQUE INDEX IF NOT EXISTS idx_discount_holders_person
  ON discount_holders (email, LOWER(first_name), LOWER(last_name));

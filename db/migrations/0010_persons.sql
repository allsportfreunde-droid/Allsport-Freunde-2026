-- Personen je Anmeldung statt Name + Begleiterzahl (bisher scripts/migrate-persons.ts)
CREATE TABLE IF NOT EXISTS registration_persons (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id INTEGER NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  first_name      VARCHAR(100) NOT NULL,
  last_name       VARCHAR(100) NOT NULL,
  checked_in_at   TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reg_persons_registration_id ON registration_persons(registration_id);

ALTER TABLE events ADD COLUMN IF NOT EXISTS max_per_email INT NOT NULL DEFAULT 5;

-- Datenübernahme aus registrations.first_name/last_name/guests – nur solange
-- es diese Spalten noch gibt. Das alte Skript löschte sie danach und war
-- deshalb kein zweites Mal lauffähig; die Prüfung macht es wiederholbar.
--
-- Anmelder und Begleitpersonen in EINEM Schritt: Das alte Skript fügte erst
-- die Anmelder ein und suchte danach Anmeldungen "ohne Person" für die
-- Begleiter – die gab es dann nicht mehr, Begleiter fielen weg. Die Zeit-
-- stempel halten den Anmelder vorn (Personen werden nach created_at sortiert).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'registrations' AND column_name = 'first_name'
  ) THEN
    WITH legacy AS (
      SELECT r.id, r.first_name, r.last_name, r.guests
      FROM registrations r
      WHERE NOT EXISTS (SELECT 1 FROM registration_persons rp WHERE rp.registration_id = r.id)
    )
    INSERT INTO registration_persons (registration_id, first_name, last_name, created_at)
    SELECT l.id, l.first_name, l.last_name, NOW()
    FROM legacy l
    WHERE l.first_name IS NOT NULL
    UNION ALL
    SELECT l.id, 'Begleitperson', 'Begleitperson', NOW() + gs.n * INTERVAL '1 millisecond'
    FROM legacy l
    CROSS JOIN generate_series(1, l.guests) AS gs(n)
    WHERE l.guests > 0;

    ALTER TABLE registrations
      DROP COLUMN IF EXISTS first_name,
      DROP COLUMN IF EXISTS last_name,
      DROP COLUMN IF EXISTS guests;
  END IF;
END $$;

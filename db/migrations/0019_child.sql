-- Kind ja/nein je Person (bisher scripts/migrate-child.ts). Bestehende
-- Personen gelten als Erwachsene – wie der Default "Nein" im Formular.
ALTER TABLE registration_persons ADD COLUMN IF NOT EXISTS is_child BOOLEAN NOT NULL DEFAULT FALSE;

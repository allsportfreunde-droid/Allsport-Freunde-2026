-- Wiederanmeldung nach Stornierung (bisher scripts/migrate-registration-history.ts).
-- Die frühere Constraint erlaubte je Event und E-Mail nur einen Datensatz.
-- Künftig beliebig viele stornierte, aber höchstens eine aktive Anmeldung.
ALTER TABLE registrations DROP CONSTRAINT IF EXISTS registrations_event_id_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_registrations_active_event_email
  ON registrations(event_id, email)
  WHERE email IS NOT NULL AND status IN ('pending', 'approved');

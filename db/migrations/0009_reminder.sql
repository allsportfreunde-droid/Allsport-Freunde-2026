-- Erinnerungsmails und Stornolinks (bisher scripts/migrate-reminder.ts)
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS cancellation_tokens (
  id              TEXT        NOT NULL PRIMARY KEY,
  token           TEXT        NOT NULL UNIQUE,
  registration_id INTEGER     NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  expires_at      TIMESTAMP   NOT NULL,
  used_at         TIMESTAMP,
  created_at      TIMESTAMP   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cancellation_tokens_token ON cancellation_tokens(token);
CREATE INDEX IF NOT EXISTS idx_cancellation_tokens_registration_id ON cancellation_tokens(registration_id);

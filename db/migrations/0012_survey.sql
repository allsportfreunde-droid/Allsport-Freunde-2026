-- Umfrage nach dem Event (bisher scripts/migrate-survey.ts)
ALTER TABLE events ADD COLUMN IF NOT EXISTS survey_url TEXT;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS survey_sent_at TIMESTAMP;

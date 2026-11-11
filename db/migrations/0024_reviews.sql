-- Event-Reviews (bisher scripts/migrate-reviews.ts)
-- Versandzeitpunkt startet das Antwortfenster; Erinnerung separat.
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS review_requested_at TIMESTAMPTZ;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS review_reminded_at TIMESTAMPTZ;
-- Höchstens ein Erinnerungslauf pro Event.
ALTER TABLE events ADD COLUMN IF NOT EXISTS review_reminder_sent_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS event_reviews (
  id               SERIAL PRIMARY KEY,
  event_id         INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  registration_id  INTEGER NOT NULL UNIQUE REFERENCES registrations(id) ON DELETE CASCADE,
  rating           SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  would_return     VARCHAR(12) CHECK (would_return IN ('ja', 'vielleicht', 'nein')),
  comment          TEXT CHECK (comment IS NULL OR char_length(comment) <= 2000),
  publish_consent  BOOLEAN NOT NULL DEFAULT FALSE,
  published_at     TIMESTAMPTZ,
  published_by     VARCHAR(255),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_event_reviews_event_id ON event_reviews(event_id);
CREATE INDEX IF NOT EXISTS idx_event_reviews_published ON event_reviews(published_at) WHERE published_at IS NOT NULL;

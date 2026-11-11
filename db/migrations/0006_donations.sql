-- Spenden je Event (bisher scripts/migrate-donations.ts)
CREATE TABLE IF NOT EXISTS event_donations (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  registration_id INTEGER REFERENCES registrations(id) ON DELETE SET NULL,
  donor_name VARCHAR(255) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  note TEXT,
  created_by VARCHAR(100),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_event_donations_event_id ON event_donations(event_id);
CREATE INDEX IF NOT EXISTS idx_event_donations_registration_id ON event_donations(registration_id);

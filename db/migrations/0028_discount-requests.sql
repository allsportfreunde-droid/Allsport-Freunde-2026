-- Ermäßigungsanträge aus der Anmeldung (bisher scripts/migrate-discount-requests.ts).
-- Der Nachweis liegt nur bis zur Entscheidung hier (spätestens 30 Tage) und
-- wird dann geleert. Bewusst kein Dateiname – er kann Namen enthalten.
CREATE TABLE IF NOT EXISTS discount_requests (
  id                SERIAL PRIMARY KEY,
  person_id         UUID NOT NULL UNIQUE REFERENCES registration_persons(id) ON DELETE CASCADE,
  registration_id   INTEGER NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  discount          VARCHAR(20) NOT NULL CHECK (discount IN ('reduced_30', 'reduced_50')),
  status            VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  remember          BOOLEAN NOT NULL DEFAULT FALSE,
  consented_at      TIMESTAMP NOT NULL,
  proof_data        BYTEA,
  proof_type        VARCHAR(30),
  proof_uploaded_at TIMESTAMP,
  proof_deleted_at  TIMESTAMP,
  decided_at        TIMESTAMP,
  decided_by        VARCHAR(255),
  decision_note     TEXT,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_discount_requests_status ON discount_requests(status);
CREATE INDEX IF NOT EXISTS idx_discount_requests_registration ON discount_requests(registration_id);

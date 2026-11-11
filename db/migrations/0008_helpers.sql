-- Helferverwaltung (bisher scripts/migrate-helpers.ts)
CREATE TABLE IF NOT EXISTS helpers (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  email       VARCHAR(255),
  phone       VARCHAR(50),
  qualifications TEXT[] NOT NULL DEFAULT '{}',
  notes       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_helpers_is_active ON helpers(is_active);
CREATE INDEX IF NOT EXISTS idx_helpers_name ON helpers(name);

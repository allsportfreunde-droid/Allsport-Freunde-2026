-- Check-in per QR-Code (bisher scripts/migrate-checkin.ts)
ALTER TABLE registrations
  ADD COLUMN IF NOT EXISTS qr_code TEXT,
  ADD COLUMN IF NOT EXISTS qr_token TEXT,
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS checked_in_by VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_registrations_qr_token ON registrations(qr_token);

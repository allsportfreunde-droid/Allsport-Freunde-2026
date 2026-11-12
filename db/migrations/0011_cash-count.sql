-- Kassensturz nach dem Event (bisher scripts/migrate-cash-count.ts)
ALTER TABLE events ADD COLUMN IF NOT EXISTS cash_counted DECIMAL(10,2);
ALTER TABLE events ADD COLUMN IF NOT EXISTS cash_counted_at TIMESTAMPTZ;

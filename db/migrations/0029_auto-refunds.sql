-- Automatische Erstattung über Stripe bei fristgerechter Stornierung.
-- refund_status gilt nur für zugesagte Beträge über 0:
--   processing – beansprucht, die Stripe-Erstattung läuft
--   refunded   – Stripe hat die Erstattung angenommen (stripe_refund_id)
--   failed     – Stripe hat abgelehnt, das Team erstattet von Hand (refund_error)
--   manual     – vor der Automatik zugesagt und von Hand erstattet
ALTER TABLE registration_persons
  ADD COLUMN IF NOT EXISTS refund_status VARCHAR(20)
    CHECK (refund_status IN ('processing', 'refunded', 'failed', 'manual'));
ALTER TABLE registration_persons ADD COLUMN IF NOT EXISTS stripe_refund_id TEXT;
ALTER TABLE registration_persons ADD COLUMN IF NOT EXISTS refund_error TEXT;
ALTER TABLE registration_persons ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

-- Bisherige Zusagen wurden von Hand erstattet und dürfen nie automatisch
-- ein zweites Mal zurückgehen.
UPDATE registration_persons SET refund_status = 'manual'
WHERE refund_announced_at IS NOT NULL AND refund_amount > 0 AND refund_status IS NULL;

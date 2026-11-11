-- Grundschema – bisher scripts/setup-db.ts. Alles ist wiederholbar
-- (IF NOT EXISTS), damit diese Datei auch auf bestehenden Datenbanken läuft.

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL CHECK(category IN ('fussball', 'fitness', 'schwimmen')),
  description TEXT NOT NULL,
  date DATE NOT NULL,
  time VARCHAR(10) NOT NULL,
  location VARCHAR(255) NOT NULL,
  parking_location TEXT,
  price VARCHAR(100) NOT NULL,
  dress_code VARCHAR(255) NOT NULL,
  max_participants INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  cancellation_reason TEXT,
  published_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
ALTER TABLE events ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'draft';
ALTER TABLE events ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS published_at TIMESTAMP;
-- Alter Status 'active' → 'published'
UPDATE events SET status = 'published', published_at = created_at WHERE status = 'active';
ALTER TABLE events ADD COLUMN IF NOT EXISTS parking_location TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS stripe_price_id VARCHAR(255);
-- Kinderpreis: NULL übernimmt den Erwachsenenpreis, 0 bedeutet kostenlos.
ALTER TABLE events ADD COLUMN IF NOT EXISTS child_entry_price NUMERIC(10, 2) CHECK (child_entry_price >= 0);
ALTER TABLE events ADD COLUMN IF NOT EXISTS stripe_child_price_id VARCHAR(255);
ALTER TABLE events ADD COLUMN IF NOT EXISTS child_price VARCHAR(100);
-- Stripe-Produkt je Event und die ermäßigten Preise (§ 3), siehe lib/stripe-catalog.ts
ALTER TABLE events ADD COLUMN IF NOT EXISTS stripe_product_id VARCHAR(255);
ALTER TABLE events ADD COLUMN IF NOT EXISTS stripe_adult_reduced_30_price_id VARCHAR(255);
ALTER TABLE events ADD COLUMN IF NOT EXISTS stripe_adult_reduced_50_price_id VARCHAR(255);
ALTER TABLE events ADD COLUMN IF NOT EXISTS stripe_child_reduced_30_price_id VARCHAR(255);
ALTER TABLE events ADD COLUMN IF NOT EXISTS stripe_child_reduced_50_price_id VARCHAR(255);
ALTER TABLE events ADD COLUMN IF NOT EXISTS stripe_tier_products JSONB;
-- Eigener Stornozeitpunkt (leer = 24 Stunden vor Beginn)
ALTER TABLE events ADD COLUMN IF NOT EXISTS cancellation_deadline TIMESTAMP;

CREATE TABLE IF NOT EXISTS registrations (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id),
  first_name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  guests INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  status_token VARCHAR(255),
  status_changed_at TIMESTAMP,
  status_note TEXT,
  is_walk_in BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
ALTER TABLE registrations ALTER COLUMN email DROP NOT NULL;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS is_walk_in BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS notes TEXT;
-- Warteliste vom normalen "pending" unterscheidbar machen
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS is_waitlist BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_registrations_is_waitlist ON registrations(is_waitlist) WHERE is_waitlist = TRUE;
-- Zahlungen an der Anmeldung festhalten
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(10,2);
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS stripe_session_id VARCHAR(255);
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS stripe_payment_intent_id VARCHAR(255);
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS paid_person_prices JSONB;
-- Stornierte Anmeldungen bleiben als Zahlungs-/Erstattungshistorie erhalten.
-- Nur gleichzeitig aktive Anmeldungen derselben E-Mail werden verhindert.
ALTER TABLE registrations DROP CONSTRAINT IF EXISTS registrations_event_id_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_registrations_active_event_email
  ON registrations(event_id, email)
  WHERE email IS NOT NULL AND status IN ('pending', 'approved');
CREATE TABLE IF NOT EXISTS checkout_pricing (
  session_id VARCHAR(255) PRIMARY KEY,
  registration_id INTEGER NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  person_prices JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_registrations_stripe_session ON registrations(stripe_session_id) WHERE stripe_session_id IS NOT NULL;

-- Checkout-Zustand und Versandnachweise (bisher lib/db/checkout-schema.ts).
-- Alte Stripe-Sessions können noch ohne gespeicherte Preisaufteilung existieren.
ALTER TABLE checkout_pricing ALTER COLUMN person_prices DROP NOT NULL;
ALTER TABLE checkout_pricing ADD COLUMN IF NOT EXISTS payment_state TEXT NOT NULL DEFAULT 'open'
  CHECK (payment_state IN ('open', 'processing', 'paid', 'failed', 'checking'));
ALTER TABLE checkout_pricing DROP CONSTRAINT IF EXISTS checkout_pricing_payment_state_check;
ALTER TABLE checkout_pricing ADD CONSTRAINT checkout_pricing_payment_state_check
  CHECK (payment_state IN ('open', 'processing', 'paid', 'failed', 'checking'));
ALTER TABLE checkout_pricing ADD COLUMN IF NOT EXISTS payment_intent_id TEXT;
CREATE INDEX IF NOT EXISTS idx_checkout_pricing_registration ON checkout_pricing(registration_id);
CREATE TABLE IF NOT EXISTS checkout_notifications (
  id TEXT PRIMARY KEY,
  registration_id INTEGER NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('approval', 'payment_failed', 'refund_due')),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  message JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_attempt_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_checkout_notifications_registration ON checkout_notifications(registration_id);
-- Vor der Stripe-Antwort existiert noch keine session_id für checkout_pricing.
CREATE TABLE IF NOT EXISTS checkout_creation (
  registration_id INTEGER PRIMARY KEY REFERENCES registrations(id) ON DELETE CASCADE,
  owner UUID NOT NULL,
  locked_until TIMESTAMPTZ NOT NULL,
  request_key UUID NOT NULL,
  request_params JSONB,
  person_prices JSONB,
  request_started_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_registrations_is_walk_in ON registrations(is_walk_in) WHERE is_walk_in = TRUE;

CREATE TABLE IF NOT EXISTS event_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL CHECK(category IN ('fussball', 'fitness', 'schwimmen')),
  description TEXT NOT NULL DEFAULT '',
  location VARCHAR(255) NOT NULL,
  price VARCHAR(100) NOT NULL,
  dress_code VARCHAR(255) NOT NULL DEFAULT '',
  max_participants INTEGER NOT NULL,
  last_used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS event_images (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  alt_text VARCHAR(500) NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_event_images_event_id ON event_images(event_id);

CREATE TABLE IF NOT EXISTS template_images (
  id SERIAL PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES event_templates(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  alt_text VARCHAR(500) NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_template_images_template_id ON template_images(template_id);

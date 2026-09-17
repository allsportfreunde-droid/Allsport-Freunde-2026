import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { migrateCheckoutFulfillment } from "../lib/db/checkout-schema";

const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("Fehler: POSTGRES_URL oder DATABASE_URL ist nicht gesetzt.");
  process.exit(1);
}
const sql = neon(dbUrl);

async function setup() {
  console.log("Erstelle Tabellen in Neon Postgres...\n");

  await sql`
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
    )
  `;
  // Migration: add/update columns for existing databases
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'draft'`;
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS cancellation_reason TEXT`;
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS published_at TIMESTAMP`;
  // Migrate legacy 'active' status → 'published'
  await sql`UPDATE events SET status = 'published', published_at = created_at WHERE status = 'active'`;
  // Migration: parking_location für bestehende Datenbanken
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS parking_location TEXT`;
  // Migration: Stripe Price ID für bestehende Datenbanken
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS stripe_price_id VARCHAR(255)`;
  // Kinderpreis: NULL übernimmt den Erwachsenenpreis, 0 bedeutet kostenlos.
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS child_entry_price NUMERIC(10, 2) CHECK (child_entry_price >= 0)`;
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS stripe_child_price_id VARCHAR(255)`;
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS child_price VARCHAR(100)`;
  // Migration: eigener Stornozeitpunkt (leer = 24 Stunden vor Beginn)
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS cancellation_deadline TIMESTAMP`;
  console.log("  ✓ Tabelle 'events' erstellt");

  await sql`
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
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(event_id, email)
    )
  `;
  // Migrations for existing databases
  await sql`ALTER TABLE registrations ALTER COLUMN email DROP NOT NULL`;
  await sql`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS is_walk_in BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS notes TEXT`;
  // Migration: Warteliste vom normalen "pending" unterscheidbar machen
  await sql`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS is_waitlist BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`CREATE INDEX IF NOT EXISTS idx_registrations_is_waitlist ON registrations(is_waitlist) WHERE is_waitlist = TRUE`;
  // Migration: Zahlungen an der Anmeldung festhalten
  await sql`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP`;
  await sql`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(10,2)`;
  await sql`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS stripe_session_id VARCHAR(255)`;
  await sql`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS stripe_payment_intent_id VARCHAR(255)`;
  await sql`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS paid_person_prices JSONB`;
  await sql`
    CREATE TABLE IF NOT EXISTS checkout_pricing (
      session_id VARCHAR(255) PRIMARY KEY,
      registration_id INTEGER NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
      person_prices JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_registrations_stripe_session ON registrations(stripe_session_id) WHERE stripe_session_id IS NOT NULL`;
  await migrateCheckoutFulfillment(sql);
  await sql`CREATE INDEX IF NOT EXISTS idx_registrations_is_walk_in ON registrations(is_walk_in) WHERE is_walk_in = TRUE`;
  console.log("  ✓ Tabelle 'registrations' erstellt");

  await sql`
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
    )
  `;
  console.log("  ✓ Tabelle 'event_templates' erstellt");

  await sql`
    CREATE TABLE IF NOT EXISTS event_images (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      alt_text VARCHAR(500) NOT NULL DEFAULT '',
      position INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_event_images_event_id ON event_images(event_id)`;
  console.log("  ✓ Tabelle 'event_images' erstellt");

  await sql`
    CREATE TABLE IF NOT EXISTS template_images (
      id SERIAL PRIMARY KEY,
      template_id INTEGER NOT NULL REFERENCES event_templates(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      alt_text VARCHAR(500) NOT NULL DEFAULT '',
      position INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_template_images_template_id ON template_images(template_id)`;
  console.log("  ✓ Tabelle 'template_images' erstellt");

  console.log("\nDatenbank-Setup abgeschlossen!");
}

setup().catch((err) => {
  console.error("Fehler beim Setup:", err);
  process.exit(1);
});

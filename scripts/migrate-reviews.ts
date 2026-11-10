import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("Fehler: POSTGRES_URL oder DATABASE_URL ist nicht gesetzt.");
  process.exit(1);
}
const sql = neon(dbUrl);

async function migrate() {
  console.log("Führe Review-Migration durch...\n");

  // Anmeldungen: Versandzeitpunkt startet das Antwortfenster; Erinnerung separat.
  await sql`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS review_requested_at TIMESTAMPTZ`;
  await sql`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS review_reminded_at TIMESTAMPTZ`;
  console.log("  ✓ Review-Spalten in 'registrations' hinzugefügt");

  // Veranstaltungen: höchstens ein Erinnerungslauf pro Event.
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS review_reminder_sent_at TIMESTAMPTZ`;
  console.log("  ✓ Review-Spalte in 'events' hinzugefügt");

  await sql`
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
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_event_reviews_event_id ON event_reviews(event_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_event_reviews_published ON event_reviews(published_at) WHERE published_at IS NOT NULL`;
  console.log("  ✓ Tabelle 'event_reviews' erstellt");

  console.log("\nReview-Migration abgeschlossen!");
}

migrate().catch((err) => {
  console.error("Fehler bei der Migration:", err);
  process.exit(1);
});

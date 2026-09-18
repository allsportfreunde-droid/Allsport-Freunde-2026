import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!dbUrl) throw new Error("POSTGRES_URL oder DATABASE_URL ist nicht gesetzt.");
const sql = neon(dbUrl);

async function migrate() {
  // NULL bleibt für bestehende Zahlungen erhalten: ihre bisherige Aufteilung gilt weiter.
  await sql`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS paid_person_prices JSONB`;
  await sql`
    CREATE TABLE IF NOT EXISTS checkout_pricing (
      session_id VARCHAR(255) PRIMARY KEY,
      registration_id INTEGER NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
      person_prices JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  console.log("Preisaufteilung für Checkout und bezahlte Anmeldungen vorbereitet.");
}

migrate().catch((error) => {
  console.error("Fehler bei der Zahlungsaufteilung-Migration:", error);
  process.exit(1);
});

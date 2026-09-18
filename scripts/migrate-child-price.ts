import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("Fehler: POSTGRES_URL oder DATABASE_URL ist nicht gesetzt.");
  process.exit(1);
}
const sql = neon(dbUrl);

async function migrate() {
  // Bestehende Events behalten ohne Kinderpreis den Erwachsenenpreis.
  // Eine ausdrücklich hinterlegte 0 bleibt von NULL unterscheidbar.
  await sql`
    ALTER TABLE events
      ADD COLUMN IF NOT EXISTS child_entry_price NUMERIC(10, 2)
        CHECK (child_entry_price >= 0),
      ADD COLUMN IF NOT EXISTS stripe_child_price_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS child_price VARCHAR(100)
  `;
  console.log("Kinderbetrag und Stripe-Preis-ID an events ergänzt.");
}

migrate().catch((error) => {
  console.error("Fehler bei der Kinderpreis-Migration:", error);
  process.exit(1);
});

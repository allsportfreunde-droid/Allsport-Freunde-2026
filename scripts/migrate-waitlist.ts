import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("Fehler: POSTGRES_URL oder DATABASE_URL ist nicht gesetzt.");
  process.exit(1);
}
const sql = neon(dbUrl);

async function migrate() {
  console.log("Führe Warteliste-Migration durch...\n");

  // Bisher war "Warteliste" gleichbedeutend mit status = 'pending'. Das reicht
  // nicht mehr: wer einen Platz hat, soll zahlen können – wer auf der
  // Warteliste steht, ausdrücklich nicht. Beide sind aber 'pending'.
  await sql`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS is_waitlist BOOLEAN NOT NULL DEFAULT FALSE`;
  console.log("  ✓ registrations.is_waitlist hinzugefügt (BOOLEAN, Standard FALSE)");

  await sql`CREATE INDEX IF NOT EXISTS idx_registrations_is_waitlist ON registrations(is_waitlist) WHERE is_waitlist = TRUE`;
  console.log("  ✓ Index auf is_waitlist angelegt");

  console.log("\nWarteliste-Migration abgeschlossen!");
}

migrate().catch((err) => {
  console.error("Fehler bei der Migration:", err);
  process.exit(1);
});

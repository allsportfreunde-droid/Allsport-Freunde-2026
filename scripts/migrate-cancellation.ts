import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("Fehler: POSTGRES_URL oder DATABASE_URL ist nicht gesetzt.");
  process.exit(1);
}
const sql = neon(dbUrl);

async function migrate() {
  console.log("Führe Stornofrist-Migration durch...\n");

  // Leer = es gilt die Regel "24 Stunden vor Beginn". Ein Wert setzt stattdessen
  // einen festen Zeitpunkt, etwa wenn Hallenzeit vorher verbindlich wird.
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS cancellation_deadline TIMESTAMP`;
  console.log("  ✓ events.cancellation_deadline hinzugefügt (TIMESTAMP, nullable)");

  console.log("\nStornofrist-Migration abgeschlossen!");
}

migrate().catch((err) => {
  console.error("Fehler bei der Migration:", err);
  process.exit(1);
});

import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("POSTGRES_URL oder DATABASE_URL ist nicht gesetzt.");
  process.exit(1);
}
const sql = neon(dbUrl);

async function migrate() {
  console.log("Führe Migration für Wiederanmeldungen durch...\n");

  // Die frühere Tabellen-Constraint erlaubte je Event und E-Mail insgesamt nur
  // einen Datensatz. Künftig darf es beliebig viele stornierte Historieneinträge,
  // aber weiterhin höchstens eine aktive Anmeldung geben.
  await sql`ALTER TABLE registrations DROP CONSTRAINT IF EXISTS registrations_event_id_email_key`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_registrations_active_event_email
    ON registrations(event_id, email)
    WHERE email IS NOT NULL AND status IN ('pending', 'approved')`;

  console.log("  ✓ Stornierte Anmeldungen bleiben erhalten; aktive Duplikate bleiben gesperrt");
  console.log("\nMigration für Wiederanmeldungen abgeschlossen!");
}

migrate().catch((err) => {
  console.error("Fehler bei der Migration:", err);
  process.exit(1);
});

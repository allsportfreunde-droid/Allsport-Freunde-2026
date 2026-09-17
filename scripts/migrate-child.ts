import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("Fehler: POSTGRES_URL oder DATABASE_URL ist nicht gesetzt.");
  process.exit(1);
}
const sql = neon(dbUrl);

async function migrate() {
  console.log("Migration: Kind-Kennzeichen (U18) an registration_persons\n");

  // Bestehende Personen gelten als Erwachsene – das Kennzeichen wurde bei
  // ihrer Anmeldung nie erhoben, und "Nein" ist auch im Formular der Default.
  await sql`
    ALTER TABLE registration_persons
      ADD COLUMN IF NOT EXISTS is_child BOOLEAN NOT NULL DEFAULT FALSE
  `;
  console.log("  ✓ Spalte 'is_child' auf registration_persons bereit");

  const counts = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE is_child)::int AS children
    FROM registration_persons
  `;
  const { total, children } = counts[0] as { total: number; children: number };
  console.log(`\n  ${total} Personen gesamt, davon ${children} als Kind markiert`);
  console.log("\nMigration abgeschlossen!");
}

migrate().catch((err) => {
  console.error("Fehler bei der Migration:", err);
  process.exit(1);
});

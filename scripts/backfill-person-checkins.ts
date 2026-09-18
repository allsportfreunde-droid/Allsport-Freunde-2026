import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("Fehler: POSTGRES_URL oder DATABASE_URL ist nicht gesetzt.");
  process.exit(1);
}
const sql = neon(dbUrl);

/**
 * Repariert Anmeldungen, bei denen die Anmeldung selbst eingecheckt ist,
 * aber keine einzige Person einen Check-In-Zeitstempel hat.
 *
 * Das betraf Walk-ins, die über das Check-In-Dashboard angelegt wurden:
 * dort wurde nur registrations.checked_in_at gesetzt, die zugehörigen
 * registration_persons blieben ohne checked_in_at – dadurch zählten die
 * Personen weder in der Check-In-Statistik noch in den Einnahmen.
 *
 * Teilweise eingecheckte Anmeldungen (mindestens eine Person eingecheckt)
 * bleiben unangetastet, da dort bewusst einzelne Personen offen sind.
 */
async function backfill() {
  console.log("Backfill: Personen-Check-Ins nachtragen\n");

  const rows = await sql`
    UPDATE registration_persons rp
    SET checked_in_at = r.checked_in_at
    FROM registrations r
    WHERE rp.registration_id = r.id
      AND r.checked_in_at IS NOT NULL
      AND rp.cancelled_at IS NULL
      AND rp.checked_in_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM registration_persons rp2
        WHERE rp2.registration_id = r.id
          AND rp2.cancelled_at IS NULL
          AND rp2.checked_in_at IS NOT NULL
      )
    RETURNING rp.id
  `;

  console.log(`  ✓ ${rows.length} Personen nachträglich als eingecheckt markiert`);
  console.log("\nBackfill abgeschlossen!");
}

backfill().catch((err) => {
  console.error("Fehler beim Backfill:", err);
  process.exit(1);
});

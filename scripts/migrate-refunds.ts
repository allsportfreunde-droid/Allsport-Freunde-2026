import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("Fehler: POSTGRES_URL oder DATABASE_URL ist nicht gesetzt.");
  process.exit(1);
}
const sql = neon(dbUrl);

async function migrate() {
  console.log("Führe Erstattungs-Migration durch...\n");

  // Erstattet wird pro Person, nicht pro Anmeldung: wer 5 Plätze bezahlt und
  // einen davon storniert, bekommt ein Fünftel zurück. Damit muss an jeder
  // Person stehen, welcher Anteil auf sie entfällt – eine Summe auf der
  // Anmeldung könnte das nach der zweiten Teilstornierung nicht mehr
  // auseinanderhalten.
  await sql`ALTER TABLE registration_persons ADD COLUMN IF NOT EXISTS refund_amount DECIMAL(10,2)`;
  console.log("  ✓ registration_persons.refund_amount hinzugefügt");

  // Der Zeitstempel ist die Sperre gegen eine doppelte Zusage: geschrieben
  // wird nur, solange er leer ist. Zwei gleichzeitige Stornierungen können
  // denselben Anteil dadurch nicht zweimal versprechen.
  await sql`ALTER TABLE registration_persons ADD COLUMN IF NOT EXISTS refund_announced_at TIMESTAMPTZ`;
  console.log("  ✓ registration_persons.refund_announced_at hinzugefügt");

  console.log("\nErstattungs-Migration abgeschlossen!");
}

migrate().catch((err) => {
  console.error("Fehler bei der Migration:", err);
  process.exit(1);
});

import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("Fehler: POSTGRES_URL oder DATABASE_URL ist nicht gesetzt.");
  process.exit(1);
}
const sql = neon(dbUrl);

async function migrate() {
  console.log("Führe Zahlungs-Migration durch...\n");

  // Ab hier weiß eine Anmeldung, ob sie bezahlt ist. Vorher war das nirgends
  // festgehalten – "bezahlt" war eine Behauptung der Rückleitungs-URL.
  await sql`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP`;
  console.log("  ✓ registrations.paid_at hinzugefügt");

  await sql`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(10,2)`;
  console.log("  ✓ registrations.amount_paid hinzugefügt");

  // Die Session-ID ist der Schlüssel gegen Doppelbuchung: Stripe stellt
  // dasselbe Ereignis mehrfach zu, und die Rückleitungs-Seite meldet es
  // zusätzlich. Eindeutig, damit die zweite Meldung ins Leere läuft.
  await sql`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS stripe_session_id VARCHAR(255)`;
  console.log("  ✓ registrations.stripe_session_id hinzugefügt");

  // Die PaymentIntent-ID führt im Stripe-Dashboard direkt zur Zahlung.
  await sql`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS stripe_payment_intent_id VARCHAR(255)`;
  console.log("  ✓ registrations.stripe_payment_intent_id hinzugefügt");

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_registrations_stripe_session
    ON registrations(stripe_session_id) WHERE stripe_session_id IS NOT NULL
  `;
  console.log("  ✓ Eindeutiger Index auf stripe_session_id angelegt");

  console.log("\nZahlungs-Migration abgeschlossen!");
}

migrate().catch((err) => {
  console.error("Fehler bei der Migration:", err);
  process.exit(1);
});

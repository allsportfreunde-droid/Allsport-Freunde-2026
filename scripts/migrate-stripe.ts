import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("Fehler: POSTGRES_URL oder DATABASE_URL ist nicht gesetzt.");
  process.exit(1);
}
const sql = neon(dbUrl);

async function migrate() {
  console.log("Führe Stripe-Migration durch...\n");

  // Stripe Price IDs sind Strings der Form "price_1AbCdEfGhIjKlMnO".
  // Nullable: kostenlose Events und manuell gepflegte Preise haben keine.
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS stripe_price_id VARCHAR(255)`;
  console.log("  ✓ events.stripe_price_id hinzugefügt (VARCHAR, nullable)");

  console.log("\nStripe-Migration abgeschlossen!");
}

migrate().catch((err) => {
  console.error("Fehler bei der Migration:", err);
  process.exit(1);
});

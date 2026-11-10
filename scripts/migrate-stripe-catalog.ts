import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("Fehler: POSTGRES_URL oder DATABASE_URL ist nicht gesetzt.");
  process.exit(1);
}
const sql = neon(dbUrl);

async function migrate() {
  // Ein Stripe-Produkt je Event plus die vier ermäßigten Preise (§ 3).
  // Erwachsene und Kind nutzen weiter stripe_price_id / stripe_child_price_id.
  // Bestehende Events erhalten ihre IDs beim nächsten Speichern im Admin.
  await sql`
    ALTER TABLE events
      ADD COLUMN IF NOT EXISTS stripe_product_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS stripe_adult_reduced_30_price_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS stripe_adult_reduced_50_price_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS stripe_child_reduced_30_price_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS stripe_child_reduced_50_price_id VARCHAR(255)
  `;
  console.log("Stripe-Produkt und ermäßigte Price IDs an events ergänzt.");
}

migrate().catch((error) => {
  console.error("Fehler bei der Stripe-Katalog-Migration:", error);
  process.exit(1);
});

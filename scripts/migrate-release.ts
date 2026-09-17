import "dotenv/config";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const migrations = [
  // Event-Felder, auf die Checkout und Anzeige anschließend zugreifen.
  "migrate-stripe.ts",
  "migrate-child-price.ts",
  "migrate-cancellation.ts",
  // Registrierungszustand und Zahlungsreferenzen.
  "migrate-waitlist.ts",
  "migrate-payments.ts",
  // registration_persons ist eine bestehende Voraussetzung; hier kommen nur neue Felder hinzu.
  "migrate-child.ts",
  "migrate-refunds.ts",
  // Checkout-Snapshots müssen vor Zustand, Sperren und Versandaufträgen existieren.
  "migrate-person-prices.ts",
  "migrate-checkout-fulfillment.ts",
] as const;

const requiredBaseTables = ["events", "registrations", "registration_persons"] as const;
const expectedColumns = [
  "events.stripe_price_id",
  "events.child_entry_price",
  "events.stripe_child_price_id",
  "events.child_price",
  "events.cancellation_deadline",
  "registrations.is_waitlist",
  "registrations.paid_at",
  "registrations.amount_paid",
  "registrations.stripe_session_id",
  "registrations.stripe_payment_intent_id",
  "registrations.paid_person_prices",
  "registration_persons.is_child",
  "registration_persons.refund_amount",
  "registration_persons.refund_announced_at",
  "checkout_pricing.person_prices",
  "checkout_pricing.payment_state",
  "checkout_pricing.payment_intent_id",
] as const;
const expectedTables = ["checkout_pricing", "checkout_notifications", "checkout_creation"] as const;

function printPlan() {
  console.log("Release-Migrationen in dieser Reihenfolge:");
  migrations.forEach((migration, index) => console.log(`  ${index + 1}. ${migration}`));
}

async function main() {
  printPlan();
  if (process.argv.includes("--plan")) return;

  const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("POSTGRES_URL oder DATABASE_URL ist nicht gesetzt.");

  const target = new URL(dbUrl);
  console.log(`\nZiel: ${target.hostname}${target.pathname}`);
  const sql = neon(dbUrl);

  const baseTables = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('events', 'registrations', 'registration_persons')
  ` as Array<{ table_name: string }>;
  const existingBaseTables = new Set(baseTables.map(row => row.table_name));
  const missingBaseTables = requiredBaseTables.filter(table => !existingBaseTables.has(table));
  if (missingBaseTables.length) {
    throw new Error(
      `Basismigrationen fehlen (${missingBaseTables.join(", ")}). ` +
      "Die Release-Migration wurde nicht gestartet. Zuerst die bestehende Datenbankbasis herstellen.",
    );
  }

  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const projectDirectory = dirname(scriptDirectory);
  const require = createRequire(import.meta.url);
  const tsxCli = require.resolve("tsx/cli");

  for (const [index, migration] of migrations.entries()) {
    console.log(`\n[${index + 1}/${migrations.length}] ${migration}`);
    const result = spawnSync(process.execPath, [tsxCli, join(scriptDirectory, migration)], {
      cwd: projectDirectory,
      env: process.env,
      stdio: "inherit",
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`${migration} ist mit Exit-Code ${result.status ?? "unbekannt"} fehlgeschlagen.`);
    }
  }

  const columns = await sql`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
  ` as Array<{ table_name: string; column_name: string }>;
  const existingColumns = new Set(columns.map(row => `${row.table_name}.${row.column_name}`));
  const missingColumns = expectedColumns.filter(column => !existingColumns.has(column));

  const tables = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
  ` as Array<{ table_name: string }>;
  const existingTables = new Set(tables.map(row => row.table_name));
  const missingTables = expectedTables.filter(table => !existingTables.has(table));

  if (missingColumns.length || missingTables.length) {
    throw new Error([
      missingColumns.length ? `Spalten fehlen: ${missingColumns.join(", ")}` : "",
      missingTables.length ? `Tabellen fehlen: ${missingTables.join(", ")}` : "",
    ].filter(Boolean).join("; "));
  }

  console.log("\n✓ Alle Release-Migrationen und die Abschlussprüfung waren erfolgreich.");
}

main().catch(error => {
  console.error("\nRelease-Migration abgebrochen:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

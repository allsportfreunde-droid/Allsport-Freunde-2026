import { config } from "dotenv";
import { createInterface } from "node:readline/promises";
import { Client } from "@neondatabase/serverless";
import WebSocket from "ws";
import { getStatus, loadMigrations, migrate, type MigrationDb } from "../db/migrator";

/**
 * Bringt eine Datenbank auf den Stand von db/migrations.
 *
 *   npm run db:migrate                                   offene Migrationen einspielen (.env)
 *   npm run db:status                                    nur anzeigen, was offen ist
 *   npm run db:migrate -- --env-file .env.production     andere Datenbank
 *   npm run db:migrate -- --yes                          ohne Rückfrage (z. B. CI)
 */

const args = process.argv.slice(2);
const statusOnly = args.includes("--status");
const skipConfirm = args.includes("--yes");
const envFileIndex = args.indexOf("--env-file");
const envFile = envFileIndex >= 0 ? args[envFileIndex + 1] : undefined;
if (envFileIndex >= 0 && !envFile) fail("--env-file braucht einen Pfad.");

config({ path: envFile ?? ".env", quiet: true });

// Ohne Pooler: Sperre und Transaktion brauchen eine feste Verbindung.
const dbUrl =
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL;
if (!dbUrl) fail(`Keine Datenbank-URL (POSTGRES_URL / DATABASE_URL) in ${envFile ?? ".env"}.`);

function fail(message: string): never {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

/** Der Neon-Client wirft bei Verbindungsfehlern ein WebSocket-Event statt eines Errors. */
function reason(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  const e = error as { message?: unknown; error?: { message?: unknown } } | null;
  if (typeof e?.message === "string" && e.message) return e.message;
  if (typeof e?.error?.message === "string" && e.error.message) return e.error.message;
  return "unbekannter Fehler";
}

async function confirm(target: string, count: number): Promise<boolean> {
  if (skipConfirm || /^(localhost|127\.0\.0\.1)$/.test(new URL(dbUrl!).hostname)) return true;
  if (!process.stdin.isTTY) fail("Keine Rückfrage möglich – mit --yes bestätigen.");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`\n${count} Migration(en) auf ${target} einspielen? Zum Bestätigen "ja" tippen: `);
  rl.close();
  return answer.trim().toLowerCase() === "ja";
}

async function main() {
  const url = new URL(dbUrl!);
  const target = `${url.hostname}${url.pathname}`;
  const migrations = loadMigrations();

  const client = new Client({ connectionString: dbUrl, connectionTimeoutMillis: 15000 });
  client.neonConfig.webSocketConstructor = WebSocket;
  try {
    await client.connect();
  } catch (error) {
    fail(`Keine Verbindung zu ${target}: ${reason(error)}`);
  }
  const db: MigrationDb = {
    exec: (sql) => client.query(sql),
    query: async <T>(sql: string, params?: unknown[]) => (await client.query(sql, params)).rows as T[],
  };

  try {
    console.log(`Ziel: ${target}${envFile ? `  (aus ${envFile})` : ""}`);
    const status = await getStatus(db, migrations);
    console.log(`Eingespielt: ${status.applied.length} von ${migrations.length}`);
    for (const name of status.missing) console.warn(`  ⚠ ${name} ist eingetragen, die Datei fehlt aber.`);
    for (const m of status.changed) console.error(`  ✗ ${m.name} wurde nach dem Einspielen geändert.`);

    if (status.pending.length === 0) {
      console.log("✓ Alles auf dem neuesten Stand.");
      return;
    }
    console.log("Offen:");
    for (const m of status.pending) console.log(`  · ${m.name}`);
    if (statusOnly) return;
    if (status.changed.length) fail("Geänderte Migrationen – bitte zuerst klären, nichts eingespielt.");

    if (!(await confirm(target, status.pending.length))) {
      console.log("Abgebrochen, nichts eingespielt.");
      return;
    }

    const done = await migrate(db, migrations, (line) => console.log(`  ${line}`));
    console.log(`\n✓ ${done.length} Migration(en) eingespielt.`);
  } finally {
    await client.end();
  }
}

main().catch((error) => fail(reason(error)));

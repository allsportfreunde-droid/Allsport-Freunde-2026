import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Datenbank-Migrationen: nummerierte SQL-Dateien in db/migrations, angewendet
 * in Dateinamen-Reihenfolge. Welche schon gelaufen sind, steht in der Tabelle
 * schema_migrations – so reicht ein Befehl für jede Datenbank, egal auf
 * welchem Stand sie ist.
 *
 * Regeln für Migrationsdateien:
 * - Name: NNNN_kurzer-name.sql, fortlaufend. Neue Änderung = neue Datei.
 * - Eine bereits eingespielte Datei wird nie mehr geändert (Prüfsumme).
 * - Jede Datei läuft in einer Transaktion. Deshalb kein
 *   CREATE INDEX CONCURRENTLY und kein eigenes BEGIN/COMMIT.
 */

/** Was der Runner von einer Verbindung braucht – Neon im Betrieb, PGlite im Test. */
export interface MigrationDb {
  /** Mehrere Anweisungen ohne Parameter. */
  exec(sql: string): Promise<unknown>;
  /** Eine Anweisung mit Parametern. */
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface Migration {
  name: string;
  sql: string;
  checksum: string;
}

export interface MigrationStatus {
  applied: Array<Migration & { appliedAt: string }>;
  pending: Migration[];
  /** Eingespielt, aber die Datei wurde seitdem geändert. */
  changed: Migration[];
  /** Eingespielt, aber die Datei gibt es nicht mehr. */
  missing: string[];
}

export const MIGRATIONS_DIR = join(process.cwd(), "db", "migrations");
const NAME_PATTERN = /^\d{4}_[a-z0-9-]+\.sql$/;
/** Beliebige, feste Zahl – verhindert, dass zwei Läufe gleichzeitig migrieren. */
const LOCK_ID = 727_2026;

/** Zeilenenden vereinheitlichen, damit ein Windows-Checkout die Prüfsumme nicht ändert. */
export function checksum(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");
}

export function loadMigrations(dir = MIGRATIONS_DIR): Migration[] {
  const files = readdirSync(dir).filter((file) => file.endsWith(".sql")).sort();
  const invalid = files.filter((file) => !NAME_PATTERN.test(file));
  if (invalid.length) {
    throw new Error(`Ungültige Dateinamen (erwartet NNNN_name.sql): ${invalid.join(", ")}`);
  }
  const numbers = files.map((file) => file.slice(0, 4));
  const duplicate = numbers.find((n, i) => numbers.indexOf(n) !== i);
  if (duplicate) throw new Error(`Nummer ${duplicate} ist doppelt vergeben.`);

  return files.map((name) => {
    const sql = readFileSync(join(dir, name), "utf8");
    return { name, sql, checksum: checksum(sql) };
  });
}

async function ensureTable(db: MigrationDb) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      checksum   TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function getStatus(db: MigrationDb, migrations: Migration[]): Promise<MigrationStatus> {
  await ensureTable(db);
  const rows = await db.query<{ name: string; checksum: string; applied_at: string | Date }>(
    "SELECT name, checksum, applied_at FROM schema_migrations ORDER BY name"
  );
  const byName = new Map(rows.map((row) => [row.name, row]));
  const status: MigrationStatus = { applied: [], pending: [], changed: [], missing: [] };

  for (const migration of migrations) {
    const row = byName.get(migration.name);
    if (!row) status.pending.push(migration);
    else if (row.checksum !== migration.checksum) status.changed.push(migration);
    else status.applied.push({ ...migration, appliedAt: new Date(row.applied_at).toISOString() });
  }
  const known = new Set(migrations.map((m) => m.name));
  status.missing = rows.map((row) => row.name).filter((name) => !known.has(name));
  return status;
}

/**
 * Spielt alle offenen Migrationen ein, jede in einer eigenen Transaktion.
 * Bricht vorher ab, wenn eine bereits eingespielte Datei geändert wurde –
 * dann passen Code und Datenbank nicht mehr zusammen.
 */
export async function migrate(
  db: MigrationDb,
  migrations: Migration[],
  log: (line: string) => void = () => {}
): Promise<string[]> {
  await db.query("SELECT pg_advisory_lock($1)", [LOCK_ID]);
  try {
    const status = await getStatus(db, migrations);
    if (status.changed.length) {
      throw new Error(
        `Bereits eingespielte Migrationen wurden geändert: ${status.changed.map((m) => m.name).join(", ")}. ` +
        "Änderungen gehören in eine neue Migrationsdatei."
      );
    }

    const done: string[] = [];
    for (const migration of status.pending) {
      log(`→ ${migration.name}`);
      await db.exec("BEGIN");
      try {
        await db.exec(migration.sql);
        await db.query(
          "INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)",
          [migration.name, migration.checksum]
        );
        await db.exec("COMMIT");
      } catch (error) {
        await db.exec("ROLLBACK").catch(() => {});
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`${migration.name} fehlgeschlagen (zurückgerollt): ${reason}`);
      }
      done.push(migration.name);
    }
    return done;
  } finally {
    await db.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]).catch(() => {});
  }
}

import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { checksum, getStatus, loadMigrations, migrate, type Migration, type MigrationDb } from "../db/migrator";

/** Echtes Postgres (WASM) im Prozess – prüft, dass jede Migration wirklich läuft. */
async function database() {
  const pg = new PGlite();
  const db: MigrationDb = {
    exec: (sql) => pg.exec(sql),
    query: async <T>(sql: string, params?: unknown[]) => (await pg.query<T>(sql, params)).rows,
  };
  return { pg, db };
}

const all = loadMigrations();

async function columns(db: MigrationDb, table: string) {
  const rows = await db.query<{ column_name: string }>(
    "SELECT column_name FROM information_schema.columns WHERE table_name = $1", [table]
  );
  return rows.map((row) => row.column_name);
}

describe("Migrationen", () => {
  it("baut eine leere Datenbank vollständig auf", async () => {
    const { db } = await database();
    const done = await migrate(db, all);

    expect(done).toEqual(all.map((m) => m.name));
    expect(await columns(db, "registrations")).toEqual(expect.arrayContaining([
      "is_waitlist", "paid_at", "review_requested_at", "qr_token", "reminder_sent_at",
    ]));
    // Name und Begleiter stehen seit 0010 an den Personen.
    expect(await columns(db, "registrations")).not.toContain("first_name");
    expect(await columns(db, "registration_persons")).toEqual(expect.arrayContaining([
      "is_child", "discount", "refund_amount",
    ]));
    expect(await columns(db, "events")).toEqual(expect.arrayContaining([
      "stripe_tier_products", "cancellation_deadline", "max_per_email", "cash_counted",
    ]));
    for (const table of ["event_reviews", "discount_holders", "discount_requests", "checkout_creation", "helpers"]) {
      expect(await columns(db, table)).not.toHaveLength(0);
    }
  });

  it("spielt beim zweiten Lauf nichts mehr ein", async () => {
    const { db } = await database();
    await migrate(db, all);
    expect(await migrate(db, all)).toEqual([]);
    expect((await getStatus(db, all)).pending).toEqual([]);
  });

  it("läuft auf einer bestehenden Datenbank ohne Buchführung durch – wie beim ersten Lauf auf Prod", async () => {
    const { pg, db } = await database();
    // Stand wie bisher: alle Skripte gelaufen, aber nirgends vermerkt.
    for (const m of all) await pg.exec(m.sql);

    const done = await migrate(db, all);
    expect(done).toHaveLength(all.length);
    expect((await getStatus(db, all)).applied).toHaveLength(all.length);
  });

  it("übernimmt Name und Begleiter alter Anmeldungen in die Personen", async () => {
    const { db } = await database();
    const before = all.filter((m) => m.name < "0010");
    await migrate(db, before);
    await db.exec(`
      INSERT INTO events (title, category, description, date, time, location, price, dress_code, max_participants)
      VALUES ('Kick', 'fussball', '', '2026-05-01', '10:00', 'Park', 'Kostenlos', '', 20);
      INSERT INTO registrations (event_id, first_name, last_name, email, guests)
      VALUES (1, 'Ada', 'Alt', 'ada@example.com', 2);
    `);

    await migrate(db, all);

    // In der Reihenfolge, in der die App Personen liest: der Anmelder zuerst.
    const persons = await db.query<{ first_name: string }>(
      "SELECT first_name FROM registration_persons ORDER BY created_at, id"
    );
    expect(persons.map((p) => p.first_name)).toEqual(["Ada", "Begleitperson", "Begleitperson"]);
  });

  it("bricht ab, wenn eine eingespielte Datei nachträglich geändert wurde", async () => {
    const { db } = await database();
    const first = all.slice(0, 2);
    await migrate(db, first);
    const edited: Migration[] = [first[0], { ...first[1], sql: `${first[1].sql}\n-- geändert`, checksum: "anders" }];

    await expect(migrate(db, [...edited, all[2]])).rejects.toThrow(/geändert/);
    expect((await getStatus(db, all)).applied.map((m) => m.name)).toEqual(first.map((m) => m.name));
  });

  it("rollt eine fehlerhafte Migration vollständig zurück", async () => {
    const { db } = await database();
    const broken: Migration = {
      name: "9999_broken.sql",
      sql: "CREATE TABLE halb_fertig (id INT); SELECT * FROM gibt_es_nicht;",
      checksum: "x",
    };

    await expect(migrate(db, [all[0], broken])).rejects.toThrow(/9999_broken\.sql fehlgeschlagen/);
    expect(await columns(db, "halb_fertig")).toHaveLength(0);
    expect((await getStatus(db, [all[0], broken])).pending.map((m) => m.name)).toEqual(["9999_broken.sql"]);
  });
});

describe("Migrationsdateien", () => {
  it("sind lückenlos nummeriert", () => {
    expect(all.map((m) => Number(m.name.slice(0, 4)))).toEqual(all.map((_, i) => i + 1));
  });

  it("lehnt falsche Dateinamen und doppelte Nummern ab", () => {
    const dir = mkdtempSync(join(tmpdir(), "migrations-"));
    writeFileSync(join(dir, "0001_a.sql"), "SELECT 1;");
    writeFileSync(join(dir, "0001_b.sql"), "SELECT 1;");
    expect(() => loadMigrations(dir)).toThrow(/doppelt/);

    const other = mkdtempSync(join(tmpdir(), "migrations-"));
    writeFileSync(join(other, "neu.sql"), "SELECT 1;");
    expect(() => loadMigrations(other)).toThrow(/Ungültige Dateinamen/);
  });

  it("ändert die Prüfsumme nicht durch Windows-Zeilenenden", () => {
    expect(checksum("A;\r\nB;\r\n")).toBe(checksum("A;\nB;\n"));
  });
});

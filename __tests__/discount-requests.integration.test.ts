import { Client } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Echte PostgreSQL-Semantik für die Ermäßigungsanträge: Transaktion mit FOR UPDATE,
// ON CONFLICT auf dem Ausdrucksindex, bytea-Roundtrip, Löschfristen.
//
// Läuft komplett in TEMPORÄREN Tabellen innerhalb EINER Transaktion, die am Ende
// zurückgerollt wird. Temporäre Tabellen überdecken gleichnamige echte Tabellen
// nur für diese Verbindung – bestehende Daten werden weder gelesen noch verändert.
// Opt-in: DISCOUNT_TEST_DATABASE_URL=… npm run test:integration
const databaseUrl = process.env.DISCOUNT_TEST_DATABASE_URL;

const state = vi.hoisted(() => ({ client: null as unknown }));

type Fragment = { strings: readonly string[]; values: unknown[]; __fragment: true } & PromiseLike<unknown[]>;

/** Minimaler Ersatz für neon(): Tagged Templates, verschachtelte Fragmente, transaction(). */
function createSql(client: Client) {
  const build = (root: Fragment) => {
    const params: unknown[] = [];
    const walk = (fragment: Fragment): string =>
      fragment.strings.reduce((text, chunk, i) => {
        if (i >= fragment.values.length) return text + chunk;
        const value = fragment.values[i];
        if (value && typeof value === "object" && "__fragment" in value) return text + chunk + walk(value as Fragment);
        params.push(value);
        return `${text}${chunk}$${params.length}`;
      }, "");
    return { text: walk(root), params };
  };
  const sql = (strings: TemplateStringsArray, ...values: unknown[]): Fragment => {
    const fragment = {
      strings, values, __fragment: true as const,
      then<A = unknown[], B = never>(onFulfilled?: ((rows: unknown[]) => A | PromiseLike<A>) | null, onRejected?: ((e: unknown) => B | PromiseLike<B>) | null) {
        const { text, params } = build(fragment as Fragment);
        return client.query(text, params).then((result) => result.rows as unknown[]).then(onFulfilled, onRejected);
      },
    };
    return fragment as Fragment;
  };
  // Die äußere Test-Transaktion umschließt alles; die Batches laufen der Reihe nach darin.
  sql.transaction = async (queries: Fragment[]) => {
    const results: unknown[][] = [];
    for (const query of queries) results.push(await query);
    return results;
  };
  return sql;
}

vi.mock("../lib/db/utils", () => ({
  getSQL: () => createSql(state.client as Client),
  isPostgresConfigured: () => true,
}));

const db = await import("../lib/db/discount-requests");

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 250, 0, 255]);

describe.skipIf(!databaseUrl)("Ermäßigungsanträge in PostgreSQL", () => {
  let client: Client;
  const q = async (text: string, params: unknown[] = []) => (await client.query(text, params)).rows;

  beforeAll(async () => {
    const direct = new URL(databaseUrl!);
    direct.hostname = direct.hostname.replace("-pooler.", ".");
    client = new Client(direct.toString());
    await client.connect();
    state.client = client;
    await client.query("BEGIN");
    await client.query(`
      CREATE TEMP TABLE events (id SERIAL PRIMARY KEY, title TEXT, date DATE, time TIME, location TEXT);
      CREATE TEMP TABLE registrations (
        id SERIAL PRIMARY KEY, event_id INTEGER, email TEXT, status TEXT DEFAULT 'pending',
        status_token TEXT, paid_at TIMESTAMP
      );
      CREATE TEMP TABLE registration_persons (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), registration_id INTEGER REFERENCES registrations(id),
        first_name VARCHAR(100), last_name VARCHAR(100), is_child BOOLEAN DEFAULT FALSE,
        discount VARCHAR(20), cancelled_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TEMP TABLE discount_holders (
        id SERIAL PRIMARY KEY, first_name VARCHAR(50) NOT NULL, last_name VARCHAR(50) NOT NULL,
        email VARCHAR(255) NOT NULL, phone VARCHAR(50),
        discount VARCHAR(20) NOT NULL CHECK (discount IN ('reduced_30', 'reduced_50')),
        proof_checked_at DATE NOT NULL, proof_checked_by VARCHAR(255) NOT NULL, valid_until DATE, notes TEXT,
        consented_at TIMESTAMP, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX ON discount_holders (email, LOWER(first_name), LOWER(last_name));
      CREATE TEMP TABLE discount_requests (
        id SERIAL PRIMARY KEY,
        person_id UUID NOT NULL UNIQUE REFERENCES registration_persons(id) ON DELETE CASCADE,
        registration_id INTEGER NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
        discount VARCHAR(20) NOT NULL CHECK (discount IN ('reduced_30', 'reduced_50')),
        status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        remember BOOLEAN NOT NULL DEFAULT FALSE, consented_at TIMESTAMP NOT NULL,
        proof_data BYTEA, proof_type VARCHAR(30), proof_uploaded_at TIMESTAMP, proof_deleted_at TIMESTAMP,
        decided_at TIMESTAMP, decided_by VARCHAR(255), decision_note TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    // Sicherheitsnetz: Alle Namen müssen auf die temporären Tabellen zeigen.
    const resolved = await q(`SELECT to_regclass('discount_requests')::text AS a, to_regclass('registration_persons')::text AS b, to_regclass('discount_holders')::text AS c`);
    expect(Object.values(resolved[0]).every((name) => String(name).startsWith("pg_temp"))).toBe(true);
  });

  afterAll(async () => {
    if (!client) return;
    await client.query("ROLLBACK").catch(() => {});
    await client.end();
  });

  /** Event, Anmeldung, Person und offener Antrag. */
  async function fixture(opts: { name?: [string, string]; remember?: boolean; paid?: boolean; ageDays?: number } = {}) {
    const [first, last] = opts.name ?? ["Anna", "Muster"];
    const [event] = await q(`INSERT INTO events (title, date, time, location) VALUES ('Schwimmen', '2099-06-01', '18:00', 'Bad') RETURNING id`);
    const token = `tok-${Math.random().toString(36).slice(2)}`;
    const [registration] = await q(
      `INSERT INTO registrations (event_id, email, status_token, paid_at) VALUES ($1, 'anna@example.de', $2, $3) RETURNING id`,
      [event.id, token, opts.paid ? new Date() : null]
    );
    const [person] = await q(
      `INSERT INTO registration_persons (registration_id, first_name, last_name) VALUES ($1, $2, $3) RETURNING id::text AS id`,
      [registration.id, first, last]
    );
    const [request] = await q(
      `INSERT INTO discount_requests (person_id, registration_id, discount, remember, consented_at, created_at)
       VALUES ($1::uuid, $2, 'reduced_50', $3, NOW(), NOW() - make_interval(days => $4::int)) RETURNING id`,
      [person.id, registration.id, opts.remember ?? false, opts.ageDays ?? 0]
    );
    return { token, registrationId: registration.id as number, personId: person.id as string, requestId: request.id as number };
  }

  it("lädt nur mit passendem Token hoch und gibt die Bytes unverändert zurück", async () => {
    const f = await fixture({ remember: true });
    expect(await db.getProofUploadTarget(f.token, f.requestId)).toEqual({ id: f.requestId, status: "pending" });
    expect(await db.getProofUploadTarget("falsch", f.requestId)).toBeNull();

    expect(await db.saveDiscountProof(f.requestId, JPEG, "image/jpeg")).toBe(true);
    const proof = await db.getDiscountProof(f.requestId);
    expect(proof?.type).toBe("image/jpeg");
    expect([...proof!.data]).toEqual([...JPEG]);

    const [info] = await db.getRegistrationDiscountRequests(f.registrationId);
    expect(info).toMatchObject({ id: f.requestId, person_id: f.personId, status: "pending", has_proof: true });
    const listed = (await db.getDiscountRequestsForAdmin()).find((r) => r.id === f.requestId)!;
    expect(listed).toMatchObject({ has_proof: true, first_name: "Anna", event_title: "Schwimmen", paid: false });
    expect(listed).not.toHaveProperty("proof_data");
  });

  it("bestätigt in einem Schritt: Ermäßigung an der Person, Listeneintrag, Nachweis gelöscht", async () => {
    const f = await fixture({ remember: true });
    await db.saveDiscountProof(f.requestId, JPEG, "image/jpeg");

    const result = await db.decideDiscountRequest(f.requestId, "approved", null, "admin@verein.de", "2026-11-10");
    expect(result).toMatchObject({ ok: true, applied: true, remembered: true });
    expect(result.ok && result.mail).toMatchObject({ to: "anna@example.de", firstName: "Anna", personName: "Anna Muster", discount: "reduced_50" });

    expect((await q(`SELECT discount FROM registration_persons WHERE id = $1`, [f.personId]))[0].discount).toBe("reduced_50");
    const [request] = await q(`SELECT status, proof_data, proof_deleted_at, decided_by FROM discount_requests WHERE id = $1`, [f.requestId]);
    expect(request).toMatchObject({ status: "approved", proof_data: null, decided_by: "admin@verein.de" });
    expect(request.proof_deleted_at).not.toBeNull();
    const [holder] = await q(`SELECT discount, proof_checked_by, consented_at FROM discount_holders WHERE email = 'anna@example.de'`);
    expect(holder).toMatchObject({ discount: "reduced_50", proof_checked_by: "admin@verein.de" });
    expect(holder.consented_at).not.toBeNull();

    expect(await db.decideDiscountRequest(f.requestId, "rejected", null, "admin@verein.de", "2026-11-10"))
      .toEqual({ ok: false, reason: "already_decided" });
    expect(await db.decideDiscountRequest(999999, "approved", null, "admin@verein.de", "2026-11-10"))
      .toEqual({ ok: false, reason: "not_found" });
  });

  it("bestätigt keine Ermäßigung ohne hinterlegten Nachweis", async () => {
    const f = await fixture();

    expect(await db.decideDiscountRequest(f.requestId, "approved", null, "admin@verein.de", "2026-11-10"))
      .toEqual({ ok: false, reason: "proof_missing" });
    expect((await q(`SELECT discount FROM registration_persons WHERE id = $1`, [f.personId]))[0].discount).toBeNull();
    expect((await q(`SELECT status FROM discount_requests WHERE id = $1`, [f.requestId]))[0].status).toBe("pending");
    expect(await q(`SELECT 1 FROM discount_holders WHERE email = 'anna@example.de'`)).toHaveLength(0);
  });

  it("aktualisiert einen bestehenden Listeneintrag statt zu doppeln (ON CONFLICT)", async () => {
    const f = await fixture({ name: ["ANNA", "muster"], remember: true });
    await db.saveDiscountProof(f.requestId, JPEG, "image/jpeg");
    const result = await db.decideDiscountRequest(f.requestId, "approved", null, "zweit@verein.de", "2026-11-11");
    expect(result).toMatchObject({ ok: true, remembered: true });
    const holders = await q(`SELECT proof_checked_by FROM discount_holders WHERE email = 'anna@example.de'`);
    expect(holders).toHaveLength(1);
    expect(holders[0].proof_checked_by).toBe("zweit@verein.de");
  });

  it("ändert an einer bezahlten Anmeldung den Preis nicht", async () => {
    const f = await fixture({ name: ["Bea", "Bezahlt"], paid: true });
    await db.saveDiscountProof(f.requestId, JPEG, "image/jpeg");
    const result = await db.decideDiscountRequest(f.requestId, "approved", null, "admin@verein.de", "2026-11-10");
    expect(result).toMatchObject({ ok: true, applied: false, remembered: false });
    expect((await q(`SELECT discount FROM registration_persons WHERE id = $1`, [f.personId]))[0].discount).toBeNull();
  });

  it("lehnt ab: keine Ermäßigung, Nachweis gelöscht, Begründung gespeichert", async () => {
    const f = await fixture({ name: ["Cem", "Abgelehnt"], remember: true });
    await db.saveDiscountProof(f.requestId, JPEG, "image/jpeg");
    expect(await db.decideDiscountRequest(f.requestId, "rejected", "Bescheid abgelaufen", "admin@verein.de", "2026-11-10"))
      .toMatchObject({ ok: true, applied: false, remembered: false });
    expect((await q(`SELECT discount FROM registration_persons WHERE id = $1`, [f.personId]))[0].discount).toBeNull();
    const [request] = await q(`SELECT status, proof_data, decision_note FROM discount_requests WHERE id = $1`, [f.requestId]);
    expect(request).toEqual({ status: "rejected", proof_data: null, decision_note: "Bescheid abgelaufen" });
    expect(await db.saveDiscountProof(f.requestId, JPEG, "image/jpeg")).toBe(false);
    expect(await q(`SELECT 1 FROM discount_holders WHERE first_name = 'Cem'`)).toHaveLength(0);
  });

  it("löscht fällige Nachweise und lässt frische stehen", async () => {
    const old = await fixture({ name: ["Alt", "Antrag"], ageDays: 31 });
    const cancelled = await fixture({ name: ["Storno", "Person"] });
    const fresh = await fixture({ name: ["Neu", "Antrag"] });
    for (const f of [old, cancelled, fresh]) await db.saveDiscountProof(f.requestId, JPEG, "image/jpeg");
    await q(`UPDATE registration_persons SET cancelled_at = NOW() WHERE id = $1`, [cancelled.personId]);

    expect(await db.purgeDiscountProofs()).toBeGreaterThanOrEqual(2);
    expect(await db.getDiscountProof(old.requestId)).toBeNull();
    expect(await db.getDiscountProof(cancelled.requestId)).toBeNull();
    expect(await db.getDiscountProof(fresh.requestId)).not.toBeNull();
  });
});

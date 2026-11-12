import { Client } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Echte PostgreSQL-Semantik für die nachträgliche Ermäßigung: Das UPDATE darf
// nur greifen, solange nichts bezahlt ist und keine Zahlung läuft.
//
// Läuft komplett in TEMPORÄREN Tabellen innerhalb EINER Transaktion, die am Ende
// zurückgerollt wird – bestehende Daten werden weder gelesen noch verändert.
// Opt-in: DISCOUNT_TEST_DATABASE_URL=… npm run test:integration
const databaseUrl = process.env.DISCOUNT_TEST_DATABASE_URL;

const state = vi.hoisted(() => ({ client: null as unknown }));

/** Minimaler Ersatz für neon(): nur Tagged Templates ohne Fragmente. */
function createSql(client: Client) {
  return (strings: TemplateStringsArray, ...values: unknown[]) =>
    client
      .query(strings.reduce((text, chunk, i) => text + chunk + (i < values.length ? `$${i + 1}` : ""), ""), values)
      .then((result) => result.rows as unknown[]);
}

vi.mock("../lib/db/utils", () => ({
  getSQL: () => createSql(state.client as Client),
  isPostgresConfigured: () => true,
}));

const { setPersonDiscount } = await import("../lib/db/person-discount");

describe.skipIf(!databaseUrl)("Ermäßigung nachträglich setzen in PostgreSQL", () => {
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
      CREATE TEMP TABLE events (
        id SERIAL PRIMARY KEY, price TEXT, entry_price NUMERIC(10,2), child_entry_price NUMERIC(10,2)
      );
      CREATE TEMP TABLE registrations (id SERIAL PRIMARY KEY, event_id INTEGER, paid_at TIMESTAMP);
      CREATE TEMP TABLE registration_persons (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), registration_id INTEGER REFERENCES registrations(id),
        discount VARCHAR(20) CHECK (discount IN ('reduced_30', 'reduced_50')), cancelled_at TIMESTAMPTZ
      );
      CREATE TEMP TABLE checkout_pricing (session_id TEXT PRIMARY KEY, registration_id INTEGER, payment_state TEXT);
    `);
    const resolved = await q(`SELECT to_regclass('registration_persons')::text AS a, to_regclass('checkout_pricing')::text AS b`);
    expect(Object.values(resolved[0]).every((name) => String(name).startsWith("pg_temp"))).toBe(true);
  });

  afterAll(async () => {
    if (!client) return;
    await client.query("ROLLBACK").catch(() => {});
    await client.end();
  });

  async function fixture(opts: { paid?: boolean; cancelled?: boolean; price?: [string, number | null]; checkout?: string } = {}) {
    const [price, entry] = opts.price ?? ["12 €", 12];
    const [event] = await q(`INSERT INTO events (price, entry_price) VALUES ($1, $2) RETURNING id`, [price, entry]);
    const [registration] = await q(
      `INSERT INTO registrations (event_id, paid_at) VALUES ($1, $2) RETURNING id`,
      [event.id, opts.paid ? new Date() : null]
    );
    const [person] = await q(
      `INSERT INTO registration_persons (registration_id, cancelled_at) VALUES ($1, $2) RETURNING id::text AS id`,
      [registration.id, opts.cancelled ? new Date() : null]
    );
    if (opts.checkout) {
      await q(`INSERT INTO checkout_pricing VALUES ($1, $2, $3)`, [`cs_${registration.id}`, registration.id, opts.checkout]);
    }
    return { registrationId: registration.id as number, personId: person.id as string };
  }
  const discountOf = async (personId: string) =>
    (await q(`SELECT discount FROM registration_persons WHERE id = $1`, [personId]))[0].discount;

  it("setzt und entfernt die Ermäßigung einer unbezahlten Anmeldung", async () => {
    const f = await fixture({ checkout: "failed" });
    expect(await setPersonDiscount(f.registrationId, f.personId, "reduced_50")).toEqual({ ok: true });
    expect(await discountOf(f.personId)).toBe("reduced_50");
    expect(await setPersonDiscount(f.registrationId, f.personId, null)).toEqual({ ok: true });
    expect(await discountOf(f.personId)).toBeNull();
  });

  it.each(["paid", "processing", "checking"])("ändert nichts, wenn die Zahlung %s ist", async (paymentState) => {
    const f = await fixture({ checkout: paymentState });
    expect(await setPersonDiscount(f.registrationId, f.personId, "reduced_30")).toEqual({ ok: false, reason: "paid_or_busy" });
    expect(await discountOf(f.personId)).toBeNull();
  });

  it("ändert nichts an einer bezahlten Anmeldung", async () => {
    const f = await fixture({ paid: true });
    expect(await setPersonDiscount(f.registrationId, f.personId, "reduced_30")).toEqual({ ok: false, reason: "paid_or_busy" });
  });

  it("lässt stornierte Personen und Events ohne Preis aus", async () => {
    const cancelled = await fixture({ cancelled: true });
    expect(await setPersonDiscount(cancelled.registrationId, cancelled.personId, "reduced_30"))
      .toEqual({ ok: false, reason: "cancelled" });
    const free = await fixture({ price: ["Spende willkommen", null] });
    expect(await setPersonDiscount(free.registrationId, free.personId, "reduced_30"))
      .toEqual({ ok: false, reason: "no_price" });
  });

  it("findet die Person nur unter ihrer eigenen Anmeldung", async () => {
    const f = await fixture();
    expect(await setPersonDiscount(f.registrationId + 999, f.personId, "reduced_30"))
      .toEqual({ ok: false, reason: "not_found" });
    expect(await setPersonDiscount(f.registrationId, "keine-uuid", "reduced_30"))
      .toEqual({ ok: false, reason: "not_found" });
  });
});

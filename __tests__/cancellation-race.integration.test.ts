import { randomUUID } from "node:crypto";
import { Client } from "@neondatabase/serverless";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as cancelAll } from "../app/api/status/[token]/cancel/route";
import { POST as cancelPerson } from "../app/api/status/[token]/cancel-person/[personId]/route";
import { POST as cancelToken } from "../app/api/cancel-registration/route";
import { fulfillCheckout } from "../lib/checkout-fulfillment";
import { recordCheckoutState } from "../lib/db/checkout";
import { getSQL } from "../lib/db/utils";
import { withRegistrationLock } from "../lib/db/registration-lock";

// Real Neon driver, real PostgreSQL transactions, row locks, triggers and outbox.
// Only the external Stripe/email services are replaced. No database function is mocked.
// Opt in with CANCELLATION_TEST_DATABASE_URL (a Neon test database). Each run
// creates and drops ONLY its unique temporary database. This avoids depending
// on session/search_path settings, which the Neon HTTP endpoint may ignore.
// Run: npm run test:integration. The test role needs CREATE/DROP DATABASE rights.
// Without the explicit test URL, the regular unit test run skips this suite.
const services = vi.hoisted(() => ({ retrieve: vi.fn() }));
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({ checkout: { sessions: { retrieve: services.retrieve } } }),
  stripePaymentUrl: () => null,
}));
vi.mock("@/lib/email", () => ({ sendRegistrationCancelledEmail: vi.fn(), sendRefundDueAdminEmail: vi.fn() }));
vi.mock("@/lib/checkout-notifications", () => ({ deliverCheckoutNotifications: vi.fn() }));

const databaseUrl = process.env.CANCELLATION_TEST_DATABASE_URL;
const testDatabase = `cancel_race_${randomUUID().replaceAll("-", "")}`;
const gateNamespace = 18473829;
type Mode = "all" | "person" | "token";
type Fixture = { id: number; token: string; cancelToken: string; session: string; persons: string[] };

describe.skipIf(!databaseUrl)("cancellation / Stripe PostgreSQL serialization", () => {
  let admin: Client;
  let gate: Client;
  let bootstrap: Client;
  let databaseCreated = false;
  let nextId = 0;

  beforeAll(async () => {
    // Session-level advisory gates must not use a transaction-pooling endpoint.
    const direct = new URL(databaseUrl!);
    direct.hostname = direct.hostname.replace('-pooler.', '.');
    bootstrap = new Client(direct.toString());
    await bootstrap.connect();
    await bootstrap.query(`CREATE DATABASE ${testDatabase}`);
    databaseCreated = true;
    const scoped = new URL(direct);
    scoped.pathname = `/${testDatabase}`;
    scoped.searchParams.set("options", "-c statement_timeout=20000");
    admin = new Client(scoped.toString());
    gate = new Client(scoped.toString());
    await admin.connect();
    await gate.connect();
    const applicationUrl = new URL(databaseUrl!); // preserve production's pooled/unpooled transport
    applicationUrl.pathname = scoped.pathname;
    vi.stubEnv("POSTGRES_URL", applicationUrl.toString());
    vi.stubEnv("DATABASE_URL", applicationUrl.toString());
    // Fail before any fixtures or application writes if a transport accesses
    // a different database. Both use the real application connection setup.
    expect((await getSQL()`SELECT current_database() AS name`)[0].name).toBe(testDatabase);
    await admin.query(`
      CREATE TABLE events (
        id INTEGER PRIMARY KEY, title TEXT DEFAULT 'Sport', date DATE, time TIME DEFAULT '12:00',
        location TEXT DEFAULT 'Halle', category TEXT, price TEXT, entry_price NUMERIC,
        child_entry_price NUMERIC, child_price TEXT, dress_code TEXT, cancellation_deadline TIMESTAMP
      );
      CREATE TABLE registrations (
        id INTEGER PRIMARY KEY, event_id INTEGER REFERENCES events(id), email TEXT DEFAULT 'test@example.com',
        status TEXT DEFAULT 'pending', status_token TEXT UNIQUE, status_note TEXT, status_changed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(), is_waitlist BOOLEAN DEFAULT FALSE, paid_at TIMESTAMP,
        amount_paid NUMERIC, paid_person_prices JSONB, stripe_session_id TEXT, stripe_payment_intent_id TEXT,
        qr_code TEXT, checked_in_at TIMESTAMP
      );
      CREATE TABLE registration_persons (
        id UUID PRIMARY KEY, registration_id INTEGER REFERENCES registrations(id), first_name TEXT DEFAULT 'Test',
        last_name TEXT DEFAULT 'Person', is_child BOOLEAN DEFAULT FALSE, checked_in_at TIMESTAMPTZ,
        cancelled_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(),
        refund_announced_at TIMESTAMPTZ, refund_amount NUMERIC
      );
      CREATE TABLE cancellation_tokens (
        id TEXT PRIMARY KEY, token TEXT UNIQUE, registration_id INTEGER REFERENCES registrations(id),
        expires_at TIMESTAMP, used_at TIMESTAMP
      );
      CREATE TABLE checkout_pricing (
        session_id TEXT PRIMARY KEY, registration_id INTEGER REFERENCES registrations(id), person_prices JSONB,
        payment_state TEXT DEFAULT 'open', payment_intent_id TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE checkout_notifications (
        id TEXT PRIMARY KEY, registration_id INTEGER REFERENCES registrations(id), session_id TEXT,
        kind TEXT, data JSONB DEFAULT '{}', message JSONB, created_at TIMESTAMPTZ DEFAULT NOW(),
        first_attempt_at TIMESTAMPTZ, sent_at TIMESTAMPTZ, cancelled_at TIMESTAMPTZ
      );
      CREATE FUNCTION pause_cancellation() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN
        IF OLD.cancelled_at IS NULL AND NEW.cancelled_at IS NOT NULL THEN
          PERFORM pg_advisory_xact_lock(${gateNamespace}, NEW.registration_id * 2);
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER pause_cancellation BEFORE UPDATE ON registration_persons
        FOR EACH ROW EXECUTE FUNCTION pause_cancellation();
      CREATE FUNCTION pause_payment() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN
        PERFORM pg_advisory_xact_lock(${gateNamespace}, NEW.registration_id * 2 + 1);
        RETURN NEW;
      END $$;
      CREATE TRIGGER pause_payment BEFORE UPDATE ON checkout_pricing
        FOR EACH ROW EXECUTE FUNCTION pause_payment();
    `);
    await withRegistrationLock(-1, async sql => {
      expect((await sql`SELECT current_database() AS name`)[0].name).toBe(testDatabase);
    });
  }, 30000);

  afterEach(async () => {
    vi.useRealTimers();
    await gate?.query("SELECT pg_advisory_unlock_all()");
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await gate?.end();
    await admin?.end();
    if (bootstrap) {
      // The HTTP proxy can retain idle pooled connections to this test database.
      try { if (databaseCreated) await bootstrap.query(`DROP DATABASE ${testDatabase} WITH (FORCE)`); }
      finally { await bootstrap.end(); }
    }
  }, 30000);

  async function fixture(deadlinePassed: boolean): Promise<Fixture> {
    const id = ++nextId;
    const item = { id, token: randomUUID(), cancelToken: randomUUID(), session: `cs_${id}`, persons: [randomUUID(), randomUUID()] };
    await admin.query(`INSERT INTO events (id, date, cancellation_deadline)
      VALUES ($1, CURRENT_DATE + 7, (NOW() AT TIME ZONE 'Europe/Berlin') + $2::interval)`,
    [id, deadlinePassed ? '-1 day' : '1 day']);
    await admin.query("INSERT INTO registrations (id, event_id, status_token) VALUES ($1, $1, $2)", [id, item.token]);
    for (const person of item.persons) {
      await admin.query("INSERT INTO registration_persons (id, registration_id) VALUES ($1, $2)", [person, id]);
    }
    await admin.query(`INSERT INTO cancellation_tokens (id, token, registration_id, expires_at)
      VALUES ($1, $2, $3, NOW() + INTERVAL '8 days')`, [randomUUID(), item.cancelToken, id]);
    await admin.query("INSERT INTO checkout_pricing (session_id, registration_id, person_prices) VALUES ($1, $2, $3)",
      [item.session, id, JSON.stringify(Object.fromEntries(item.persons.map(p => [p, 1000])))]);
    return item;
  }

  function payment(item: Fixture, state: 'processing' | 'paid') {
    services.retrieve.mockResolvedValue({ id: item.session, client_reference_id: String(item.id),
      status: 'complete', mode: 'payment', currency: 'eur', amount_total: 2000,
      metadata: { pricing_version: '1' }, payment_status: state === 'paid' ? 'paid' : 'unpaid',
      payment_intent: { id: `pi_${item.id}`, status: state === 'paid' ? 'succeeded' : 'processing', payment_method: { type: 'sepa_debit' } },
    });
    const result = fulfillCheckout(item.session);
    // A failure can arrive while the test is observing a database barrier.
    // Observe it immediately and still propagate it when the test awaits result.
    void result.catch(() => {});
    return result;
  }

  async function cancel(item: Fixture, mode: Mode) {
    const request = new NextRequest(`http://localhost/api/cancel-registration?token=${item.cancelToken}`, { method: 'POST' });
    const response = mode === 'token' ? await cancelToken(request)
      : mode === 'all' ? await cancelAll(request, { params: Promise.resolve({ token: item.token }) })
        : await cancelPerson(request, { params: Promise.resolve({ token: item.token, personId: item.persons[0] }) });
    return { http: response.status, body: await response.json() };
  }

  async function hold(key: number) {
    await gate.query("SELECT pg_advisory_lock($1, $2)", [gateNamespace, key]);
  }
  async function release(key: number) {
    await gate.query("SELECT pg_advisory_unlock($1, $2)", [gateNamespace, key]);
  }
  async function waitFor(query: string, values: unknown[]): Promise<Record<string, unknown>> {
    const end = Date.now() + 15000;
    do {
      const result = await admin.query(query, values);
      if (result.rows.length) return result.rows[0];
      await new Promise(resolve => setTimeout(resolve, 25));
    } while (Date.now() < end);
    throw new Error(`Expected PostgreSQL lock wait did not occur: ${query}`);
  }
  async function paused(key: number) {
    const row = await waitFor(`SELECT pid FROM pg_locks WHERE locktype = 'advisory'
      AND classid = $1 AND objid = $2 AND NOT granted`, [gateNamespace, key]);
    return row.pid;
  }
  async function blockedBy(pid: unknown) {
    // A real row/transaction lock wait, not a timer-based guess about ordering.
    await waitFor(`SELECT pid FROM pg_stat_activity WHERE $1::int = ANY(pg_blocking_pids(pid))
      AND query LIKE '%SELECT id FROM registrations%FOR UPDATE%'`, [pid]);
  }
  async function state(item: Fixture) {
    const { rows: [row] } = await admin.query(`SELECT r.status, r.paid_at, ct.used_at, cp.payment_state,
      (SELECT COUNT(*)::int FROM registration_persons WHERE registration_id = r.id AND cancelled_at IS NOT NULL) AS cancelled,
      (SELECT COUNT(*)::int FROM checkout_notifications WHERE registration_id = r.id AND kind = 'refund_due') AS refunds
      FROM registrations r JOIN cancellation_tokens ct ON ct.registration_id = r.id
      JOIN checkout_pricing cp ON cp.registration_id = r.id WHERE r.id = $1`, [item.id]);
    return row;
  }
  function expectBlocked(result: Awaited<ReturnType<typeof cancel>>, mode: Mode) {
    if (mode === 'token') expect(result.body.status).toBe('deadline_passed');
    else expect(result.http).toBe(409);
  }

  describe.each<Mode>(['all', 'person', 'token'])('%s cancellation', mode => {
    it('re-reads processing committed while cancellation waits, rejecting an expired deadline', async () => {
      const item = await fixture(true);
      const key = item.id * 2 + 1;
      await hold(key);
      const webhook = payment(item, 'processing');
      let cancellation: ReturnType<typeof cancel> | undefined;
      try {
        const pid = await paused(key);
        cancellation = cancel(item, mode);
        await blockedBy(pid);
      } finally {
        await release(key);
        await Promise.allSettled([webhook, cancellation]);
      }
      await webhook;
      expectBlocked(await cancellation!, mode);
      expect(await state(item)).toMatchObject({ cancelled: 0, used_at: null, payment_state: 'processing' });
    }, 30000);

    it('holds the lock from deadline decision through cancellation; the webhook must wait', async () => {
      const item = await fixture(true); // unpaid can still cancel after the regular deadline
      const key = item.id * 2;
      await hold(key);
      const cancellation = cancel(item, mode);
      let webhook: Promise<boolean> | undefined;
      try {
        const pid = await paused(key); // deadline checked, person update not yet applied
        webhook = payment(item, 'processing');
        await blockedBy(pid);
        expect(await state(item)).toMatchObject({ cancelled: 0, payment_state: 'open' });
      } finally {
        await release(key);
        await Promise.allSettled([webhook, cancellation]);
      }
      expect((await cancellation).http).toBe(200);
      await webhook;
      expect(await state(item)).toMatchObject({ cancelled: mode === 'person' ? 1 : 2, payment_state: 'processing' });
    }, 30000);

    it('allows timely processing cancellation and queues exactly one refund on repeated later successes', async () => {
      const item = await fixture(false);
      await payment(item, 'processing');
      expect((await cancel(item, mode)).http).toBe(200);
      const { rows: before } = await admin.query('SELECT id, cancelled_at FROM registration_persons WHERE registration_id = $1 ORDER BY id', [item.id]);
      const repeats = await Promise.all([cancel(item, mode), cancel(item, mode)]);
      expect(repeats.map(result => result.http)).toEqual([200, 200]);
      if (mode === 'token') expect(repeats.map(result => result.body.status)).toEqual(['already_cancelled', 'already_cancelled']);
      // SEPA succeeds after the event: eligibility must use saved cancelled_at.
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(Date.now() + 10 * 86400000));
      try { await Promise.all([payment(item, 'paid'), payment(item, 'paid')]); }
      finally { vi.useRealTimers(); }
      await payment(item, 'paid');
      await payment(item, 'processing'); // stale event cannot downgrade paid
      const current = await state(item);
      expect(current).toMatchObject({ cancelled: mode === 'person' ? 1 : 2, payment_state: 'paid', refunds: 1 });
      expect(current.paid_at).not.toBeNull();
      expect(current.used_at !== null).toBe(mode === 'token');
      const { rows: [refund] } = await admin.query("SELECT data FROM checkout_notifications WHERE registration_id = $1 AND kind = 'refund_due'", [item.id]);
      expect(refund.data.amount).toBe(mode === 'person' ? 10 : 20);
      const { rows: after } = await admin.query('SELECT id, cancelled_at FROM registration_persons WHERE registration_id = $1 ORDER BY id', [item.id]);
      expect(after).toEqual(before);
    }, 30000);

    it('also rejects paid checkout state before paid_at is written', async () => {
      const item = await fixture(true);
      await recordCheckoutState(item.session, item.id, 'paid', `pi_${item.id}`);
      expectBlocked(await cancel(item, mode), mode);
      expect(await state(item)).toMatchObject({ cancelled: 0, paid_at: null, used_at: null });
    }, 30000);

    it('rejects unpaid cancellation after the event begins', async () => {
      const item = await fixture(false);
      await admin.query('UPDATE events SET date = CURRENT_DATE - 1 WHERE id = $1', [item.id]);
      expectBlocked(await cancel(item, mode), mode);
      expect(await state(item)).toMatchObject({ cancelled: 0, used_at: null });
    }, 30000);
  });

  it('rolls back token, registration and all persons when cancellation fails', async () => {
    const item = await fixture(false);
    await admin.query(`CREATE FUNCTION reject_token_use() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN
      RAISE EXCEPTION 'injected token write failure'; END $$;
      CREATE TRIGGER reject_token_use BEFORE UPDATE ON cancellation_tokens
      FOR EACH ROW WHEN (NEW.registration_id = ${item.id}) EXECUTE FUNCTION reject_token_use()`);
    expect((await cancel(item, 'token')).http).toBe(500);
    expect(await state(item)).toMatchObject({ status: 'pending', cancelled: 0, used_at: null });
    await admin.query('DROP TRIGGER reject_token_use ON cancellation_tokens');
    expect((await cancel(item, 'token')).body.status).toBe('cancelled');
  }, 30000);

  it('does not consume an expired cancellation token', async () => {
    const item = await fixture(false);
    await admin.query("UPDATE cancellation_tokens SET expires_at = NOW() - INTERVAL '1 minute' WHERE registration_id = $1", [item.id]);
    expect((await cancel(item, 'token')).body.status).toBe('expired');
    expect(await state(item)).toMatchObject({ status: 'pending', cancelled: 0, used_at: null });
  }, 30000);
});

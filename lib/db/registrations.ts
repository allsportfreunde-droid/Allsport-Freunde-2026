import { getSQL, isPostgresConfigured } from "./utils";
import { withRegistrationLock, type RegistrationSQL } from "./registration-lock";
import { CancellationBlockedError, cancellationBlockedReason, cancellationSourceFromRegistration } from "../cancellation";
import type { PersonPrices } from "../payment-prices";
import type {
  RegistrationWithEvent,
  RegistrationDetail,
  RegistrationStatusInfo,
  RegistrationStatus,
  RegistrationPerson,
  EventPerson,
  CheckoutInfo,
  RefundContext,
} from "../types";

/**
 * Number of spots that are effectively taken for an event: approved *and*
 * still-pending sign-ups. A pending sign-up already reserves a spot, so it
 * has to count towards "is the event full?" – otherwise the public occupancy
 * indicator and the waitlist confirmation e-mail would disagree. Kept in sync
 * with the same definition in `toPublicEvent`.
 */
export async function getRegistrationCount(eventId: number): Promise<number> {
  if (!isPostgresConfigured()) {
    const { getLocalRegistrationCount } = await import("../local-data");
    return getLocalRegistrationCount(eventId);
  }

  const sql = getSQL();
  const rows = await sql`
    SELECT COUNT(rp.id)::int AS count
    FROM registrations r
    JOIN registration_persons rp ON rp.registration_id = r.id AND rp.cancelled_at IS NULL
    WHERE r.event_id = ${eventId} AND r.status IN ('approved', 'pending')
  `;
  return (rows[0] as { count: number }).count;
}

export async function findRegistration(
  eventId: number,
  email: string
): Promise<{ id: number; status: string; status_token: string | null } | null> {
  if (!isPostgresConfigured()) {
    const { findLocalRegistration } = await import("../local-data");
    const reg = findLocalRegistration(eventId, email);
    return reg ? { id: reg.id, status: reg.status, status_token: reg.status_token ?? null } : null;
  }

  const sql = getSQL();
  const rows = await sql`
    SELECT id, status, status_token FROM registrations
    WHERE event_id = ${eventId} AND LOWER(email) = LOWER(${email})
    ORDER BY
      CASE status
        WHEN 'pending' THEN 0
        WHEN 'approved' THEN 1
        WHEN 'rejected' THEN 2
        WHEN 'cancelled' THEN 3
        ELSE 4
      END,
      id DESC
    LIMIT 1
  `;

  return (rows[0] as { id: number; status: string; status_token: string | null }) ?? null;
}

export async function getRemainingSlots(
  eventId: number,
  email: string,
  maxPerEmail: number
): Promise<number> {
  if (!isPostgresConfigured()) return maxPerEmail;

  const sql = getSQL();
  const rows = await sql`
    SELECT COUNT(rp.id)::int AS count
    FROM registrations r
    JOIN registration_persons rp ON rp.registration_id = r.id AND rp.cancelled_at IS NULL
    WHERE r.event_id = ${eventId}
      AND LOWER(r.email) = LOWER(${email})
      AND r.status NOT IN ('cancelled', 'rejected')
  `;
  const used = (rows[0] as { count: number }).count;
  return Math.max(0, maxPerEmail - used);
}

export async function createRegistration(data: {
  event_id: number;
  email: string;
  phone: string;
  status_token: string;
}): Promise<void> {
  if (!isPostgresConfigured()) {
    const { createLocalRegistration } = await import("../local-data");
    createLocalRegistration(data);
    return;
  }

  const sql = getSQL();
  await sql`
    INSERT INTO registrations (event_id, email, phone, status, status_token)
    VALUES (${data.event_id}, ${data.email}, ${data.phone}, 'pending', ${data.status_token})
    ON CONFLICT (email, event_id)
    DO UPDATE SET
      phone = EXCLUDED.phone,
      status = 'pending',
      status_token = EXCLUDED.status_token
  `;
}

export async function getRegistrationByToken(token: string, transaction?: RegistrationSQL): Promise<RegistrationStatusInfo | null> {
  if (!isPostgresConfigured()) {
    const { getLocalRegistrationByToken } = await import("../local-data");
    return getLocalRegistrationByToken(token);
  }

  const sql = transaction ?? getSQL();
  const rows = await sql`
    SELECT
      r.id, r.email,
      r.status, r.status_note, r.status_changed_at, r.created_at, r.is_waitlist, r.paid_at, r.amount_paid::float8 AS amount_paid,
      EXISTS (SELECT 1 FROM checkout_pricing cp WHERE cp.registration_id = r.id AND cp.payment_state IN ('processing', 'paid')) AS payment_in_progress,
      r.qr_code, r.checked_in_at,
      COALESCE((SELECT rp.first_name FROM registration_persons rp WHERE rp.registration_id = r.id ORDER BY rp.created_at LIMIT 1), '') AS first_name,
      COALESCE((SELECT rp.last_name FROM registration_persons rp WHERE rp.registration_id = r.id ORDER BY rp.created_at LIMIT 1), '') AS last_name,
      GREATEST(0, (SELECT COUNT(*)::int FROM registration_persons rp WHERE rp.registration_id = r.id AND rp.cancelled_at IS NULL) - 1) AS guests,
      e.title AS event_title, TO_CHAR(e.date, 'YYYY-MM-DD') AS event_date, e.time::text AS event_time,
      e.location AS event_location, e.category AS event_category,
      e.price AS event_price, e.entry_price::float8 AS event_entry_price, e.child_entry_price::float8 AS event_child_entry_price, e.child_price AS event_child_price, e.dress_code AS event_dress_code,
      TO_CHAR(e.cancellation_deadline, 'YYYY-MM-DD"T"HH24:MI') AS event_cancellation_deadline
    FROM registrations r
    JOIN events e ON r.event_id = e.id
    WHERE r.status_token = ${token}
  `;
  if (!rows[0]) return null;

  const reg = rows[0] as RegistrationStatusInfo;
  const persons = await sql`
    SELECT id, registration_id, first_name, last_name, is_child, checked_in_at, cancelled_at, created_at
    FROM registration_persons
    WHERE registration_id = ${reg.id}
    ORDER BY created_at ASC
  `;
  reg.persons = persons as import("../types").RegistrationPerson[];
  return reg;
}

export async function cancelRegistrationByToken(token: string): Promise<(RegistrationStatusInfo & { alreadyCancelled?: boolean }) | null> {
  if (!isPostgresConfigured()) {
    const existing = await getRegistrationByToken(token);
    if (!existing) return null;
    if (existing.status === "cancelled") return { ...existing, alreadyCancelled: true };
    assertCancellationOpen(existing, new Date());
    const { cancelLocalRegistrationByToken } = await import("../local-data");
    return cancelLocalRegistrationByToken(token);
  }

  const sql = getSQL();
  const [row] = await sql`SELECT id FROM registrations WHERE status_token = ${token}`;
  if (!row) return null;
  return withRegistrationLock(row.id as number, async (sql) => {
    const existing = await getRegistrationByToken(token, sql);
    if (!existing || existing.id !== row.id) return null;
    if (existing.status === "cancelled") return { ...existing, alreadyCancelled: true };
    if (!['pending', 'approved'].includes(existing.status)) return null;
    const now = new Date();
    assertCancellationOpen(existing, now);
    await cancelLockedRegistration(sql, existing.id, now);
    return getRegistrationByToken(token, sql);
  });
}

function assertCancellationOpen(registration: RegistrationStatusInfo, now: Date) {
  const blocked = cancellationBlockedReason(cancellationSourceFromRegistration(registration), now);
  if (blocked) throw new CancellationBlockedError(blocked);
}

/** Caller holds the registration row lock; persist the time of the decision. */
async function cancelLockedRegistration(sql: RegistrationSQL, registrationId: number, now: Date) {
  await sql`UPDATE registrations SET status = 'cancelled', status_changed_at = ${now.toISOString()}, status_note = NULL
    WHERE id = ${registrationId}`;
  await sql`UPDATE registration_persons SET cancelled_at = ${now.toISOString()}
    WHERE registration_id = ${registrationId} AND cancelled_at IS NULL`;
}

export async function cancelPersonByToken(
  token: string,
  personId: string
): Promise<{ ok: boolean; allCancelled: boolean; alreadyCancelled?: boolean; registration?: RegistrationStatusInfo } | null> {
  if (!isPostgresConfigured()) {
    const existing = await getRegistrationByToken(token);
    if (!existing) return null;
    assertCancellationOpen(existing, new Date());
    return { ok: true, allCancelled: false, registration: existing };
  }

  const sql = getSQL();
  const [row] = await sql`SELECT id FROM registrations WHERE status_token = ${token}`;
  if (!row) return null;
  return withRegistrationLock(row.id as number, async (sql) => {
    const existing = await getRegistrationByToken(token, sql);
    if (!existing || existing.id !== row.id) return null;
    const person = existing.persons?.find(p => p.id === personId);
    if (!person) return null;
    if (person.cancelled_at) return { ok: true, allCancelled: existing.status === "cancelled", alreadyCancelled: true, registration: existing };
    if (!['pending', 'approved'].includes(existing.status)) return null;
    const now = new Date();
    assertCancellationOpen(existing, now);
    await sql`UPDATE registration_persons SET cancelled_at = ${now.toISOString()}
      WHERE id = ${personId} AND registration_id = ${existing.id} AND cancelled_at IS NULL`;
    const [remaining] = await sql`SELECT COUNT(*)::int AS count FROM registration_persons
      WHERE registration_id = ${existing.id} AND cancelled_at IS NULL`;
    const allCancelled = remaining.count === 0;
    if (allCancelled) await cancelLockedRegistration(sql, existing.id, now);
    return { ok: true, allCancelled, registration: existing };
  });
}

// Helper: correlated subqueries for person name + count
// Used inline in SELECT lists throughout this file.
const personNameCols = `
  COALESCE((SELECT rp.first_name FROM registration_persons rp WHERE rp.registration_id = r.id ORDER BY rp.created_at LIMIT 1), '') AS first_name,
  COALESCE((SELECT rp.last_name FROM registration_persons rp WHERE rp.registration_id = r.id ORDER BY rp.created_at LIMIT 1), '') AS last_name,
  (SELECT COUNT(*)::int FROM registration_persons rp WHERE rp.registration_id = r.id AND rp.cancelled_at IS NULL) AS person_count,
  (SELECT COUNT(*)::int FROM registration_persons rp WHERE rp.registration_id = r.id AND rp.cancelled_at IS NULL AND rp.is_child) AS child_count
`;
void personNameCols; // Used as documentation; actual SQL is inlined below

export async function getAllRegistrations(): Promise<RegistrationWithEvent[]> {
  if (!isPostgresConfigured()) {
    const { getLocalAllRegistrations } = await import("../local-data");
    return getLocalAllRegistrations();
  }

  const sql = getSQL();
  const rows = await sql`
    SELECT
      (r.paid_at IS NULL AND EXISTS (SELECT 1 FROM checkout_pricing cp
        WHERE cp.registration_id = r.id AND cp.payment_state = 'failed')) AS payment_failed,
      r.id, r.event_id, r.email, r.phone, r.status, r.status_token, r.is_waitlist,
      r.status_changed_at, r.status_note, r.created_at,
      r.qr_code, r.qr_token, r.checked_in_at, r.checked_in_by,
      r.is_walk_in, r.notes, r.reminder_sent_at,
      COALESCE((SELECT rp.first_name FROM registration_persons rp WHERE rp.registration_id = r.id ORDER BY rp.created_at LIMIT 1), '') AS first_name,
      COALESCE((SELECT rp.last_name FROM registration_persons rp WHERE rp.registration_id = r.id ORDER BY rp.created_at LIMIT 1), '') AS last_name,
      (SELECT COUNT(*)::int FROM registration_persons rp WHERE rp.registration_id = r.id AND rp.cancelled_at IS NULL) AS person_count,
      (SELECT COUNT(*)::int FROM registration_persons rp WHERE rp.registration_id = r.id AND rp.cancelled_at IS NULL AND rp.is_child) AS child_count,
      e.title AS event_title,
      TO_CHAR(e.date, 'YYYY-MM-DD') AS event_date,
      e.category AS event_category
    FROM registrations r
    JOIN events e ON r.event_id = e.id
    ORDER BY r.created_at DESC
  `;
  return rows as RegistrationWithEvent[];
}

export async function getEventRegistrations(eventId: number): Promise<RegistrationWithEvent[]> {
  if (!isPostgresConfigured()) {
    const { getLocalEventRegistrations } = await import("../local-data");
    return getLocalEventRegistrations(eventId);
  }

  const sql = getSQL();
  const rows = await sql`
    SELECT
      (r.paid_at IS NULL AND EXISTS (SELECT 1 FROM checkout_pricing cp
        WHERE cp.registration_id = r.id AND cp.payment_state = 'failed')) AS payment_failed,
      r.id, r.event_id, r.email, r.phone, r.status, r.status_token, r.is_waitlist,
      r.status_changed_at, r.status_note, r.created_at,
      r.qr_code, r.qr_token, r.checked_in_at, r.checked_in_by,
      r.is_walk_in, r.notes, r.reminder_sent_at,
      COALESCE((SELECT rp.first_name FROM registration_persons rp WHERE rp.registration_id = r.id ORDER BY rp.created_at LIMIT 1), '') AS first_name,
      COALESCE((SELECT rp.last_name FROM registration_persons rp WHERE rp.registration_id = r.id ORDER BY rp.created_at LIMIT 1), '') AS last_name,
      (SELECT COUNT(*)::int FROM registration_persons rp WHERE rp.registration_id = r.id AND rp.cancelled_at IS NULL) AS person_count,
      (SELECT COUNT(*)::int FROM registration_persons rp WHERE rp.registration_id = r.id AND rp.cancelled_at IS NULL AND rp.is_child) AS child_count,
      e.title AS event_title,
      TO_CHAR(e.date, 'YYYY-MM-DD') AS event_date,
      e.category AS event_category
    FROM registrations r
    JOIN events e ON r.event_id = e.id
    WHERE r.event_id = ${eventId}
    ORDER BY r.created_at DESC
  `;
  return rows as RegistrationWithEvent[];
}

export async function getEventPersons(eventId: number): Promise<EventPerson[]> {
  if (!isPostgresConfigured()) {
    const { getLocalEventPersons } = await import("../local-data");
    return getLocalEventPersons(eventId);
  }

  const sql = getSQL();
  const rows = await sql`
    SELECT
      rp.id AS person_id,
      rp.registration_id,
      rp.first_name,
      rp.last_name,
      rp.is_child,
      rp.checked_in_at,
      rp.cancelled_at,
      rp.created_at,
      r.email,
      r.phone,
      r.status,
      r.is_walk_in
    FROM registration_persons rp
    JOIN registrations r ON r.id = rp.registration_id
    WHERE r.event_id = ${eventId}
    ORDER BY r.created_at ASC, rp.created_at ASC
  `;
  return rows as EventPerson[];
}

export async function deleteRegistration(id: number): Promise<void> {
  if (!isPostgresConfigured()) {
    const { deleteLocalRegistration } = await import("../local-data");
    deleteLocalRegistration(id);
    return;
  }

  const sql = getSQL();
  await sql`DELETE FROM registrations WHERE id = ${id}`;
}

export type RegistrationStatusUpdate = RegistrationWithEvent & { status_changed?: boolean };

export async function updateRegistrationStatus(
  id: number,
  status: RegistrationStatus,
  note?: string
): Promise<RegistrationStatusUpdate | null> {
  if (!isPostgresConfigured()) {
    const { updateLocalRegistrationStatus } = await import("../local-data");
    return updateLocalRegistrationStatus(id, status, note);
  }

  const sql = getSQL();
  const changed = await sql`
    UPDATE registrations SET
      status = ${status},
      status_changed_at = NOW(),
      status_note = ${note || null}
    WHERE id = ${id}
      AND (${status} <> 'approved' OR status <> 'approved')
    RETURNING id
  `;

  const rows = await sql`
    SELECT
      r.id, r.event_id, r.email, r.phone, r.status, r.status_token, r.is_waitlist,
      r.status_changed_at, r.status_note, r.created_at,
      r.qr_code, r.qr_token, r.checked_in_at, r.checked_in_by,
      r.is_walk_in, r.notes, r.reminder_sent_at,
      COALESCE((SELECT rp.first_name FROM registration_persons rp WHERE rp.registration_id = r.id ORDER BY rp.created_at LIMIT 1), '') AS first_name,
      COALESCE((SELECT rp.last_name FROM registration_persons rp WHERE rp.registration_id = r.id ORDER BY rp.created_at LIMIT 1), '') AS last_name,
      (SELECT COUNT(*)::int FROM registration_persons rp WHERE rp.registration_id = r.id AND rp.cancelled_at IS NULL) AS person_count,
      (SELECT COUNT(*)::int FROM registration_persons rp WHERE rp.registration_id = r.id AND rp.cancelled_at IS NULL AND rp.is_child) AS child_count,
      e.title AS event_title, TO_CHAR(e.date, 'YYYY-MM-DD') AS event_date, e.category AS event_category
    FROM registrations r
    JOIN events e ON r.event_id = e.id
    WHERE r.id = ${id}
  `;
  return rows[0] ? { ...(rows[0] as RegistrationWithEvent), status_changed: changed.length > 0 } : null;
}

export async function getRegistrationWithEvent(id: number): Promise<RegistrationWithEvent | null> {
  if (!isPostgresConfigured()) {
    const { getLocalRegistrationWithEvent } = await import("../local-data");
    return getLocalRegistrationWithEvent(id);
  }

  const sql = getSQL();
  const rows = await sql`
    SELECT
      r.id, r.event_id, r.email, r.phone, r.status, r.status_token, r.is_waitlist,
      r.status_changed_at, r.status_note, r.created_at,
      r.qr_code, r.qr_token, r.checked_in_at, r.checked_in_by,
      r.is_walk_in, r.notes, r.reminder_sent_at,
      COALESCE((SELECT rp.first_name FROM registration_persons rp WHERE rp.registration_id = r.id ORDER BY rp.created_at LIMIT 1), '') AS first_name,
      COALESCE((SELECT rp.last_name FROM registration_persons rp WHERE rp.registration_id = r.id ORDER BY rp.created_at LIMIT 1), '') AS last_name,
      (SELECT COUNT(*)::int FROM registration_persons rp WHERE rp.registration_id = r.id AND rp.cancelled_at IS NULL) AS person_count,
      (SELECT COUNT(*)::int FROM registration_persons rp WHERE rp.registration_id = r.id AND rp.cancelled_at IS NULL AND rp.is_child) AS child_count,
      e.title AS event_title, TO_CHAR(e.date, 'YYYY-MM-DD') AS event_date, e.category AS event_category
    FROM registrations r
    JOIN events e ON r.event_id = e.id
    WHERE r.id = ${id}
  `;
  return (rows[0] as RegistrationWithEvent) ?? null;
}

export async function getRegistrationDetail(id: number): Promise<RegistrationDetail | null> {
  if (!isPostgresConfigured()) {
    const base = await getRegistrationWithEvent(id);
    if (!base) return null;
    const persons: RegistrationPerson[] = [
      {
        id: `local-${base.id}-0`,
        registration_id: base.id,
        first_name: base.first_name,
        last_name: base.last_name,
        is_child: false,
        checked_in_at: base.checked_in_at,
        cancelled_at: null,
        created_at: base.created_at,
      },
      ...Array.from({ length: Math.max(0, base.person_count - 1) }, (_, i) => ({
        id: `local-${base.id}-${i + 1}`,
        registration_id: base.id,
        first_name: "Begleitperson",
        last_name: `${i + 1}`,
        is_child: false,
        checked_in_at: null,
        cancelled_at: null,
        created_at: base.created_at,
      })),
    ];
    // Der Dev-Modus ohne Postgres kennt keine Zahlungen.
    return {
      ...base,
      event_time: "",
      event_location: "",
      paid_at: null,
      amount_paid: null,
      stripe_session_id: null,
      stripe_payment_intent_id: null,
      persons,
    };
  }

  const sql = getSQL();
  const rows = await sql`
    SELECT
      r.id, r.event_id, r.email, r.phone, r.status, r.status_token, r.is_waitlist,
      r.status_changed_at, r.status_note, r.created_at,
      r.qr_code, r.qr_token, r.checked_in_at, r.checked_in_by,
      r.is_walk_in, r.notes, r.reminder_sent_at,
      r.paid_at, r.amount_paid::float8 AS amount_paid, r.stripe_session_id, r.stripe_payment_intent_id,
      COALESCE((SELECT rp.first_name FROM registration_persons rp WHERE rp.registration_id = r.id ORDER BY rp.created_at LIMIT 1), '') AS first_name,
      COALESCE((SELECT rp.last_name FROM registration_persons rp WHERE rp.registration_id = r.id ORDER BY rp.created_at LIMIT 1), '') AS last_name,
      (SELECT COUNT(*)::int FROM registration_persons rp WHERE rp.registration_id = r.id AND rp.cancelled_at IS NULL) AS person_count,
      (SELECT COUNT(*)::int FROM registration_persons rp WHERE rp.registration_id = r.id AND rp.cancelled_at IS NULL AND rp.is_child) AS child_count,
      e.title AS event_title,
      TO_CHAR(e.date, 'YYYY-MM-DD') AS event_date,
      e.time::text AS event_time,
      e.category AS event_category,
      e.location AS event_location
    FROM registrations r
    JOIN events e ON r.event_id = e.id
    WHERE r.id = ${id}
  `;
  if (!rows[0]) return null;

  const detail = rows[0] as RegistrationDetail;
  const persons = await sql`
    SELECT id, registration_id, first_name, last_name, is_child, checked_in_at, cancelled_at, created_at
    FROM registration_persons
    WHERE registration_id = ${id} AND cancelled_at IS NULL
    ORDER BY created_at ASC
  `;
  detail.persons = persons as RegistrationPerson[];
  return detail;
}

export async function bulkUpdateRegistrationStatus(
  ids: number[],
  status: RegistrationStatus,
  note?: string
): Promise<RegistrationStatusUpdate[]> {
  if (!isPostgresConfigured()) {
    const { bulkUpdateLocalRegistrationStatus } = await import("../local-data");
    return bulkUpdateLocalRegistrationStatus(ids, status, note);
  }

  const results: RegistrationStatusUpdate[] = [];
  for (const id of ids) {
    const result = await updateRegistrationStatus(id, status, note);
    if (result) results.push(result);
  }
  return results;
}

export async function cancelRegistrationById(registrationId: number): Promise<void> {
  await withRegistrationLock(registrationId, async (sql) => {
    const [row] = await sql`SELECT status_token FROM registrations WHERE id = ${registrationId}`;
    if (!row) return;
    const existing = await getRegistrationByToken(row.status_token as string, sql);
    if (!existing || !['pending', 'approved'].includes(existing.status)) return;
    const now = new Date();
    assertCancellationOpen(existing, now);
    await cancelLockedRegistration(sql, registrationId, now);
  });
}

export async function generateCancellationToken(
  registrationId: number,
  eventEndsAt: Date
): Promise<string> {
  const crypto = globalThis.crypto;
  const token = crypto.getRandomValues(new Uint8Array(32)).reduce((acc, byte) => acc + byte.toString(16).padStart(2, '0'), '');
  const id = crypto.randomUUID();
  const sql = getSQL();
  await sql`
    INSERT INTO cancellation_tokens (id, token, registration_id, expires_at)
    VALUES (${id}, ${token}, ${registrationId}, ${eventEndsAt.toISOString()})
  `;
  return token;
}

export interface CancellationTokenInfo {
  paymentInProgress?: boolean;
  registrationId: number;
  expiresAt: string;
  usedAt: string | null;
  registrationStatus: string;
  firstName: string;
  lastName: string;
  email: string | null;
  statusToken: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  eventLocation: string;
  /** Eigener Stornozeitpunkt des Events (null = 24-Stunden-Regel) */
  eventCancellationDeadline: string | null;
  /** Zeitpunkt der Zahlung (null = unbezahlt, dann gilt keine Frist) */
  paidAt: string | null;
}

export async function getCancellationTokenInfo(
  token: string, transaction?: RegistrationSQL,
): Promise<CancellationTokenInfo | null> {
  const sql = transaction ?? getSQL();
  const rows = await sql`
    SELECT
      ct.registration_id,
      (ct.expires_at AT TIME ZONE 'UTC')::text AS expires_at,
      ct.used_at::text,
      r.status        AS registration_status,
      r.email,
      r.status_token,
      r.paid_at,
      EXISTS (SELECT 1 FROM checkout_pricing cp WHERE cp.registration_id = r.id AND cp.payment_state IN ('processing', 'paid')) AS payment_in_progress,
      COALESCE((SELECT rp.first_name FROM registration_persons rp WHERE rp.registration_id = r.id ORDER BY rp.created_at LIMIT 1), '') AS first_name,
      COALESCE((SELECT rp.last_name FROM registration_persons rp WHERE rp.registration_id = r.id ORDER BY rp.created_at LIMIT 1), '') AS last_name,
      e.title         AS event_title,
      TO_CHAR(e.date, 'YYYY-MM-DD') AS event_date,
      e.time::text    AS event_time,
      e.location      AS event_location,
      TO_CHAR(e.cancellation_deadline, 'YYYY-MM-DD"T"HH24:MI') AS event_cancellation_deadline
    FROM cancellation_tokens ct
    JOIN registrations r ON ct.registration_id = r.id
    JOIN events e ON r.event_id = e.id
    WHERE ct.token = ${token}
  `;
  const row = rows[0] as {
    registration_id: number;
    expires_at: string;
    payment_in_progress: boolean;
    used_at: string | null;
    registration_status: string;
    first_name: string;
    last_name: string;
    email: string | null;
    status_token: string;
    paid_at: string | null;
    event_title: string;
    event_date: string;
    event_time: string;
    event_location: string;
    event_cancellation_deadline: string | null;
  } | undefined;
  if (!row) return null;
  return {
    registrationId: row.registration_id,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    registrationStatus: row.registration_status,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    statusToken: row.status_token,
    eventTitle: row.event_title,
    eventDate: row.event_date,
    eventTime: row.event_time,
    eventLocation: row.event_location,
    eventCancellationDeadline: row.event_cancellation_deadline,
    paidAt: row.paid_at,
    paymentInProgress: row.payment_in_progress,
  };
}

export async function cancelRegistrationByCancellationToken(token: string): Promise<
  | { status: 'cancelled'; info: CancellationTokenInfo }
  | { status: 'not_found' | 'already_cancelled' | 'expired' }
> {
  const sql = getSQL();
  const [row] = await sql`SELECT registration_id FROM cancellation_tokens WHERE token = ${token}`;
  if (!row) return { status: 'not_found' };
  return withRegistrationLock(row.registration_id as number, async (sql) => {
    const info = await getCancellationTokenInfo(token, sql);
    if (!info || info.registrationId !== row.registration_id) return { status: 'not_found' };
    if (info.usedAt !== null || info.registrationStatus === 'cancelled') return { status: 'already_cancelled' };
    const now = new Date();
    if (new Date(info.expiresAt) <= now) return { status: 'expired' };
    if (!['pending', 'approved'].includes(info.registrationStatus)) return { status: 'not_found' };
    const blocked = cancellationBlockedReason({ event_date: info.eventDate, event_time: info.eventTime,
      cancellation_deadline: info.eventCancellationDeadline, paid_at: info.paidAt,
      payment_in_progress: info.paymentInProgress }, now);
    if (blocked) throw new CancellationBlockedError(blocked);
    await cancelLockedRegistration(sql, info.registrationId, now);
    await sql`UPDATE cancellation_tokens SET used_at = ${now.toISOString()} WHERE token = ${token}`;
    return { status: 'cancelled', info };
  });
}

export interface RegistrationDueForReminder {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  status_token: string;
  event_title: string;
  event_date: string;
  event_time: string;
  event_location: string;
}

export async function getRegistrationsDueForReminder(): Promise<RegistrationDueForReminder[]> {
  const sql = getSQL();
  const rows = await sql`
    SELECT
      r.id,
      r.email,
      r.status_token,
      COALESCE((SELECT rp.first_name FROM registration_persons rp WHERE rp.registration_id = r.id ORDER BY rp.created_at LIMIT 1), '') AS first_name,
      COALESCE((SELECT rp.last_name FROM registration_persons rp WHERE rp.registration_id = r.id ORDER BY rp.created_at LIMIT 1), '') AS last_name,
      e.title       AS event_title,
      TO_CHAR(e.date, 'YYYY-MM-DD') AS event_date,
      e.time::text  AS event_time,
      e.location    AS event_location
    FROM registrations r
    JOIN events e ON r.event_id = e.id
    WHERE r.status = 'approved'
      AND r.reminder_sent_at IS NULL
      AND r.email IS NOT NULL
      AND e.date = CURRENT_DATE + INTERVAL '1 day'
      AND e.status != 'cancelled'
  `;
  return rows as RegistrationDueForReminder[];
}

export async function sendReminderEmail(registrationId: number): Promise<void> {
  const sql = getSQL();

  const rows = await sql`
    SELECT
      r.id,
      r.email,
      r.status,
      r.reminder_sent_at,
      r.status_token,
      COALESCE((SELECT rp.first_name FROM registration_persons rp WHERE rp.registration_id = r.id ORDER BY rp.created_at LIMIT 1), '') AS first_name,
      COALESCE((SELECT rp.last_name FROM registration_persons rp WHERE rp.registration_id = r.id ORDER BY rp.created_at LIMIT 1), '') AS last_name,
      e.title       AS event_title,
      TO_CHAR(e.date, 'YYYY-MM-DD') AS event_date,
      e.time::text  AS event_time,
      e.location    AS event_location,
      e.status      AS event_status
    FROM registrations r
    JOIN events e ON r.event_id = e.id
    WHERE r.id = ${registrationId}
  `;

  const reg = rows[0] as {
    id: number;
    first_name: string;
    last_name: string;
    email: string | null;
    status: string;
    reminder_sent_at: string | null;
    status_token: string;
    event_title: string;
    event_date: string;
    event_time: string;
    event_location: string;
    event_status: string;
  } | undefined;

  if (!reg) throw new Error(`Registration ${registrationId} nicht gefunden`);
  if (!reg.email) throw new Error(`Registration ${registrationId} hat keine E-Mail-Adresse`);
  if (reg.status !== "approved") throw new Error(`Registration ${registrationId} ist nicht approved`);
  if (reg.reminder_sent_at) throw new Error(`Reminder für Registration ${registrationId} wurde bereits gesendet`);
  if (reg.event_status === "cancelled") throw new Error(`Event für Registration ${registrationId} wurde abgesagt`);

  const eventEndsAt = new Date(`${reg.event_date}T23:59:59`);
  const cancellationToken = await generateCancellationToken(registrationId, eventEndsAt);

  const { sendEventReminderEmail } = await import("../email");
  await sendEventReminderEmail({
    to: reg.email,
    firstName: reg.first_name,
    eventTitle: reg.event_title,
    eventDate: reg.event_date,
    eventTime: reg.event_time,
    eventLocation: reg.event_location,
    statusToken: reg.status_token,
    cancellationToken,
  });

  await sql`
    UPDATE registrations
    SET reminder_sent_at = NOW()
    WHERE id = ${registrationId}
  `;
}

// ─── Survey Emails ────────────────────────────────────────

export interface RegistrationDueForSurvey {
  id: number;
  email: string;
}

export async function getRegistrationsDueForSurvey(): Promise<RegistrationDueForSurvey[]> {
  const sql = getSQL();
  const rows = await sql`
    SELECT r.id, r.email
    FROM registrations r
    JOIN events e ON r.event_id = e.id
    WHERE r.status = 'approved'
      AND r.survey_sent_at IS NULL
      AND r.email IS NOT NULL
      AND e.survey_url IS NOT NULL
      AND e.survey_url != ''
      AND e.date < CURRENT_DATE
      AND e.date >= CURRENT_DATE - INTERVAL '30 days'
      AND e.status != 'cancelled'
  `;
  return rows as RegistrationDueForSurvey[];
}

export async function sendSurveyEmailForRegistration(registrationId: number): Promise<void> {
  const sql = getSQL();

  const rows = await sql`
    SELECT
      r.id,
      r.email,
      r.status,
      r.survey_sent_at,
      COALESCE((SELECT rp.first_name FROM registration_persons rp WHERE rp.registration_id = r.id ORDER BY rp.created_at LIMIT 1), '') AS first_name,
      e.title       AS event_title,
      TO_CHAR(e.date, 'YYYY-MM-DD') AS event_date,
      e.survey_url  AS survey_url,
      e.status      AS event_status
    FROM registrations r
    JOIN events e ON r.event_id = e.id
    WHERE r.id = ${registrationId}
  `;

  const reg = rows[0] as {
    id: number;
    first_name: string;
    email: string | null;
    status: string;
    survey_sent_at: string | null;
    event_title: string;
    event_date: string;
    survey_url: string | null;
    event_status: string;
  } | undefined;

  if (!reg) throw new Error(`Registration ${registrationId} nicht gefunden`);
  if (!reg.email) throw new Error(`Registration ${registrationId} hat keine E-Mail-Adresse`);
  if (reg.status !== "approved") throw new Error(`Registration ${registrationId} ist nicht approved`);
  if (reg.survey_sent_at) throw new Error(`Survey-E-Mail für Registration ${registrationId} wurde bereits gesendet`);
  if (!reg.survey_url) throw new Error(`Kein Survey-URL für Event der Registration ${registrationId}`);
  if (reg.event_status === "cancelled") throw new Error(`Event für Registration ${registrationId} wurde abgesagt`);

  const { sendEventSurveyEmail } = await import("../email");
  await sendEventSurveyEmail({
    to: reg.email,
    firstName: reg.first_name,
    eventTitle: reg.event_title,
    eventDate: reg.event_date,
    surveyUrl: reg.survey_url,
  });

  await sql`
    UPDATE registrations
    SET survey_sent_at = NOW()
    WHERE id = ${registrationId}
  `;
}

/**
 * Die Grundlage einer Zahlung, an einer Stelle aus der Datenbank geholt:
 * welcher Betrag, wie viele Personen, zu welcher Anmeldung. Bewusst getrennt
 * von getRegistrationByToken – dort geht es um Anzeige, hier um Geld.
 */
export async function getCheckoutInfo(token: string): Promise<CheckoutInfo | null> {
  if (!isPostgresConfigured()) {
    const { getLocalCheckoutInfo } = await import("../local-data");
    return getLocalCheckoutInfo(token);
  }

  const sql = getSQL();
  const rows = await sql`
    SELECT
      r.id AS registration_id, r.email, r.status, r.is_waitlist, r.paid_at,
      EXTRACT(EPOCH FROM (r.created_at AT TIME ZONE 'UTC'))::float8 AS registration_created_unix,
      e.id AS event_id, e.title AS event_title, TO_CHAR(e.date, 'YYYY-MM-DD') AS event_date,
      e.price, e.entry_price::float8 AS entry_price, e.stripe_price_id,
      e.child_entry_price::float8 AS child_entry_price, e.stripe_child_price_id,
      (SELECT COUNT(*)::int FROM registration_persons rp
        WHERE rp.registration_id = r.id AND rp.cancelled_at IS NULL) AS person_count,
      (SELECT COUNT(*)::int FROM registration_persons rp
        WHERE rp.registration_id = r.id AND rp.cancelled_at IS NULL AND rp.is_child) AS child_count,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id', rp.id::text, 'is_child', rp.is_child) ORDER BY rp.created_at, rp.id)
        FROM registration_persons rp WHERE rp.registration_id = r.id AND rp.cancelled_at IS NULL), '[]'::jsonb) AS persons
    FROM registrations r
    JOIN events e ON r.event_id = e.id
    WHERE r.status_token = ${token}
  `;
  return (rows[0] as CheckoutInfo) ?? null;
}
/** Hält die angebotenen Personenpreise vor Ausgabe des Zahlungslinks fest. */
export async function saveCheckoutPricing(sessionId: string, registrationId: number, prices: PersonPrices): Promise<void> {
  const sql = getSQL();
  const rows = await sql`
    INSERT INTO checkout_pricing (session_id, registration_id, person_prices)
    VALUES (${sessionId}, ${registrationId}, ${JSON.stringify(prices)}::jsonb)
    ON CONFLICT (session_id) DO UPDATE SET person_prices = EXCLUDED.person_prices
    WHERE checkout_pricing.registration_id = EXCLUDED.registration_id
      AND (checkout_pricing.person_prices IS NULL OR checkout_pricing.person_prices = EXCLUDED.person_prices)
    RETURNING session_id
  `;
  if (!rows[0]) throw new Error("Gespeicherte Checkout-Preisaufteilung darf nicht verändert werden.");
}

export async function getCheckoutPricing(sessionId: string, registrationId: number): Promise<PersonPrices | null> {
  const sql = getSQL();
  const rows = await sql`
    SELECT person_prices FROM checkout_pricing
    WHERE session_id = ${sessionId} AND registration_id = ${registrationId}
  `;
  return (rows[0] as { person_prices: PersonPrices } | undefined)?.person_prices ?? null;
}

/**
 * Verbucht Zahlung und Personenpreise gemeinsam. Nur der erste Aufruf mit
 * `paid_at IS NULL` erhält bereits verbuchte Beträge. Die Teilnahmebestätigung
 * erfolgt getrennt; auch nach einer Stornierung muss ein Zahlungseingang erhalten bleiben.
 */
export async function markRegistrationPaid(
  registrationId: number,
  sessionId: string,
  amount: number,
  paymentIntentId: string | null,
  personPrices: PersonPrices | null = null
): Promise<boolean> {
  return withRegistrationLock(registrationId, async (sql) => {
    const rows = await sql`
      UPDATE registrations SET
        paid_at = clock_timestamp(),
        amount_paid = ${amount},
        paid_person_prices = ${personPrices == null ? null : JSON.stringify(personPrices)}::jsonb,
        stripe_session_id = ${sessionId},
        stripe_payment_intent_id = ${paymentIntentId},
        is_waitlist = FALSE
      WHERE id = ${registrationId}
        AND paid_at IS NULL
      RETURNING id
    `;
    return rows.length > 0;
  });
}

// ─── Erstattungen ────────────────────────────────────────────────────────────

/**
 * Alles, was für die Erstattung nach einer Stornierung gebraucht wird, in
 * einem Zug aus der Datenbank.
 *
 * Zurückgezahlt wird von Hand im Stripe-Dashboard. Diese Abfrage liefert die
 * Grundlage dafür und für die Zusage in der Storno-E-Mail: für wie viele
 * Personen damals bezahlt wurde, wer davon storniert ist und was bereits
 * zugesagt wurde.
 *
 * Neue Zahlungen verwenden die beim Checkout gespeicherten Personenpreise.
 * Bei älteren Zahlungen wird die bisherige Zuordnung über Zeitstempel beibehalten.
 *
 * `paid_at` steht ohne Zeitzone in der Datenbank, die Personen-Zeitstempel
 * mit. Der Vergleich macht die Zeitzone deshalb ausdrücklich: geschrieben
 * wurde `paid_at` von NOW() in einer UTC-Sitzung.
 */
export async function getRefundContext(
  registrationId: number
): Promise<RefundContext | null> {
  if (!isPostgresConfigured()) return null;

  const sql = getSQL();
  const rows = await sql`
    SELECT
      r.id AS registration_id, r.email, r.status_token,
      r.paid_at, r.amount_paid::float8 AS amount_paid, r.paid_person_prices, r.stripe_payment_intent_id, r.stripe_session_id,
      COALESCE((SELECT rp.first_name FROM registration_persons rp
                WHERE rp.registration_id = r.id ORDER BY rp.created_at LIMIT 1), '') AS first_name,
      e.title AS event_title, TO_CHAR(e.date, 'YYYY-MM-DD') AS event_date,
      e.time::text AS event_time, e.location AS event_location,
      TO_CHAR(e.cancellation_deadline, 'YYYY-MM-DD"T"HH24:MI') AS event_cancellation_deadline
    FROM registrations r
    JOIN events e ON r.event_id = e.id
    WHERE r.id = ${registrationId}
  `;
  if (!rows[0]) return null;
  const base = rows[0] as Omit<
    RefundContext,
    | "paid_persons"
    | "announced_cents"
    | "pending_persons"
    | "active_paid_persons"
    | "active_persons"
  >;

  const persons = (await sql`
    SELECT
      rp.id, rp.first_name, rp.last_name,
      rp.cancelled_at,
      (rp.cancelled_at IS NOT NULL) AS cancelled,
      (rp.refund_announced_at IS NOT NULL) AS announced,
      COALESCE(rp.refund_amount, 0)::float8 AS refund_amount,
      (
        r.paid_at IS NOT NULL
        AND CASE WHEN r.paid_person_prices IS NOT NULL
          THEN r.paid_person_prices ? rp.id::text
          ELSE rp.created_at <= (r.paid_at AT TIME ZONE 'UTC')
            AND (rp.cancelled_at IS NULL OR rp.cancelled_at >= (r.paid_at AT TIME ZONE 'UTC'))
        END
      ) AS paid_for
    FROM registration_persons rp
    JOIN registrations r ON r.id = rp.registration_id
    WHERE rp.registration_id = ${registrationId}
    ORDER BY rp.created_at ASC
  `) as Array<{
    id: string;
    first_name: string;
    last_name: string;
    cancelled: boolean;
    cancelled_at: string | null;
    announced: boolean;
    refund_amount: number;
    paid_for: boolean;
  }>;

  const paid = persons.filter((p) => p.paid_for);
  return {
    ...base,
    paid_persons: paid.length,
    announced_cents: persons.reduce(
      (sum, p) => sum + Math.round((p.refund_amount ?? 0) * 100),
      0
    ),
    pending_persons: paid
      .filter((p) => p.cancelled && !p.announced)
      .map(({ id, first_name, last_name, cancelled_at }) => ({ id, first_name, last_name, cancelled_at })),
    active_paid_persons: paid.filter((p) => !p.cancelled && !p.announced).length,
    active_persons: persons.filter((p) => !p.cancelled).length,
  };
}

/**
 * Hält fest, welcher Betrag einer stornierten Person zusteht.
 *
 * Der Zeitstempel ist mehr als Buchführung: er ist die Bedingung, unter der
 * geschrieben wird (`refund_announced_at IS NULL`). Zwei gleichzeitige
 * Stornierungen können deshalb nicht denselben Anteil zweimal zusagen – das
 * entscheidet die Datenbank, nicht die Reihenfolge der Aufrufe. Zurück kommen
 * nur die Personen, die dieser Aufruf wirklich für sich verbucht hat.
 */
export async function announceRefunds(
  shares: Array<{ personId: string; amount: number }>
): Promise<string[]> {
  if (!isPostgresConfigured() || shares.length === 0) return [];

  const sql = getSQL();
  const claimed: string[] = [];
  for (const { personId, amount } of shares) {
    const rows = await sql`
      UPDATE registration_persons
      SET refund_announced_at = NOW(), refund_amount = ${amount}
      WHERE id = ${personId}::uuid AND refund_announced_at IS NULL
      RETURNING id
    `;
    if (rows[0]) claimed.push((rows[0] as { id: string }).id);
  }
  return claimed;
}

/**
 * Was für eine Anmeldung insgesamt zu erstatten ist – die Zahl, die der Admin
 * im Stripe-Dashboard zurückgibt.
 */
export async function getRefundDue(
  registrationId: number
): Promise<{ amount: number; persons: number }> {
  if (!isPostgresConfigured()) return { amount: 0, persons: 0 };

  const sql = getSQL();
  const rows = await sql`
    SELECT
      COALESCE(SUM(refund_amount), 0)::float8 AS amount,
      COUNT(*) FILTER (WHERE refund_announced_at IS NOT NULL)::int AS persons
    FROM registration_persons
    WHERE registration_id = ${registrationId}
  `;
  return rows[0] as { amount: number; persons: number };
}

import { getSQL, isPostgresConfigured } from "./utils";
import { findRegistration } from "./registrations";
import type { CheckinParticipant, CheckinStatusResponse, WaitlistEntry } from "../types";

export interface CheckinEventRow {
  id: number;
  title: string;
  category: string;
  date: string;
  time: string;
  location: string;
  entry_price: number | null;
  approved_count: number;
  checked_in_count: number;
  total_costs: number;
  total_donations: number;
  expected_revenue: number;
  actual_revenue: number;
}

export async function getCheckinEvents(): Promise<{
  today: CheckinEventRow[];
  upcoming: CheckinEventRow[];
  past: CheckinEventRow[];
}> {
  if (!isPostgresConfigured()) {
    const { getLocalCheckinEvents } = await import("../local-data");
    return getLocalCheckinEvents();
  }

  const sql = getSQL();

  // Core query — no financial subqueries so it never fails due to missing tables
  const coreQuery = sql`
    SELECT
      e.id,
      e.title,
      e.category,
      TO_CHAR(e.date, 'YYYY-MM-DD') AS date,
      e.time::text AS time,
      e.location,
      e.entry_price::float8 AS entry_price,
      COUNT(CASE WHEN r.status = 'approved' THEN rp.id ELSE NULL END)::int AS approved_count,
      COUNT(CASE WHEN r.status = 'approved' AND r.checked_in_at IS NOT NULL THEN rp.id ELSE NULL END)::int AS checked_in_count,
      COUNT(CASE WHEN r.status = 'approved' THEN rp.id ELSE NULL END)::float8 * COALESCE(e.entry_price::float8, 0) AS expected_revenue,
      COUNT(CASE WHEN r.status = 'approved' AND r.checked_in_at IS NOT NULL THEN rp.id ELSE NULL END)::float8 * COALESCE(e.entry_price::float8, 0) AS actual_revenue
    FROM events e
    LEFT JOIN registrations r ON e.id = r.event_id
    LEFT JOIN registration_persons rp ON rp.registration_id = r.id AND rp.cancelled_at IS NULL
    WHERE e.status = 'published' AND e.date >= CURRENT_DATE
    GROUP BY e.id
    ORDER BY e.date ASC, e.time ASC
  `;

  const corePastQuery = sql`
    SELECT
      e.id,
      e.title,
      e.category,
      TO_CHAR(e.date, 'YYYY-MM-DD') AS date,
      e.time::text AS time,
      e.location,
      e.entry_price::float8 AS entry_price,
      COUNT(CASE WHEN r.status = 'approved' THEN rp.id ELSE NULL END)::int AS approved_count,
      COUNT(CASE WHEN r.status = 'approved' AND r.checked_in_at IS NOT NULL THEN rp.id ELSE NULL END)::int AS checked_in_count,
      COUNT(CASE WHEN r.status = 'approved' THEN rp.id ELSE NULL END)::float8 * COALESCE(e.entry_price::float8, 0) AS expected_revenue,
      COUNT(CASE WHEN r.status = 'approved' AND r.checked_in_at IS NOT NULL THEN rp.id ELSE NULL END)::float8 * COALESCE(e.entry_price::float8, 0) AS actual_revenue
    FROM events e
    LEFT JOIN registrations r ON e.id = r.event_id
    LEFT JOIN registration_persons rp ON rp.registration_id = r.id AND rp.cancelled_at IS NULL
    WHERE e.status = 'published' AND e.date < CURRENT_DATE
    GROUP BY e.id
    ORDER BY e.date DESC, e.time DESC
    LIMIT 10
  `;

  const [rows, pastRows] = await Promise.all([coreQuery, corePastQuery]);

  // Financial data — wrapped in try/catch in case tables are not yet migrated
  type FinRow = { event_id: number; total: number };
  let costsMap = new Map<number, number>();
  let donationsMap = new Map<number, number>();
  try {
    const costRows = await sql`SELECT event_id, SUM(amount)::float8 AS total FROM event_costs GROUP BY event_id` as FinRow[];
    for (const r of costRows) costsMap.set(r.event_id, r.total);
  } catch { /* event_costs table not yet migrated */ }
  try {
    const donationRows = await sql`SELECT event_id, SUM(amount)::float8 AS total FROM event_donations GROUP BY event_id` as FinRow[];
    for (const r of donationRows) donationsMap.set(r.event_id, r.total);
  } catch { /* event_donations table not yet migrated */ }

  type CoreRow = Omit<CheckinEventRow, "total_costs" | "total_donations">;
  const enrich = (r: CoreRow): CheckinEventRow => ({
    ...r,
    total_costs: costsMap.get(r.id) ?? 0,
    total_donations: donationsMap.get(r.id) ?? 0,
  });

  // process.env.TZ can be ":UTC" (POSIX prefix) which Intl rejects – strip it
  const tz = (process.env.TZ || "Europe/Berlin").replace(/^:/, "");
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: tz });

  return {
    today: (rows as CoreRow[]).filter((r) => r.date === todayStr).map(enrich),
    upcoming: (rows as CoreRow[]).filter((r) => r.date > todayStr).map(enrich),
    past: (pastRows as CoreRow[]).map(enrich),
  };
}

export async function saveQRCode(
  registrationId: number,
  qrCode: string,
  qrToken: string
): Promise<void> {
  const sql = getSQL();
  await sql`
    UPDATE registrations SET qr_code = ${qrCode}, qr_token = ${qrToken}
    WHERE id = ${registrationId}
  `;
}

export async function getRegistrationByQRToken(
  qrToken: string
): Promise<import("../types").RegistrationWithEvent | null> {
  const sql = getSQL();
  const rows = await sql`
    SELECT
      r.id, r.event_id, r.email, r.phone, r.status, r.status_token,
      r.status_changed_at, r.status_note, r.created_at,
      r.qr_code, r.qr_token, r.checked_in_at, r.checked_in_by,
      r.is_walk_in, r.notes, r.reminder_sent_at,
      COALESCE((SELECT rp.first_name FROM registration_persons rp WHERE rp.registration_id = r.id ORDER BY rp.created_at LIMIT 1), '') AS first_name,
      COALESCE((SELECT rp.last_name FROM registration_persons rp WHERE rp.registration_id = r.id ORDER BY rp.created_at LIMIT 1), '') AS last_name,
      (SELECT COUNT(*)::int FROM registration_persons rp WHERE rp.registration_id = r.id AND rp.cancelled_at IS NULL) AS person_count,
      e.title AS event_title, TO_CHAR(e.date, 'YYYY-MM-DD') AS event_date, e.category AS event_category
    FROM registrations r
    JOIN events e ON r.event_id = e.id
    WHERE r.qr_token = ${qrToken}
  `;
  return (rows[0] as import("../types").RegistrationWithEvent) ?? null;
}

export async function getRegistrationWithPersonsByQRToken(token: string): Promise<{
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  status: string;
  checked_in_at: string | null;
  is_walk_in: boolean;
  persons: import("../types").RegistrationPerson[];
} | null> {
  const sql = getSQL();
  const rows = await sql`
    SELECT
      r.id, r.email, r.status, r.checked_in_at, r.is_walk_in,
      COALESCE((SELECT rp.first_name FROM registration_persons rp WHERE rp.registration_id = r.id ORDER BY rp.created_at LIMIT 1), '') AS first_name,
      COALESCE((SELECT rp.last_name FROM registration_persons rp WHERE rp.registration_id = r.id ORDER BY rp.created_at LIMIT 1), '') AS last_name
    FROM registrations r
    WHERE r.qr_token = ${token}
  `;
  if (!rows[0]) return null;
  const reg = rows[0] as { id: number; first_name: string; last_name: string; email: string | null; status: string; checked_in_at: string | null; is_walk_in: boolean };
  const persons = await sql`
    SELECT id::text AS id, registration_id, first_name, last_name, checked_in_at, cancelled_at, created_at
    FROM registration_persons
    WHERE registration_id = ${reg.id} AND cancelled_at IS NULL
    ORDER BY created_at ASC
  `;
  return { ...reg, persons: persons as import("../types").RegistrationPerson[] };
}

export async function markCheckedIn(
  registrationId: number,
  checkedInBy: string
): Promise<void> {
  const sql = getSQL();
  await sql`
    UPDATE registrations
    SET checked_in_at = NOW(), checked_in_by = ${checkedInBy}
    WHERE id = ${registrationId}
  `;
  await sql`
    UPDATE registration_persons
    SET checked_in_at = NOW()
    WHERE registration_id = ${registrationId} AND cancelled_at IS NULL AND checked_in_at IS NULL
  `;
}

export async function markPersonCheckedIn(
  personId: string,
  checkedInBy: string
): Promise<{ registrationId: number } | null> {
  const sql = getSQL();
  const rows = await sql`
    UPDATE registration_persons
    SET checked_in_at = NOW()
    WHERE id = ${personId} AND cancelled_at IS NULL AND checked_in_at IS NULL
    RETURNING registration_id
  `;
  if (!rows[0]) return null;
  const registrationId = (rows[0] as { registration_id: number }).registration_id;
  await sql`
    UPDATE registrations SET checked_in_at = NOW(), checked_in_by = ${checkedInBy}
    WHERE id = ${registrationId} AND checked_in_at IS NULL
  `;
  return { registrationId };
}

export async function undoPersonCheckin(personId: string): Promise<{ registrationId: number } | null> {
  const sql = getSQL();
  const rows = await sql`
    UPDATE registration_persons
    SET checked_in_at = NULL
    WHERE id = ${personId} AND cancelled_at IS NULL
    RETURNING registration_id
  `;
  if (!rows[0]) return null;
  const registrationId = (rows[0] as { registration_id: number }).registration_id;
  const remaining = await sql`
    SELECT COUNT(*)::int AS n FROM registration_persons
    WHERE registration_id = ${registrationId} AND cancelled_at IS NULL AND checked_in_at IS NOT NULL
  `;
  if ((remaining[0] as { n: number }).n === 0) {
    await sql`UPDATE registrations SET checked_in_at = NULL, checked_in_by = NULL WHERE id = ${registrationId}`;
  }
  return { registrationId };
}

/** Load all active persons for a set of registrations, grouped by registration. */
async function getPersonsByRegistration(
  regIds: number[]
): Promise<Map<number, import("../types").RegistrationPerson[]>> {
  const personsByReg = new Map<number, import("../types").RegistrationPerson[]>();
  if (regIds.length === 0) return personsByReg;

  const sql = getSQL();
  type PersonRow = import("../types").RegistrationPerson & { registration_id: number };
  const personRows = await sql`
    SELECT id::text AS id, registration_id, first_name, last_name, checked_in_at, cancelled_at, created_at
    FROM registration_persons
    WHERE registration_id = ANY(${regIds})
      AND cancelled_at IS NULL
    ORDER BY created_at ASC
  ` as PersonRow[];

  for (const p of personRows) {
    if (!personsByReg.has(p.registration_id)) personsByReg.set(p.registration_id, []);
    personsByReg.get(p.registration_id)!.push(p);
  }
  return personsByReg;
}

/**
 * Waitlist = all registrations of an event that are still pending. Ordered by
 * sign-up time so the team can confirm them first-come-first-served.
 * Registrations whose persons have all been cancelled are skipped.
 */
export async function getEventWaitlist(eventId: number): Promise<WaitlistEntry[]> {
  const sql = getSQL();
  const rows = await sql`
    SELECT
      r.id, r.email, r.phone, r.notes, r.created_at,
      COALESCE((SELECT rp.first_name FROM registration_persons rp WHERE rp.registration_id = r.id ORDER BY rp.created_at LIMIT 1), '') AS first_name,
      COALESCE((SELECT rp.last_name FROM registration_persons rp WHERE rp.registration_id = r.id ORDER BY rp.created_at LIMIT 1), '') AS last_name
    FROM registrations r
    WHERE r.event_id = ${eventId}
      AND r.status = 'pending'
      AND EXISTS (
        SELECT 1 FROM registration_persons rp
        WHERE rp.registration_id = r.id AND rp.cancelled_at IS NULL
      )
    ORDER BY r.created_at ASC
  `;

  const entriesBase = rows as Omit<WaitlistEntry, "persons">[];
  const personsByReg = await getPersonsByRegistration(entriesBase.map((r) => r.id));

  return entriesBase.map((r) => ({ ...r, persons: personsByReg.get(r.id) ?? [] }));
}

/**
 * Approve a pending registration. Returns true only when this call performed
 * the transition, so the caller sends the approval email exactly once even if
 * two admins tap "Bestätigen" at the same time.
 */
export async function approvePendingRegistration(registrationId: number): Promise<boolean> {
  const sql = getSQL();
  const rows = await sql`
    UPDATE registrations
    SET status = 'approved', status_changed_at = NOW()
    WHERE id = ${registrationId} AND status = 'pending'
    RETURNING id
  `;
  return rows.length > 0;
}

/**
 * Check in specific persons of a registration. Person IDs are constrained to
 * the given registration, so a stale client can never check in someone else.
 * Returns the number of persons newly checked in.
 */
export async function checkinPersonsForRegistration(
  registrationId: number,
  personIds: string[],
  checkedInBy: string
): Promise<number> {
  if (personIds.length === 0) return 0;

  const sql = getSQL();
  const rows = await sql`
    UPDATE registration_persons
    SET checked_in_at = NOW()
    WHERE registration_id = ${registrationId}
      AND id = ANY(${personIds}::uuid[])
      AND cancelled_at IS NULL
      AND checked_in_at IS NULL
    RETURNING id
  `;

  if (rows.length > 0) {
    await sql`
      UPDATE registrations SET checked_in_at = NOW(), checked_in_by = ${checkedInBy}
      WHERE id = ${registrationId} AND checked_in_at IS NULL
    `;
  }
  return rows.length;
}

export async function getCheckinStatus(eventId: number): Promise<CheckinStatusResponse> {
  const sql = getSQL();
  const rows = await sql`
    SELECT
      r.id, r.email, r.phone, r.checked_in_at, r.checked_in_by, r.is_walk_in, r.notes,
      COALESCE((SELECT rp.first_name FROM registration_persons rp WHERE rp.registration_id = r.id ORDER BY rp.created_at LIMIT 1), '') AS first_name,
      COALESCE((SELECT rp.last_name FROM registration_persons rp WHERE rp.registration_id = r.id ORDER BY rp.created_at LIMIT 1), '') AS last_name,
      GREATEST(0, (SELECT COUNT(*)::int FROM registration_persons rp WHERE rp.registration_id = r.id AND rp.cancelled_at IS NULL) - 1) AS guests
    FROM registrations r
    WHERE r.event_id = ${eventId} AND r.status = 'approved'
    ORDER BY
      (SELECT rp.last_name FROM registration_persons rp WHERE rp.registration_id = r.id ORDER BY rp.created_at LIMIT 1) ASC,
      (SELECT rp.first_name FROM registration_persons rp WHERE rp.registration_id = r.id ORDER BY rp.created_at LIMIT 1) ASC
  `;

  const participantsBase = rows as Omit<CheckinParticipant, "persons">[];

  // Fetch all persons for these registrations in one query
  const [personsByReg, waitlist] = await Promise.all([
    getPersonsByRegistration(participantsBase.map((r) => r.id)),
    getEventWaitlist(eventId),
  ]);

  const participants: CheckinParticipant[] = participantsBase.map((r) => ({
    ...r,
    persons: personsByReg.get(r.id) ?? [],
  }));

  const totalRegistrations = participants.length;
  const totalGuests = participants.reduce((sum, p) => sum + p.guests, 0);
  const total = totalRegistrations + totalGuests;
  // checked_in: count persons whose checked_in_at is set (person-level)
  const checkedIn = participants.reduce(
    (sum, p) => sum + p.persons.filter((pp) => pp.checked_in_at !== null).length,
    0
  );
  const walkIns = participants.filter((p) => p.is_walk_in);
  const walkInRegistrations = walkIns.length;
  const walkInGuests = walkIns.reduce((sum, p) => sum + p.guests, 0);

  return {
    total,
    checked_in: checkedIn,
    missing: total - checkedIn,
    total_registrations: totalRegistrations,
    total_guests: totalGuests,
    walk_in_registrations: walkInRegistrations,
    walk_in_guests: walkInGuests,
    participants,
    waitlist,
    waitlist_registrations: waitlist.length,
    waitlist_persons: waitlist.reduce((sum, w) => sum + w.persons.length, 0),
  };
}

export async function createWalkInRegistration(data: {
  event_id: number;
  persons: Array<{ firstName: string; lastName: string }>;
  email: string | null;
  phone: string | null;
  notes: string | null;
  checked_in_by: string | null;
}): Promise<{ id: number; alreadyExists: boolean }> {
  if (!isPostgresConfigured()) {
    const { createLocalWalkInRegistration } = await import("../local-data");
    return createLocalWalkInRegistration(data);
  }

  if (data.email) {
    const existing = await findRegistration(data.event_id, data.email);
    if (existing) return { id: existing.id, alreadyExists: true };
  }

  const sql = getSQL();
  const statusToken = crypto.randomUUID();

  const rows = await sql`
    INSERT INTO registrations
      (event_id, email, phone, status, status_token, is_walk_in, notes, checked_in_at, checked_in_by, status_changed_at)
    VALUES
      (${data.event_id}, ${data.email}, ${data.phone}, 'approved', ${statusToken},
       TRUE, ${data.notes}, ${data.checked_in_by ? sql`NOW()` : sql`NULL`}, ${data.checked_in_by ?? null}, NOW())
    RETURNING id
  `;
  const registrationId = (rows[0] as { id: number }).id;

  // Wird der Walk-in vom Check-In-Dashboard angelegt (checked_in_by gesetzt),
  // gelten alle Personen sofort als eingecheckt – nicht nur die Anmeldung.
  for (const person of data.persons) {
    await sql`
      INSERT INTO registration_persons (registration_id, first_name, last_name, checked_in_at)
      VALUES (
        ${registrationId}, ${person.firstName}, ${person.lastName},
        ${data.checked_in_by ? sql`NOW()` : sql`NULL`}
      )
    `;
  }

  return { id: registrationId, alreadyExists: false };
}

export async function undoCheckin(registrationId: number): Promise<void> {
  const sql = getSQL();
  await sql`
    UPDATE registrations
    SET checked_in_at = NULL, checked_in_by = NULL
    WHERE id = ${registrationId} AND status = 'approved'
  `;
  await sql`
    UPDATE registration_persons
    SET checked_in_at = NULL
    WHERE registration_id = ${registrationId} AND cancelled_at IS NULL
  `;
}

export async function manualCheckin(
  registrationId: number,
  checkedInBy: string
): Promise<{ alreadyCheckedIn: boolean }> {
  const sql = getSQL();
  const rows = await sql`
    SELECT checked_in_at FROM registrations WHERE id = ${registrationId} AND status = 'approved'
  `;

  if (!rows[0]) throw new Error("Anmeldung nicht gefunden oder nicht genehmigt.");

  const reg = rows[0] as { checked_in_at: string | null };
  if (reg.checked_in_at) return { alreadyCheckedIn: true };

  await markCheckedIn(registrationId, checkedInBy);
  return { alreadyCheckedIn: false };
}

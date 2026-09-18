import { getSQL } from "./utils";
import { personRevenueSql } from "./person-revenue";
import type { EventCost, EventDonation, EventFinancials } from "../types";

export async function getEventCosts(eventId: number): Promise<EventCost[]> {
  const sql = getSQL();
  const rows = await sql`
    SELECT id, event_id, description, amount::float8 AS amount, created_at, updated_at
    FROM event_costs
    WHERE event_id = ${eventId}
    ORDER BY created_at ASC
  `;
  return rows as EventCost[];
}

export async function createEventCost(
  eventId: number,
  description: string,
  amount: number
): Promise<EventCost> {
  const sql = getSQL();
  const rows = await sql`
    INSERT INTO event_costs (event_id, description, amount)
    VALUES (${eventId}, ${description}, ${amount})
    RETURNING id, event_id, description, amount::float8 AS amount, created_at, updated_at
  `;
  return rows[0] as EventCost;
}

export async function updateEventCost(
  costId: number,
  description: string,
  amount: number
): Promise<EventCost | null> {
  const sql = getSQL();
  const rows = await sql`
    UPDATE event_costs
    SET description = ${description}, amount = ${amount}, updated_at = NOW()
    WHERE id = ${costId}
    RETURNING id, event_id, description, amount::float8 AS amount, created_at, updated_at
  `;
  return (rows[0] as EventCost) ?? null;
}

export async function deleteEventCost(costId: number): Promise<void> {
  const sql = getSQL();
  await sql`DELETE FROM event_costs WHERE id = ${costId}`;
}

export async function getEventCostById(costId: number): Promise<EventCost | null> {
  const sql = getSQL();
  const rows = await sql`
    SELECT id, event_id, description, amount::float8 AS amount, created_at, updated_at
    FROM event_costs WHERE id = ${costId}
  `;
  return (rows[0] as EventCost) ?? null;
}

export async function getEventDonations(eventId: number): Promise<EventDonation[]> {
  const sql = getSQL();
  const rows = await sql`
    SELECT id, event_id, registration_id, donor_name, amount::float8 AS amount, note, created_by, created_at
    FROM event_donations
    WHERE event_id = ${eventId}
    ORDER BY created_at ASC
  `;
  return rows as EventDonation[];
}

export async function getDonationById(donationId: number): Promise<EventDonation | null> {
  const sql = getSQL();
  const rows = await sql`
    SELECT id, event_id, registration_id, donor_name, amount::float8 AS amount, note, created_by, created_at
    FROM event_donations WHERE id = ${donationId}
  `;
  return (rows[0] as EventDonation) ?? null;
}

export async function createDonation(
  eventId: number,
  registrationId: number | null,
  donorName: string,
  amount: number,
  note: string | null,
  createdBy: string | null
): Promise<EventDonation> {
  const sql = getSQL();
  const rows = await sql`
    INSERT INTO event_donations (event_id, registration_id, donor_name, amount, note, created_by)
    VALUES (${eventId}, ${registrationId}, ${donorName}, ${amount}, ${note}, ${createdBy})
    RETURNING id, event_id, registration_id, donor_name, amount::float8 AS amount, note, created_by, created_at
  `;
  return rows[0] as EventDonation;
}

export async function deleteDonation(donationId: number): Promise<void> {
  const sql = getSQL();
  await sql`DELETE FROM event_donations WHERE id = ${donationId}`;
}

export async function getEventFinancials(eventId: number): Promise<EventFinancials> {
  const sql = getSQL();

  // Entry price + cash count (columns may not exist if migration not run yet)
  let entryPrice: number | null = null;
  let childEntryPrice: number | null = null;
  let cashCounted: number | null = null;
  let cashCountedAt: string | null = null;
  try {
    const eventRows = await sql`
      SELECT
        entry_price::float8    AS entry_price,
        child_entry_price::float8 AS child_entry_price,
        cash_counted::float8   AS cash_counted,
        cash_counted_at
      FROM events WHERE id = ${eventId}
    `;
    const row = eventRows[0] as {
      entry_price: number | null;
      child_entry_price: number | null;
      cash_counted: number | null;
      cash_counted_at: string | null;
    } | undefined;
    entryPrice    = row?.entry_price   ?? null;
    childEntryPrice = row?.child_entry_price ?? null;
    cashCounted   = row?.cash_counted  ?? null;
    cashCountedAt = row?.cash_counted_at ? String(row.cash_counted_at) : null;
  } catch {
    // columns not yet migrated – treat as null
  }

  // Costs (table may not exist if migration not run yet)
  let costs: EventCost[] = [];
  try {
    costs = await getEventCosts(eventId);
  } catch {
    // event_costs table not yet migrated – treat as empty
  }
  const totalCosts = costs.reduce((sum, c) => sum + c.amount, 0);

  // Approved persons (expected revenue) — count via registration_persons
  const approvedRows = await sql`
    SELECT
      COUNT(DISTINCT r.id)::int AS registrations,
      COUNT(rp.id)::int AS persons,
      COALESCE(SUM(${personRevenueSql(sql)}), 0)::float8 AS revenue
    FROM registrations r
    JOIN events e ON e.id = r.event_id
    JOIN registration_persons rp ON rp.registration_id = r.id AND rp.cancelled_at IS NULL
    WHERE r.event_id = ${eventId} AND r.status = 'approved'
  `;
  const approvedCount = (approvedRows[0] as { registrations: number; persons: number }).registrations;
  const approvedPersons = (approvedRows[0] as { registrations: number; persons: number }).persons;
  const approvedGuests = Math.max(0, approvedPersons - approvedCount);
  const expectedRevenue = (approvedRows[0] as { revenue: number }).revenue;

  // Checked-in persons (actual revenue) — count via registration_persons
  const checkinRows = await sql`
    SELECT
      COUNT(DISTINCT r.id)::int AS registrations,
      COUNT(rp.id)::int AS persons,
      COALESCE(SUM(${personRevenueSql(sql)}), 0)::float8 AS revenue
    FROM registrations r
    JOIN events e ON e.id = r.event_id
    JOIN registration_persons rp ON rp.registration_id = r.id AND rp.cancelled_at IS NULL AND rp.checked_in_at IS NOT NULL
    WHERE r.event_id = ${eventId} AND r.status = 'approved'
  `;
  const checkinCount = (checkinRows[0] as { registrations: number; persons: number }).registrations;
  const checkinPersons = (checkinRows[0] as { registrations: number; persons: number }).persons;
  const checkinGuests = Math.max(0, checkinPersons - checkinCount);
  const actualRevenue = (checkinRows[0] as { revenue: number }).revenue;

  // Donations (table may not exist if migration not run yet)
  let donations: EventDonation[] = [];
  try {
    donations = await getEventDonations(eventId);
  } catch {
    // event_donations table not yet migrated
  }
  const totalDonations = donations.reduce((sum, d) => sum + d.amount, 0);

  return {
    entry_price: entryPrice,
    child_entry_price: childEntryPrice,
    total_costs: totalCosts,
    approved_persons: approvedPersons,
    approved_guests: approvedGuests,
    expected_revenue: expectedRevenue,
    checkedin_persons: checkinPersons,
    checkedin_guests: checkinGuests,
    actual_revenue: actualRevenue,
    total_donations: totalDonations,
    donation_count: donations.length,
    // When a Kassenabschluss (physical cash count) exists, the balance uses the
    // actually counted cash instead of the calculated actual revenue.
    balance: (cashCounted != null ? cashCounted : actualRevenue) + totalDonations - totalCosts,
    costs,
    donations,
    cash_counted: cashCounted,
    cash_counted_at: cashCountedAt,
  };
}

export async function saveCashCount(eventId: number, amount: number): Promise<void> {
  const sql = getSQL();
  await sql`
    UPDATE events
    SET cash_counted = ${amount}, cash_counted_at = NOW()
    WHERE id = ${eventId}
  `;
}

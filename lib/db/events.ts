import { getSQL, isPostgresConfigured } from "./utils";
import { personRevenueSql } from "./person-revenue";
import type {
  EventWithRegistrations,
  AdminStats,
  EventCreateInput,
  CancelEventResult,
  PublishEventResult,
  EventImage,
  EventImageInput,
} from "../types";
import { toPublicEvent } from "../types";

/**
 * Personen pro E-Mail-Adresse. Die Routen reichen den Wert roh durch, die
 * Klammer sitzt deshalb hier – an der einen Stelle, die jeder Schreibweg
 * passieren muss. Grenzen wie im Formular: 1 bis 20, Standard 5.
 */
function normalizeMaxPerEmail(value: unknown): number {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return 5;
  return Math.min(20, Math.max(1, Math.floor(n)));
}

export async function getEvents(): Promise<EventWithRegistrations[]> {
  if (!isPostgresConfigured()) {
    const { getLocalEvents } = await import("../local-data");
    return getLocalEvents();
  }

  const sql = getSQL();
  const rows = await sql`
    SELECT
      e.id, e.title, e.category, e.description, TO_CHAR(e.date, 'YYYY-MM-DD') AS date, e.time::text AS time, e.location, e.parking_location, e.price, e.entry_price::float8 AS entry_price, e.child_entry_price::float8 AS child_entry_price, e.child_price, e.dress_code, e.max_participants, COALESCE(e.max_per_email, 5)::int AS max_per_email, TO_CHAR(e.cancellation_deadline, 'YYYY-MM-DD"T"HH24:MI') AS cancellation_deadline, e.status, e.cancellation_reason, e.published_at, e.created_at,
      COUNT(CASE WHEN r.status = 'approved' THEN rp.id ELSE NULL END)::int AS current_participants,
      COUNT(CASE WHEN r.status = 'pending' THEN rp.id ELSE NULL END)::int AS pending_participants,
      COALESCE((SELECT JSON_AGG(jsonb_build_object('id', i.id, 'event_id', i.event_id, 'url', i.url, 'alt_text', i.alt_text, 'position', i.position) ORDER BY i.position) FROM event_images i WHERE i.event_id = e.id), '[]') AS images
    FROM events e
    LEFT JOIN registrations r ON e.id = r.event_id
    LEFT JOIN registration_persons rp ON rp.registration_id = r.id AND rp.cancelled_at IS NULL
    WHERE e.status = 'published' AND e.date >= CURRENT_DATE
    GROUP BY e.id
    ORDER BY e.date ASC, e.time ASC
  `;
  // Strip raw participant counts before the data leaves the server – the public
  // site only ever sees an occupancy percentage + a "full" flag.
  return (rows as EventWithRegistrations[]).map(toPublicEvent);
}

export async function getEvent(
  id: number
): Promise<{ id: number; max_participants: number; max_per_email: number; title: string; date: string; time: string; location: string; price: string; entry_price: number | null; child_entry_price: number | null; child_price: string | null; cancellation_deadline: string | null; dress_code: string; category: string; status: string; cancellation_reason: string | null; published_at: string | null } | null> {
  if (!isPostgresConfigured()) {
    const { getLocalEvent } = await import("../local-data");
    const event = getLocalEvent(id);
    // entry_price ist am lokalen Typ optional, hier aber zugesichert.
    return event
      ? {
          ...event,
          entry_price: event.entry_price ?? null,
          child_entry_price: event.child_entry_price ?? null,
          child_price: event.child_price ?? null,
          cancellation_deadline: event.cancellation_deadline ?? null,
        }
      : null;
  }

  const sql = getSQL();
  const rows = await sql`SELECT id, max_participants, COALESCE(max_per_email, 5)::int AS max_per_email, title, TO_CHAR(date, 'YYYY-MM-DD') AS date, time::text AS time, location, price, entry_price::float8 AS entry_price, child_entry_price::float8 AS child_entry_price, child_price, TO_CHAR(cancellation_deadline, 'YYYY-MM-DD"T"HH24:MI') AS cancellation_deadline, dress_code, category, status, cancellation_reason, published_at FROM events WHERE id = ${id}`;
  return (rows[0] as { id: number; max_participants: number; max_per_email: number; title: string; date: string; time: string; location: string; price: string; entry_price: number | null; child_entry_price: number | null; child_price: string | null; cancellation_deadline: string | null; dress_code: string; category: string; status: string; cancellation_reason: string | null; published_at: string | null }) ?? null;
}

export async function getAllEvents(): Promise<EventWithRegistrations[]> {
  if (!isPostgresConfigured()) {
    const { getLocalAllEvents } = await import("../local-data");
    return getLocalAllEvents();
  }

  const sql = getSQL();
  const rows = await sql`
    SELECT
      e.id, e.title, e.category, e.description, TO_CHAR(e.date, 'YYYY-MM-DD') AS date, e.time::text AS time, e.location, e.parking_location, e.price, e.entry_price::float8 AS entry_price, e.stripe_price_id, e.child_entry_price::float8 AS child_entry_price, e.child_price, e.stripe_child_price_id, e.dress_code, e.max_participants, e.max_per_email, e.status, e.cancellation_reason, e.published_at, e.created_at, e.survey_url, TO_CHAR(e.cancellation_deadline, 'YYYY-MM-DD"T"HH24:MI') AS cancellation_deadline,
      COUNT(CASE WHEN r.status = 'approved' THEN rp.id ELSE NULL END)::int AS current_participants,
      COUNT(CASE WHEN r.status = 'pending' THEN rp.id ELSE NULL END)::int AS pending_participants,
      COALESCE((SELECT JSON_AGG(jsonb_build_object('id', i.id, 'event_id', i.event_id, 'url', i.url, 'alt_text', i.alt_text, 'position', i.position) ORDER BY i.position) FROM event_images i WHERE i.event_id = e.id), '[]') AS images,
      COALESCE((SELECT SUM(ec.amount)::float8 FROM event_costs ec WHERE ec.event_id = e.id), 0)::float8 AS total_costs,
      COALESCE(SUM(CASE WHEN r.status = 'approved' THEN ${personRevenueSql(sql)} ELSE 0 END), 0)::float8 AS expected_revenue,
      COALESCE(SUM(CASE WHEN r.status = 'approved' AND rp.checked_in_at IS NOT NULL THEN ${personRevenueSql(sql)} ELSE 0 END), 0)::float8 AS actual_revenue,
      COALESCE((SELECT SUM(ed.amount)::float8 FROM event_donations ed WHERE ed.event_id = e.id), 0)::float8 AS total_donations,
      e.cash_counted::float8 AS cash_counted,
      e.cash_counted_at,
      COALESCE(SUM(CASE WHEN r.status = 'approved' AND r.is_walk_in = FALSE THEN 1 ELSE 0 END), 0)::int AS total_registrations,
      COALESCE(SUM(CASE WHEN r.status = 'approved' AND r.is_walk_in = FALSE AND r.checked_in_at IS NOT NULL THEN 1 ELSE 0 END), 0)::int AS checkin_count,
      COALESCE(SUM(CASE WHEN r.status = 'approved' AND r.is_walk_in = TRUE THEN 1 ELSE 0 END), 0)::int AS walk_in_count
    FROM events e
    LEFT JOIN registrations r ON e.id = r.event_id
    LEFT JOIN registration_persons rp ON rp.registration_id = r.id AND rp.cancelled_at IS NULL
    GROUP BY e.id
    ORDER BY e.date DESC, e.time DESC
  `;
  return rows as EventWithRegistrations[];
}

export async function getEventFull(id: number): Promise<EventWithRegistrations | null> {
  if (!isPostgresConfigured()) {
    const { getLocalEventFull } = await import("../local-data");
    return getLocalEventFull(id);
  }

  const sql = getSQL();
  const rows = await sql`
    SELECT
      e.id, e.title, e.category, e.description, TO_CHAR(e.date, 'YYYY-MM-DD') AS date, e.time::text AS time, e.location, e.parking_location, e.price, e.entry_price::float8 AS entry_price, e.stripe_price_id, e.child_entry_price::float8 AS child_entry_price, e.child_price, e.stripe_child_price_id, e.dress_code, e.max_participants, e.max_per_email, e.status, e.cancellation_reason, e.published_at, e.created_at, e.survey_url, TO_CHAR(e.cancellation_deadline, 'YYYY-MM-DD"T"HH24:MI') AS cancellation_deadline,
      COUNT(CASE WHEN r.status = 'approved' THEN rp.id ELSE NULL END)::int AS current_participants,
      COUNT(CASE WHEN r.status = 'pending' THEN rp.id ELSE NULL END)::int AS pending_participants,
      COALESCE((SELECT JSON_AGG(jsonb_build_object('id', i.id, 'event_id', i.event_id, 'url', i.url, 'alt_text', i.alt_text, 'position', i.position) ORDER BY i.position) FROM event_images i WHERE i.event_id = e.id), '[]') AS images
    FROM events e
    LEFT JOIN registrations r ON e.id = r.event_id
    LEFT JOIN registration_persons rp ON rp.registration_id = r.id AND rp.cancelled_at IS NULL
    WHERE e.id = ${id}
    GROUP BY e.id
  `;
  return (rows[0] as EventWithRegistrations) ?? null;
}

export async function setEventImages(eventId: number, images: EventImageInput[]): Promise<void> {
  if (!isPostgresConfigured()) {
    const { setLocalEventImages } = await import("../local-data");
    setLocalEventImages(eventId, images);
    return;
  }
  const sql = getSQL();
  await sql`DELETE FROM event_images WHERE event_id = ${eventId}`;
  for (const img of images) {
    await sql`INSERT INTO event_images (event_id, url, alt_text, position) VALUES (${eventId}, ${img.url}, ${img.alt_text}, ${img.position})`;
  }
}

export async function getEventImages(eventId: number): Promise<EventImage[]> {
  if (!isPostgresConfigured()) {
    const { setLocalEventImages: _ } = await import("../local-data");
    // use the images attached to the event
    const { getLocalEventFull } = await import("../local-data");
    const event = getLocalEventFull(eventId);
    return event?.images ?? [];
  }
  const sql = getSQL();
  const rows = await sql`SELECT * FROM event_images WHERE event_id = ${eventId} ORDER BY position`;
  return rows as EventImage[];
}

export async function createEvent(data: EventCreateInput & { publish?: boolean }): Promise<{ id: number }> {
  if (!isPostgresConfigured()) {
    const { createLocalEvent } = await import("../local-data");
    return createLocalEvent(data);
  }

  const sql = getSQL();
  const status = data.publish ? "published" : "draft";
  const publishedAt = data.publish ? new Date().toISOString() : null;
  const entryPrice = (data.entry_price != null && data.entry_price > 0) ? data.entry_price : null;
  // Die Price ID gehört zum Betrag – ohne Betrag ist sie bedeutungslos (siehe lib/price.ts).
  const stripePriceId = entryPrice != null ? (data.stripe_price_id ?? null) : null;
  const maxPerEmail = normalizeMaxPerEmail(data.max_per_email);
  const rows = await sql`
    INSERT INTO events (title, category, description, date, time, location, parking_location, price, entry_price, stripe_price_id, child_entry_price, stripe_child_price_id, child_price, dress_code, max_participants, max_per_email, survey_url, cancellation_deadline, status, published_at)
    VALUES (${data.title}, ${data.category}, ${data.description}, ${data.date}, ${data.time}, ${data.location}, ${data.parking_location ?? null}, ${data.price}, ${entryPrice}, ${stripePriceId}, ${data.child_entry_price ?? null}, ${data.stripe_child_price_id ?? null}, ${data.child_price ?? null}, ${data.dress_code}, ${data.max_participants}, ${maxPerEmail}, ${data.survey_url ?? null}, ${data.cancellation_deadline || null}, ${status}, ${publishedAt})
    RETURNING id
  `;
  const { id } = rows[0] as { id: number };
  if (data.images?.length) {
    await setEventImages(id, data.images);
  }
  return { id };
}

export async function publishEvent(id: number): Promise<PublishEventResult> {
  if (!isPostgresConfigured()) {
    const { publishLocalEvent } = await import("../local-data");
    return publishLocalEvent(id);
  }

  const sql = getSQL();
  const eventRows = await sql`SELECT id, status FROM events WHERE id = ${id}`;
  const event = eventRows[0] as { id: number; status: string } | undefined;
  if (!event) return { success: false };

  await sql`UPDATE events SET status = 'published', published_at = NOW() WHERE id = ${id}`;
  return { success: true };
}

export async function unpublishEvent(id: number): Promise<PublishEventResult> {
  if (!isPostgresConfigured()) {
    const { unpublishLocalEvent } = await import("../local-data");
    return unpublishLocalEvent(id);
  }

  const sql = getSQL();
  const countRows = await sql`SELECT COUNT(*)::int AS count FROM registrations WHERE event_id = ${id}`;
  const registrationCount = (countRows[0] as { count: number }).count;
  if (registrationCount > 0) return { success: false, registrationCount };

  await sql`UPDATE events SET status = 'draft', published_at = NULL WHERE id = ${id} AND status = 'published'`;
  return { success: true };
}

export async function updateEvent(id: number, data: EventCreateInput): Promise<void> {
  if (!isPostgresConfigured()) {
    const { updateLocalEvent } = await import("../local-data");
    updateLocalEvent(id, data);
    return;
  }

  const sql = getSQL();
  const entryPrice = (data.entry_price != null && data.entry_price > 0) ? data.entry_price : null;
  // Die Price ID gehört zum Betrag – ohne Betrag ist sie bedeutungslos (siehe lib/price.ts).
  const stripePriceId = entryPrice != null ? (data.stripe_price_id ?? null) : null;
  const maxPerEmail = normalizeMaxPerEmail(data.max_per_email);
  await sql`
    UPDATE events SET
      title = ${data.title},
      category = ${data.category},
      description = ${data.description},
      date = ${data.date},
      time = ${data.time},
      location = ${data.location},
      parking_location = ${data.parking_location ?? null},
      price = ${data.price},
      entry_price = ${entryPrice},
      stripe_price_id = ${stripePriceId},
      child_entry_price = ${data.child_entry_price ?? null},
      stripe_child_price_id = ${data.stripe_child_price_id ?? null},
      child_price = ${data.child_price ?? null},
      dress_code = ${data.dress_code},
      max_participants = ${data.max_participants},
      max_per_email = ${maxPerEmail},
      survey_url = ${data.survey_url ?? null},
      cancellation_deadline = ${data.cancellation_deadline || null}
    WHERE id = ${id}
  `;
  if (data.images !== undefined) {
    await setEventImages(id, data.images);
  }
}

export async function cancelEvent(id: number, reason?: string): Promise<CancelEventResult> {
  if (!isPostgresConfigured()) {
    const { cancelLocalEvent } = await import("../local-data");
    return cancelLocalEvent(id, reason);
  }

  const sql = getSQL();
  const eventRows = await sql`SELECT id, title, TO_CHAR(date, 'YYYY-MM-DD') AS date, time::text AS time, location, status FROM events WHERE id = ${id}`;
  const event = eventRows[0] as { id: number; title: string; date: string; time: string; location: string; status: string } | undefined;

  if (!event) return { alreadyCancelled: false, event: null, registrations: [] };
  if (event.status === "cancelled") return { alreadyCancelled: true, event, registrations: [] };

  await sql`
    UPDATE events SET
      status = 'cancelled',
      cancellation_reason = ${reason ?? null}
    WHERE id = ${id}
  `;

  const regRows = await sql`
    SELECT
      r.email, r.status_token,
      COALESCE((SELECT rp.first_name FROM registration_persons rp WHERE rp.registration_id = r.id ORDER BY rp.created_at LIMIT 1), '') AS first_name,
      COALESCE((SELECT rp.last_name FROM registration_persons rp WHERE rp.registration_id = r.id ORDER BY rp.created_at LIMIT 1), '') AS last_name
    FROM registrations r
    WHERE r.event_id = ${id}
  `;

  return {
    alreadyCancelled: false,
    event: { title: event.title, date: event.date, time: event.time, location: event.location },
    registrations: regRows as Array<{ email: string | null; first_name: string; last_name: string; status_token: string }>,
  };
}

export async function deleteEvent(id: number): Promise<void> {
  if (!isPostgresConfigured()) {
    const { deleteLocalEvent } = await import("../local-data");
    deleteLocalEvent(id);
    return;
  }

  const sql = getSQL();
  await sql`DELETE FROM event_images WHERE event_id = ${id}`;
  await sql`DELETE FROM registrations WHERE event_id = ${id}`;
  await sql`DELETE FROM events WHERE id = ${id}`;
}

export async function getAdminStats(): Promise<AdminStats> {
  if (!isPostgresConfigured()) {
    const { getLocalAdminStats } = await import("../local-data");
    return getLocalAdminStats();
  }

  const sql = getSQL();
  const totalEventsRows = await sql`SELECT COUNT(*)::int AS count FROM events`;
  const upcomingRows = await sql`SELECT COUNT(*)::int AS count FROM events WHERE date >= CURRENT_DATE`;
  const totalRegsRows = await sql`SELECT COUNT(rp.id)::int AS count FROM registrations r JOIN registration_persons rp ON rp.registration_id = r.id`;
  const pendingRows = await sql`SELECT COUNT(rp.id)::int AS count FROM registrations r JOIN registration_persons rp ON rp.registration_id = r.id WHERE r.status = 'pending'`;
  const utilRows = await sql`
    SELECT
      CASE WHEN SUM(e.max_participants) = 0 THEN 0
      ELSE ROUND((COALESCE(SUM(r.total), 0)::numeric / SUM(e.max_participants)::numeric) * 100)
      END AS avg
    FROM events e
    LEFT JOIN (
      SELECT r2.event_id, COUNT(rp2.id) AS total FROM registrations r2 JOIN registration_persons rp2 ON rp2.registration_id = r2.id WHERE r2.status = 'approved' GROUP BY r2.event_id
    ) r ON e.id = r.event_id
    WHERE e.date >= CURRENT_DATE
  `;

  return {
    total_events: (totalEventsRows[0] as { count: number }).count,
    upcoming_events: (upcomingRows[0] as { count: number }).count,
    total_registrations: (totalRegsRows[0] as { count: number }).count,
    pending_registrations: (pendingRows[0] as { count: number }).count,
    avg_utilization: Number((utilRows[0] as { avg: string | number }).avg) || 0,
  };
}

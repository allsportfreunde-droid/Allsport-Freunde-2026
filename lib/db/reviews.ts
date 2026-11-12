import { getSQL } from "./utils";
import { formatPublicName, isReviewSendAllowed, isReviewWindowOpen, reviewDeadline } from "../review";
import type { ReviewInput } from "../review";
import type {
  EventReview, EventReviewDashboard, EventReviewWithAuthor, PublicTestimonialsResponse,
  ReviewOverviewEvent, ReviewOverviewResponse, ReviewSendKind, ReviewStats, ReviewTokenInfo,
} from "../types";

type Timestamp = string | Date;
type ReviewRow = Omit<EventReview, "published_at" | "created_at" | "updated_at"> & {
  published_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};
type AuthorRow = ReviewRow & Pick<EventReviewWithAuthor, "first_name" | "last_name" | "email" | "event_title">;

function iso(value: Timestamp | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

/** Nur die gemeinsamen Review-Felder weitergeben, keine internen SQL-Hilfswerte. */
function reviewFromRow(row: ReviewRow): EventReview {
  return {
    id: row.id,
    event_id: row.event_id,
    registration_id: row.registration_id,
    rating: row.rating,
    would_return: row.would_return,
    comment: row.comment,
    publish_consent: row.publish_consent,
    published_at: iso(row.published_at),
    created_at: iso(row.created_at)!,
    updated_at: iso(row.updated_at)!,
  };
}

function authorFromRow(row: AuthorRow): EventReviewWithAuthor {
  return {
    ...reviewFromRow(row), first_name: row.first_name, last_name: row.last_name, email: row.email,
    ...(row.event_title !== undefined ? { event_title: row.event_title } : {}),
  };
}

function authorColumns(sql: ReturnType<typeof getSQL>) {
  return sql`
    COALESCE((SELECT rp.first_name FROM registration_persons rp WHERE rp.registration_id = r.id ORDER BY rp.created_at LIMIT 1), '') AS first_name,
    COALESCE((SELECT rp.last_name FROM registration_persons rp WHERE rp.registration_id = r.id ORDER BY rp.created_at LIMIT 1), '') AS last_name,
    r.email
  `;
}

/** Erinnerungskandidaten benötigen keinen erneuten Check-in. */
function reminderCondition(sql: ReturnType<typeof getSQL>) {
  return sql`
    r.status = 'approved' AND NULLIF(BTRIM(r.email), '') IS NOT NULL
    AND r.review_requested_at IS NOT NULL AND r.review_reminded_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM event_reviews er WHERE er.registration_id = r.id)
    AND r.review_requested_at > NOW() - INTERVAL '14 days'
  `;
}

export async function getReviewRecipients(eventId: number, kind: ReviewSendKind): Promise<Array<{
  registration_id: number; email: string; status_token: string; first_name: string; review_requested_at: string | null;
}>> {
  const sql = getSQL();
  const condition = kind === "initial" ? sql`
    r.status = 'approved' AND NULLIF(BTRIM(r.email), '') IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM registration_persons rp
      WHERE rp.registration_id = r.id AND rp.checked_in_at IS NOT NULL AND rp.cancelled_at IS NULL
    )
    AND r.review_requested_at IS NULL
  ` : reminderCondition(sql);
  const rows = await sql`
    SELECT r.id AS registration_id, r.email, r.status_token,
      COALESCE((SELECT rp.first_name FROM registration_persons rp WHERE rp.registration_id = r.id ORDER BY rp.created_at LIMIT 1), '') AS first_name,
      r.review_requested_at
    FROM registrations r
    WHERE r.event_id = ${eventId} AND ${condition}
    ORDER BY r.id
  `;
  return (rows as Array<{
    registration_id: number; email: string; status_token: string; first_name: string; review_requested_at: Timestamp | null;
  }>).map((row) => ({ ...row, review_requested_at: iso(row.review_requested_at) }));
}

export async function claimReviewRequests(ids: number[]): Promise<number[]> {
  if (ids.length === 0) return [];
  const sql = getSQL();
  const rows = await sql`
    UPDATE registrations SET review_requested_at = NOW()
    WHERE id = ANY(${ids}) AND review_requested_at IS NULL RETURNING id
  `;
  return (rows as { id: number }[]).map((row) => row.id);
}

export async function releaseReviewRequests(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const sql = getSQL();
  await sql`UPDATE registrations SET review_requested_at = NULL WHERE id = ANY(${ids})`;
}

export async function claimReviewReminders(ids: number[]): Promise<number[]> {
  if (ids.length === 0) return [];
  const sql = getSQL();
  const rows = await sql`
    UPDATE registrations SET review_reminded_at = NOW()
    WHERE id = ANY(${ids}) AND review_reminded_at IS NULL RETURNING id
  `;
  return (rows as { id: number }[]).map((row) => row.id);
}

export async function releaseReviewReminders(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const sql = getSQL();
  await sql`UPDATE registrations SET review_reminded_at = NULL WHERE id = ANY(${ids})`;
}

export async function claimEventReviewReminder(eventId: number): Promise<boolean> {
  const sql = getSQL();
  const rows = await sql`
    UPDATE events SET review_reminder_sent_at = NOW()
    WHERE id = ${eventId} AND review_reminder_sent_at IS NULL RETURNING id
  `;
  return rows.length > 0;
}

export async function releaseEventReviewReminder(eventId: number): Promise<void> {
  const sql = getSQL();
  await sql`UPDATE events SET review_reminder_sent_at = NULL WHERE id = ${eventId}`;
}

function reviewStats(reviews: EventReview[]): ReviewStats {
  const stats: ReviewStats = {
    responses: reviews.length, average: null,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    would_return: { ja: 0, vielleicht: 0, nein: 0 },
  };
  let total = 0;
  for (const review of reviews) {
    total += review.rating;
    stats.distribution[review.rating as 1 | 2 | 3 | 4 | 5]++;
    if (review.would_return !== null) stats.would_return[review.would_return]++;
  }
  if (reviews.length > 0) stats.average = Math.round(total / reviews.length * 10) / 10;
  return stats;
}

export async function getEventReviewDashboard(eventId: number): Promise<EventReviewDashboard | null> {
  const sql = getSQL();
  const eventRows = await sql`
    SELECT id, title, TO_CHAR(date, 'YYYY-MM-DD') AS date, status, review_reminder_sent_at
    FROM events WHERE id = ${eventId}
  `;
  if (!eventRows[0]) return null;
  const event = eventRows[0] as EventReviewDashboard["event"] & { review_reminder_sent_at: Timestamp | null };
  const [countRows, reviewRows] = await Promise.all([
    sql`
      WITH registration_state AS (
        SELECT r.*,
          r.status = 'approved' AND EXISTS (
            SELECT 1 FROM registration_persons rp
            WHERE rp.registration_id = r.id AND rp.checked_in_at IS NOT NULL AND rp.cancelled_at IS NULL
          ) AS checked_in,
          NULLIF(BTRIM(r.email), '') IS NOT NULL AS has_email,
          (${reminderCondition(sql)}) AS reminder_candidate
        FROM registrations r WHERE r.event_id = ${eventId}
      )
      SELECT COUNT(*) FILTER (WHERE checked_in)::int AS checked_in_registrations,
        COUNT(*) FILTER (WHERE checked_in AND NOT has_email)::int AS without_email,
        COUNT(*) FILTER (WHERE review_requested_at IS NOT NULL)::int AS requested,
        COUNT(*) FILTER (WHERE checked_in AND has_email AND review_requested_at IS NULL)::int AS pending_initial,
        MIN(review_requested_at) AS first_requested_at,
        COUNT(*) FILTER (WHERE reminder_candidate)::int AS reminder_candidates
      FROM registration_state
    `,
    sql`
      SELECT er.*, ${authorColumns(sql)}
      FROM event_reviews er JOIN registrations r ON r.id = er.registration_id
      WHERE er.event_id = ${eventId} ORDER BY er.created_at DESC, er.id DESC
    `,
  ]);
  const counts = countRows[0] as Pick<EventReviewDashboard,
    "checked_in_registrations" | "without_email" | "requested" | "pending_initial" | "reminder_candidates"
  > & { first_requested_at: Timestamp | null };
  const reviews = (reviewRows as AuthorRow[]).map(authorFromRow);
  const allowed = isReviewSendAllowed(event.date, event.status);
  return {
    event: { id: event.id, title: event.title, date: event.date, status: event.status },
    can_send: allowed.allowed, send_blocked_reason: allowed.reason,
    ...counts, first_requested_at: iso(counts.first_requested_at),
    reminder_sent_at: iso(event.review_reminder_sent_at), stats: reviewStats(reviews), reviews,
  };
}

export async function getReviewTokenInfo(token: string): Promise<(ReviewTokenInfo & { registration_id: number; event_id: number }) | null> {
  const sql = getSQL();
  const rows = await sql`
    SELECT r.id AS registration_id, r.event_id, r.review_requested_at,
      COALESCE((SELECT rp.first_name FROM registration_persons rp WHERE rp.registration_id = r.id ORDER BY rp.created_at LIMIT 1), '') AS first_name,
      e.title AS event_title, TO_CHAR(e.date, 'YYYY-MM-DD') AS event_date,
      er.rating, er.would_return, er.comment, er.publish_consent
    FROM registrations r JOIN events e ON e.id = r.event_id
    LEFT JOIN event_reviews er ON er.registration_id = r.id
    WHERE r.status_token = ${token} AND r.review_requested_at IS NOT NULL
  `;
  if (!rows[0]) return null;
  const row = rows[0] as {
    registration_id: number; event_id: number; review_requested_at: Timestamp | null;
    first_name: string; event_title: string; event_date: string;
    rating: number | null; would_return: EventReview["would_return"]; comment: string | null; publish_consent: boolean;
  };
  if (row.review_requested_at === null) return null;
  return {
    registration_id: row.registration_id, event_id: row.event_id,
    first_name: row.first_name, event_title: row.event_title, event_date: row.event_date,
    deadline: reviewDeadline(row.review_requested_at).toISOString(),
    is_open: isReviewWindowOpen(row.review_requested_at),
    review: row.rating === null ? null : {
      rating: row.rating, would_return: row.would_return, comment: row.comment, publish_consent: row.publish_consent,
    },
  };
}

export async function getReviewOverview(): Promise<ReviewOverviewResponse> {
  const sql = getSQL();
  const [eventRows, reviewRows] = await Promise.all([
    sql`
      WITH requests AS (
        SELECT event_id, COUNT(*)::int AS requested FROM registrations
        WHERE review_requested_at IS NOT NULL GROUP BY event_id
      ), responses AS (
        SELECT event_id, COUNT(*)::int AS responses, AVG(rating)::float8 AS average,
          COUNT(*) FILTER (WHERE would_return = 'ja')::float8 /
            NULLIF(COUNT(would_return), 0) AS would_return_yes_rate
        FROM event_reviews GROUP BY event_id
      )
      SELECT e.id AS event_id, e.title, TO_CHAR(e.date, 'YYYY-MM-DD') AS date, e.category,
        q.requested, COALESCE(a.responses, 0)::int AS responses,
        COALESCE(a.responses, 0)::float8 / q.requested AS response_rate,
        a.average, a.would_return_yes_rate
      FROM events e JOIN requests q ON q.event_id = e.id
      LEFT JOIN responses a ON a.event_id = e.id
      ORDER BY e.date DESC, e.id DESC
    `,
    sql`
      SELECT er.*, ${authorColumns(sql)}, e.title AS event_title
      FROM event_reviews er JOIN registrations r ON r.id = er.registration_id
      JOIN events e ON e.id = er.event_id
      WHERE er.published_at IS NOT NULL OR (er.publish_consent AND er.comment IS NOT NULL)
      ORDER BY er.created_at DESC, er.id DESC
    `,
  ]);
  const reviews = (reviewRows as AuthorRow[]).map(authorFromRow);
  return {
    // Erst bei der Anzeige runden, damit der gewichtete Gesamtdurchschnitt korrekt bleibt.
    events: eventRows as ReviewOverviewEvent[],
    pending_approval: reviews.filter((row) => row.published_at === null && row.publish_consent && row.comment !== null),
    published: reviews.filter((row) => row.published_at !== null),
  };
}

export async function getPublicTestimonials(limit = 6): Promise<PublicTestimonialsResponse> {
  const sql = getSQL();
  const [statRows, itemRows] = await Promise.all([
    sql`SELECT COUNT(*)::int AS count, AVG(rating)::float8 AS average FROM event_reviews`,
    sql`
      SELECT er.id, er.rating, er.comment,
        COALESCE((SELECT rp.first_name FROM registration_persons rp WHERE rp.registration_id = r.id ORDER BY rp.created_at LIMIT 1), '') AS first_name,
        COALESCE((SELECT rp.last_name FROM registration_persons rp WHERE rp.registration_id = r.id ORDER BY rp.created_at LIMIT 1), '') AS last_name,
        e.title AS event_title, e.category AS event_category, TO_CHAR(e.date, 'YYYY-MM-DD') AS event_date
      FROM event_reviews er JOIN registrations r ON r.id = er.registration_id
      JOIN events e ON e.id = er.event_id
      WHERE er.published_at IS NOT NULL AND er.publish_consent AND er.comment IS NOT NULL
      ORDER BY er.published_at DESC, er.id DESC LIMIT ${limit}
    `,
  ]);
  const stats = statRows[0] as { count: number; average: number | null };
  const items = itemRows as Array<{
    id: number; rating: number; comment: string; first_name: string; last_name: string;
    event_title: string; event_category: string; event_date: string;
  }>;
  return {
    count: stats.count,
    average: stats.count < 5 || stats.average === null ? null : Math.round(stats.average * 10) / 10,
    items: items.map((row) => ({
      id: row.id, name: formatPublicName(row.first_name, row.last_name), rating: row.rating, comment: row.comment,
      event_title: row.event_title, event_category: row.event_category, event_date: row.event_date,
    })),
  };
}

export async function saveReview(registrationId: number, eventId: number, input: ReviewInput): Promise<{ review: EventReview; unpublished: boolean }> {
  const sql = getSQL();
  const hasComment = input.comment !== undefined;
  const hasConsent = input.publish_consent !== undefined;
  // Die Freigabe anhand der bisherigen Werte entziehen, bevor der Kommentar ersetzt wird.
  const revoke = sql`(
    (${hasComment} AND event_reviews.comment IS DISTINCT FROM EXCLUDED.comment)
    OR (${hasConsent} AND NOT EXCLUDED.publish_consent)
  )`;
  // Auch die erste Bewertung serialisieren: Sonst könnte nach einem leeren
  // Vorab-Lesen eine parallele Bewertung entstehen und bereits freigegeben werden.
  const [, previous, rows] = await sql.transaction([
    sql`SELECT id FROM registrations WHERE id = ${registrationId} FOR UPDATE`,
    sql`SELECT published_at FROM event_reviews WHERE registration_id = ${registrationId} FOR UPDATE`,
    sql`
      INSERT INTO event_reviews (registration_id, event_id, rating, would_return, comment, publish_consent)
      VALUES (${registrationId}, ${eventId}, ${input.rating}, ${input.would_return ?? null},
        ${input.comment ?? null}, ${input.publish_consent ?? false})
      ON CONFLICT (registration_id) DO UPDATE SET
        rating = EXCLUDED.rating,
        would_return = ${input.would_return !== undefined ? sql`EXCLUDED.would_return` : sql`event_reviews.would_return`},
        comment = ${hasComment ? sql`EXCLUDED.comment` : sql`event_reviews.comment`},
        publish_consent = ${hasConsent ? sql`EXCLUDED.publish_consent` : sql`event_reviews.publish_consent`},
        published_at = CASE WHEN ${revoke} THEN NULL ELSE event_reviews.published_at END,
        published_by = CASE WHEN ${revoke} THEN NULL ELSE event_reviews.published_by END,
        updated_at = NOW()
      RETURNING *
    `,
  ]);
  const row = rows[0] as ReviewRow;
  const old = previous[0] as { published_at: Timestamp | null } | undefined;
  return { review: reviewFromRow(row), unpublished: old?.published_at != null && row.published_at === null };
}

export async function setReviewPublished(reviewId: number, published: boolean, adminEmail: string | null): Promise<
  { ok: true; review: EventReview } | { ok: false; reason: "not_found" | "no_consent" | "no_comment" }
> {
  const sql = getSQL();
  // Sperre und Prüfung gehören zum selben Statement, damit eine gleichzeitige Änderung nicht veröffentlicht wird.
  const rows = await sql`
    WITH current_review AS MATERIALIZED (
      SELECT * FROM event_reviews WHERE id = ${reviewId} FOR UPDATE
    ), updated AS (
      UPDATE event_reviews er SET
        published_at = ${published ? sql`NOW()` : sql`NULL`},
        published_by = ${published ? adminEmail : null}, updated_at = NOW()
      FROM current_review c WHERE er.id = c.id
        AND (NOT ${published} OR (c.publish_consent AND c.comment IS NOT NULL))
      RETURNING er.*
    )
    SELECT updated.*, NULL::text AS reason FROM updated
    UNION ALL
    SELECT c.*, CASE WHEN NOT c.publish_consent THEN 'no_consent' ELSE 'no_comment' END AS reason
    FROM current_review c WHERE NOT EXISTS (SELECT 1 FROM updated)
  `;
  if (!rows[0]) return { ok: false, reason: "not_found" };
  const row = rows[0] as ReviewRow & { reason: "no_consent" | "no_comment" | null };
  if (row.reason) return { ok: false, reason: row.reason };
  return { ok: true, review: reviewFromRow(row) };
}

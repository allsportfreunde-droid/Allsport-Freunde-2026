# Step 1 of 8 – Database, types and core logic

## Task
You are working in the "Allsport Freunde 2026" repository (Next.js 16, Neon Postgres)
and implementing the first step of the **event reviews** feature: migration, shared
types, pure logic and database functions. **No** API routes, no UI, no emails yet.

## Language
- This prompt is in English, but the codebase is German: all code comments,
  user-facing texts and error messages you write must be **German**, matching the
  existing code.

## Read first
1. `docs/review-feature/PLAN.md` in full, especially section 1 (Requirements),
   2 (Analysis), 3 (Target design with SQL and types) and 4 (Risks).
2. Reference code:
   - `scripts/migrate-donations.ts` (migration pattern)
   - `lib/db/finances.ts`, `lib/db/checkins.ts` (DB functions, person-level check-in)
   - `lib/db/index.ts` (exports)
   - `lib/cancellation.ts` (Europe/Berlin time zone)
   - `__tests__/walkin-checkin.test.ts` (mock for the neon SQL tag)

## Steps

### 1. Migration `scripts/migrate-reviews.ts`
- Use exactly the SQL from PLAN.md section 3 "Data model (new)", idempotent.
- Structure and console output like `scripts/migrate-donations.ts`.
- Add to `package.json`: `"db:migrate-reviews": "npx tsx scripts/migrate-reviews.ts"`
  (next to the other `db:migrate-*` entries).
- Do **not** run it and do not connect to a real database.

### 2. Types in `lib/types.ts`
Copy all types from PLAN.md section 3 "Shared types" unchanged (translate their
comments into German), as a separate block with a heading comment at the end of the file.

### 3. Pure logic `lib/review.ts` (no DB access, no Next.js imports)
- `export const REVIEW_WINDOW_DAYS = 14;`
- `berlinToday(now = new Date()): string`: calendar day in Europe/Berlin as `YYYY-MM-DD`.
- `isReviewSendAllowed(eventDate: string, eventStatus: string, now = new Date())`
  → `{ allowed: true, reason: null } | { allowed: false, reason: "event_in_future" | "event_cancelled" }`.
  Allowed from `eventDate <= berlinToday(now)`.
- `reviewDeadline(requestedAt: string | Date): Date` (+14 days).
- `isReviewWindowOpen(requestedAt: string | Date | null, now = new Date()): boolean`
  (`null` → `false`).
- `formatPublicName(firstName: string, lastName: string): string`
  → `"Ahmet K."`; empty last name → first name only; trim whitespace; uppercase initial.
- `parseReviewInput(body: unknown)`: validates a request body for saving.
  - `rating`: required, integer 1–5.
  - `would_return`: optional; `"ja" | "vielleicht" | "nein" | null`.
  - `comment`: optional; string, trimmed, empty → `null`, max. 2000 characters.
  - `publish_consent`: optional; boolean.
  - **Important:** missing fields (`undefined`) must stay distinguishable from an
    explicit `null`. The one-click save from the email only sends `rating` and must
    not delete existing answers.
  - Returns `{ ok: true, value: { rating, would_return?, comment?, publish_consent? } }`
    or `{ ok: false, error: string }` with a German error message.

### 4. DB functions `lib/db/reviews.ts` (+ export in `lib/db/index.ts`)
Postgres-only (`getSQL()`); the API routes in later steps check `isPostgresConfigured()`.
Return all timestamps as ISO strings.

**Recipients and reservation**
- `getReviewRecipients(eventId, kind: ReviewSendKind)` →
  `Array<{ registration_id: number; email: string; status_token: string; first_name: string; review_requested_at: string | null }>`
  - `initial`: `r.status = 'approved'`, email not empty, a person exists with
    `checked_in_at IS NOT NULL AND cancelled_at IS NULL`, `review_requested_at IS NULL`.
  - `reminder`: `approved`, email not empty, `review_requested_at IS NOT NULL`,
    `review_reminded_at IS NULL`, no row in `event_reviews`, window still open
    (`review_requested_at > NOW() - INTERVAL '14 days'`).
  - `first_name`: first person of the registration (`ORDER BY created_at LIMIT 1`);
    see the existing pattern `COALESCE((SELECT rp.first_name …), '')` in `lib/db/registrations.ts`.
- `claimReviewRequests(ids: number[]): Promise<number[]>`:
  `UPDATE registrations SET review_requested_at = NOW() WHERE id = ANY(${ids}) AND review_requested_at IS NULL RETURNING id`.
- `releaseReviewRequests(ids: number[])`: resets `review_requested_at = NULL`.
- `claimReviewReminders(ids)` / `releaseReviewReminders(ids)`: same for `review_reminded_at`.
- `claimEventReviewReminder(eventId): Promise<boolean>`:
  `UPDATE events SET review_reminder_sent_at = NOW() WHERE id = … AND review_reminder_sent_at IS NULL RETURNING id`.
- `releaseEventReviewReminder(eventId)`: resets the column to `NULL`.

**Reading**
- `getEventReviewDashboard(eventId): Promise<EventReviewDashboard | null>`
  (`null` if the event does not exist). `can_send`/`send_blocked_reason` via
  `isReviewSendAllowed`. Counts exactly as described in the type comments in PLAN.md.
  Round `stats.average` to one decimal. `reviews` with first and last name of the
  first person and the email, newest first.
- `getReviewTokenInfo(token)` →
  `(ReviewTokenInfo & { registration_id: number; event_id: number }) | null`.
  `null` if the token is unknown **or** `review_requested_at IS NULL` (not invited).
  `deadline`/`is_open` via `reviewDeadline`/`isReviewWindowOpen`.
- `getReviewOverview(): Promise<ReviewOverviewResponse>`.
- `getPublicTestimonials(limit = 6): Promise<PublicTestimonialsResponse>`:
  `items` only where `published_at IS NOT NULL AND publish_consent AND comment IS NOT NULL`,
  most recently published first, name via `formatPublicName`, **no** email, no
  registration ID. `average` across all reviews, `null` with fewer than 5 reviews.

**Writing**
- `saveReview(registrationId, eventId, input)` → `{ review: EventReview; unpublished: boolean }`
  - Upsert via `INSERT … ON CONFLICT (registration_id) DO UPDATE`.
  - Fields missing from `input` stay unchanged; an explicit `null` clears them.
  - If a published review changes its comment or `publish_consent` becomes `false`:
    set `published_at = NULL`, `published_by = NULL` and return `unpublished: true`
    (so the caller can clear the cache).
  - `updated_at = NOW()` on every save.
- `setReviewPublished(reviewId, published: boolean, adminEmail: string | null)`
  → `{ ok: true; review: EventReview } | { ok: false; reason: "not_found" | "no_consent" | "no_comment" }`.
  Publishing requires consent and a comment; unpublishing is always allowed.

### 5. Tests
- `__tests__/review-logic.test.ts` for `lib/review.ts`: day boundary around midnight
  (e.g. `2026-07-01T22:30:00Z` is already July 2 in Berlin), winter/summer time,
  cancelled and future events, end of the window, `formatPublicName` cases,
  `parseReviewInput` (valid, rating 0/6/2.5/"4", comment too long,
  missing vs. `null` fields).
- `__tests__/review-db.test.ts` using the SQL recorder from `walkin-checkin.test.ts`:
  - The `initial` recipient query contains the person-level check-in condition,
    `cancelled_at IS NULL`, `status = 'approved'` and `review_requested_at IS NULL`.
  - `claimReviewRequests` returns only the IDs reported back by the database.
  - `saveReview` with only `rating` does not overwrite `comment`/`would_return`.
  - `setReviewPublished(…, true, …)` without consent → `no_consent`.

## Rules
- Follow the existing patterns; comments and messages in German.
- No changes outside the files listed, no unrelated formatting changes.
- Do not use the `survey_url` / `survey_sent_at` columns.
- Do not commit or push unless the user explicitly asks.

## Done when
- `npm test` passes and `npx tsc --noEmit -p .` reports no errors (ignore messages from `.next/`).
- You report at the end: changed/new files, test results, deviations from the plan with reasons.

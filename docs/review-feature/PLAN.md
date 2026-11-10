# Event reviews in the app – implementation plan

As of: 2026-10-19 · Status: **planned, not implemented**

This document is the shared context for all implementation steps. Every prompt in
[`prompts/`](prompts/) assumes this document has been read in full first. The
decisions in section 1 were agreed with the project owner and are **not up for
renegotiation**. If something in the code contradicts them, ask instead of
deviating on your own.

**Language:** this plan and the prompts are in English, but the codebase is German.
All code comments, user-facing texts, email content and error messages must be
**German**. Quoted UI strings in this plan (e.g. "Review", „Ahmet K.“) are the
exact German texts to use.

---

## 1. Requirements (agreed)

### Admin flow
- New tab **"Review"** in an event's check-in dashboard
  (`/admin/events/[id]/dashboard`). Post-event flow like the existing cash count
  ("Kassenabschluss"): open state → done with a green ✓.
- Sending is triggered **manually**, no cron. The button is active **from the
  event day on** (calendar day in Europe/Berlin), never for cancelled events.
- **Recipients:** all registrations with `status = 'approved'` and an email address
  where **at least one person is checked in**. Walk-ins with email are included;
  walk-ins without email are only shown as a count.
- **One review per registration:** only the registration has an email, the
  individual persons do not.
- **Sending rules:**
  - Each registration receives the request **exactly once**.
  - **Follow-up send ("Nachsenden"):** people checked in after the first send can
    be requested afterwards (same button; it only covers registrations not yet requested).
  - **Reminder:** usable **once** per event; goes to all requested registrations
    without an answer whose window is still open.

### Participant flow
- The email contains **5 clickable stars**. A click opens the review page, the
  rating is **saved immediately**, then the optional questions follow.
- Questions (German UI texts):
  1. **„Wie hat dir das Event gefallen?“** 1–5 stars (required)
  2. **„Würdest du wieder mitmachen?“** Ja / Vielleicht / Nein (optional)
  3. **„Was sollen wir beibehalten oder besser machen?“** free text (optional)
  4. Checkbox **„Mein Kommentar darf veröffentlicht werden“** (off by default)
- **Window: 14 days** from the send to that registration. Within the window the
  rating can be changed; afterwards the link is closed.

### Results
- **Review tab of the event:** average stars, response rate, star distribution,
  would-return rate, comments **with names** (admins see who wrote what).
- **New admin menu item "Reviews":** all events compared, plus a list of comments
  waiting for approval.
- **Homepage:** section „Das sagen unsere Teilnehmer“ with the average rating and
  selected comments.
  - Shown only with the participant's **consent** **and** after **approval by an
    admin** per comment.
  - Public name as **first name + initial**, e.g. „Ahmet K.“.
  - Approvals can be withdrawn at any time.

### Assumptions (not objected to by the project owner)
- The name attached to a review = first person of the registration
  (`registration_persons`, oldest `created_at`).
- If a participant edits an already published comment or withdraws consent, the
  publication is **removed automatically** (needs approval again).
- The privacy policy is extended. The association must review the text; it is not
  legal advice.

---

## 2. Analysis: relevant current state

### Stack and conventions
- **Next.js 16** (App Router), React 19, TypeScript, Tailwind v4, UI building blocks
  in `components/ui/` (shadcn-like: `button`, `card`, `dialog`, `checkbox`,
  `textarea`, `badge`, `progress` …), icons from `lucide-react`.
- Route handlers receive `params` as a **Promise**:
  `{ params }: { params: Promise<{ id: string }> }` → `const { id } = await params;`
- Code comments, UI texts and error messages are **German**, informal „du“ towards
  participants. Emails start with „Assalamu Alaikum {Vorname},“.
- Commands: `npm test` (vitest), `npx tsc --noEmit -p .`, `npm run lint`.
  Note: `tsc` may report stale errors from `.next/` (generated types); ignore them.

### Database
- Neon Postgres via the tagged-template client: `const sql = getSQL();`
  from `lib/db/utils.ts`. `isPostgresConfigured()` checks whether a DB is configured.
- **Local mode without a DB:** `lib/local-data.ts` provides in-memory data for
  events and registrations. Finance and cash-count functions are **Postgres-only**
  (e.g. `saveCashCount` in `lib/db/finances.ts`). Reviews are Postgres-only as well.
  Without a DB: admin APIs answer 503 with a clear message; the public testimonials
  API returns an empty list so the homepage does not break locally.
- DB functions live in `lib/db/*.ts` and are exposed via `lib/db/index.ts`
  (`export * from "./…"`); import from `@/lib/db`.
- **Migrations:** one script per feature, `scripts/migrate-<name>.ts`
  (pattern: `scripts/migrate-donations.ts`, idempotent with `IF NOT EXISTS`), plus
  an npm script `"db:migrate-<name>": "npx tsx scripts/migrate-<name>.ts"` in
  `package.json`. `scripts/setup-db.ts` does **not** contain the full schema and
  must not be touched. `scripts/migrate-release.ts` belongs to an earlier release
  and is not extended either.
- Audit log: `logAudit(user.email ?? null, "ACTION", "entity_type", id, details)`
  from `lib/db/utils.ts` (never breaks the main operation).

### Data model (excerpt)
- `events`: `id`, `title`, `category` (`fussball` | `fitness` | `schwimmen`),
  `date` (DATE), `time`, `location`, `status` (`draft` | `published` | `cancelled`),
  `cash_counted`, `cash_counted_at` …
- `registrations`: `id`, `event_id`, `email` (nullable, walk-ins often have none),
  `status` (`pending` | `approved` | `rejected` | `cancelled`),
  `status_token` (secret link token, already included in all emails),
  `is_walk_in`, `is_waitlist`, `checked_in_at`, `reminder_sent_at` …
  Re-registrations create **new** rows; there is at most one active registration
  per event and email (`idx_registrations_active_event_email`).
- `registration_persons`: `id` (uuid), `registration_id`, `first_name`,
  `last_name`, `is_child`, `checked_in_at`, `cancelled_at`, `created_at`.
  **`registration_persons.checked_in_at` is the source of truth for check-in**
  (see `lib/db/checkins.ts` and `scripts/backfill-person-checkins.ts`);
  cancelled persons (`cancelled_at IS NOT NULL`) do not count.
- Legacy: the former Google Forms survey was removed on 2026-10-19. The columns
  `events.survey_url` and `registrations.survey_sent_at` still exist but are
  **not reused**.

### Admin area and auth
- `middleware.ts` protects `/admin/*` and `/api/admin/*` via Supabase.
  Every API route additionally checks:
  ```ts
  const supabase = await createClient(); // from "@/lib/supabase/server"
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  ```
  Reference: `app/api/admin/events/[id]/cash-count/route.ts`.
  Every logged-in user is an admin; there are no roles.
- Navigation: `components/admin/Sidebar.tsx`, array `navSections`
  (section "EVENTS" contains Events, Vorlagen, Anmeldungen, Teilnehmer, Check-In).
- Admin pages are client components that load their own API routes via `fetch`
  (e.g. `app/admin/finanzen/page.tsx`).

### Check-in dashboard
- `app/admin/events/[id]/dashboard/page.tsx`, about 2200 lines, `"use client"`.
  - Tabs: `type Tab = "anmeldungen" | "warteliste" | "finanzen" | "spenden"`
    (search for `// Tab state`); the tab bar is an array with `key`, `label`,
    `icon`, `badge`, `badgeColor` (search for `── Tab bar ──`); mobile short
    labels come from a ternary chain right below it.
  - Polls `/api/checkin/status/[eventId]` and `/api/admin/events/[id]/finances`
    every 10 s (`fetchStatus`). The page does **not** know the event date; the
    review API must provide it.
  - UI reference: the "Kassenabschluss" block in the Finanzen tab (green box with
    `BadgeCheck`, timestamp „Eingetragen: …“, form below).
- New logic goes into **its own component** (`components/admin/ReviewTab.tsx`)
  so the large page does not grow further.

### Email
- `lib/email.ts` uses Resend (`resend@6.10`). `sendEmail()` **swallows errors**
  (fire-and-forget) and is therefore unsuitable for recording who actually
  received the email.
- For review emails: `resend.batch.send([...])` (max. 100 emails per call) with
  HTML pre-rendered via `render()` from `@react-email/components`
  (reference: `createCheckoutEmail` / `sendCheckoutEmail` in `lib/email.ts`,
  including `idempotencyKey`). Without `RESEND_API_KEY`, only log, as `sendEmail()`
  does; this counts as "sent" so local testing works.
- `appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"`,
  sender `fromEmail` in `lib/email.ts`.
- Email templates: `emails/*.tsx` with `@react-email/components`, styles as
  `React.CSSProperties` constants at the bottom of the file, footer
  „Allsport Freunde 2026 e.V. – Gemeinsam sportlich in der Rhein-Main-Region“.
  Reference: `emails/reminder.tsx`.

### Public token pages and protection
- Pattern: `app/status/[token]/page.tsx` (client page) loads
  `app/api/status/[token]/route.ts`. These paths are not protected by the
  middleware; the token is the authorization.
- `lib/ratelimit.ts`: `checkRateLimit(ip, RATE_LIMITS.x)`, `getClientIp(headers)`,
  in-memory per instance. Add the new limit to `RATE_LIMITS` there.
- `lib/honeypot.ts` requires a fill time of at least 2.5 s. **Do not** use it for
  reviews: the one-click save would fail it, and the secret token already
  protects the endpoint.

### Homepage and cache
- `app/page.tsx` composes the sections (Hero, AboutUs, EventGrid, GeneralInfo,
  Footer). Sections are client components with `framer-motion`; style reference:
  `components/AboutUs.tsx`.
- Public data comes from API routes with an in-memory cache:
  `getFromCache` / `setCache` / `invalidateCache(prefix)` from `lib/cache.ts`,
  reference `app/api/events/route.ts`.

### Time zone
- Events are in **Europe/Berlin** (`EVENT_TIME_ZONE` in `lib/cancellation.ts`).
  The database's `CURRENT_DATE` is UTC-based. Check "from the event day on" in
  TypeScript using the Berlin calendar day (e.g.
  `new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(now)`
  yields `YYYY-MM-DD`).

### Tests
- vitest, files in `__tests__/*.test.ts(x)`.
- Pattern for mocking the neon SQL tag with a query recorder:
  `__tests__/walkin-checkin.test.ts`.
- Put pure logic (windows, name format, validation) into a separate file without
  DB access and test it directly.
- **Component tests render statically only:** `vitest` runs with
  `environment: "node"`; there is neither jsdom nor Testing Library. Reference:
  `__tests__/status-page-payment.test.tsx` with `renderToStaticMarkup`.
  Therefore split components that load data: a view that renders from props only
  (statically testable) and a thin wrapper that loads data and runs actions. Do not
  test click behavior via the DOM, and **do not add new test dependencies**
  without asking the user.

---

## 3. Target design

### Data model (new)
```sql
-- registrations
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS review_requested_at TIMESTAMPTZ; -- request sent (window starts)
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS review_reminded_at  TIMESTAMPTZ; -- reminder sent

-- events
ALTER TABLE events ADD COLUMN IF NOT EXISTS review_reminder_sent_at TIMESTAMPTZ;    -- reminder (once per event)

CREATE TABLE IF NOT EXISTS event_reviews (
  id               SERIAL PRIMARY KEY,
  event_id         INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  registration_id  INTEGER NOT NULL UNIQUE REFERENCES registrations(id) ON DELETE CASCADE,
  rating           SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  would_return     VARCHAR(12) CHECK (would_return IN ('ja', 'vielleicht', 'nein')),
  comment          TEXT CHECK (comment IS NULL OR char_length(comment) <= 2000),
  publish_consent  BOOLEAN NOT NULL DEFAULT FALSE,
  published_at     TIMESTAMPTZ,
  published_by     VARCHAR(255),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_event_reviews_event_id ON event_reviews(event_id);
CREATE INDEX IF NOT EXISTS idx_event_reviews_published ON event_reviews(published_at) WHERE published_at IS NOT NULL;
```
In the migration script, write the SQL comments in German like the other migrations.

### Flows
```
Admin (Review tab)             Server                                   Participant
──────────────────             ──────                                   ───────────
[Send review] ──POST send──▶   reserve recipients (UPDATE … SET
                               review_requested_at = NOW() … RETURNING)
                               → emails via Resend batch
                               → release failed reservations
                                                                         Email: ★★★★★
                                                                         Click ★4 ─▶ /review/[token]?rating=4
                               ◀── POST /api/review/[token] {rating:4} ── page saves via JS after loading
                               ◀── POST … {would_return, comment, consent}  optional questions
[Reminder] ────POST send──▶    only requested without review, window open, once per event
[Approve] ─────PATCH───────▶   set published_at, invalidate cache ─────▶ homepage
```

### Endpoints
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/events/[id]/review` | Counts, send status, results, reviews with names |
| POST | `/api/admin/events/[id]/review/send` | Body `{ kind: "initial" \| "reminder" }`; `initial` covers the first send and follow-up sends |
| GET | `/api/admin/reviews` | Overview of all events + approval queue + published |
| PATCH | `/api/admin/reviews/[reviewId]` | Body `{ published: boolean }` |
| GET | `/api/review/[token]` | Data for the participant page |
| POST | `/api/review/[token]` | Save/change a review |
| GET | `/api/testimonials` | Public: approved testimonials + average |

### Shared types (in `lib/types.ts`, created in step 1)
The comments below are in English for this plan; when copying the types into
`lib/types.ts`, translate the comments into German like the rest of the code.
```ts
export type ReviewWouldReturn = "ja" | "vielleicht" | "nein";
export type ReviewSendKind = "initial" | "reminder";

export interface EventReview {
  id: number;
  event_id: number;
  registration_id: number;
  rating: number;                        // 1–5
  would_return: ReviewWouldReturn | null;
  comment: string | null;
  publish_consent: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Review with author name – admins only */
export interface EventReviewWithAuthor extends EventReview {
  first_name: string;
  last_name: string;
  email: string | null;
  event_title?: string;                  // in overviews across several events
}

export interface ReviewStats {
  responses: number;
  average: number | null;                // one decimal, null without responses
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  would_return: Record<ReviewWouldReturn, number>;
}

export interface EventReviewDashboard {
  event: { id: number; title: string; date: string; status: string };
  can_send: boolean;
  /** "event_in_future" | "event_cancelled" | null */
  send_blocked_reason: string | null;
  checked_in_registrations: number;      // approved, at least 1 person checked in
  without_email: number;                 // of those, without email
  requested: number;                     // review_requested_at set
  pending_initial: number;               // checked in, with email, not yet requested
  first_requested_at: string | null;
  reminder_sent_at: string | null;       // events.review_reminder_sent_at
  reminder_candidates: number;           // requested, no answer, window open
  stats: ReviewStats;
  reviews: EventReviewWithAuthor[];      // newest first
}

export interface ReviewSendResult { kind: ReviewSendKind; sent: number; failed: number }

/** For the public participant page – no internal IDs */
export interface ReviewTokenInfo {
  first_name: string;
  event_title: string;
  event_date: string;                    // YYYY-MM-DD
  deadline: string;                      // ISO, review_requested_at + 14 days
  is_open: boolean;
  review: Pick<EventReview, "rating" | "would_return" | "comment" | "publish_consent"> | null;
}

export interface PublicTestimonial {
  id: number;
  name: string;                          // "Ahmet K."
  rating: number;
  comment: string;
  event_title: string;
  event_category: string;
  event_date: string;
}

export interface PublicTestimonialsResponse {
  average: number | null;                // across all reviews, null with < 5 reviews
  count: number;
  items: PublicTestimonial[];
}

export interface ReviewOverviewEvent {
  event_id: number;
  title: string;
  date: string;
  category: string;
  requested: number;
  responses: number;
  response_rate: number | null;          // 0–1
  average: number | null;
  would_return_yes_rate: number | null;  // share of "ja" among answered
}

export interface ReviewOverviewResponse {
  events: ReviewOverviewEvent[];         // newest event first, only events with requested > 0
  pending_approval: EventReviewWithAuthor[]; // consent + comment, not published
  published: EventReviewWithAuthor[];
}
```

### New and changed files
| Step | New | Changed |
|---|---|---|
| 1 | `scripts/migrate-reviews.ts`, `lib/review.ts`, `lib/db/reviews.ts`, `__tests__/review-*.test.ts` | `package.json`, `lib/types.ts`, `lib/db/index.ts` |
| 2 | `emails/review-request.tsx`, `lib/review-sending.ts`, tests | `lib/email.ts` |
| 3 | `app/api/admin/events/[id]/review/route.ts`, `…/review/send/route.ts`, `app/api/admin/reviews/route.ts`, `app/api/admin/reviews/[reviewId]/route.ts` | – |
| 4 | `app/review/[token]/page.tsx`, `app/review/layout.tsx`, `components/review/ReviewForm.tsx`, `app/api/review/[token]/route.ts` | `lib/ratelimit.ts` |
| 5 | `components/admin/ReviewTab.tsx` | `app/admin/events/[id]/dashboard/page.tsx` |
| 6 | `app/admin/reviews/page.tsx`, `components/admin/ReviewsOverviewView.tsx` | `components/admin/Sidebar.tsx` |
| 7 | `app/api/testimonials/route.ts`, `components/Testimonials.tsx` | `app/page.tsx`, `app/datenschutz/page.tsx` |
| 8 | – | `README.md` |

---

## 4. Risks and how the plan handles them

| Risk | Countermeasure |
|---|---|
| **Link scanners** (Outlook Safe Links, antivirus) open links from emails automatically and would submit ratings | A GET **never** saves. The page saves the rating via `POST` from the browser after loading. Participants can correct it within the window. |
| **Duplicate sends** from a double click or two admins at the same time | Recipients are reserved before sending via a conditional `UPDATE … WHERE review_requested_at IS NULL RETURNING id`; only reserved rows are emailed. For the reminder, a conditional update of `events.review_reminder_sent_at` reserves the run. |
| **Partial email failures** | Evaluate per batch (≤ 100); release the reservations of failed batches (`review_requested_at = NULL` or `review_reminded_at = NULL`) so the follow-up send picks them up again. Show the result `{ sent, failed }` in the UI. |
| **Serverless timeouts** with many recipients | Batch API instead of single emails; events typically have < 100 registrations. |
| **Personal data made public** | Only with consent + admin approval; only first name + initial; editing the comment or withdrawing consent removes the approval; the public API returns no email and no IDs except the review ID. |
| **Token misuse** (someone else's link) | `status_token` is already secret and in all emails; rate limit per IP; 14-day window; only registrations with `review_requested_at` may submit a review. |
| **Wrong day boundary** due to UTC | Compute the Berlin calendar day in TypeScript (see section 2). |

---

## 5. Step order

| # | Prompt | Content | Depends on |
|---|---|---|---|
| 1 | [`01-database.md`](prompts/01-database.md) | Migration, types, pure logic, DB functions | – |
| 2 | [`02-email-and-sending.md`](prompts/02-email-and-sending.md) | Email template, batch sending, reservation | 1 |
| 3 | [`03-admin-api.md`](prompts/03-admin-api.md) | Admin endpoints | 1, 2 |
| 4 | [`04-participant-page.md`](prompts/04-participant-page.md) | `/review/[token]` and API | 1 |
| 5 | [`05-dashboard-tab.md`](prompts/05-dashboard-tab.md) | "Review" tab in the check-in dashboard | 3 |
| 6 | [`06-admin-overview.md`](prompts/06-admin-overview.md) | "Reviews" menu item with approval | 3 |
| 7 | [`07-homepage-and-privacy.md`](prompts/07-homepage-and-privacy.md) | Homepage testimonials, privacy policy | 1, 6 |
| 8 | [`08-final-review.md`](prompts/08-final-review.md) | Final review, README, rollout | all |

Step 4 can run in parallel with steps 2/3. Each step ends with passing tests and
an error-free `tsc`; only then start the next prompt.

---

## 6. Definition of Done (overall)
- Every requirement in section 1 can be verified manually (checklist in prompt 8).
- `npm test`, `npx tsc --noEmit -p .` (ignoring `.next/` messages) and `npm run lint` pass.
- Locally without `POSTGRES_URL` the app starts, the homepage works and the review tab shows an understandable note.
- The migration `npm run db:migrate-reviews` is idempotent (can be run twice).
- No changes outside the feature (no unrelated formatting or refactoring).

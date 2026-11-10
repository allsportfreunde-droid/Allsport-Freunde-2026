# Step 3 of 8 – Admin API

## Task
You create the four admin endpoints for reviews. They connect the DB functions
(step 1) and the sending logic (step 2) to the UI built later.

## Language
- This prompt is in English, but the codebase is German: all code comments and
  error messages must be **German**.

## Check the prerequisite
`lib/db/reviews.ts` and `lib/review-sending.ts` exist and their tests pass.
If not: stop and report.

## Read first
1. `docs/review-feature/PLAN.md`, section 2 ("Admin area and auth", "Homepage and cache")
   and section 3 ("Endpoints", "Shared types").
2. Code:
   - `app/api/admin/events/[id]/cash-count/route.ts` (auth, ID validation, error format)
   - `app/api/admin/events/[id]/donations/route.ts` (`logAudit`)
   - `lib/cache.ts` (`invalidateCache`)
   - `__tests__/status-route-payment.test.tsx` (how route handlers are tested)

## Shared rules for all four routes
- Auth exactly as in `cash-count/route.ts` → 401 `{ error: "Nicht autorisiert." }`.
- Without a database (`!isPostgresConfigured()`) → 503
  `{ error: "Reviews benötigen eine Datenbank (POSTGRES_URL)." }`.
- Invalid IDs → 400 `{ error: "Ungültige Event-ID." }` or `"Ungültige Review-ID."`.
- Log errors (`console.error` with German context) → 500 `{ error: "Ein Fehler ist aufgetreten." }`.
- Responses with `Cache-Control: no-store`.
- `params` is a Promise (`await params`).

## Steps

### 1. `app/api/admin/events/[id]/review/route.ts` – `GET`
→ `EventReviewDashboard` via `getEventReviewDashboard`; `null` → 404 `{ error: "Event nicht gefunden." }`.

### 2. `app/api/admin/events/[id]/review/send/route.ts` – `POST`
- Body `{ kind: "initial" | "reminder" }`, anything else → 400 `{ error: "Ungültige Versandart." }`.
- `sendEventReviewRequests(eventId, kind, user.email ?? null)`;
  `ok: false` → pass through its `status` and `error`; `ok: true` → `ReviewSendResult`.
- Set `export const maxDuration = 60;` (sending several batches).

### 3. `app/api/admin/reviews/route.ts` – `GET`
→ `ReviewOverviewResponse` via `getReviewOverview()`.

### 4. `app/api/admin/reviews/[reviewId]/route.ts` – `PATCH`
- Body `{ published: boolean }`, otherwise 400.
- `setReviewPublished(id, published, user.email ?? null)`:
  - `not_found` → 404 `{ error: "Review nicht gefunden." }`
  - `no_consent` → 409 `{ error: "Ohne Einwilligung darf der Kommentar nicht veröffentlicht werden." }`
  - `no_comment` → 409 `{ error: "Ohne Kommentar gibt es nichts zu veröffentlichen." }`
- On success: `invalidateCache("testimonials")`,
  `logAudit(user.email ?? null, published ? "PUBLISH_REVIEW" : "UNPUBLISH_REVIEW", "event_review", id)`,
  response `{ review }`.

### 5. Tests `__tests__/review-admin-api.test.ts`
Mock the Supabase client, `@/lib/db` and `@/lib/review-sending`:
- No user → 401 (for all four routes).
- No database → 503.
- `send` with `kind: "foo"` → 400; a 409 from the sending logic is passed through.
- `PATCH` with `no_consent` → 409; success calls `invalidateCache("testimonials")`.

## Rules
- No business logic in the routes. The checks live in `lib/review-sending.ts`
  and `lib/db/reviews.ts`; the routes only validate input and pass results through.
- German texts, existing patterns, no unrelated changes. Do not commit unless explicitly asked.

## Done when
- `npm test` passes, `npx tsc --noEmit -p .` reports no errors (except `.next/`).
- Report with files, tests and example responses (JSON) for the four endpoints.

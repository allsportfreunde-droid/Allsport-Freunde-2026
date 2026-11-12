# Step 6 of 8 – Admin menu item "Reviews"

## Task
You build the admin page `/admin/reviews`: a comparison of all events, the approval
queue for comments and the list of published testimonials.

## Language
- This prompt is in English, but the codebase is German: all code comments,
  UI texts and error messages must be **German**.

## Check the prerequisite
`GET /api/admin/reviews` and `PATCH /api/admin/reviews/[reviewId]` exist (step 3).
The deep link `/admin/events/[id]/dashboard?tab=review` works (step 5).
If not: stop and report.

## Read first
1. `docs/review-feature/PLAN.md`, section 1 ("Results") and 3 (`ReviewOverviewResponse`).
2. Code:
   - `components/admin/Sidebar.tsx` (`navSections`)
   - `app/admin/finanzen/page.tsx` (structure of an admin overview, tables, loading/error states)
   - `components/ui/ResponsiveTable.tsx`, `components/ui/MetricCard.tsx`

## Steps

### 1. Navigation
In `components/admin/Sidebar.tsx`, section "EVENTS", after "Check-In":
`{ href: "/admin/reviews", label: "Reviews", icon: Star }` (import the icon from `lucide-react`).

### 2. View component `components/admin/ReviewsOverviewView.tsx` and page `app/admin/reviews/page.tsx`
- `ReviewsOverviewView` renders from props only (`data: ReviewOverviewResponse`,
  `busyId`, callbacks). The client page `app/admin/reviews/page.tsx` loads
  `GET /api/admin/reviews`, runs the actions and passes everything in.
- Three sections:

**a) "Freigabe ausstehend"** (top, with the count in the title)
- Cards: first and last name, event title, stars, comment, date,
  preview "erscheint als: {Vorname} {Initial}."
- Button "Auf Website zeigen" → `PATCH { published: true }`, then reload.
- Empty state: "Keine Kommentare warten auf Freigabe."

**b) "Events im Vergleich"**
- Table (cards on mobile, check `ResponsiveTable`):
  event (link to `/admin/events/{id}/dashboard?tab=review`), date, requested,
  responses, response rate %, average ★, would return %.
- Sort: newest event first. Empty state: "Noch keine Reviews verschickt."
- Above it, three metrics across all events: average stars, overall response rate,
  number of responses.

**c) "Auf der Website"**
- Published testimonials with approval date and a button "Von Website nehmen" → `PATCH { published: false }`.

**States:** loading, error (on 503 show the missing-database note), disable action
buttons while a request is running.

### 3. Tests `__tests__/admin-reviews-page.test.tsx`
Render `ReviewsOverviewView` statically with `renderToStaticMarkup` (no jsdom,
no new test dependencies): approval queue with name preview "Ahmet K.",
event link contains `?tab=review`, empty states.

## Explicitly out of scope
A "reject" action for comments is not required. Comments that are not approved stay
visible in the queue. If you see this as a problem while implementing, mention it as
a suggestion in your report; do not build it on your own.

## Rules
- Same look as the other admin pages. German texts, existing patterns.
- Do not commit unless explicitly asked.

## Done when
- `npm test` passes, `npx tsc --noEmit -p .` reports no errors (except `.next/`).
- The menu item is highlighted as active on `/admin/reviews`.
- Report with files and tests.

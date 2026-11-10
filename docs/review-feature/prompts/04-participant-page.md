# Step 4 of 8 – Review page for participants

## Task
You build the public page `/review/[token]`, where participants land after clicking
a star in the email, and its API.

## Language
- This prompt is in English, but the codebase is German: all code comments,
  UI texts and error messages must be **German** (informal "du" towards participants).

## Check the prerequisite
Step 1 is done (`lib/review.ts`, `lib/db/reviews.ts` with `getReviewTokenInfo`
and `saveReview`). If not: stop and report.

## Read first
1. `docs/review-feature/PLAN.md`, section 1 ("Participant flow"),
   2 ("Public token pages and protection") and 4 (risk: **link scanners**).
2. Code:
   - `app/status/[token]/page.tsx` and `components/status/StatusPage.tsx`
     (structure, loading and error states, look and feel)
   - `app/api/status/[token]/route.ts`
   - `lib/ratelimit.ts`
   - `components/ui/` (`button`, `card`, `checkbox`, `textarea`)

## Steps

### 1. Rate limit
Add to `RATE_LIMITS` in `lib/ratelimit.ts`:
`review: { limit: 60, windowMs: 10 * 60 * 1000 }` with a short German comment.

### 2. API `app/api/review/[token]/route.ts`
- **GET**
  - Check the rate limit → 429 `{ error: "Zu viele Anfragen. Bitte später erneut versuchen." }`.
  - Without a database → 404, same as an unknown token.
  - `getReviewTokenInfo(token)`; `null` → 404 `{ error: "Dieser Link ist ungültig." }`.
  - Response: only the fields of `ReviewTokenInfo` (**without** `registration_id`/`event_id`),
    `Cache-Control: no-store`.
- **POST**
  - Rate limit, read JSON, `parseReviewInput` → 400 with its error message.
  - `getReviewTokenInfo`; `null` → 404; `!is_open` → 410
    `{ error: "Die Bewertungsfrist für dieses Event ist abgelaufen." }`.
  - `saveReview(...)`; if `unpublished` → `invalidateCache("testimonials")`.
  - Response `{ review }` (only `rating`, `would_return`, `comment`, `publish_consent`).
- **No honeypot.** The reason is in PLAN.md (its minimum fill time would block the one-click save).

### 3. Page `app/review/[token]/page.tsx` + `app/review/layout.tsx`
- `layout.tsx` sets `metadata` with `title: "Event bewerten"` and
  `robots: { index: false, follow: false }`.
- `page.tsx` is a client page following the status page pattern:
  1. Token from `useParams`, `rating` from `useSearchParams` (only 1–5 is valid).
  2. Load via GET. Show loading, error (invalid link) and closed states.
  3. **One-click save:** if `rating` is valid and `is_open`, immediately send one
     `POST { rating }`. Guard against double execution (React StrictMode) with
     `useRef`. Then remove `?rating` from the URL with `window.history.replaceState`
     so a reload does not save again.
     **Never** save on the server during GET (link scanners).
  4. Render the form from `components/review/ReviewForm.tsx`.

### 4. Component `components/review/ReviewForm.tsx`
All data comes in via props (so it can be tested statically, see the tests below).
- Header: "Assalamu Alaikum {first_name}", event title and date (German format).
- **Question 1 "Wie hat dir das Event gefallen?":** five large star buttons
  (touch target ≥ 44 px, `aria-label="4 von 5 Sternen"`, keyboard accessible,
  `aria-pressed`). A click saves immediately (`POST { rating }`) and briefly shows
  "Gespeichert ✓".
- **Question 2 "Würdest du wieder mitmachen?":** three toggle buttons Ja / Vielleicht / Nein;
  clicking the selected one again clears the selection.
- **Question 3 "Was sollen wir beibehalten oder besser machen?":** textarea,
  `maxLength={2000}`, character counter.
- **Checkbox (off by default):** "Mein Kommentar darf mit Vorname und
  Anfangsbuchstaben des Nachnamens (z. B. „Ahmet K.“) auf der Website von
  Allsport Freunde gezeigt werden. Das kann ich jederzeit über diesen Link
  widerrufen." with a link to `/datenschutz`. Only enabled when a comment is entered.
- Button "Absenden" → `POST` with all fields. Then a thank-you state
  "Danke für dein Feedback! 🤍" with the note "Du kannst deine Bewertung bis {deadline} ändern."
  and a button "Bewertung ändern".
- Prefill existing answers (`review` from GET).
- Closed state: note "Die Bewertung für dieses Event ist geschlossen.",
  show the existing rating read-only.
- Mobile first, look matching the status page, show API errors visibly.

### 5. Tests
- `__tests__/review-token-route.test.ts`: unknown token → 404, closed window → 410,
  invalid rating → 400, success calls `saveReview`, `unpublished` clears the cache,
  rate limit → 429, GET does not return `registration_id`.
- `__tests__/review-form.test.tsx`, static with `renderToStaticMarkup` like
  `__tests__/status-page-payment.test.tsx` (there is no jsdom and no Testing Library):
  existing answers are prefilled, the checkbox is disabled without a comment,
  the closed state shows no input fields, the stars have `aria-label`s.
  Do not add new test dependencies.

## Rules
- Do not add `/review` to the `middleware.ts` matchers (public page).
- Never send the email address or internal IDs to the browser.
- German texts with "du", existing patterns. Do not commit unless explicitly asked.

## Done when
- `npm test` passes, `npx tsc --noEmit -p .` reports no errors (except `.next/`).
- Report with files, tests and a short description of the page states.

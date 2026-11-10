# Step 7 of 8 – Testimonials on the homepage and privacy policy

## Task
You show approved comments on the homepage in a section "Das sagen unsere Teilnehmer"
and extend the privacy policy.

## Language
- This prompt is in English, but the codebase is German: all code comments,
  UI texts and the privacy policy text must be **German**.

## Check the prerequisite
`getPublicTestimonials` exists (step 1). Approvals clear the `testimonials` cache
(steps 3 and 4). Check both places (`PATCH /api/admin/reviews/[reviewId]`,
`POST /api/review/[token]`) and add `invalidateCache("testimonials")` if it is missing.

## Read first
1. `docs/review-feature/PLAN.md`, section 1 ("Results") and
   2 ("Homepage and cache", and "Database" for local mode).
2. Code:
   - `app/page.tsx`, `components/AboutUs.tsx` (style, `framer-motion`, `Card`)
   - `app/api/events/route.ts` (public route with cache)
   - `lib/cache.ts`
   - `app/datenschutz/page.tsx` (structure with `Section`, existing sections 2, 3 and 5)

## Steps

### 1. API `app/api/testimonials/route.ts` – `GET`
- `export const dynamic = "force-dynamic";`
- Cache key `testimonials:public` (the prefix matches `invalidateCache("testimonials")`).
- Without a database or on error: `{ average: null, count: 0, items: [] }` with status 200
  (on error also `console.error`). The homepage must never break.
- Otherwise `getPublicTestimonials(6)`.

### 2. Component `components/Testimonials.tsx` (client)
- `export function TestimonialsView({ data })` renders from props only;
  the default export loads `/api/testimonials` and renders the view.
- With `items.length === 0` or on error: **render nothing** (`null`).
- Heading "Das sagen unsere Teilnehmer", `id="stimmen"`.
- If `average` is set: "Ø {4,6} von 5 ★ aus {count} Bewertungen" (German decimal comma).
- Cards (1/2/3 columns depending on width): stars, comment as a quote,
  "— {name}, {event_title}". Truncate long comments after about 280 characters
  with an expandable "… mehr".
- Design and animation like `components/AboutUs.tsx`.

### 3. Placement
In `app/page.tsx` between `<EventGrid />` and `<GeneralInfo />`.

### 4. Privacy policy `app/datenschutz/page.tsx`
Extend it in the page's existing style without rewording other sections. Write the text in German:
- **Section 2 ("Verarbeitete Daten und Zwecke"):** new item "Event-Bewertungen":
  - After attending (check-in), the association may send a review request by email.
  - Stored: star rating, answer about attending again, comment, consent to publication
    and timestamps. Everything is linked to the registration and visible to the board
    with the participant's name.
  - Purpose: improving the events.
- **Section 3 ("Rechtsgrundlagen"):**
  - Review request and evaluation: legitimate interest, Art. 6(1)(f) GDPR
    (German: "Art. 6 Abs. 1 lit. f DSGVO").
  - Publication on the website with first name and last-name initial: consent,
    Art. 6(1)(a) GDPR ("Art. 6 Abs. 1 lit. a DSGVO"), revocable at any time
    (via the review link or by contacting the association).
- **Section 5 ("Speicherdauer"):** reviews are stored like the associated registration
  and deleted with it. Adapt the wording to the existing text there.
- Put a code comment at the new text:
  `{/* TODO Vorstand: Text zu Event-Bewertungen inhaltlich prüfen */}`.

### 5. Tests
- `__tests__/testimonials-route.test.ts`: empty response without a database, cache hit
  without a DB call, error → empty response with 200.
- `__tests__/testimonials.test.tsx`: render `TestimonialsView` statically with
  `renderToStaticMarkup` (no jsdom, no new test dependencies): empty list → empty string;
  with data → name "Ahmet K." and "4,6" visible; `average: null` → no average line.

## Rules
- Publish only what `getPublicTestimonials` returns; no email, no full last names.
- Mark the privacy text as a draft (TODO comment) and state clearly in your report
  that it must be reviewed.
- German texts, existing patterns. Do not commit unless explicitly asked.

## Done when
- `npm test` passes, `npx tsc --noEmit -p .` reports no errors (except `.next/`).
- Locally without `POSTGRES_URL` the homepage loads without errors and the section stays hidden.
- Report with files, tests and the inserted privacy text verbatim.

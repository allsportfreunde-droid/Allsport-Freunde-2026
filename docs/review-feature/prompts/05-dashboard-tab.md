# Step 5 of 8 – "Review" tab in the check-in dashboard

## Task
You add the **"Review"** tab to an event's check-in dashboard: sending, follow-up
sending, reminder, results and approval of comments. It works as a post-event flow,
like the existing cash count ("Kassenabschluss").

## Language
- This prompt is in English, but the codebase is German: all code comments,
  UI texts and error messages must be **German**.

## Check the prerequisite
The admin API from step 3 exists:
`GET /api/admin/events/[id]/review`, `POST …/review/send`, `PATCH /api/admin/reviews/[reviewId]`.
If not: stop and report.

## Read first
1. `docs/review-feature/PLAN.md`, section 1 ("Admin flow", "Results")
   and section 2 ("Check-in dashboard").
2. Code:
   - `app/admin/events/[id]/dashboard/page.tsx`: search for `// Tab state`,
     `── Tab bar ──`, `── Tab: Finanzen ──` and the `Kassenabschluss` block
     (UI reference: green confirmation box with `BadgeCheck`, timestamp, form)
   - `components/ui/MetricCard.tsx`, `components/ui/MetricGrid.tsx`, `components/ui/dialog.tsx`
   - Type `EventReviewDashboard` in `lib/types.ts`

## Steps

### 1. New component `components/admin/ReviewTab.tsx`
Two parts in the same file (for static tests, see PLAN.md "Tests"):
- `export function ReviewTabView(props)`: renders from props only
  (`data: EventReviewDashboard`, `busy`, `message`, callbacks `onSend(kind)`,
  `onTogglePublish(reviewId, published)`, `onRefresh`).
- `export default function ReviewTab({ eventId, onChanged })`: loads
  `GET /api/admin/events/${eventId}/review` on mount and after every action,
  runs the actions, holds dialog, loading and error state and renders `ReviewTabView`.
  `onChanged?: (d: EventReviewDashboard) => void` reports new data to the page.
No 10-second polling; add a small "Aktualisieren" button instead.

**Card "Review-Anfrage"**
- `can_send === false`:
  - `event_in_future` → grey note "Der Versand ist ab dem Event-Tag ({Datum}) möglich."
  - `event_cancelled` → "Das Event wurde abgesagt – kein Review-Versand."
- Nothing sent yet (`requested === 0`):
  - Text "{pending_initial} eingecheckte Anmeldungen mit E-Mail · {without_email} ohne E-Mail"
  - Button "Review an {pending_initial} senden" (disabled at 0)
  - Confirmation dialog: "Review-Anfrage an {n} Teilnehmer senden? Jede Anmeldung bekommt die Mail nur einmal."
- Already sent:
  - Green box like the cash count: "Verschickt am {first_requested_at} · {requested} Mails"
  - If `pending_initial > 0`: amber line "{n} später Eingecheckte noch ohne Anfrage" + button "Nachsenden"
    (same endpoint, `kind: "initial"`)
- **Reminder:**
  - `reminder_sent_at` set → "Erinnerung verschickt am {Datum}".
  - Otherwise, when `requested > 0`: button "Erinnerung an {reminder_candidates} ohne Antwort"
    (disabled at 0), dialog "Die Erinnerung kann pro Event nur einmal verschickt werden."
- Show the result after sending: "{sent} gesendet" and, if `failed > 0`, in red
  "{failed} fehlgeschlagen – per Nachsenden erneut versuchen". Show API errors (409/503)
  with their message.
- Disable all send buttons while a send is in progress (double click).

**Card "Ergebnisse"** (only when `requested > 0`)
- Metrics: average stars (one decimal, German decimal comma), response rate
  "{responses} von {requested} ({Prozent})", would return "{Anteil ja}".
- Distribution 5★ to 1★ as horizontal bars (plain `div`s, count on the right).

**Card "Kommentare"**
- List, newest first: first and last name, stars, would-return chip, comment, date.
- With `publish_consent && comment`: badge "Darf veröffentlicht werden" and button
  "Auf Website zeigen", or "Von Website nehmen" when `published_at` is set → `PATCH`, then reload.
- Empty state: "Noch keine Antworten."

**States:** loading, error with message (on 503 show the missing-database note).

### 2. Integration into `app/admin/events/[id]/dashboard/page.tsx` (keep it minimal)
- Extend `type Tab` with `"review"`.
- Tab entry: `label: "Review"`, icon `Star` from `lucide-react`.
- The mobile short labels currently come from a ternary chain. Add a `shortLabel`
  field to the tab array and use it there instead of extending the chain.
- **Badge:** the page loads `GET …/review` **once** on mount and stores
  `{ requested, pending_initial }`; `ReviewTab` updates it via `onChanged`.
  Display: nothing sent yet → no badge; sent and `pending_initial > 0` →
  amber number; otherwise a green "✓".
- **Deep link:** support `?tab=review` (and the other tab keys) as the initial tab
  (`useSearchParams`, accept only valid keys). If Next.js requires a `Suspense`
  boundary for that, add it.
- `{activeTab === "review" && <ReviewTab … />}` after the donations tab.
- Do **not** change the existing 10-second polling.

### 3. Tests `__tests__/review-tab.test.tsx`
Render `ReviewTabView` statically with `renderToStaticMarkup` (no jsdom available,
no new test dependencies):
- Future event → no send button, note with date visible.
- Before sending → button "Review an {n} senden"; disabled when `pending_initial = 0`.
- After sending with `pending_initial > 0` → "Nachsenden" visible.
- `reminder_sent_at` set → no reminder button, date visible.
- Comment with consent → "Auf Website zeigen"; published → "Von Website nehmen";
  without consent → no approval button.

## Rules
- Do not rework other tabs; only the minimal changes described above.
- Match the look of the finance tab/cash count (reuse its Tailwind classes).
- German texts, existing patterns. Do not commit unless explicitly asked.

## Done when
- `npm test` passes, `npx tsc --noEmit -p .` reports no errors (except `.next/`).
- The tab also works at phone width (the tab bar scrolls as before).
- Report with files, tests and a short description of the UI states.

# Step 2 of 8 – Review email and sending logic

## Task
You build the review email with clickable stars and the server-side sending logic,
including protection against duplicate sends. **No** API routes and no UI yet.

## Language
- This prompt is in English, but the codebase is German: all code comments,
  user-facing texts, email content and error messages must be **German**.

## Check the prerequisite
Step 1 must be done: `lib/review.ts`, `lib/db/reviews.ts`,
`scripts/migrate-reviews.ts` and the review types in `lib/types.ts` exist.
If not: stop and report.

## Read first
1. `docs/review-feature/PLAN.md`, especially section 1 ("Sending rules"),
   2 ("Email") and 4 (risks: duplicate sends, partial failures, timeouts).
2. Code:
   - `lib/email.ts`: `createCheckoutEmail`, `sendCheckoutEmail` (render + idempotencyKey),
     `sendEmail` (logging without `RESEND_API_KEY`), `fromEmail`, `appUrl`, `formatDateDE`
   - `emails/reminder.tsx` (structure and style of an email)
   - `lib/review.ts`, `lib/db/reviews.ts` from step 1

## Steps

### 1. Email template `emails/review-request.tsx`
- Props: `firstName`, `eventTitle`, `eventDate` (already formatted),
  `reviewUrl` (without query), `deadlineDate` (formatted), `isReminder: boolean`.
- Content (German):
  - Heading: initial send "Wie war's? ⭐", reminder "Kurze Erinnerung ⭐".
  - "Assalamu Alaikum {firstName}," and one or two sentences: thanks for joining
    **{eventTitle}** on {eventDate}; rate it with one click.
  - **Star row:** five separate `★` links to `${reviewUrl}?rating=1` … `?rating=5`,
    large (approx. 36 px), color `#f59e0b`, no underline, with spacing;
    below in small text "1 = gar nicht · 5 = super".
  - Fallback button "Bewertung abgeben" linking to `reviewUrl` (green like `primaryButton` in `reminder.tsx`).
  - Note "Du kannst bis {deadlineDate} bewerten. Dauert keine Minute."
  - "Jazakallahu Khairan! 🤍" and the usual footer.
- Style like `emails/reminder.tsx` (style constants at the bottom of the file).
  No external images, so the stars stay visible when images are blocked.

### 2. Sending functions in `lib/email.ts`
- `buildReviewRequestEmail(data)` → `{ from, to, subject, html }` using `render()`.
  - Subject, initial send: `Wie war „${eventTitle}“? Bewerte mit einem Klick`
  - Subject, reminder: `Erinnerung: Wie war „${eventTitle}“?`
  - `reviewUrl = ${appUrl}/review/${statusToken}`
- `sendEmailBatch(messages, idempotencyKey): Promise<boolean>`
  - With Resend: `resend.batch.send(messages, { idempotencyKey })`; return `true` only
    if there is no `error` and data comes back. Catch exceptions → `false` + `console.error`.
  - Without `RESEND_API_KEY`: log each email like `sendEmail` does and return `true`.
  - At most 100 messages per call (check beforehand, otherwise throw).

### 3. Orchestration `lib/review-sending.ts`
`sendEventReviewRequests(eventId: number, kind: ReviewSendKind, adminEmail: string | null)`
→ `Promise<{ ok: true; result: ReviewSendResult } | { ok: false; status: 404 | 409; error: string }>`

Flow:
1. Load the event (title, date, status). Not found → 404.
2. `isReviewSendAllowed` → otherwise 409 with a German message
   ("Der Versand ist ab dem Event-Tag möglich." / "Das Event wurde abgesagt.").
3. **initial** (first send and follow-up send):
   - `getReviewRecipients(eventId, "initial")` → none → `{ sent: 0, failed: 0 }`.
   - `claimReviewRequests(ids)` and email only the IDs returned.
   - Deadline in the email: today + 14 days.
4. **reminder**:
   - At least one registration must already have been requested, otherwise 409
     ("Bitte zuerst die Review-Anfrage senden.").
   - `getReviewRecipients(eventId, "reminder")` → none → 409
     ("Keine offenen Anfragen für eine Erinnerung."); do **not** use up the one-time reminder in that case.
   - `claimEventReviewReminder(eventId)` → `false` → 409 ("Die Erinnerung wurde bereits verschickt.").
   - `claimReviewReminders(ids)`, send with `isReminder: true`;
     deadline in the email: `reviewDeadline(review_requested_at)` of each recipient.
5. Send in batches of 100. Deterministic `idempotencyKey` per batch, e.g.
   `review-${kind}-${eventId}-${first ID}-${last ID}-${count}`.
6. If a batch fails: release the reservations of that batch
   (`releaseReviewRequests` or `releaseReviewReminders`) and count them as `failed`.
   If **all** batches of a reminder fail: `releaseEventReviewReminder(eventId)`
   so the button can be used again.
7. `logAudit(adminEmail, kind === "initial" ? "SEND_REVIEW_REQUESTS" : "SEND_REVIEW_REMINDER", "event", eventId, { sent, failed })`.

### 4. Tests `__tests__/review-sending.test.ts`
Replace DB functions and `sendEmailBatch` with `vi.mock`:
- Future or cancelled event → 409, nothing reserved or sent.
- Only reserved IDs are emailed (claim returns fewer than requested).
- 230 recipients → 3 batches (100/100/30).
- Failed batch → `releaseReviewRequests` with exactly those IDs, `failed` correct.
- Reminder twice → second call returns 409.
- Reminder without candidates → 409 and `claimEventReviewReminder` is not called.
- Reminder where all batches fail → `releaseEventReviewReminder` is called.
- Snapshot-free render test of the email: HTML contains five links with `?rating=1` … `?rating=5`.

## Rules
- Do not use `sendEmail()` for review emails (it swallows errors).
- Do not change existing email functions.
- German texts, existing patterns, no unrelated changes. Do not commit unless explicitly asked.

## Done when
- `npm test` passes, `npx tsc --noEmit -p .` reports no errors (except `.next/`).
- Report: files, tests, deviations from the plan.

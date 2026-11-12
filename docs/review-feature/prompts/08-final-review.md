# Step 8 of 8 – Final review, documentation, rollout

## Task
You check the complete event reviews feature against the requirements, fix the bugs
you find, document it in the README and prepare the rollout.

## Language
- This prompt is in English, but the codebase is German: code comments, UI texts
  and the README section must be **German**. Write your final report in German too,
  since it goes to the German-speaking project owner.

## Read first
1. `docs/review-feature/PLAN.md` in full, especially sections 1 and 6 ("Definition of Done").
2. All files listed in PLAN.md section 3 "New and changed files".

## Steps

### 1. Automated checks
- `npm test`, `npx tsc --noEmit -p .` (ignore messages from `.next/`), `npm run lint`.
- Fix errors that belong to this feature. Do not touch pre-existing, unrelated
  warnings; only list them in the report.

### 2. Check against the requirements
Go through every line of PLAN.md section 1 and note where it is implemented
(file and function) or what is missing. Check in particular:
- Sending only from the event day (Berlin time), never for cancelled events.
- Only registrations with a checked-in person **and** an email; walk-ins without email only as a count.
- No duplicate sends: conditional reservation before sending, release on failure.
- Reminder exactly once per event, only to requested registrations without an answer and with an open window.
- GET on `/review/[token]` never saves; the one-click save is a POST from the browser.
- 14-day window from each registration's own request; changes allowed within the window.
- Changing the comment or withdrawing consent removes a publication.
- The public API returns only "first name + initial", no email, no registration ID.
- Locally without `POSTGRES_URL`: the homepage works, the admin tab shows a note.

### 3. Manual test guide (write it into the report, do not run it)
Step by step for a QA environment with a database and `RESEND_API_KEY`:
1. `npm run db:migrate-reviews` (twice; no errors the second time).
2. Create an event dated today, check in two registrations with email and one walk-in without email.
3. "Review" tab: check the counts, send, check the green box.
4. Check in another person → "Nachsenden" appears → send.
5. Open the email, click 4 stars → rating saved, URL without `?rating`.
6. Submit a comment with consent; approve it in `/admin/reviews` → the homepage shows it.
7. Change the comment on the review page → it disappears from the homepage and is back in the approval queue.
8. Send the reminder → a second attempt is rejected.

### 4. README
Add a short German section "Event-Reviews" to `README.md` (same style as the other sections):
- The flow in three sentences (sending in the check-in dashboard, rating via link,
  approval under Admin → Reviews).
- Migration: `npm run db:migrate-reviews`.
- Dependencies: `RESEND_API_KEY` and `NEXT_PUBLIC_APP_URL` must be set,
  otherwise the links in the email point to `localhost`.

### 5. Rollout notes (in the report, do not run)
- Order: migration on QA → deploy QA → manual test → migration on production → deploy production.
- Check that `NEXT_PUBLIC_APP_URL` points to the correct domain in every environment.
- Note for the association: have the privacy text (TODO comment in `app/datenschutz/page.tsx`)
  reviewed before go-live.

## Rules
- No new features, only bug fixes and documentation.
- Do not run migrations against real databases, do not deploy.
- Do not commit unless explicitly asked.

## Done when
The report contains: results of the automated checks, the requirements table
(done/open), fixed bugs, the manual test guide and the rollout notes.

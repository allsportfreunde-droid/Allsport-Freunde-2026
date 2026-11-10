import { createHash } from "node:crypto";
import {
  getEvent, getEventReviewDashboard, getReviewRecipients, claimReviewRequests, releaseReviewRequests,
  claimReviewReminders, releaseReviewReminders, claimEventReviewReminder, releaseEventReviewReminder, logAudit,
} from "@/lib/db";
import { buildReviewRequestEmail, sendEmailBatch } from "@/lib/email";
import { isReviewSendAllowed, reviewDeadline } from "@/lib/review";
import type { ReviewSendKind, ReviewSendResult } from "@/lib/types";

export async function sendEventReviewRequests(eventId: number, kind: ReviewSendKind, adminEmail: string | null): Promise<
  { ok: true; result: ReviewSendResult } | { ok: false; status: 404 | 409; error: string }
> {
  const event = await getEvent(eventId);
  if (!event) return { ok: false, status: 404, error: "Das Event wurde nicht gefunden." };
  const allowed = isReviewSendAllowed(event.date, event.status);
  if (!allowed.allowed) {
    return {
      ok: false, status: 409,
      error: allowed.reason === "event_cancelled" ? "Das Event wurde abgesagt." : "Der Versand ist ab dem Event-Tag möglich.",
    };
  }

  const isReminder = kind === "reminder";
  if (isReminder) {
    const dashboard = await getEventReviewDashboard(eventId);
    if (!dashboard?.requested) return { ok: false, status: 409, error: "Bitte zuerst die Review-Anfrage senden." };
  }
  const candidates = await getReviewRecipients(eventId, kind);
  if (candidates.length === 0) {
    if (isReminder) return { ok: false, status: 409, error: "Keine offenen Anfragen für eine Erinnerung." };
    await logAudit(adminEmail, "SEND_REVIEW_REQUESTS", "event", eventId, { sent: 0, failed: 0 });
    return { ok: true, result: { kind, sent: 0, failed: 0 } };
  }
  if (isReminder && !await claimEventReviewReminder(eventId)) {
    return { ok: false, status: 409, error: "Die Erinnerung wurde bereits verschickt." };
  }

  const ids = candidates.map((recipient) => recipient.registration_id);
  let claimed: number[];
  try {
    claimed = isReminder ? await claimReviewReminders(ids) : await claimReviewRequests(ids);
  } catch (error) {
    if (isReminder) await releaseEventReviewReminder(eventId);
    throw error;
  }
  const claimedIds = new Set(claimed);
  const recipients = candidates.filter((recipient) => claimedIds.has(recipient.registration_id))
    .sort((a, b) => a.registration_id - b.registration_id);
  const initialDeadline = reviewDeadline(new Date());
  let sent = 0;
  let failed = 0;
  for (let offset = 0; offset < recipients.length; offset += 100) {
    const batch = recipients.slice(offset, offset + 100);
    const batchIds = batch.map((recipient) => recipient.registration_id);
    let delivered = false;
    try {
      const messages = await Promise.all(batch.map(async (recipient) => {
        if (isReminder && recipient.review_requested_at === null) {
          throw new Error("Der Versandzeitpunkt der Review-Anfrage fehlt.");
        }
        return buildReviewRequestEmail({
          to: recipient.email, firstName: recipient.first_name, eventTitle: event.title, eventDate: event.date,
          statusToken: recipient.status_token, isReminder,
          deadline: isReminder ? reviewDeadline(recipient.review_requested_at!) : initialDeadline,
        });
      }));
      // Gleiche Inhalte behalten denselben Schlüssel. Andere Empfängergruppen
      // oder eine neue Frist nach Freigabe dürfen keinen Schlüsselkonflikt erzeugen.
      const digest = createHash("sha256").update(JSON.stringify({ ids: batchIds, messages })).digest("hex").slice(0, 24);
      const key = `review-${kind}-${eventId}-${batchIds[0]}-${batchIds[batchIds.length - 1]}-${batch.length}-${digest}`;
      delivered = await sendEmailBatch(messages, key);
    } catch (error) {
      console.error("[Review] Fehler beim Vorbereiten oder Senden eines E-Mail-Batches:", error);
    }
    if (delivered) {
      sent += batch.length;
    } else {
      if (isReminder) await releaseReviewReminders(batchIds);
      else await releaseReviewRequests(batchIds);
      failed += batch.length;
    }
  }
  // Auch ohne verbliebene Reservierungen darf kein Erinnerungslauf verbraucht werden.
  if (isReminder && sent === 0) await releaseEventReviewReminder(eventId);
  await logAudit(adminEmail, isReminder ? "SEND_REVIEW_REMINDER" : "SEND_REVIEW_REQUESTS", "event", eventId, { sent, failed });
  return { ok: true, result: { kind, sent, failed } };
}

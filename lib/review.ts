import type { ReviewWouldReturn } from "./types";

export const REVIEW_WINDOW_DAYS = 14;

/** Kalendertag der Veranstaltung, unabhängig von der Zeitzone des Servers. */
export function berlinToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(now);
}

export function isReviewSendAllowed(
  eventDate: string,
  eventStatus: string,
  now = new Date()
): { allowed: true; reason: null } | { allowed: false; reason: "event_in_future" | "event_cancelled" } {
  if (eventStatus === "cancelled") return { allowed: false, reason: "event_cancelled" };
  if (eventDate > berlinToday(now)) return { allowed: false, reason: "event_in_future" };
  return { allowed: true, reason: null };
}

export function reviewDeadline(requestedAt: string | Date): Date {
  return new Date(new Date(requestedAt).getTime() + REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

export function isReviewWindowOpen(requestedAt: string | Date | null, now = new Date()): boolean {
  return requestedAt !== null && now.getTime() < reviewDeadline(requestedAt).getTime();
}

export function formatPublicName(firstName: string, lastName: string): string {
  const first = firstName.trim();
  const initial = Array.from(lastName.trim())[0]?.toLocaleUpperCase("de-DE");
  return initial ? `${first} ${initial}.`.trim() : first;
}

export interface ReviewInput {
  rating: number;
  would_return?: ReviewWouldReturn | null;
  comment?: string | null;
  publish_consent?: boolean;
}

export function parseReviewInput(body: unknown): { ok: true; value: ReviewInput } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Bitte übermittle eine gültige Bewertung." };
  }
  const data = body as Record<string, unknown>;
  if (typeof data.rating !== "number" || !Number.isInteger(data.rating) || data.rating < 1 || data.rating > 5) {
    return { ok: false, error: "Bitte wähle eine ganze Anzahl von 1 bis 5 Sternen." };
  }
  const value: ReviewInput = { rating: data.rating };

  // Fehlende Angaben bleiben aus: Ein Sternklick darf Antworten nicht löschen.
  if (data.would_return !== undefined) {
    if (data.would_return !== null && data.would_return !== "ja" && data.would_return !== "vielleicht" && data.would_return !== "nein") {
      return { ok: false, error: "Bitte wähle für die erneute Teilnahme Ja, Vielleicht oder Nein." };
    }
    value.would_return = data.would_return;
  }
  if (data.comment !== undefined) {
    if (data.comment !== null && typeof data.comment !== "string") {
      return { ok: false, error: "Der Kommentar muss ein Text sein." };
    }
    const comment = data.comment?.trim() || null;
    if (comment !== null && Array.from(comment).length > 2000) {
      return { ok: false, error: "Der Kommentar darf höchstens 2000 Zeichen lang sein." };
    }
    value.comment = comment;
  }
  if (data.publish_consent !== undefined) {
    if (typeof data.publish_consent !== "boolean") {
      return { ok: false, error: "Die Einwilligung zur Veröffentlichung muss Ja oder Nein sein." };
    }
    value.publish_consent = data.publish_consent;
  }
  return { ok: true, value };
}

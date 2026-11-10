import { describe, expect, it } from "vitest";
import {
  REVIEW_WINDOW_DAYS, berlinToday, formatPublicName, isReviewSendAllowed,
  isReviewWindowOpen, parseReviewInput, reviewDeadline,
} from "../lib/review";

describe("Berliner Kalendertag und Versand", () => {
  it.each([
    ["2026-07-01T21:59:59Z", "2026-07-01"],
    ["2026-07-01T22:00:00Z", "2026-07-02"],
    ["2026-07-01T22:30:00Z", "2026-07-02"],
    ["2026-01-01T22:59:59Z", "2026-01-01"],
    ["2026-01-01T23:00:00Z", "2026-01-02"],
    ["2026-03-29T01:30:00Z", "2026-03-29"],
    ["2026-10-25T01:30:00Z", "2026-10-25"],
  ])("bestimmt für %s den Tag %s", (now, day) => {
    expect(berlinToday(new Date(now))).toBe(day);
  });

  it("erlaubt den Versand ab dem Berliner Eventtag", () => {
    const now = new Date("2026-07-01T22:30:00Z");
    expect(isReviewSendAllowed("2026-07-02", "published", now)).toEqual({ allowed: true, reason: null });
    expect(isReviewSendAllowed("2026-07-01", "published", now)).toEqual({ allowed: true, reason: null });
    expect(isReviewSendAllowed("2026-07-03", "published", now)).toEqual({ allowed: false, reason: "event_in_future" });
  });

  it("sperrt abgesagte Veranstaltungen auch am Eventtag oder danach", () => {
    const now = new Date("2026-07-01T22:30:00Z");
    for (const day of ["2026-07-01", "2026-07-02", "2026-07-03"]) {
      expect(isReviewSendAllowed(day, "cancelled", now)).toEqual({ allowed: false, reason: "event_cancelled" });
    }
  });
});

describe("Antwortfenster", () => {
  it("endet genau 14 Tage nach dem Versand, auch über die Zeitumstellung", () => {
    expect(REVIEW_WINDOW_DAYS).toBe(14);
    const requested = new Date("2026-03-22T12:00:00Z");
    expect(reviewDeadline(requested).toISOString()).toBe("2026-04-05T12:00:00.000Z");
    expect(requested.toISOString()).toBe("2026-03-22T12:00:00.000Z");
    expect(reviewDeadline("2026-10-18T12:00:00Z").toISOString()).toBe("2026-11-01T12:00:00.000Z");
  });

  it("ist bis unmittelbar vor der Frist offen", () => {
    const requested = "2026-07-01T12:00:00Z";
    expect(isReviewWindowOpen(requested, new Date("2026-07-15T11:59:59.999Z"))).toBe(true);
    expect(isReviewWindowOpen(requested, new Date("2026-07-15T12:00:00Z"))).toBe(false);
    expect(isReviewWindowOpen(requested, new Date("2026-07-15T12:00:00.001Z"))).toBe(false);
    expect(isReviewWindowOpen(null)).toBe(false);
  });
});

describe("öffentlicher Name", () => {
  it.each([
    ["Ahmet", "Kaya", "Ahmet K."],
    ["  Ahmet ", " kaya  ", "Ahmet K."],
    ["Ahmet", "", "Ahmet"],
    [" Ahmet ", "  ", "Ahmet"],
    ["Ayşe", "özdemir", "Ayşe Ö."],
    ["", "", ""],
  ])("formatiert %s / %s", (first, last, expected) => {
    expect(formatPublicName(first, last)).toBe(expected);
  });
});

describe("parseReviewInput", () => {
  it("validiert und normalisiert vollständige Antworten", () => {
    expect(parseReviewInput({ rating: 5, would_return: "ja", comment: "  Super!  ", publish_consent: true })).toEqual({
      ok: true, value: { rating: 5, would_return: "ja", comment: "Super!", publish_consent: true },
    });
    for (const would_return of ["vielleicht", "nein", null]) {
      expect(parseReviewInput({ rating: 1, would_return })).toEqual({ ok: true, value: { rating: 1, would_return } });
    }
  });

  it.each([0, 6, 2.5, "4", null, undefined, NaN, Infinity])("weist die ungültige Sternezahl %s zurück", (rating) => {
    expect(parseReviewInput({ rating })).toEqual({ ok: false, error: expect.any(String) });
  });

  it.each([null, undefined, [], "Text", 4])("weist ungültige Anfragekörper zurück: %s", (body) => {
    expect(parseReviewInput(body).ok).toBe(false);
  });

  it("unterscheidet fehlende Felder von ausdrücklich leeren Angaben", () => {
    expect(parseReviewInput({ rating: 4 })).toEqual({ ok: true, value: { rating: 4 } });
    expect(parseReviewInput({ rating: 4, comment: undefined, would_return: undefined, publish_consent: undefined }))
      .toEqual({ ok: true, value: { rating: 4 } });
    expect(parseReviewInput({ rating: 4, comment: null, would_return: null, publish_consent: false })).toEqual({
      ok: true, value: { rating: 4, comment: null, would_return: null, publish_consent: false },
    });
    expect(parseReviewInput({ rating: 4, comment: " \n " })).toEqual({ ok: true, value: { rating: 4, comment: null } });
  });

  it("begrenzt den getrimmten Kommentar auf 2000 Zeichen wie Postgres", () => {
    expect(parseReviewInput({ rating: 4, comment: "a".repeat(2001) }).ok).toBe(false);
    expect(parseReviewInput({ rating: 4, comment: ` ${"a".repeat(2000)} ` }).ok).toBe(true);
    expect(parseReviewInput({ rating: 4, comment: "😀".repeat(2000) }).ok).toBe(true);
    expect(parseReviewInput({ rating: 4, comment: "😀".repeat(2001) }).ok).toBe(false);
  });

  it.each([
    { would_return: "yes" }, { would_return: false }, { comment: 42 },
    { publish_consent: null }, { publish_consent: "true" },
  ])("weist ungültige optionale Angaben zurück: %s", (fields) => {
    expect(parseReviewInput({ rating: 4, ...fields }).ok).toBe(false);
  });
});

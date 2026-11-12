import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ReviewForm from "../components/review/ReviewForm";
import type { ReviewTokenInfo } from "../lib/types";

const info: ReviewTokenInfo = {
  first_name: "Ahmet", event_title: "Fußball", event_date: "2026-10-18", deadline: "2026-11-01T12:00:00Z",
  is_open: true, review: { rating: 4, would_return: "vielleicht", comment: "Mehr Spielzeit bitte!", publish_consent: true },
};
const render = (changes: Partial<ReviewTokenInfo> = {}, props: Partial<React.ComponentProps<typeof ReviewForm>> = {}) =>
  renderToStaticMarkup(<ReviewForm info={{ ...info, ...changes }} {...props} />);

describe("Review-Formular", () => {
  it("zeigt den Namen, das Eventdatum und vorhandene Antworten", () => {
    const html = render();
    expect(html).toContain("Assalamu Alaikum Ahmet");
    expect(html).toContain("Fußball");
    expect(html).toContain("18. Oktober 2026");
    expect(html).toContain("Mehr Spielzeit bitte!");
    expect(html).toMatch(/aria-pressed="true"[^>]*>Vielleicht<\/button>/);
    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*checked=""/);
    expect(html).toContain('maxLength="2000"');
    expect(html).toContain("21 / 2000 Zeichen");
  });
  it("zeigt fünf zugängliche Sternbuttons mit mindestens 44 Pixel Klickfläche", () => {
    const html = render();
    for (const rating of [1, 2, 3, 4, 5]) {
      expect(html).toContain(`aria-label="${rating} von 5 Sternen" aria-pressed="${rating === 4}"`);
    }
    const stars = html.match(/<button[^>]*aria-label="\d von 5 Sternen"[^>]*>/g)!;
    expect(stars).toHaveLength(5);
    for (const star of stars) { expect(star).toContain("h-12 w-12"); expect(star).toContain('type="button"'); }
  });
  it.each([null, "", "   "])("deaktiviert die Einwilligung ohne Kommentar: %s", (comment) => {
    const html = render({ review: { ...info.review!, comment, publish_consent: false } });
    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*disabled=""/);
    expect(html).not.toMatch(/<input[^>]*checked=""/);
  });
  it("startet ohne Antwort mit leerem Formular und ohne Einwilligung", () => {
    const html = render({ review: null });
    expect(html).not.toContain('aria-pressed="true"');
    expect(html).not.toMatch(/<input[^>]*checked=""/);
    expect(html).toContain("0 / 2000 Zeichen");
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
  });
  it("zeigt die vollständige Einwilligung und verlinkt den Datenschutz", () => {
    const html = render();
    expect(html).toContain("Anfangsbuchstaben des Nachnamens");
    expect(html).toContain("innerhalb der Bewertungsfrist über diesen Link");
    expect(html).toContain("jederzeit durch Kontaktaufnahme mit dem Verein widerrufen.");
    expect(html).toContain("widerrufen.");
    expect(html).toContain('href="/datenschutz"');
    expect(html).toMatch(/<input[^>]*aria-labelledby="review-consent-label"/);
  });
  it("zeigt nach Fristablauf nur die vorhandene Sternezahl ohne Eingabefelder", () => {
    const html = render({ is_open: false });
    expect(html).toContain("Die Bewertung für dieses Event ist geschlossen.");
    expect(html).toContain('href="/#kontakt"');
    expect(html).toContain("Deine Einwilligung zur Veröffentlichung kannst du weiterhin");
    expect(html).toContain('aria-label="4 von 5 Sternen"');
    expect(html).toContain("★★★★☆");
    expect(html).not.toMatch(/<(?:input|textarea|button|form)\b/);
  });
  it("zeigt den geschlossenen Zustand auch ohne bisherige Antwort", () => {
    expect(render({ is_open: false, review: null })).toContain("Die Bewertung für dieses Event ist geschlossen.");
  });
  it("zeigt die Bestätigung mit Änderungsmöglichkeit und Frist", () => {
    const html = render({}, { submitted: true });
    expect(html).toContain("Danke für dein Feedback! 🤍");
    expect(html).toContain("Du kannst deine Bewertung bis 1. November 2026 ändern.");
    expect(html).toContain("Bewertung ändern");
    expect(html).not.toContain("<textarea");
  });
  it("zeigt Speicherbestätigung und API-Fehler sichtbar an", () => {
    expect(render({}, { saved: true })).toContain("Gespeichert ✓");
    const html = render({}, { error: "Speichern fehlgeschlagen." });
    expect(html).toContain('role="alert"');
    expect(html).toContain("Speichern fehlgeschlagen.");
  });
});

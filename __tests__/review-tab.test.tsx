import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReviewTabView } from "../components/admin/ReviewTab";
import type { EventReviewDashboard, EventReviewWithAuthor } from "../lib/types";

const data: EventReviewDashboard = {
  event: { id: 7, title: "Fußball", date: "2026-10-18", status: "published" },
  can_send: true, send_blocked_reason: null, checked_in_registrations: 5, without_email: 2,
  requested: 0, pending_initial: 3, first_requested_at: null, reminder_sent_at: null, reminder_candidates: 0,
  stats: { responses: 0, average: null, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, would_return: { ja: 0, vielleicht: 0, nein: 0 } },
  reviews: [],
};
const review: EventReviewWithAuthor = {
  id: 11, event_id: 7, registration_id: 42, rating: 4, would_return: "ja", comment: "Super!",
  publish_consent: true, published_at: null, created_at: "2026-10-19T10:00:00Z", updated_at: "2026-10-19T10:00:00Z",
  first_name: "Ahmet", last_name: "Kaya", email: "ahmet@example.com",
};
const sent = { requested: 3, first_requested_at: "2026-10-18T10:00:00Z", pending_initial: 0, reminder_candidates: 2 };
function render(changes: Partial<EventReviewDashboard> = {}, props: Partial<React.ComponentProps<typeof ReviewTabView>> = {}) {
  return renderToStaticMarkup(<ReviewTabView data={{ ...data, ...changes }} busy={false} message={null}
    onSend={() => {}} onTogglePublish={() => {}} onRefresh={() => {}} {...props} />);
}
function button(html: string, text: string) {
  return [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map((match) => match[0]).find((value) => value.includes(text));
}

describe("Review-Tab-Ansicht", () => {
  it("zeigt vor dem Event nur den Hinweis mit Datum und keine Versandbuttons", () => {
    const html = render({ can_send: false, send_blocked_reason: "event_in_future" });
    expect(html).toContain("Der Versand ist ab dem Event-Tag (18.10.2026) möglich.");
    expect(button(html, "senden")).toBeUndefined();
    expect(button(html, "Erinnerung an")).toBeUndefined();
  });
  it("sperrt bei abgesagten Events auch Nachversand und Erinnerung", () => {
    const html = render({ ...sent, pending_initial: 2, can_send: false, send_blocked_reason: "event_cancelled" });
    expect(html).toContain("Das Event wurde abgesagt – kein Review-Versand.");
    expect(button(html, "Nachsenden")).toBeUndefined();
    expect(button(html, "Erinnerung an")).toBeUndefined();
  });
  it("zeigt vor dem ersten Versand die Empfängerzahlen und den Versandbutton", () => {
    const html = render();
    expect(html).toContain("3 eingecheckte Anmeldungen mit E-Mail · 2 ohne E-Mail");
    expect(button(html, "Review an 3 senden")).toBeDefined();
    expect(html).not.toContain('id="review-results-title"');
    expect(html).toContain("Noch keine Antworten.");
  });
  it("deaktiviert den ersten Versand ohne Empfänger", () => {
    expect(button(render({ pending_initial: 0 }), "Review an 0 senden")).toContain('disabled=""');
  });
  it("zeigt nach dem Versand die Bestätigung und spätere Check-ins zum Nachsenden", () => {
    const html = render({ ...sent, pending_initial: 2 });
    expect(html).toContain("Verschickt am 18.10.2026, 12:00 · 3 Mails");
    expect(html).toContain("bg-green-50");
    expect(html).toContain("2 später Eingecheckte noch ohne Anfrage");
    expect(button(html, "Nachsenden")).toBeDefined();
  });
  it("zeigt für eine bereits versendete Erinnerung das Datum ohne Erinnerungsbutton", () => {
    const html = render({ ...sent, reminder_sent_at: "2026-10-19T10:00:00Z" });
    expect(html).toContain("Erinnerung verschickt am 19.10.2026, 12:00");
    expect(button(html, "Erinnerung an")).toBeUndefined();
  });
  it("deaktiviert eine Erinnerung ohne offene Kandidaten", () => {
    expect(button(render({ ...sent, reminder_candidates: 0 }), "Erinnerung an 0 ohne Antwort")).toContain('disabled=""');
  });
  it("deaktiviert während einer Aktion alle Versand- und Freigabebuttons", () => {
    const html = render({ ...sent, pending_initial: 2, reviews: [review] }, { busy: true });
    for (const text of ["Nachsenden", "Erinnerung an", "Auf Website zeigen", "Aktualisieren"]) {
      expect(button(html, text)).toContain('disabled=""');
    }
  });
  it("zeigt gesendete und fehlgeschlagene Nachrichten sowie API-Fehler", () => {
    const html = render({}, { message: { kind: "initial", sent: 2, failed: 1 }, error: "Reviews benötigen eine Datenbank (POSTGRES_URL)." });
    expect(html).toContain("2 gesendet");
    expect(html).toContain("1 fehlgeschlagen – per Nachsenden erneut versuchen");
    expect(html).toContain('role="alert"');
    expect(html).toContain("Reviews benötigen eine Datenbank (POSTGRES_URL).");
  });
  it("berechnet Kennzahlen mit deutschem Komma und Ja-Anteil unter beantworteten Angaben", () => {
    const html = render({ ...sent, requested: 10, stats: {
      responses: 5, average: 4.2, distribution: { 1: 0, 2: 0, 3: 1, 4: 2, 5: 2 },
      would_return: { ja: 2, vielleicht: 1, nein: 1 },
    } });
    expect(html).toContain("4,2 ★");
    expect(html.replace(/\u00a0/g, " ")).toContain("5 von 10 (50 %)");
    expect(html).toContain("2 von 4 Angaben: Ja");
    const distributions = [...html.matchAll(/aria-label="(\d) Sterne: (\d) Antworten"/g)].map((match) => [match[1], match[2]]);
    expect(distributions).toEqual([["5", "2"], ["4", "2"], ["3", "1"], ["2", "0"], ["1", "0"]]);
    expect(html).toContain("width:40%");
  });
  it("zeigt ohne Antworten weder NaN noch einen erfundenen Durchschnitt", () => {
    const html = render({ ...sent });
    expect(html).toContain("Noch keine Angabe");
    expect(html).not.toContain("NaN");
    expect(html).toContain("width:0%");
  });
  it("zeigt Namen, Sterne, Kommentar, Wiederteilnahme und Datum", () => {
    const html = render({ ...sent, reviews: [review] });
    expect(html).toContain("Ahmet Kaya");
    expect(html).toContain('aria-label="4 von 5 Sternen"');
    expect(html).toContain("Wieder dabei: Ja");
    expect(html).toContain("Super!");
    expect(html).toContain("19.10.2026, 12:00");
  });
  it("bietet die Freigabe nur für einen Kommentar mit Einwilligung an", () => {
    const html = render({ ...sent, reviews: [review] });
    expect(html).toContain("Darf veröffentlicht werden");
    expect(button(html, "Auf Website zeigen")).toBeDefined();
    expect(button(html, "Von Website nehmen")).toBeUndefined();
    const noConsent = render({ ...sent, reviews: [{ ...review, publish_consent: false }] });
    expect(button(noConsent, "Auf Website zeigen")).toBeUndefined();
    expect(noConsent).not.toContain("Darf veröffentlicht werden");
    expect(button(render({ ...sent, reviews: [{ ...review, comment: null }] }), "Auf Website zeigen")).toBeUndefined();
  });
  it("bietet bei veröffentlichten Kommentaren die Rücknahme an", () => {
    const html = render({ ...sent, reviews: [{ ...review, published_at: "2026-10-19T11:00:00Z" }] });
    expect(button(html, "Von Website nehmen")).toBeDefined();
    expect(button(html, "Auf Website zeigen")).toBeUndefined();
  });
  it("sortiert Antworten ohne Änderung der Props absteigend nach Datum", () => {
    const reviews = [review, { ...review, id: 12, first_name: "Ali", created_at: "2026-10-20T11:00:00Z" }];
    const html = render({ ...sent, reviews });
    expect(html.indexOf("Ali Kaya")).toBeLessThan(html.indexOf("Ahmet Kaya"));
    expect(reviews[0].id).toBe(11);
  });
});

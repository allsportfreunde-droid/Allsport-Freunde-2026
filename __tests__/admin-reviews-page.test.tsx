import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReviewsOverviewView } from "../components/admin/ReviewsOverviewView";
import Sidebar from "../components/admin/Sidebar";
import type { EventReviewWithAuthor, ReviewOverviewResponse } from "../lib/types";

vi.mock("next/navigation", () => ({ usePathname: () => "/admin/reviews" }));
vi.mock("@/app/admin/actions/auth", () => ({ logout: vi.fn() }));

const review: EventReviewWithAuthor = {
  id: 11, event_id: 7, registration_id: 42, rating: 5, would_return: "ja", comment: "Ein toller Nachmittag!",
  publish_consent: true, published_at: null, created_at: "2026-10-18T10:00:00Z", updated_at: "2026-10-18T10:00:00Z",
  first_name: "Ahmet", last_name: "Kaya", email: "ahmet@example.com", event_title: "Fußball",
};
const empty: ReviewOverviewResponse = { events: [], pending_approval: [], published: [] };
const data: ReviewOverviewResponse = {
  events: [
    { event_id: 7, title: "Fußball", date: "2026-10-18", category: "fussball", requested: 4, responses: 1, response_rate: 0.25, average: 5, would_return_yes_rate: 1 },
    { event_id: 8, title: "Fitness", date: "2026-10-19", category: "fitness", requested: 6, responses: 3, response_rate: 0.5, average: 3, would_return_yes_rate: 0.5 },
  ],
  pending_approval: [review],
  published: [{ ...review, id: 12, first_name: "Ali", published_at: "2026-10-19T11:00:00Z" }],
};

function render(changes: Partial<ReviewOverviewResponse> = {}, props: Partial<React.ComponentProps<typeof ReviewsOverviewView>> = {}) {
  return renderToStaticMarkup(<ReviewsOverviewView data={{ ...data, ...changes }} busyId={null} onTogglePublish={() => {}} {...props} />);
}
function section(html: string, title: string) {
  return html.match(new RegExp(`<section[^>]*aria-labelledby="${title}"[^>]*>([\\s\\S]*?)<\\/section>`))![1];
}

describe("Admin-Review-Übersicht", () => {
  it("zeigt die Freigabewarteschlange mit Namen, Kommentar, Datum und öffentlicher Namensvorschau", () => {
    const html = section(render(), "reviews-pending-title");
    expect(html).toContain("Freigabe ausstehend (1)");
    expect(html).toContain("Ahmet Kaya");
    expect(html).toContain("erscheint als: Ahmet K.");
    expect(html).toContain("Fußball");
    expect(html).toContain("Ein toller Nachmittag!");
    expect(html).toContain('aria-label="5 von 5 Sternen"');
    expect(html).toContain("18.10.2026, 12:00");
    expect(html).toContain("Auf Website zeigen");
    expect(html).not.toContain("Ablehnen");
    expect(html).not.toContain("ahmet@example.com");
  });

  it("verlinkt Events mit dem Deep Link zum Review-Tab", () => {
    const html = section(render(), "reviews-events-title");
    expect(html).toContain('href="/admin/events/7/dashboard?tab=review"');
    expect(html).toContain('href="/admin/events/8/dashboard?tab=review"');
  });

  it("zeigt die Events absteigend nach Datum, als Tabelle und mobile Karten", () => {
    const html = section(render(), "reviews-events-title");
    expect(html.indexOf("Fitness")).toBeLessThan(html.indexOf("Fußball"));
    expect(html).toContain("hidden md:block overflow-x-auto");
    expect(html).toContain("md:hidden space-y-3");
    expect(html).toContain("Angefragt");
    expect(html).toContain("Wieder dabei: Ja");
    expect(html).toContain("19.10.2026");
    expect(data.events[0].event_id).toBe(7);
  });

  it("gewichtet den Gesamtdurchschnitt mit den Antworten und berechnet die gesamte Antwortquote", () => {
    const html = section(render(), "reviews-events-title").replace(/\u00a0/g, " ");
    expect(html).toContain("3,5 ★");
    expect(html).toContain("40 %");
    expect(html).toContain("4 von 10 Anfragen");
    expect(html).toContain("Antworten insgesamt");
  });

  it("rundet erst nach der Gewichtung der ungerundeten Event-Durchschnitte", () => {
    const html = section(render({ events: [
      { ...data.events[0], requested: 5, responses: 5, average: 21 / 5 },
      { ...data.events[1], requested: 3, responses: 3, average: 13 / 3 },
    ] }), "reviews-events-title");
    // 34 Sterne aus acht Antworten ergeben 4,25; vorzeitiges Runden ergäbe 4,2375.
    expect(html).toContain("4,3 ★");
  });

  it("zeigt veröffentlichte Kommentare mit Freigabedatum und Rücknahmebutton", () => {
    const html = section(render(), "reviews-published-title");
    expect(html).toContain("Auf der Website (1)");
    expect(html).toContain("Ali Kaya");
    expect(html).toContain("Freigegeben am");
    expect(html).toContain("19.10.2026, 13:00");
    expect(html).toContain("Von Website nehmen");
    expect(html).not.toContain("Auf Website zeigen");
  });

  it("zeigt alle drei Leerzustände und keine erfundenen Kennzahlen", () => {
    const html = render(empty);
    expect(html).toContain("Keine Kommentare warten auf Freigabe.");
    expect(html).toContain("Noch keine Reviews verschickt.");
    expect(html).toContain("Noch keine Kommentare auf der Website.");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("Infinity");
    expect(html).not.toContain("0,0 ★");
  });

  it("zeigt für unbeantwortete Events keine Sternzahl oder Wiederteilnahmequote", () => {
    const html = render({ events: [{ ...data.events[0], responses: 0, response_rate: 0, average: null, would_return_yes_rate: null }] });
    expect(html).toContain("0 von 4 Anfragen");
    expect(html).not.toContain("0,0 ★");
    expect(html).not.toContain("NaN");
  });

  it.each([{ busyId: 11 }, { busy: true }])("sperrt alle Freigabeaktionen während einer Anfrage: %s", (props) => {
    const html = render({}, props);
    const buttons = [...html.matchAll(/<button\b[^>]*>/g)].map((match) => match[0]);
    expect(buttons).toHaveLength(2);
    for (const button of buttons) expect(button).toContain('disabled=""');
  });

  it("zeigt auch bei fehlendem Nachnamen eine passende Namensvorschau", () => {
    expect(render({ pending_approval: [{ ...review, last_name: " " }] })).toContain("erscheint als: Ahmet");
  });
});

describe("Reviews-Navigation", () => {
  it("zeigt Reviews direkt nach Check-In und hebt den Eintrag als aktiv hervor", () => {
    const html = renderToStaticMarkup(<Sidebar collapsed={false} onToggle={() => {}} />);
    const links = [...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map((match) => match[0]);
    const index = links.findIndex((link) => link.includes('href="/admin/reviews"'));
    expect(index).toBeGreaterThan(0);
    expect(links[index - 1]).toContain('href="/admin/checkin"');
    expect(links[index]).toContain("bg-green-600 text-white");
    expect(links[index]).toContain("Reviews");
    expect(links[index]).toContain("lucide-star");
  });
});

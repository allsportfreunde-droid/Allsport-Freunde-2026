import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import RegistrationDetailModal from "../components/RegistrationDetailModal";
import type { RegistrationDetail } from "../lib/types";

const person = (id: string, overrides: object = {}) => ({
  id, registration_id: 12, first_name: "Anna", last_name: `Muster${id}`, is_child: false, discount: null,
  checked_in_at: null, cancelled_at: null, created_at: "2026-11-01T10:00:00Z", ...overrides,
});

function detail(overrides: Partial<RegistrationDetail> = {}): RegistrationDetail {
  return {
    id: 12, event_id: 3, email: "anna@example.de", phone: "0170", status: "pending",
    created_at: "2026-11-01T10:00:00Z", first_name: "Anna", last_name: "Muster",
    event_title: "Schwimmen", event_date: "2099-06-01", event_category: "schwimmen",
    event_time: "18:00", event_location: "Bad", person_count: 2, child_count: 0,
    paid_at: null, amount_paid: null, stripe_session_id: null, stripe_payment_intent_id: null,
    discount_available: true,
    persons: [person("p1"), person("p2", { discount: "reduced_50" })],
    ...overrides,
  } as RegistrationDetail;
}

const render = (data: RegistrationDetail, editable = true) =>
  renderToStaticMarkup(
    <RegistrationDetailModal open onClose={() => {}} loading={false} data={data} onChange={editable ? () => {} : undefined} />
  );

describe("Ermäßigung in der Anmeldungs-Detailansicht", () => {
  it("bietet bei unbezahlten Anmeldungen je Person die Auswahl an", () => {
    const html = render(detail());
    expect(html.match(/<select/g)).toHaveLength(2);
    expect(html).toContain("Voller Preis");
    expect(html).toContain("−50 % (Schwerbehinderung)");
    expect(html).toContain("Offene Zahlungslinks werden geschlossen.");
  });

  it("lässt stornierte Personen aus", () => {
    const html = render(detail({ persons: [person("p1"), person("p2", { cancelled_at: "2026-11-02T10:00:00Z" })] }));
    expect(html.match(/<select/g)).toHaveLength(1);
  });

  it("sperrt die Auswahl bei bezahlten Anmeldungen und verweist auf Stripe", () => {
    const html = render(detail({ paid_at: "2026-11-02T10:00:00Z", amount_paid: 18 }));
    expect(html).not.toContain("<select");
    expect(html).toContain("Bereits bezahlt – Ermäßigung nicht mehr änderbar");
  });

  it("zeigt nichts davon bei Events ohne verbindlichen Preis oder ohne Bearbeiten", () => {
    for (const html of [render(detail({ discount_available: false })), render(detail(), false)]) {
      expect(html).not.toContain("<select");
      expect(html).not.toContain("Offene Zahlungslinks");
    }
  });
});

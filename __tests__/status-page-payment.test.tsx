import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import StatusPage from "../components/status/StatusPage";
import { formatEuro } from "../lib/finance";
import type { RegistrationStatusInfo } from "../lib/types";

function info(overrides: Partial<RegistrationStatusInfo> = {}): RegistrationStatusInfo {
  return {
    id: 1, first_name: "Test", last_name: "Person", email: "test@example.com", guests: 0,
    status: "pending", status_changed_at: null, status_note: null, created_at: "2026-09-15T10:00:00Z",
    event_title: "Sport", event_date: "2099-06-01", event_time: "12:00", event_location: "Halle",
    event_category: "fussball", is_waitlist: false, paid_at: null, event_cancellation_deadline: null,
    event_price: "10 €", event_entry_price: 10, event_child_entry_price: null,
    event_dress_code: "Sport", qr_code: null, checked_in_at: null,
    persons: [{
      id: "p1", registration_id: 1, first_name: "Test", last_name: "Person",
      is_child: false, checked_in_at: null, cancelled_at: null, created_at: "2026-09-15T10:00:00Z",
    }],
    ...overrides,
  };
}
const render = (overrides: Partial<RegistrationStatusInfo>, paymentResult: "erfolg" | "abbruch" | null = null) =>
  renderToStaticMarkup(<StatusPage info={info(overrides)} paymentResult={paymentResult} />);

describe("Statusseite nach der Rückkehr von Stripe", () => {
  it("trennt bei bezahlter und bestätigter Anmeldung Zahlung, Teilnahme und QR-Hinweis", () => {
    const html = render({
      status: "approved", payment_state: "paid", paid_at: "2026-09-15T10:00:00Z",
      amount_paid: 10, qr_code: "data:image/png;base64,abc",
    }, "erfolg");
    expect(html).toContain("Zahlung eingegangen");
    expect(html).toContain("Deine Teilnahme ist bestätigt.");
    expect(html).toContain("Deinen Check-In QR-Code findest du unten.");
    expect(html).toContain('src="data:image/png;base64,abc"');
    expect(html).toContain(`· ${formatEuro(10)}`);
    expect(html).not.toContain("Jetzt bezahlen");
  });

  it("lässt eine bezahlte Anmeldung storniert und verspricht keine Erstattung oder Bestätigung", () => {
    const html = render({
      status: "cancelled", payment_state: "paid", paid_at: "2026-09-15T10:00:00Z",
      amount_paid: 10, qr_code: "data:image/png;base64,abc",
    }, "erfolg");
    expect(html).toContain("Zahlung eingegangen");
    expect(html).toContain("Deine Anmeldung bleibt storniert.");
    expect(html).toContain("Eine mögliche Erstattung wird geprüft.");
    expect(html).not.toContain("Deine Teilnahme ist bestätigt.");
    expect(html).not.toContain("Deinen Check-In QR-Code findest du unten.");
    expect(html).not.toContain('src="data:image/png;base64,abc"');
  });

  it("leitet auch bei einer abgelehnten Anmeldung keine Bestätigung aus der Zahlung ab", () => {
    const html = render({
      status: "rejected", payment_state: "paid", paid_at: "2026-09-15T10:00:00Z",
    }, "erfolg");
    expect(html).toContain("Zahlung eingegangen");
    expect(html).toContain("Deine Anmeldung bleibt abgelehnt.");
    expect(html).toContain("Eine mögliche Erstattung wird geprüft.");
    expect(html).not.toContain("Deine Teilnahme ist bestätigt.");
  });

  it("zeigt bei laufendem SEPA-Einzug die bestätigte Teilnahme getrennt an", () => {
    const html = render({ status: "approved", payment_state: "processing", checkout_amount: 10 }, "erfolg");
    expect(html).toContain("SEPA-Einzug gestartet");
    expect(html).toContain("Deine Teilnahme ist bestätigt.");
    expect(html).not.toContain("Zahlung eingegangen");
    expect(html).not.toContain("Jetzt bezahlen");
    expect(html).toContain(`SEPA-Einzug läuft · ${formatEuro(10)}. Bitte nicht erneut bezahlen.`);
  });

  it("lässt eine Anmeldung trotz laufendem SEPA-Einzug storniert und kündigt keine QR-Mail an", () => {
    const html = render({
      status: "cancelled", payment_state: "processing", checkout_amount: 10,
      qr_code: "data:image/png;base64,abc",
    }, "erfolg");
    expect(html).toContain("SEPA-Einzug gestartet");
    expect(html).toContain("Deine Anmeldung bleibt storniert.");
    expect(html).not.toContain("Deine Teilnahme ist bestätigt.");
    expect(html).not.toContain("QR-Code findest du unten");
    expect(html).not.toContain("QR-Code kommt per E-Mail");
    expect(html).not.toContain('src="data:image/png;base64,abc"');
  });

  it("vertraut dem Erfolgsparameter bei offenem Zahlungsstand nicht", () => {
    const html = render({ payment_state: "open" }, "erfolg");
    expect(html).not.toContain("Zahlung eingegangen");
    expect(html).not.toContain("SEPA-Einzug gestartet");
    expect(html).not.toContain("Deine Teilnahme ist bestätigt.");
    expect(html).toContain("Jetzt bezahlen");
  });

  it("vertraut dem Erfolgsparameter bei noch laufender Prüfung nicht", () => {
    const html = render({ payment_state: "checking" }, "erfolg");
    expect(html).toContain("wird noch geprüft");
    expect(html).not.toContain("Zahlung eingegangen");
    expect(html).not.toContain("Deine Teilnahme ist bestätigt.");
    expect(html).not.toContain("Jetzt bezahlen");
  });

  it("lässt die Teilnahme nach fehlgeschlagenem Einzug bestätigt und erneutes Bezahlen zu", () => {
    const html = render({ status: "approved", payment_state: "failed" }, "erfolg");
    expect(html).toContain("Der SEPA-Einzug ist fehlgeschlagen.");
    expect(html).toContain("Deine Teilnahme bleibt bestätigt.");
    expect(html).toContain("Du kannst die Zahlung erneut starten.");
    expect(html).toContain("Jetzt bezahlen");
    expect(html).not.toContain("Zahlung eingegangen");
    expect(html).not.toContain("SEPA-Einzug gestartet");
  });

  it("verbirgt den Betrag, wenn er für den laufenden Einzug nicht bekannt ist", () => {
    const html = render({ payment_state: "processing", checkout_amount: null });
    expect(html).toContain("SEPA-Einzug läuft. Bitte nicht erneut bezahlen.");
    expect(html).not.toContain("NaN");
  });

  it("zeigt den QR-Code bereits, solange der Einzug noch läuft", () => {
    const html = render({ status: "approved", payment_state: "processing", qr_code: "data:image/png;base64,abc" });
    expect(html).toContain('src="data:image/png;base64,abc"');
    expect(html).not.toContain("Jetzt bezahlen");
  });

  it("kommt ohne Zahlungsstand aus einer älteren API-Antwort aus", () => {
    expect(render({})).toContain("Jetzt bezahlen");
    const paid = render({ status: "approved", paid_at: "2026-09-15T10:00:00Z", amount_paid: 10 }, "erfolg");
    expect(paid).toContain("Zahlung eingegangen");
    expect(paid).not.toContain("Jetzt bezahlen");
  });

  it("zeigt bei Abbruch-Rückkehr und bezahltem Zahlungsstand keine Abbruchbehauptung", () => {
    const html = render({ payment_state: "paid", paid_at: "2026-09-15T10:00:00Z" }, "abbruch");
    expect(html).toContain("Bezahlt am");
    expect(html).not.toContain("abgebrochen");
    expect(html).not.toContain("Checkout-Seite verlassen");
  });

  it("zeigt bei Abbruch-Rückkehr und laufendem SEPA-Einzug keine Abbruchbehauptung", () => {
    const html = render({ payment_state: "processing" }, "abbruch");
    expect(html).toContain("SEPA-Einzug läuft");
    expect(html).not.toContain("abgebrochen");
    expect(html).not.toContain("Checkout-Seite verlassen");
  });

  it("zeigt bei Abbruch-Rückkehr und laufender Prüfung nur den neutralen Prüfhinweis", () => {
    const html = render({ payment_state: "checking" }, "abbruch");
    expect(html).toContain("Deine Zahlung wird noch geprüft.");
    expect(html).not.toContain("abgebrochen");
    expect(html).not.toContain("Checkout-Seite verlassen");
    expect(html).not.toContain("Jetzt bezahlen");
  });

  it("zeigt bei Abbruch-Rückkehr und offenem Zahlungsstand die neutrale Rückkehrmeldung", () => {
    const html = render({ payment_state: "open" }, "abbruch");
    expect(html).toContain("Du hast die Checkout-Seite verlassen. Deine Anmeldung bleibt bestehen.");
    expect(html).not.toContain("abgebrochen");
    expect(html).toContain("Jetzt bezahlen");
  });

  it("lässt nach Abbruch-Rückkehr und fehlgeschlagenem Zahlungsstand einen neuen Versuch zu", () => {
    const html = render({ payment_state: "failed" }, "abbruch");
    expect(html).toContain("Du hast die Checkout-Seite verlassen. Deine Anmeldung bleibt bestehen.");
    expect(html).not.toContain("abgebrochen");
    expect(html).toContain("Jetzt bezahlen");
  });
});

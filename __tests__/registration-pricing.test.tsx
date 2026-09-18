import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { calculateRegistrationPrice, formatEventPrice, formatPriceLabel } from "../lib/price";
import { formatEuro } from "../lib/finance";
import StatusPage from "../components/status/StatusPage";
import { RegistrationReceivedEmail } from "../emails/registration-received";
import type { RegistrationStatusInfo } from "../lib/types";

const event = { price: "10 €", entry_price: 10, child_entry_price: 4 };

describe("Gemeinsame Preisberechnung", () => {
  it.each([
    [3, 1, 4, 2400], [2, 2, 4, 800], [2, 0, 4, 2000],
    [3, 1, 0, 2000], [2, 2, 0, 0], [3, 1, null, 3000],
  ])("%i Personen, %i Kinder zu %s Euro ergeben %i Cent", (persons, children, childPrice, expected) => {
    expect(calculateRegistrationPrice({ ...event, child_entry_price: childPrice }, persons!, children!)?.totalCents).toBe(expected);
  });

  it("rechnet mit ganzen Cent", () => {
    expect(calculateRegistrationPrice({ price: "0,10 €", entry_price: 0.1, child_entry_price: 0.2 }, 3, 1)?.totalCents).toBe(40);
  });

  it("unterscheidet fehlenden Kinderpreis von kostenlos", () => {
    expect(formatPriceLabel(10, 2, "10 €", null, 2)).toBe(`2 × ${formatEuro(10)} = ${formatEuro(20)}`);
    expect(formatPriceLabel(10, 2, "10 €", 0, 2)).toBeNull();
  });

  it("beschriftet eine gemischte Anmeldung nachvollziehbar", () => {
    expect(formatPriceLabel(10, 3, "10 €", 4, 1)).toBe(`2 Erwachsene × ${formatEuro(10)} + 1 Kind × ${formatEuro(4)} = ${formatEuro(24)}`);
    expect(formatEventPrice(event)).toContain(`Kinder: ${formatEuro(4)}`);
  });

  it("fordert bei Freitext weiterhin keinen Erwachsenenbetrag ein", () => {
    expect(calculateRegistrationPrice({ price: "Spende willkommen", entry_price: 10 }, 2)).toBeNull();
  });

  it("berechnet einen eigenen Kinderpreis auch bei kostenlosen Erwachsenen", () => {
    expect(calculateRegistrationPrice({ price: "Kostenlos", entry_price: null, child_entry_price: 4 }, 2, 1)?.totalCents).toBe(400);
  });

  it("berechnet für eine leere Anmeldung keinen Betrag", () => {
    expect(calculateRegistrationPrice(event, 0, 0)).toBeNull();
  });
});

function statusInfo(childCount: number, childPrice: number): RegistrationStatusInfo {
  return {
    id: 1, first_name: "Test", last_name: "Familie", email: "test@example.com", guests: 1,
    status: "pending", status_changed_at: null, status_note: null, created_at: "2026-09-15T10:00:00Z",
    event_title: "Sport", event_date: "2099-06-01", event_time: "12:00", event_location: "Halle",
    event_category: "fussball", is_waitlist: false, paid_at: null, event_cancellation_deadline: null,
    event_price: "10 €", event_entry_price: 10, event_child_entry_price: childPrice,
    event_dress_code: "Sport", qr_code: null, checked_in_at: null,
    persons: [0, 1].map((index) => ({
      id: String(index), registration_id: 1, first_name: "Test", last_name: String(index),
      is_child: index < childCount, checked_in_at: null, cancelled_at: null, created_at: "2026-09-15T10:00:00Z",
    })),
  };
}

describe("Preis auf Statusseite und in Anmelde-E-Mail", () => {
  it("zeigt Kinder-Freitext und berechnet zusätzlich den festen Betrag", () => {
    const info = { ...statusInfo(1, 4), event_child_price: "Kinderbeitrag" };
    const html = renderToStaticMarkup(<StatusPage info={info} />);
    expect(html).toContain(`Kinder: Kinderbeitrag (${formatEuro(4)})`);
    expect(html).toContain(formatEuro(14));
    expect(html).toContain("Jetzt bezahlen");
  });
  it("zeigt beide Preise und den richtigen Gesamtbetrag", () => {
    const html = renderToStaticMarkup(<StatusPage info={statusInfo(1, 4)} />);
    expect(html).toContain(`1 Erwachsener × ${formatEuro(10)} + 1 Kind × ${formatEuro(4)}`);
    expect(html).toContain(formatEuro(14));
    expect(html).toContain("Jetzt bezahlen");
  });

  it("zeigt für kostenlose Kinder manuelle Prüfung statt Zahlungsaufforderung", () => {
    const html = renderToStaticMarkup(<StatusPage info={statusInfo(2, 0)} />);
    expect(html).toContain("Deine Anmeldung wird derzeit geprüft");
    expect(html).not.toContain("Jetzt bezahlen");
    expect(html).not.toContain("Offen ist noch");
  });

  it("zeigt nach der Zahlung den gebuchten Betrag statt aktueller Eventpreise", () => {
    const info = { ...statusInfo(1, 99), status: "approved" as const, paid_at: "2026-09-15T10:00:00Z", amount_paid: 14 };
    const html = renderToStaticMarkup(<StatusPage info={info} />);
    expect(html).toContain(formatEuro(14));
    expect(html).not.toContain(formatEuro(109));
    expect(html).not.toContain("Jetzt bezahlen");
  });

  it("verschickt bei 0 Euro keine Zahlungsaufforderung", () => {
    const html = renderToStaticMarkup(<RegistrationReceivedEmail
      firstName="Test" eventTitle="Sport" eventDate="01.06.2099" eventTime="12:00"
      eventLocation="Halle" statusUrl="https://example.com/status/test"
      priceLabel={formatPriceLabel(10, 2, "10 €", 0, 2) ?? undefined}
    />);
    expect(html).toContain("wird nun geprüft");
    expect(html).not.toContain("Jetzt bezahlen");
  });
});

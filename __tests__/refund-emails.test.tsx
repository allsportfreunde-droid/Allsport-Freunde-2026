/**
 * Rendert die beiden Storno-E-Mails einmal durch.
 *
 * Eine kaputte Vorlage fällt sonst erst beim Versand auf – also genau dann,
 * wenn jemand storniert hat und auf seine Bestätigung wartet.
 */

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RegistrationCancelledEmail } from "@/emails/registration-cancelled";
import { RefundDueAdminEmail } from "@/emails/refund-due-admin";

const storno = (extra: Partial<Parameters<typeof RegistrationCancelledEmail>[0]> = {}) =>
  renderToStaticMarkup(
    RegistrationCancelledEmail({
      firstName: "Halit",
      eventTitle: "Hallenfußball",
      eventDate: "Dienstag, 15. September 2026",
      eventTime: "18:00",
      eventLocation: "Sporthalle Budenheim",
      statusUrl: "https://example.test/status/abc",
      ...extra,
    })
  );

describe("RegistrationCancelledEmail", () => {
  it("bestätigt eine vollständige Stornierung ohne Betrag", () => {
    const html = storno();
    expect(html).toContain("Anmeldung storniert");
    expect(html).not.toContain("Erstattung");
  });

  it("nennt den Erstattungsbetrag", () => {
    const html = storno({ refundLabel: "22,50 €" });
    expect(html).toContain("Erstattung: 22,50 €");
    expect(html).toContain("vollständige Betrag");
  });

  it("benennt bei einer Teilstornierung Person und Rest", () => {
    const html = storno({
      cancelledPersons: ["Ömer Saygili"],
      remainingPersons: 2,
      refundLabel: "7,50 €",
    });
    expect(html).toContain("Abmeldung bestätigt");
    expect(html).toContain("Ömer Saygili");
    expect(html).toContain("2 Personen bleiben");
    expect(html).toContain("Erstattung: 7,50 €");
  });
});

describe("RefundDueAdminEmail", () => {
  const admin = (stripeUrl: string | null) =>
    renderToStaticMarkup(
      RefundDueAdminEmail({
        eventTitle: "Hallenfußball",
        eventDate: "Dienstag, 15. September 2026",
        participantEmail: "teilnehmer@example.test",
        personNames: ["Ömer Saygili"],
        amountLabel: "7,50 €",
        remainingPersons: 2,
        stripeUrl,
        statusUrl: "https://example.test/status/abc",
        adminUrl: "https://example.test/admin/registrations?suche=x",
      })
    );

  it("führt Betrag und alle drei Links auf", () => {
    const html = admin("https://dashboard.stripe.com/test/payments/pi_1");
    expect(html).toContain("Erstattung fällig");
    expect(html).toContain("7,50 €");
    expect(html).toContain("dashboard.stripe.com/test/payments/pi_1");
    expect(html).toContain("/admin/registrations?suche=x");
    expect(html).toContain("/status/abc");
  });

  it("sagt es, wenn keine Stripe-Zahlung hinterlegt ist", () => {
    const html = admin(null);
    expect(html).toContain("keine Stripe-Zahlung");
    expect(html).not.toContain("dashboard.stripe.com");
  });
});

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import EventForm from "../components/admin/EventForm";
import type { EventWithRegistrations } from "../lib/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

function renderForm(extra: Partial<EventWithRegistrations> = {}) {
  const event: EventWithRegistrations = {
    id: 1, title: "Sport", category: "fussball", description: "", date: "2099-06-01", time: "12:00",
    location: "Halle", parking_location: null, price: "10 €", entry_price: 10,
    dress_code: "Sport", max_participants: 10, max_per_email: 5, status: "draft",
    cancellation_reason: null, published_at: null, created_at: "2026-09-16", current_participants: 0,
    ...extra,
  };
  return renderToStaticMarkup(<EventForm event={event} />);
}

function renderChildFields(extra: Partial<EventWithRegistrations>) {
  return renderForm(extra).split("Preis Kinder</label>")[1].split('id="tier_prices_title"')[0];
}

describe("Kinderpreis-Modi im Adminformular", () => {
  it("bietet keine Stripe-ID-Eingabe mehr an", () => {
    const html = renderForm({ stripe_child_price_id: "price_child", child_entry_price: 0 });
    expect(html).not.toContain(">Stripe</button>");
    expect(html).not.toContain("price_1AbCdEfGhIjKlMnO");
    expect(html).not.toContain('id="child_stripe_price_id"');
  });

  it("öffnet ein Event ohne Kinderbetrag mit dem Erwachsenenpreis", () => {
    const html = renderChildFields({ child_entry_price: null });
    expect(html).toContain(">Wie Erwachsene</button>");
    expect(html).toContain("Kinder zahlen den Erwachsenenpreis.");
    expect(html).toMatch(/id="child_price_amount"[^>]*disabled=""[^>]*value="10,00"/);
  });

  it("öffnet einen Kinderbetrag als bearbeitbares Betragsfeld, auch 0 €", () => {
    for (const [amount, value] of [[4.5, "4,50"], [0, "0,00"]] as const) {
      const html = renderChildFields({ child_entry_price: amount });
      expect(html).not.toContain('id="child_price_text"');
      const input = html.match(/<input[^>]*id="child_price_amount"[^>]*>/)![0];
      expect(input).toContain(`value="${value}"`);
      expect(input).not.toContain('disabled=""');
    }
  });

  it("öffnet Freitext zusammen mit dem bearbeitbaren festen Kinderbetrag", () => {
    const html = renderChildFields({ child_price: "Kinderbeitrag", child_entry_price: 3 });
    expect(html).toContain('id="child_price_text"');
    expect(html).toContain('value="Kinderbeitrag"');
    expect(html).toContain("Fester Betrag pro Kind für den Checkout");
    const input = html.match(/<input[^>]*id="child_price_amount"[^>]*>/)![0];
    expect(input).toContain('value="3,00"');
    expect(input).not.toContain('disabled=""');
  });
});

describe("Preisübersicht mit Ermäßigungen", () => {
  it("zeigt die sechs berechneten Preise", () => {
    const html = renderForm({ price: "12,00 €", entry_price: 12, child_entry_price: 6 });
    for (const amount of ["12,00", "8,40", "6,00", "4,20", "3,00"]) expect(html).toContain(amount);
    expect(html).toContain("Beim Speichern werden diese sechs Preise als Produkt in Stripe angelegt.");
  });

  it("meldet ein vollständig angelegtes Produkt mit Link", () => {
    const html = renderForm({
      stripe_product_id: "prod_1", stripe_product_url: "https://dashboard.stripe.com/test/products/prod_1",
      stripe_price_id: "price_a", stripe_child_price_id: "price_c",
      stripe_adult_reduced_30_price_id: "price_a30", stripe_adult_reduced_50_price_id: "price_a50",
      stripe_child_reduced_30_price_id: "price_c30", stripe_child_reduced_50_price_id: "price_c50",
    });
    expect(html).toContain("In Stripe angelegt");
    expect(html).toContain('href="https://dashboard.stripe.com/test/products/prod_1"');
  });

  it("legt bei Freitext kein Produkt an", () => {
    const html = renderForm({ price: "Spende willkommen", entry_price: null });
    expect(html).toContain("Kein verbindlicher Preis – es wird kein Stripe-Produkt angelegt");
  });
});

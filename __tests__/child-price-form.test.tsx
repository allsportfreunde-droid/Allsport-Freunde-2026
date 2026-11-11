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
    expect(html).toContain(">Kind<");
    expect(html).toContain("Beim Speichern entstehen in Stripe sechs Produkte – eines je Preis.");
  });

  it("zeigt ohne Kinderpreis nur die Eintrittszeile und drei Produkte", () => {
    const html = renderForm({ price: "10,00 €", entry_price: 10, child_entry_price: null });
    expect(html).toContain(">Eintritt<");
    expect(html).not.toContain(">Kind<");
    expect(html).toContain("Beim Speichern entstehen in Stripe drei Produkte – eines je Preis.");
  });

  it("verlinkt bei aktuellem Abgleich jeden Betrag auf sein Produkt", () => {
    const tiers = ["adult", "adult_reduced_30", "adult_reduced_50"] as const;
    const html = renderForm({
      stripe_tier_products: { adult: "prod_a", adult_reduced_30: "prod_a30", adult_reduced_50: "prod_a50" },
      stripe_product_urls: Object.fromEntries(tiers.map((t) => [t, `https://dashboard.stripe.com/test/products/${t}`])),
      stripe_price_id: "price_a", stripe_adult_reduced_30_price_id: "price_a30", stripe_adult_reduced_50_price_id: "price_a50",
    });
    expect(html).toContain("In Stripe angelegt");
    for (const tier of tiers) expect(html).toContain(`href="https://dashboard.stripe.com/test/products/${tier}"`);
  });

  it("verlinkt nicht, solange ein Produkt fehlt", () => {
    const html = renderForm({
      stripe_tier_products: { adult: "prod_a" },
      stripe_product_urls: { adult: "https://dashboard.stripe.com/test/products/prod_a" },
      stripe_price_id: "price_a",
    });
    expect(html).not.toContain("In Stripe angelegt");
    expect(html).not.toContain("dashboard.stripe.com");
    expect(html).toContain("Beim Speichern werden die drei Stripe-Produkte aktualisiert – eines je Preis.");
  });

  it("legt bei Freitext kein Produkt an", () => {
    const html = renderForm({ price: "Spende willkommen", entry_price: null });
    expect(html).toContain("Kein verbindlicher Preis – es wird kein Stripe-Produkt angelegt");
  });
});

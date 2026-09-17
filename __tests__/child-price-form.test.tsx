import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import EventForm from "../components/admin/EventForm";
import type { EventWithRegistrations } from "../lib/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

function renderChildFields(extra: Partial<EventWithRegistrations>) {
  const event: EventWithRegistrations = {
    id: 1, title: "Sport", category: "fussball", description: "", date: "2099-06-01", time: "12:00",
    location: "Halle", parking_location: null, price: "10 €", entry_price: 10,
    dress_code: "Sport", max_participants: 10, max_per_email: 5, status: "draft",
    cancellation_reason: null, published_at: null, created_at: "2026-09-16", current_participants: 0,
    ...extra,
  };
  return renderToStaticMarkup(<EventForm event={event} />).split("Preis Kinder</label>")[1].split('for="dress_code"')[0];
}

describe("Kinderpreis-Modi im Adminformular", () => {
  it("zeigt alle drei Modi und öffnet eine hinterlegte Stripe-ID im Stripe-Modus", () => {
    const html = renderChildFields({ stripe_child_price_id: "price_child", child_entry_price: 0 });
    expect(html).toContain(">Stripe</button>");
    expect(html).toContain(">Betrag</button>");
    expect(html).toContain(">Freitext</button>");
    expect(html).toContain('id="child_stripe_price_id"');
    expect(html).toMatch(/id="child_price_amount"[^>]*disabled=""[^>]*value="0,00"/);
  });

  it("öffnet einen manuellen Kinderbetrag als bearbeitbares Betragsfeld", () => {
    const html = renderChildFields({ child_entry_price: 4.5 });
    expect(html).not.toContain('id="child_stripe_price_id"');
    expect(html).not.toContain('id="child_price_text"');
    const input = html.match(/<input[^>]*id="child_price_amount"[^>]*>/)![0];
    expect(input).toContain('value="4,50"');
    expect(input).not.toContain('disabled=""');
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

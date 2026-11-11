import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PriceSummary from "../components/PriceSummary";
import { calculatePersonsPrice } from "../lib/price-tiers";
import { formatEuro } from "../lib/finance";

const event = { price: "7,50 €", entry_price: 7.5, child_entry_price: 5 };

describe("Kostenübersicht", () => {
  it("bleibt ohne Ermäßigung die gewohnte eine Zeile", () => {
    const pricing = calculatePersonsPrice(event, [{ is_child: false }, { is_child: true }])!;
    const html = renderToStaticMarkup(<PriceSummary pricing={pricing} />);
    expect(html).toContain(pricing.breakdown);
    expect(html).not.toContain("<ul");
    expect(html).not.toContain("Gesamt");
  });

  it("zeigt mit Ermäßigung je Stufe eine Zeile und den Normalpreis durchgestrichen", () => {
    const pricing = calculatePersonsPrice(event, [
      { is_child: false, discount: "reduced_50" },
      { is_child: true, discount: "reduced_50" },
    ])!;
    expect(pricing.totalCents).toBe(625);
    expect(pricing.undiscountedCents).toBe(1250);

    const html = renderToStaticMarkup(<PriceSummary pricing={pricing} />);
    expect(html.match(/<li/g)).toHaveLength(2);
    expect(html).toContain("Erwachsener");
    expect(html).toContain("Kind");
    expect(html.match(/−50 %/g)).toHaveLength(2);
    expect(html).toContain(`1 × ${formatEuro(3.75)}`);
    expect(html).toContain(`1 × ${formatEuro(2.5)}`);
    expect(html).toContain("Gesamt");
    expect(html).toMatch(new RegExp(`<s[^>]*>.*regulär.*${formatEuro(12.5)}</s>`));
    expect(html).toContain(formatEuro(6.25));
  });

  it("fasst gleiche Stufen zusammen und nutzt die Mehrzahl", () => {
    const pricing = calculatePersonsPrice(event, [
      { is_child: false }, { is_child: false }, { is_child: false, discount: "reduced_30" },
    ])!;
    const html = renderToStaticMarkup(<PriceSummary pricing={pricing} />);
    expect(html).toContain("Erwachsene<");
    expect(html).toContain(`2 × ${formatEuro(7.5)}`);
    expect(html).toContain(`1 × ${formatEuro(5.25)}`);
  });
});

import { describe, expect, it } from "vitest";
import { calculateTierPrices, discountedCents, PRICE_TIERS, TIER_PRICE_COLUMNS } from "../lib/price-tiers";

describe("calculateTierPrices", () => {
  it("berechnet alle sechs Stufen aus Erwachsenen- und Kinderpreis", () => {
    expect(calculateTierPrices({ price: "12,00 €", entry_price: 12, child_entry_price: 6 })).toEqual({
      adult: 1200, child: 600,
      adult_reduced_30: 840, adult_reduced_50: 600,
      child_reduced_30: 420, child_reduced_50: 300,
    });
  });

  it("rundet auf ganze Cent", () => {
    expect(discountedCents(725, 50)).toBe(363);
    expect(discountedCents(725, 30)).toBe(508);
    expect(discountedCents(1199, 30)).toBe(839);
    expect(calculateTierPrices({ price: "7,25 €", entry_price: 7.25 })).toMatchObject({
      adult_reduced_30: 508, adult_reduced_50: 363,
    });
  });

  it("übernimmt ohne eigenen Kinderpreis den Erwachsenenpreis", () => {
    expect(calculateTierPrices({ price: "10 €", entry_price: 10, child_entry_price: null })).toMatchObject({
      child: 1000, child_reduced_30: 700, child_reduced_50: 500,
    });
  });

  it("legt kostenlose Kinder mit 0 € an", () => {
    expect(calculateTierPrices({ price: "10 €", entry_price: 10, child_entry_price: 0 })).toMatchObject({
      adult: 1000, child: 0, child_reduced_30: 0, child_reduced_50: 0,
    });
  });

  it("kennt kostenlose Erwachsene bei kostenpflichtigen Kindern", () => {
    expect(calculateTierPrices({ price: "Kostenlos", entry_price: null, child_entry_price: 4 })).toMatchObject({
      adult: 0, adult_reduced_50: 0, child: 400, child_reduced_30: 280, child_reduced_50: 200,
    });
  });

  it.each([
    { price: "Kostenlos", entry_price: null },
    { price: "0 €", entry_price: 0, child_entry_price: 0 },
    { price: "Spende willkommen", entry_price: 8 },
  ])("gibt null, wenn nichts zu kassieren ist: %j", (event) => {
    expect(calculateTierPrices(event)).toBeNull();
  });

  it("ordnet jeder Stufe eine eigene Spalte zu", () => {
    const columns = PRICE_TIERS.map(({ tier }) => TIER_PRICE_COLUMNS[tier]);
    expect(new Set(columns).size).toBe(PRICE_TIERS.length);
  });
});

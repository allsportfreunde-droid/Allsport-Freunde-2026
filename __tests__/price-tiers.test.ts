import { describe, expect, it } from "vitest";
import {
  calculatePersonsPrice, calculateTierPrices, discountedCents, formatPersonsPriceLabel,
  personTier, PRICE_TIERS, TIER_PRICE_COLUMNS,
} from "../lib/price-tiers";
import { calculateRegistrationPrice } from "../lib/price";
import { formatEuro } from "../lib/finance";

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

describe("Preis einer Anmeldung je Person", () => {
  const event = { price: "12,00 €", entry_price: 12, child_entry_price: 6 };
  const adult = { is_child: false };
  const child = { is_child: true };

  it("bestimmt die Stufe aus Kind, Ermäßigung und Kinderpreis", () => {
    expect(personTier(adult, true)).toBe("adult");
    expect(personTier({ is_child: true, discount: "reduced_30" }, true)).toBe("child_reduced_30");
    // Ohne eigenen Kinderpreis zahlen Kinder wie Erwachsene.
    expect(personTier({ is_child: true, discount: "reduced_50" }, false)).toBe("adult_reduced_50");
  });

  it("gruppiert je Stufe und rechnet jede Person einzeln", () => {
    const persons = [adult, adult, { is_child: false, discount: "reduced_50" as const }, { is_child: true, discount: "reduced_30" as const }];
    const result = calculatePersonsPrice(event, persons)!;
    expect(result.groups.map(({ tier, count, unitCents }) => [tier, count, unitCents])).toEqual([
      ["adult", 2, 1200], ["adult_reduced_50", 1, 600], ["child_reduced_30", 1, 420],
    ]);
    expect(result.totalCents).toBe(3420);
    expect(persons.map(result.centsFor)).toEqual([1200, 1200, 600, 420]);
    expect(result.breakdown).toBe(
      `2 Erwachsene × ${formatEuro(12)} + 1 Erwachsener (−50 %) × ${formatEuro(6)} + 1 Kind (−30 %) × ${formatEuro(4.2)}`
    );
    expect(result.groups.map((g) => g.lineLabel)).toEqual(["Erwachsene", "Erwachsene (50 % ermäßigt)", "Kinder (30 % ermäßigt)"]);
  });

  it("bleibt ohne Ermäßigung identisch mit der bisherigen Rechnung", () => {
    for (const [ev, persons] of [
      [event, [adult, child, child]],
      [event, [child]],
      [{ price: "10 €", entry_price: 10 }, [adult, child]],
      [{ price: "Kostenlos", entry_price: null, child_entry_price: 4 }, [adult, child]],
    ] as const) {
      const before = calculateRegistrationPrice(ev, persons.length, persons.filter((p) => p.is_child).length)!;
      const after = calculatePersonsPrice(ev, persons)!;
      expect(after.totalCents).toBe(before.totalCents);
      expect(after.breakdown).toBe(before.breakdown);
      expect(after.hasDiscount).toBe(false);
    }
  });

  it("fasst Kinder ohne Kinderpreis unter „Eintritt“ zusammen, auch ermäßigt", () => {
    const result = calculatePersonsPrice({ price: "10 €", entry_price: 10 }, [
      adult, { is_child: true, discount: "reduced_50" },
    ])!;
    expect(result.groups.map((g) => [g.tier, g.lineLabel, g.unitCents])).toEqual([
      ["adult", "Eintritt", 1000], ["adult_reduced_50", "Eintritt (50 % ermäßigt)", 500],
    ]);
    expect(result.breakdown).toBe(`1 Person × ${formatEuro(10)} + 1 Person (−50 %) × ${formatEuro(5)}`);
  });

  it("gibt null ohne verbindlichen Preis oder ohne Personen", () => {
    expect(calculatePersonsPrice({ price: "Spende willkommen", entry_price: 8 }, [{ is_child: false, discount: "reduced_50" }])).toBeNull();
    expect(calculatePersonsPrice(event, [])).toBeNull();
  });

  it("nennt eine Summe nur, wenn etwas zu zahlen ist", () => {
    expect(formatPersonsPriceLabel(event, [{ is_child: false, discount: "reduced_50" }]))
      .toBe(`1 Erwachsener (−50 %) × ${formatEuro(6)} = ${formatEuro(6)}`);
    expect(formatPersonsPriceLabel({ price: "Kostenlos", entry_price: null }, [adult])).toBeNull();
  });
});

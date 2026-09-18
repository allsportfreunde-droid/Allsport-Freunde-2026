/**
 * Tests für lib/price.ts – die Synchronisierung von Anzeigepreis (price)
 * und Berechnungsgrundlage (entry_price).
 */

import { describe, it, expect } from "vitest";
import {
  FREE_PRICE_LABEL,
  MAX_PRICE_CENTS,
  amountFromCents,
  bindingEntryPrice,
  formatPriceLabel,
  centsFromAmount,
  centsFromDigits,
  formatAmountPlain,
  parsePriceText,
  priceFromAmount,
  priceFromText,
  normalizePrice,
  normalizeStripePriceId,
} from "../lib/price";
import { formatEuro } from "../lib/finance";

describe("parsePriceText", () => {
  it("erkennt reine Beträge", () => {
    expect(parsePriceText("5")).toBe(5);
    expect(parsePriceText("5 €")).toBe(5);
    expect(parsePriceText("5,00 €")).toBe(5);
    expect(parsePriceText("5.00")).toBe(5);
    expect(parsePriceText("€ 7,50")).toBe(7.5);
    expect(parsePriceText("12 EUR")).toBe(12);
  });

  it("erkennt deutsche Tausendertrennung", () => {
    expect(parsePriceText("1.234,56 €")).toBe(1234.56);
    expect(parsePriceText("1.234")).toBe(1234);
  });

  it("liest das eigene Ausgabeformat zurück", () => {
    // formatEuro nutzt ein geschütztes Leerzeichen – das darf nicht stören
    expect(parsePriceText(formatEuro(5))).toBe(5);
    expect(parsePriceText(formatEuro(1234.56))).toBe(1234.56);
  });

  it("gibt null für echten Freitext zurück", () => {
    expect(parsePriceText("Kostenlos")).toBeNull();
    expect(parsePriceText("Spende willkommen")).toBeNull();
    expect(parsePriceText("ab 5 €")).toBeNull();
    expect(parsePriceText("")).toBeNull();
  });
});

describe("priceFromAmount", () => {
  it("leitet den Anzeigetext aus dem Betrag ab", () => {
    expect(priceFromAmount(5)).toEqual({ price: formatEuro(5), entry_price: 5 });
  });

  it("behandelt null, 0 und negative Werte als kostenlos", () => {
    for (const value of [null, undefined, 0, -3, NaN]) {
      expect(priceFromAmount(value)).toEqual({
        price: FREE_PRICE_LABEL,
        entry_price: null,
      });
    }
  });

  it("rundet auf Cent", () => {
    expect(priceFromAmount(5.005).entry_price).toBe(5.01);
    expect(priceFromAmount(5.004).entry_price).toBe(5);
  });
});

describe("priceFromText", () => {
  it("behält echten Freitext ohne Berechnungsgrundlage", () => {
    expect(priceFromText("Spende willkommen")).toEqual({
      price: "Spende willkommen",
      entry_price: null,
    });
  });

  it("rettet die Berechnungsgrundlage aus einem reinen Betrag", () => {
    expect(priceFromText("5 €")).toEqual({ price: formatEuro(5), entry_price: 5 });
  });

  it("macht aus leerer Eingabe 'Kostenlos'", () => {
    expect(priceFromText("   ")).toEqual({ price: FREE_PRICE_LABEL, entry_price: null });
  });
});

describe("normalizePrice", () => {
  it("leitet die Anzeige aus dem Betrag ab", () => {
    expect(normalizePrice({ entry_price: 5, price: "" })).toEqual({
      price: formatEuro(5),
      entry_price: 5,
    });
  });

  it("lässt den Betrag über einen widersprüchlichen Zahlen-Anzeigetext gewinnen", () => {
    // Der Drift-Fall: Anzeige sagt 3 €, gerechnet werden 5 €
    expect(normalizePrice({ entry_price: 5, price: "3 €" })).toEqual({
      price: formatEuro(5),
      entry_price: 5,
    });
  });

  it("rettet den Betrag, wenn nur der Anzeigetext gesetzt ist", () => {
    // Genau der Bug: Stripe schrieb nur den formatierten Text
    expect(normalizePrice({ entry_price: null, price: "5,00 €" })).toEqual({
      price: formatEuro(5),
      entry_price: 5,
    });
  });

  it("behält Freitext und den Betrag als Berechnungsgrundlage nebeneinander", () => {
    expect(normalizePrice({ entry_price: 5, price: "Spende ab 5 €" })).toEqual({
      price: "Spende ab 5 €",
      entry_price: 5,
    });
  });

  it("akzeptiert Beträge als String", () => {
    expect(normalizePrice({ entry_price: "7.5", price: "" }).entry_price).toBe(7.5);
  });

  it("fällt ohne jede Eingabe auf kostenlos zurück", () => {
    expect(normalizePrice({})).toEqual({ price: FREE_PRICE_LABEL, entry_price: null });
    expect(normalizePrice({ entry_price: null, price: "Kostenlos" })).toEqual({
      price: "Kostenlos",
      entry_price: null,
    });
  });

  it("ignoriert unbrauchbare Beträge", () => {
    expect(normalizePrice({ entry_price: "abc", price: "Spende" })).toEqual({
      price: "Spende",
      entry_price: null,
    });
  });
});

// ── Kassenterminal-Eingabe ───────────────────────────────────────────────────

describe("Kassenterminal-Eingabe (centsFromDigits)", () => {
  /** Simuliert das Tippen einer Ziffer ans Ende des Feldinhalts. */
  function type(cents: number, digit: string): number {
    const next = centsFromDigits(formatAmountPlain(cents) + digit);
    return next === null ? cents : next;
  }

  /** Simuliert die Rücktaste: letztes Zeichen des Feldinhalts fällt weg. */
  function backspace(cents: number): number {
    const shown = formatAmountPlain(cents);
    const next = centsFromDigits(shown.slice(0, -1));
    return next === null ? cents : next;
  }

  it("schiebt Ziffern von rechts nach", () => {
    let c = 0;
    c = type(c, "1"); expect(formatAmountPlain(c)).toBe("0,01");
    c = type(c, "0"); expect(formatAmountPlain(c)).toBe("0,10");
    c = type(c, "0"); expect(formatAmountPlain(c)).toBe("1,00");
    c = type(c, "0"); expect(formatAmountPlain(c)).toBe("10,00");
  });

  it("tippt 500 zu 5,00 €", () => {
    let c = 0;
    for (const d of "500") c = type(c, d);
    expect(c).toBe(500);
    expect(amountFromCents(c)).toBe(5);
  });

  it("löscht mit der Rücktaste von rechts", () => {
    let c = 1000; // 10,00
    c = backspace(c); expect(formatAmountPlain(c)).toBe("1,00");
    c = backspace(c); expect(formatAmountPlain(c)).toBe("0,10");
    c = backspace(c); expect(formatAmountPlain(c)).toBe("0,01");
    c = backspace(c); expect(formatAmountPlain(c)).toBe("0,00");
    c = backspace(c); expect(formatAmountPlain(c)).toBe("0,00");
  });

  it("kommt mit dem Tausenderpunkt in der Anzeige klar", () => {
    // 1.234,56 enthält einen Punkt – der darf nicht als Ziffer zählen
    expect(formatAmountPlain(123456)).toBe("1.234,56");
    expect(centsFromDigits("1.234,56")).toBe(123456);
    expect(type(123456, "7")).toBe(1234567);
  });

  it("lehnt Eingaben über der Obergrenze ab", () => {
    expect(centsFromDigits("99999999")).toBeNull();
    expect(type(MAX_PRICE_CENTS, "9")).toBe(MAX_PRICE_CENTS);
    expect(formatAmountPlain(MAX_PRICE_CENTS)).toBe("99.999,99");
  });

  it("ignoriert eingefügten Text und führende Nullen", () => {
    expect(centsFromDigits("")).toBe(0);
    expect(centsFromDigits("abc")).toBe(0);
    expect(centsFromDigits("5,00 €")).toBe(500);
    expect(centsFromDigits("000500")).toBe(500);
  });
});

describe("Cent-Umrechnung", () => {
  it("rechnet verlustfrei hin und zurück", () => {
    for (const euro of [0.01, 0.1, 5, 7.5, 12.34, 99999.99]) {
      expect(amountFromCents(centsFromAmount(euro))).toBe(euro);
    }
  });

  it("behandelt fehlende und ungültige Beträge als 0", () => {
    expect(centsFromAmount(null)).toBe(0);
    expect(centsFromAmount(undefined)).toBe(0);
    expect(centsFromAmount(-5)).toBe(0);
    expect(centsFromAmount(NaN)).toBe(0);
  });

  it("passt zum Stripe-Format", () => {
    // Stripe liefert unit_amount: 500
    expect(amountFromCents(500)).toBe(5);
    expect(priceFromAmount(amountFromCents(500)).price).toBe(formatEuro(5));
  });
});

describe("normalizeStripePriceId", () => {
  it("behält eine gültige ID, wenn ein Betrag da ist", () => {
    expect(normalizeStripePriceId("price_1AbCdEfGhIjKlMnO", 5)).toBe("price_1AbCdEfGhIjKlMnO");
    expect(normalizeStripePriceId("  price_1AbC  ", 5)).toBe("price_1AbC");
  });

  it("verwirft die ID, sobald kein Betrag mehr da ist", () => {
    // Admin wechselt auf Freitext – die alte ID passt zu nichts mehr
    expect(normalizeStripePriceId("price_1AbCdEfGhIjKlMnO", null)).toBeNull();
  });

  it("verwirft alles, was keine Stripe Price ID ist", () => {
    expect(normalizeStripePriceId("", 5)).toBeNull();
    expect(normalizeStripePriceId("prod_1AbC", 5)).toBeNull();
    expect(normalizeStripePriceId("price_1AbC; DROP TABLE events", 5)).toBeNull();
    expect(normalizeStripePriceId(42, 5)).toBeNull();
    expect(normalizeStripePriceId(null, 5)).toBeNull();
    expect(normalizeStripePriceId(undefined, 5)).toBeNull();
  });
});

describe("bindingEntryPrice", () => {
  it("nennt den Betrag, wenn auch der Anzeigetext ein Betrag ist", () => {
    expect(bindingEntryPrice({ price: "8,00 €", entry_price: 8 })).toBe(8);
    expect(bindingEntryPrice({ price: "8", entry_price: 8 })).toBe(8);
  });

  it("fordert bei echtem Freitext nichts ein", () => {
    // entry_price bleibt Berechnungsgrundlage, ist aber nicht ausgeschrieben
    expect(bindingEntryPrice({ price: "Spende willkommen", entry_price: 8 })).toBeNull();
  });

  it("gibt null ohne Betrag", () => {
    expect(bindingEntryPrice({ price: FREE_PRICE_LABEL, entry_price: null })).toBeNull();
    expect(bindingEntryPrice({ price: "0 €", entry_price: 0 })).toBeNull();
    expect(bindingEntryPrice({})).toBeNull();
  });

  it("entscheidet wie formatPriceLabel", () => {
    // Beide Seiten derselben Regel dürfen nicht auseinanderlaufen: gibt es
    // einen verbindlichen Betrag, gibt es auch ein Label – und umgekehrt.
    const faelle = [
      { price: "8,00 €", entry_price: 8 },
      { price: "Spende willkommen", entry_price: 8 },
      { price: FREE_PRICE_LABEL, entry_price: null },
    ];
    for (const fall of faelle) {
      expect(bindingEntryPrice(fall) != null).toBe(
        formatPriceLabel(fall.entry_price, 2, fall.price) != null
      );
    }
  });
});

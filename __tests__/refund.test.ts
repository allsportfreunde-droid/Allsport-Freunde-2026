/**
 * Tests für lib/refund.ts – die Aufteilung einer Zahlung auf Personen.
 */

import { describe, it, expect } from "vitest";
import {
  personShareCents,
  refundAmountCents,
  splitRefundCents,
  refundSharesCents,
} from "../lib/refund";

/** 5 Personen à 8,00 € = 40,00 €, noch nichts zugesagt. */
const fuenf = { amountPaid: 40, paidPersons: 5, announcedCents: 0 };

describe("Erstattung nach gezahltem Personenpreis", () => {
  const prices = { adult: 1000, child: 400, free: 0 };
  const basis = { amountPaid: 14, paidPersons: 3, announcedCents: 0 };

  it("erstattet dem Kind seinen eigenen Preis", () => {
    expect(refundSharesCents(basis, ["child"], 2, prices)).toEqual([400]);
  });

  it("verteilt eine gemeinsame Erstattung nicht gleichmäßig", () => {
    expect(refundSharesCents(basis, ["adult", "child", "free"], 0, prices)).toEqual([1000, 400, 0]);
  });

  it("gibt einem kostenlosen Kind auch als letzter Person keinen Restbetrag", () => {
    expect(refundSharesCents(basis, ["free"], 0, prices)).toEqual([0]);
  });

  it("erstattet bei aufeinanderfolgenden Stornierungen insgesamt genau die Zahlung", () => {
    const first = refundSharesCents(basis, ["child"], 2, prices)[0];
    const second = refundSharesCents({ ...basis, announcedCents: first }, ["adult"], 1, prices)[0];
    const last = refundSharesCents({ ...basis, announcedCents: first + second }, ["free"], 0, prices)[0];
    expect(first + second + last).toBe(1400);
  });

  it("behält die bisherige Aufteilung für Altzahlungen bei", () => {
    expect(refundSharesCents(fuenf, ["old-person"], 4, null)).toEqual([800]);
  });

  it("sagt bei widersprüchlichen Zahlungsdaten keinen erfundenen Betrag zu", () => {
    expect(() => refundSharesCents({ ...basis, amountPaid: 15 }, ["child"], 2, prices)).toThrow();
    expect(() => refundSharesCents(basis, ["unknown"], 2, prices)).toThrow();
    expect(() => refundSharesCents({ ...basis, announcedCents: 1400 }, ["child"], 2, prices)).toThrow();
  });
});

describe("personShareCents", () => {
  it("teilt den Betrag gleichmäßig auf", () => {
    expect(personShareCents(4000, 5)).toBe(800);
  });

  it("rundet den Anteil ab", () => {
    expect(personShareCents(2500, 3)).toBe(833);
  });

  it("gibt ohne Zahlung oder Personen nichts zurück", () => {
    expect(personShareCents(0, 5)).toBe(0);
    expect(personShareCents(4000, 0)).toBe(0);
  });
});

describe("refundAmountCents", () => {
  it("erstattet eine von fünf Personen anteilig", () => {
    expect(refundAmountCents(fuenf, 1, 4)).toBe(800);
  });

  it("erstattet mehrere Personen in einem Betrag", () => {
    expect(refundAmountCents(fuenf, 2, 3)).toBe(1600);
  });

  it("erstattet alles, wenn niemand angemeldet bleibt", () => {
    expect(refundAmountCents(fuenf, 5, 0)).toBe(4000);
  });

  it("gibt der letzten Person den Rundungsrest", () => {
    // 25,00 € auf drei Personen: 833 + 833 + 834 = 2500
    const basis = { amountPaid: 25, paidPersons: 3, announcedCents: 0 };
    const erste = refundAmountCents(basis, 1, 2);
    const zweite = refundAmountCents({ ...basis, announcedCents: erste }, 1, 1);
    const letzte = refundAmountCents(
      { ...basis, announcedCents: erste + zweite },
      1,
      0
    );
    expect([erste, zweite, letzte]).toEqual([833, 833, 834]);
    expect(erste + zweite + letzte).toBe(2500);
  });

  it("zahlt nie mehr zurück als gezahlt wurde", () => {
    expect(refundAmountCents({ ...fuenf, announcedCents: 4000 }, 1, 0)).toBe(0);
    expect(refundAmountCents({ ...fuenf, announcedCents: 3500 }, 2, 3)).toBe(500);
  });

  it("erstattet nichts ohne Zahlung", () => {
    expect(refundAmountCents({ amountPaid: null, paidPersons: 3, announcedCents: 0 }, 1, 2)).toBe(0);
  });

  it("erstattet nichts ohne betroffene Person", () => {
    expect(refundAmountCents(fuenf, 0, 5)).toBe(0);
  });
});

describe("splitRefundCents", () => {
  it("verteilt den Betrag vollständig", () => {
    expect(splitRefundCents(1600, 2)).toEqual([800, 800]);
  });

  it("gibt den Rest der ersten Person", () => {
    const shares = splitRefundCents(2500, 3);
    expect(shares).toEqual([834, 833, 833]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(2500);
  });

  it("verträgt einen leeren Betrag", () => {
    expect(splitRefundCents(0, 2)).toEqual([0, 0]);
    expect(splitRefundCents(800, 0)).toEqual([]);
  });
});

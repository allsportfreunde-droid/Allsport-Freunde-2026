import { describe, expect, it } from "vitest";
import { detectProofType, discountRequestLabel } from "@/lib/discount-requests";

describe("Statustext eines Antrags", () => {
  it("nennt nur, ob der Nachweis eingereicht ist – nie das Ergebnis der Prüfung", () => {
    expect(discountRequestLabel({ discount: "reduced_50", has_proof: true })).toBe("Ermäßigung −50 % · Nachweis eingereicht");
    expect(discountRequestLabel({ discount: "reduced_30", has_proof: false }))
      .toBe("Ermäßigung −30 % beantragt – ohne Nachweis gilt der reguläre Preis");
  });
});

describe("Nachweis-Dateitypen", () => {
  it("erkennt ein PDF auch mit vorangestellten Bytes im zulässigen Headerbereich", () => {
    const bytes = new Uint8Array([
      0xef, 0xbb, 0xbf, // UTF-8-BOM aus einem fehlerhaften PDF-Export
      0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37,
    ]);

    expect(detectProofType(bytes)).toBe("application/pdf");
  });

  it("akzeptiert keine PDF-Kennung außerhalb des Headerbereichs", () => {
    const bytes = new Uint8Array(1029);
    bytes.set([0x25, 0x50, 0x44, 0x46, 0x2d], 1024);

    expect(detectProofType(bytes)).toBeNull();
  });
});

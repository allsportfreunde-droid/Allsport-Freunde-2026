import { describe, expect, it } from "vitest";
import { discountHolderStatus, matchDiscount, normalizeName, validateDiscountHolderInput } from "../lib/discount-holders";

const TODAY = "2026-11-10";

const valid = {
  first_name: " Anna ", last_name: " Muster ", email: " Anna.Muster@Example.DE ",
  phone: "", discount: "reduced_50", proof_checked_at: "2026-11-10", valid_until: "", notes: "",
  consent: true,
};

function validate(overrides: Record<string, unknown> = {}) {
  return validateDiscountHolderInput({ ...valid, ...overrides }, TODAY);
}

describe("validateDiscountHolderInput", () => {
  it("trimmt, schreibt die E-Mail klein und macht leere Felder zu null", () => {
    expect(validate()).toEqual({
      ok: true,
      data: {
        first_name: "Anna", last_name: "Muster", email: "anna.muster@example.de",
        phone: null, discount: "reduced_50", proof_checked_at: "2026-11-10", valid_until: null, notes: null,
      },
    });
  });

  it("verwirft Felder, die nicht vom Formular kommen dürfen", () => {
    const result = validate({ proof_checked_by: "jemand@anders.de", id: 99 });
    expect(result.ok && result.data).not.toHaveProperty("proof_checked_by");
    expect(result.ok && result.data).not.toHaveProperty("id");
  });

  it.each([
    [{ first_name: "  " }, "Vor- und Nachnamen"],
    [{ last_name: undefined }, "Vor- und Nachnamen"],
    [{ first_name: "x".repeat(51) }, "höchstens 50"],
    [{ email: "keine-mail" }, "E-Mail"],
    [{ email: "" }, "E-Mail"],
    [{ phone: "1".repeat(51) }, "Telefonnummer"],
    [{ discount: "reduced_20" }, "Ermäßigung"],
    [{ discount: "toString" }, "Ermäßigung"],
    [{ proof_checked_at: "" }, "geprüft"],
    [{ proof_checked_at: "2026-02-31" }, "geprüft"],
    [{ proof_checked_at: "10.11.2026" }, "geprüft"],
    [{ proof_checked_at: "2026-11-11" }, "Zukunft"],
    [{ valid_until: "2026-13-01" }, "gültig bis"],
    [{ proof_checked_at: "2026-11-01", valid_until: "2026-10-31" }, "nicht vor dem Prüfdatum"],
    [{ notes: "x".repeat(501) }, "Notiz"],
  ])("lehnt %j ab", (overrides, message) => {
    const result = validate(overrides);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain(message);
  });

  it("akzeptiert „gültig bis“ am Prüftag und in der Zukunft", () => {
    expect(validate({ valid_until: "2026-11-10" }).ok).toBe(true);
    expect(validate({ valid_until: "2027-12-31", discount: "reduced_30" }).ok).toBe(true);
  });

  it("lehnt einen leeren Body ab", () => {
    expect(validateDiscountHolderInput(null, TODAY).ok).toBe(false);
  });

  it.each([false, undefined, "true", 1])("verlangt die Einwilligung (%s)", (consent) => {
    const result = validate({ consent });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("Einwilligung");
  });
});

describe("Abgleich bei der Anmeldung", () => {
  const family = [
    { first_name: "Anna", last_name: "Muster", discount: "reduced_50" as const },
    { first_name: "Ben", last_name: "Muster-Schmidt", discount: "reduced_30" as const },
  ];

  it("vergleicht Namen ohne Groß-/Kleinschreibung und überzählige Leerzeichen", () => {
    expect(normalizeName("  Anna   Lena ")).toBe("anna lena");
    expect(matchDiscount(family, " anna ", "MUSTER")).toBe("reduced_50");
    expect(matchDiscount(family, "Ben", "muster-schmidt")).toBe("reduced_30");
  });

  it("erkennt nur exakte Namen derselben E-Mail-Adresse", () => {
    expect(matchDiscount(family, "Anna", "Mustermann")).toBeNull();
    expect(matchDiscount(family, "Ann", "Muster")).toBeNull();
    expect(matchDiscount(family, "", "Muster")).toBeNull();
    expect(matchDiscount([], "Anna", "Muster")).toBeNull();
  });
});

describe("discountHolderStatus", () => {
  it.each([
    [null, "valid"],
    ["2026-11-10", "valid"],
    ["2026-12-01", "valid"],
    ["2026-11-09", "expired"],
  ] as const)("gültig bis %s → %s", (validUntil, status) => {
    expect(discountHolderStatus({ valid_until: validUntil }, TODAY)).toBe(status);
  });
});

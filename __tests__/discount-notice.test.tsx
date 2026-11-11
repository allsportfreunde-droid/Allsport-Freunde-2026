import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import DiscountNotice from "../components/registration/DiscountNotice";
import { discountPreviewKey } from "../components/registration/useDiscountPreview";
import { formatEuro } from "../lib/finance";

describe("Ermäßigungshinweis im Anmeldeformular", () => {
  it("zeigt Satz und Betrag, sobald eine Ermäßigung erkannt ist", () => {
    const html = renderToStaticMarkup(<DiscountNotice discount="reduced_50" fullCents={1200} reducedCents={600} />);
    expect(html).toContain("Ermäßigung −50 %");
    expect(html).toContain(`${formatEuro(6)} statt ${formatEuro(12)}`);
    expect(html).toContain('aria-live="polite"');
    // Kein Grund im sichtbaren Text – nur der Satz.
    expect(html).not.toContain("Behinderung");
  });

  it("bleibt ohne Ermäßigung leer", () => {
    const html = renderToStaticMarkup(<DiscountNotice discount={null} fullCents={null} reducedCents={null} />);
    expect(html).toBe('<div aria-live="polite"></div>');
  });
});

describe("Abfrageschlüssel der Vorschau", () => {
  it("entsteht erst mit gültiger E-Mail und vollständigen Namen", () => {
    expect(discountPreviewKey("anna@example.de", "Anna", "Muster")).toBe(JSON.stringify(["anna@example.de", "anna", "muster"]));
    expect(discountPreviewKey(" Anna@Example.DE ", " anna ", "MUSTER")).toBe(discountPreviewKey("anna@example.de", "Anna", "Muster"));
    expect(discountPreviewKey("anna@", "Anna", "Muster")).toBeNull();
    expect(discountPreviewKey("anna@example.de", "A", "Muster")).toBeNull();
    expect(discountPreviewKey("anna@example.de", "Anna", "")).toBeNull();
  });
});

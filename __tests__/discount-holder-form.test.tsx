import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import DiscountHolderForm from "../components/admin/DiscountHolderForm";
import ErmaessigungenPage from "../app/admin/ermaessigungen/page";
import type { DiscountHolder } from "../lib/types";

vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const holder: DiscountHolder = {
  id: 5, first_name: "Anna", last_name: "Muster", email: "anna@example.de", phone: "0171 123",
  discount: "reduced_30", proof_checked_at: "2026-11-01", proof_checked_by: "admin@verein.de",
  valid_until: "2027-03-31", notes: null, consented_at: "2026-11-01T10:00:00Z", created_at: "", updated_at: "",
};

describe("Ermäßigungsformular", () => {
  it("bietet beide Ermäßigungen nach § 3 an und kein Upload-Feld", () => {
    const html = renderToStaticMarkup(<DiscountHolderForm onSaved={vi.fn()} onCancel={vi.fn()} />);
    expect(html).toContain('value="reduced_30"');
    expect(html).toContain('value="reduced_50"');
    expect(html).toContain("Behinderung (GdB mindestens 50)");
    expect(html).not.toContain('type="file"');
    expect(html).toContain("Keine Diagnosen oder Bescheid-Inhalte eintragen.");
    expect(html).toContain(">Eintragen<");
  });

  it("füllt beim Bearbeiten die Werte vor und nennt die prüfende Person", () => {
    const html = renderToStaticMarkup(<DiscountHolderForm holder={holder} onSaved={vi.fn()} onCancel={vi.fn()} />);
    expect(html).toContain('value="anna@example.de"');
    expect(html).toContain('value="2027-03-31"');
    expect(html).toContain("Nachweis: aktueller Leistungsbescheid");
    expect(html).toContain("Zuletzt geprüft von admin@verein.de");
    expect(html).toContain(">Speichern<");
  });
});

describe("Ermäßigungsseite", () => {
  it("rendert Kopf, Regeln und Filter", () => {
    const html = renderToStaticMarkup(<ErmaessigungenPage />);
    expect(html).toContain("Ermäßigungen nach § 3");
    expect(html).toContain("Person eintragen");
    expect(html).toContain("Nachweis: Schwerbehindertenausweis");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), isPostgresConfigured: vi.fn(), logAudit: vi.fn(),
  setPersonDiscount: vi.fn(), getRegistrationCheckouts: vi.fn(),
  retrieve: vi.fn(), expire: vi.fn(), stripe: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/db", () => ({
  isPostgresConfigured: mocks.isPostgresConfigured, logAudit: mocks.logAudit,
  setPersonDiscount: mocks.setPersonDiscount, getRegistrationCheckouts: mocks.getRegistrationCheckouts,
}));
vi.mock("@/lib/stripe", () => ({ getStripe: mocks.stripe }));

const { PUT } = await import("../app/api/admin/registrations/[id]/persons/[personId]/discount/route");

const PERSON = "5b0c8a2e-1111-4222-8333-944455556666";

function request(payload: unknown) {
  return new NextRequest(`http://localhost/api/admin/registrations/12/persons/${PERSON}/discount`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
}
const params = (id = "12", personId = PERSON) => ({ params: Promise.resolve({ id, personId }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "u1", email: "admin@verein.de" } } });
  mocks.isPostgresConfigured.mockReturnValue(true);
  mocks.setPersonDiscount.mockResolvedValue({ ok: true });
  mocks.getRegistrationCheckouts.mockResolvedValue([]);
  mocks.stripe.mockReturnValue({ checkout: { sessions: { retrieve: mocks.retrieve, expire: mocks.expire } } });
});

describe("Ermäßigung nachträglich setzen", () => {
  it("setzt eine Ermäßigung und protokolliert ohne Satz oder Namen", async () => {
    const response = await PUT(request({ discount: "reduced_50" }), params());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ discount: "reduced_50" });
    expect(mocks.setPersonDiscount).toHaveBeenCalledWith(12, PERSON, "reduced_50");
    expect(mocks.logAudit).toHaveBeenCalledWith("admin@verein.de", "SET_PERSON_DISCOUNT", "REGISTRATION", 12);
  });

  it("entfernt eine Ermäßigung mit null", async () => {
    const response = await PUT(request({ discount: null }), params());
    expect(response.status).toBe(200);
    expect(mocks.setPersonDiscount).toHaveBeenCalledWith(12, PERSON, null);
  });

  it.each([{}, { discount: "reduced_99" }, { discount: 50 }])("lehnt ungültige Eingaben ab: %j", async (payload) => {
    expect((await PUT(request(payload), params())).status).toBe(400);
    expect(mocks.setPersonDiscount).not.toHaveBeenCalled();
  });

  it("lehnt eine ungültige Anmeldungs-ID ab", async () => {
    expect((await PUT(request({ discount: null }), params("abc"))).status).toBe(400);
  });

  it.each([
    ["not_found", 404],
    ["cancelled", 409],
    ["no_price", 409],
    ["paid_or_busy", 409],
  ] as const)("antwortet bei %s mit %i und ändert nichts weiter", async (reason, status) => {
    mocks.setPersonDiscount.mockResolvedValue({ ok: false, reason });
    const response = await PUT(request({ discount: "reduced_30" }), params());
    expect(response.status).toBe(status);
    expect((await response.json()).error).toBeTruthy();
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(mocks.getRegistrationCheckouts).not.toHaveBeenCalled();
  });

  it("verweist bei bezahlten Anmeldungen auf die Erstattung in Stripe", async () => {
    mocks.setPersonDiscount.mockResolvedValue({ ok: false, reason: "paid_or_busy" });
    const response = await PUT(request({ discount: "reduced_30" }), params());
    expect((await response.json()).error).toContain("Stripe");
  });

  it("schließt offene Zahlungslinks mit dem alten Betrag – Fehler halten nichts auf", async () => {
    mocks.getRegistrationCheckouts.mockResolvedValue([
      { session_id: "cs_open", payment_state: "open", person_prices: null },
      { session_id: "cs_gone", payment_state: "open", person_prices: null },
      { session_id: "cs_failed", payment_state: "failed", person_prices: null },
    ]);
    mocks.retrieve.mockImplementation(async (id: string) => ({ id, status: id === "cs_open" ? "open" : "expired" }));
    mocks.expire.mockRejectedValueOnce(new Error("gerade abgeschlossen"));

    const response = await PUT(request({ discount: "reduced_50" }), params());
    expect(response.status).toBe(200);
    expect(mocks.retrieve).toHaveBeenCalledTimes(2);
    expect(mocks.expire).toHaveBeenCalledTimes(1);
    expect(mocks.expire).toHaveBeenCalledWith("cs_open");
  });

  it("funktioniert auch ohne Stripe-Schlüssel", async () => {
    mocks.stripe.mockReturnValue(null);
    expect((await PUT(request({ discount: "reduced_50" }), params())).status).toBe(200);
    expect(mocks.getRegistrationCheckouts).not.toHaveBeenCalled();
  });

  it("verlangt eine Admin-Session", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await PUT(request({ discount: "reduced_50" }), params())).status).toBe(401);
    expect(mocks.setPersonDiscount).not.toHaveBeenCalled();
  });

  it("braucht eine Datenbank", async () => {
    mocks.isPostgresConfigured.mockReturnValue(false);
    expect((await PUT(request({ discount: "reduced_50" }), params())).status).toBe(503);
  });
});

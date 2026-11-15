import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { RegistrationStatusInfo } from "../lib/types";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), isPostgresConfigured: vi.fn(), logAudit: vi.fn(),
  getRegistrationWithEvent: vi.fn(), getRegistrationByToken: vi.fn(), getEvent: vi.fn(),
  offerSpot: vi.fn(), withdrawSpotOffer: vi.fn(), getRegistrationCheckouts: vi.fn(),
  mail: vi.fn(), retrieve: vi.fn(), expire: vi.fn(), stripe: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/db", () => ({
  isPostgresConfigured: mocks.isPostgresConfigured, logAudit: mocks.logAudit,
  getRegistrationWithEvent: mocks.getRegistrationWithEvent, getRegistrationByToken: mocks.getRegistrationByToken,
  getEvent: mocks.getEvent, offerSpot: mocks.offerSpot, withdrawSpotOffer: mocks.withdrawSpotOffer,
  getRegistrationCheckouts: mocks.getRegistrationCheckouts,
}));
vi.mock("@/lib/email", () => ({ sendWaitlistSpotOfferedEmail: mocks.mail }));
vi.mock("@/lib/stripe", () => ({ getStripe: mocks.stripe }));

const { POST, DELETE } = await import("../app/api/admin/registrations/[id]/spot-offer/route");

const request = (method: "POST" | "DELETE") =>
  new NextRequest("http://localhost/api/admin/registrations/12/spot-offer", { method });
const params = (id = "12") => ({ params: Promise.resolve({ id }) });

function statusInfo(overrides: Partial<RegistrationStatusInfo> = {}): RegistrationStatusInfo {
  return {
    id: 12, first_name: "Ada", last_name: "Test", email: "ada@example.com", guests: 1,
    status: "pending", status_note: null, status_changed_at: null, created_at: "2026-11-01T10:00:00Z",
    event_title: "Hallenfußball", event_date: "2099-06-01", event_time: "18:00", event_location: "Halle",
    event_category: "fussball", event_id: 3, is_waitlist: false, event_full: true, paid_at: null,
    event_cancellation_deadline: null, event_price: "10 €", event_entry_price: 10,
    event_child_entry_price: 4, event_dress_code: "", qr_code: null, checked_in_at: null,
    payment_in_progress: false,
    persons: [
      { id: "p1", registration_id: 12, first_name: "Ada", last_name: "Test", is_child: false, discount: null, checked_in_at: null, cancelled_at: null, created_at: "" },
      { id: "p2", registration_id: 12, first_name: "Kind", last_name: "Test", is_child: true, discount: null, checked_in_at: null, cancelled_at: null, created_at: "" },
      { id: "p3", registration_id: 12, first_name: "Weg", last_name: "Test", is_child: false, discount: null, checked_in_at: null, cancelled_at: "2026-11-02T10:00:00Z", created_at: "" },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "u1", email: "admin@verein.de" } } });
  mocks.isPostgresConfigured.mockReturnValue(true);
  mocks.getRegistrationWithEvent.mockResolvedValue({ id: 12, event_id: 3, status_token: "tok" });
  mocks.getRegistrationByToken.mockResolvedValue(statusInfo());
  mocks.getEvent.mockResolvedValue({ id: 3, title: "Hallenfußball", date: "2099-06-01", time: "18:00", location: "Halle" });
  mocks.offerSpot.mockResolvedValue(true);
  mocks.withdrawSpotOffer.mockResolvedValue({ ok: true });
  mocks.getRegistrationCheckouts.mockResolvedValue([]);
  mocks.stripe.mockReturnValue({ checkout: { sessions: { retrieve: mocks.retrieve, expire: mocks.expire } } });
});

describe("Platz anbieten", () => {
  it("bietet den Platz an und schickt die Mail mit Betrag und aktiven Personen", async () => {
    const response = await POST(request("POST"), params());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ offered: true });
    expect(mocks.offerSpot).toHaveBeenCalledWith(12);
    expect(mocks.logAudit).toHaveBeenCalledWith("admin@verein.de", "OFFER_SPOT", "REGISTRATION", 12);
    expect(mocks.mail).toHaveBeenCalledWith(expect.objectContaining({
      to: "ada@example.com", statusToken: "tok", eventTitle: "Hallenfußball",
      persons: [{ firstName: "Ada", lastName: "Test" }, { firstName: "Kind", lastName: "Test" }],
      priceLabel: expect.stringContaining("14,00"),
    }));
  });

  it("mailt nicht ein zweites Mal, wenn das Angebot schon steht", async () => {
    mocks.offerSpot.mockResolvedValue(false);
    const response = await POST(request("POST"), params());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ offered: false });
    expect(mocks.mail).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it.each([
    ["bestätigt", { status: "approved" as const }],
    ["bezahlt", { paid_at: "2026-11-10T10:00:00Z" }],
    ["Zahlung läuft", { payment_in_progress: true }],
    ["kostenlos", { event_price: "Kostenlos", event_entry_price: 0, event_child_entry_price: 0 }],
    ["ohne E-Mail", { email: "  " }],
  ])("verweigert das Angebot: %s", async (_label, overrides) => {
    mocks.getRegistrationByToken.mockResolvedValue(statusInfo(overrides));
    expect((await POST(request("POST"), params())).status).toBe(409);
    expect(mocks.offerSpot).not.toHaveBeenCalled();
    expect(mocks.mail).not.toHaveBeenCalled();
  });

  it("verlangt einen angemeldeten Admin", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await POST(request("POST"), params())).status).toBe(401);
    expect(mocks.offerSpot).not.toHaveBeenCalled();
  });

  it("lehnt eine ungültige ID ab", async () => {
    expect((await POST(request("POST"), params("abc"))).status).toBe(400);
  });

  it("meldet eine unbekannte Anmeldung", async () => {
    mocks.getRegistrationWithEvent.mockResolvedValue(null);
    expect((await POST(request("POST"), params())).status).toBe(404);
  });
});

describe("Angebot zurückziehen", () => {
  it("zieht zurück und schließt nur offene Zahlungslinks, ohne Mail", async () => {
    mocks.getRegistrationCheckouts.mockResolvedValue([
      { session_id: "cs_open", payment_state: "open" },
      { session_id: "cs_old", payment_state: "expired" },
    ]);
    mocks.retrieve.mockResolvedValue({ status: "open" });
    const response = await DELETE(request("DELETE"), params());
    expect(response.status).toBe(200);
    expect(mocks.expire).toHaveBeenCalledTimes(1);
    expect(mocks.expire).toHaveBeenCalledWith("cs_open");
    expect(mocks.logAudit).toHaveBeenCalledWith("admin@verein.de", "WITHDRAW_SPOT_OFFER", "REGISTRATION", 12);
    expect(mocks.mail).not.toHaveBeenCalled();
  });

  it("lässt das Angebot stehen, solange eine Zahlung läuft", async () => {
    mocks.withdrawSpotOffer.mockResolvedValue({ ok: false, reason: "payment_running" });
    const response = await DELETE(request("DELETE"), params());
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("Zahlung läuft");
    expect(mocks.expire).not.toHaveBeenCalled();
  });

  it("meldet, wenn es kein Angebot gibt", async () => {
    mocks.withdrawSpotOffer.mockResolvedValue({ ok: false, reason: "not_offered" });
    expect((await DELETE(request("DELETE"), params())).status).toBe(409);
  });
});

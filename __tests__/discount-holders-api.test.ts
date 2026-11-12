import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { DiscountHolder } from "../lib/types";
import { DuplicateDiscountHolderError } from "../lib/discount-holders";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), isPostgresConfigured: vi.fn(), logAudit: vi.fn(),
  getDiscountHolders: vi.fn(), createDiscountHolder: vi.fn(),
  updateDiscountHolder: vi.fn(), deleteDiscountHolder: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/db", () => ({
  isPostgresConfigured: mocks.isPostgresConfigured, logAudit: mocks.logAudit,
  getDiscountHolders: mocks.getDiscountHolders, createDiscountHolder: mocks.createDiscountHolder,
  updateDiscountHolder: mocks.updateDiscountHolder, deleteDiscountHolder: mocks.deleteDiscountHolder,
}));

const { GET, POST } = await import("../app/api/admin/ermaessigungen/route");
const { PUT, DELETE } = await import("../app/api/admin/ermaessigungen/[id]/route");

const holder: DiscountHolder = {
  id: 5, first_name: "Anna", last_name: "Muster", email: "anna@example.de", phone: null,
  discount: "reduced_50", proof_checked_at: "2026-11-01", proof_checked_by: "admin@verein.de",
  valid_until: null, notes: null, consented_at: "2026-11-01T10:00:00Z",
  created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T10:00:00Z",
};

const body = {
  first_name: "Anna", last_name: "Muster", email: "Anna@Example.de",
  // Sicher in der Vergangenheit – die Route prüft gegen das echte heutige Datum.
  discount: "reduced_50", proof_checked_at: "2020-01-15", consent: true,
};

function request(method: string, payload?: unknown) {
  return new NextRequest("http://localhost/api/admin/ermaessigungen", {
    method, headers: { "Content-Type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "u1", email: "admin@verein.de" } } });
  mocks.isPostgresConfigured.mockReturnValue(true);
  mocks.getDiscountHolders.mockResolvedValue([holder]);
  mocks.createDiscountHolder.mockResolvedValue(holder);
  mocks.updateDiscountHolder.mockResolvedValue(holder);
  mocks.deleteDiscountHolder.mockResolvedValue(true);
});

describe("Zugriff", () => {
  it("verlangt eine Admin-Session", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await GET()).status).toBe(401);
    expect((await POST(request("POST", body))).status).toBe(401);
    expect((await PUT(request("PUT", body), params("5"))).status).toBe(401);
    expect((await DELETE(request("DELETE"), params("5"))).status).toBe(401);
    expect(mocks.createDiscountHolder).not.toHaveBeenCalled();
    expect(mocks.deleteDiscountHolder).not.toHaveBeenCalled();
  });

  it("meldet eine fehlende Datenbank", async () => {
    mocks.isPostgresConfigured.mockReturnValue(false);
    expect((await GET()).status).toBe(503);
  });

  it("liefert die Liste ohne Zwischenspeicherung", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual([holder]);
  });
});

describe("Person eintragen", () => {
  it("speichert die geprüfte Eingabe mit der Admin-E-Mail aus der Session", async () => {
    const response = await POST(request("POST", { ...body, proof_checked_by: "gefaelscht@x.de" }));
    expect(response.status).toBe(201);
    expect(mocks.createDiscountHolder).toHaveBeenCalledWith(
      expect.objectContaining({ email: "anna@example.de", discount: "reduced_50" }),
      "admin@verein.de"
    );
    expect(mocks.createDiscountHolder.mock.calls[0][0]).not.toHaveProperty("proof_checked_by");
  });

  it("schreibt ins Audit-Log nur Aktion und ID", async () => {
    await POST(request("POST", body));
    expect(mocks.logAudit).toHaveBeenCalledWith("admin@verein.de", "CREATE_DISCOUNT_HOLDER", "DISCOUNT_HOLDER", 5);
  });

  it("lehnt ungültige Eingaben ab", async () => {
    const response = await POST(request("POST", { ...body, discount: "reduced_99" }));
    expect(response.status).toBe(400);
    expect(mocks.createDiscountHolder).not.toHaveBeenCalled();
  });

  it("meldet eine bereits eingetragene Person", async () => {
    mocks.createDiscountHolder.mockRejectedValue(new DuplicateDiscountHolderError());
    const response = await POST(request("POST", body));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("bereits");
  });
});

describe("Eintrag bearbeiten und löschen", () => {
  it("aktualisiert mit der Admin-E-Mail aus der Session", async () => {
    const response = await PUT(request("PUT", body), params("5"));
    expect(response.status).toBe(200);
    expect(mocks.updateDiscountHolder).toHaveBeenCalledWith(5, expect.objectContaining({ first_name: "Anna" }), "admin@verein.de");
    expect(mocks.logAudit).toHaveBeenCalledWith("admin@verein.de", "UPDATE_DISCOUNT_HOLDER", "DISCOUNT_HOLDER", 5);
  });

  it.each(["abc", "0", "-1", "1.5"])("lehnt die ID %s ab", async (id) => {
    expect((await PUT(request("PUT", body), params(id))).status).toBe(400);
    expect((await DELETE(request("DELETE"), params(id))).status).toBe(400);
  });

  it("meldet unbekannte Einträge", async () => {
    mocks.updateDiscountHolder.mockResolvedValue(null);
    mocks.deleteDiscountHolder.mockResolvedValue(false);
    expect((await PUT(request("PUT", body), params("7"))).status).toBe(404);
    expect((await DELETE(request("DELETE"), params("7"))).status).toBe(404);
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it("meldet eine Kollision mit einer anderen Person", async () => {
    mocks.updateDiscountHolder.mockRejectedValue(new DuplicateDiscountHolderError());
    expect((await PUT(request("PUT", body), params("5"))).status).toBe(409);
  });

  it("löscht und protokolliert", async () => {
    const response = await DELETE(request("DELETE"), params("5"));
    expect(response.status).toBe(200);
    expect(mocks.deleteDiscountHolder).toHaveBeenCalledWith(5);
    expect(mocks.logAudit).toHaveBeenCalledWith("admin@verein.de", "DELETE_DISCOUNT_HOLDER", "DISCOUNT_HOLDER", 5);
  });
});

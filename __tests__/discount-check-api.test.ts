import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getRecognizableDiscounts: vi.fn(), isPostgresConfigured: vi.fn(), allowed: { value: true },
}));

vi.mock("@/lib/db", () => ({
  getRecognizableDiscounts: mocks.getRecognizableDiscounts,
  isPostgresConfigured: mocks.isPostgresConfigured,
}));
vi.mock("@/lib/ratelimit", () => ({
  checkRateLimit: () => mocks.allowed.value,
  getClientIp: () => "test",
  RATE_LIMITS: { discountCheck: {} },
}));

const { POST } = await import("../app/api/discounts/check/route");

function request(body: unknown) {
  return new NextRequest("http://localhost/api/discounts/check", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const anna = { first_name: "Anna", last_name: "Muster", email: "Anna@Example.de" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.allowed.value = true;
  mocks.isPostgresConfigured.mockReturnValue(true);
  mocks.getRecognizableDiscounts.mockResolvedValue([
    { first_name: "Anna", last_name: "Muster", discount: "reduced_50" },
  ]);
});

describe("Ermäßigungsvorschau", () => {
  it("nennt nur den Schlüssel der Ermäßigung", async () => {
    const response = await POST(request({ ...anna, first_name: " anna " }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ discount: "reduced_50" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.getRecognizableDiscounts).toHaveBeenCalledWith("anna@example.de", expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  });

  it("antwortet ohne Treffer gleich wie bei ungültiger Eingabe", async () => {
    const results = [];
    for (const body of [
      { ...anna, last_name: "Mustermann" },
      { ...anna, email: "keine-mail" },
      { ...anna, first_name: "" },
      { first_name: 42 },
      "kein json",
    ]) {
      const response = await POST(request(body));
      results.push([response.status, await response.json()]);
    }
    expect(results).toEqual(Array(5).fill([200, { discount: null }]));
  });

  it("fragt die Datenbank bei unvollständiger Eingabe gar nicht erst", async () => {
    await POST(request({ ...anna, email: "" }));
    expect(mocks.getRecognizableDiscounts).not.toHaveBeenCalled();
  });

  it("verrät auch bei einem Datenbankfehler nichts", async () => {
    mocks.getRecognizableDiscounts.mockRejectedValue(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await POST(request(anna));
    expect(await response.json()).toEqual({ discount: null });
  });

  it("antwortet ohne Datenbank mit null", async () => {
    mocks.isPostgresConfigured.mockReturnValue(false);
    expect(await (await POST(request(anna))).json()).toEqual({ discount: null });
  });

  it("begrenzt die Anfragen", async () => {
    mocks.allowed.value = false;
    const response = await POST(request(anna));
    expect(response.status).toBe(429);
    expect(mocks.getRecognizableDiscounts).not.toHaveBeenCalled();
  });
});

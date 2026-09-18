import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../app/api/checkout/confirm/route";

const mocks = vi.hoisted(() => ({ info: vi.fn(), stripe: vi.fn(), sync: vi.fn(), recover: vi.fn(), limit: vi.fn() }));
vi.mock("@/lib/db", () => ({ getCheckoutInfo: mocks.info }));
vi.mock("@/lib/stripe", () => ({ getStripe: mocks.stripe }));
vi.mock("@/lib/checkout-status", () => ({ synchronizeRegistrationCheckouts: mocks.sync }));
vi.mock("@/lib/checkout-creation", () => ({ recoverAbandonedCheckout: mocks.recover }));
vi.mock("@/lib/ratelimit", () => ({ checkRateLimit: mocks.limit, getClientIp: () => "test", RATE_LIMITS: { checkoutStatus: {} } }));

const request = (body: unknown) => new NextRequest("http://localhost/api/checkout/confirm", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: typeof body === "string" ? body : JSON.stringify(body),
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.limit.mockReturnValue(true);
  mocks.info.mockResolvedValue({ registration_id: 7 });
  mocks.stripe.mockReturnValue({ client: true });
});

describe("Abgleich nach Rückkehr von Stripe", () => {
  it("verbucht die Rückkehr-Session nur zusammen mit dem Status-Token", async () => {
    const response = await POST(request({ session_id: "cs_1" }));
    expect(response.status).toBe(400);
    expect(mocks.sync).not.toHaveBeenCalled();
    expect(mocks.recover).not.toHaveBeenCalled();
  });

  it("gleicht zuerst verwaiste Anlagen, dann Session und gespeicherte Checkouts derselben Anmeldung ab", async () => {
    expect((await POST(request({ session_id: "cs_1", status_token: "token" }))).status).toBe(200);
    expect(mocks.info).toHaveBeenCalledWith("token");
    expect(mocks.recover).toHaveBeenCalledWith({ client: true }, { registration_id: 7 });
    expect(mocks.sync).toHaveBeenCalledWith(7, "cs_1");
    expect(mocks.recover.mock.invocationCallOrder[0]).toBeLessThan(mocks.sync.mock.invocationCallOrder[0]);
  });

  it("gleicht beim Neuladen ohne Session-ID die gespeicherten Checkouts ab", async () => {
    expect((await POST(request({ status_token: "token" }))).status).toBe(200);
    expect(mocks.sync).toHaveBeenCalledWith(7, undefined);
  });

  it("weist eine ID ab, die keine Checkout-Session sein kann", async () => {
    expect((await POST(request({ session_id: "pi_1", status_token: "token" }))).status).toBe(400);
    expect(mocks.info).not.toHaveBeenCalled();
  });

  it("kennt keine Anmeldung zu einem falschen Token", async () => {
    mocks.info.mockResolvedValue(null);
    expect((await POST(request({ session_id: "cs_1", status_token: "falsch" }))).status).toBe(404);
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("überspringt die Wiederaufnahme ohne Stripe-Client, gleicht aber weiterhin ab", async () => {
    mocks.stripe.mockReturnValue(null);
    await POST(request({ status_token: "token" }));
    expect(mocks.recover).not.toHaveBeenCalled();
    expect(mocks.sync).toHaveBeenCalledWith(7, undefined);
  });

  it("antwortet bei gestörtem Abgleich mit 503 statt mit einem vermeintlichen Erfolg", async () => {
    mocks.sync.mockRejectedValue(new Error("stripe down"));
    const response = await POST(request({ session_id: "cs_1", status_token: "token" }));
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty("synchronized");
  });

  it("gibt einen Fehler der Wiederaufnahme nicht als Erfolg aus", async () => {
    mocks.recover.mockRejectedValue(new Error("Anlage unklar"));
    expect((await POST(request({ status_token: "token" }))).status).toBe(503);
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("bremst Dauerabfragen, bevor die Datenbank befragt wird", async () => {
    mocks.limit.mockReturnValue(false);
    expect((await POST(request({ session_id: "cs_1", status_token: "token" }))).status).toBe(429);
    expect(mocks.info).not.toHaveBeenCalled();
  });

  it("übersteht einen unlesbaren Body", async () => {
    const response = await POST(request("kein json"));
    expect(response.status).toBe(503);
    expect(mocks.sync).not.toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../app/api/stripe/webhook/route";

const mocks = vi.hoisted(() => ({ construct: vi.fn(), fulfill: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ getStripe: () => ({ webhooks: { constructEvent: mocks.construct } }) }));
vi.mock("@/lib/checkout-fulfillment", () => ({ fulfillCheckout: mocks.fulfill }));
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("STRIPE_WEBHOOK_SECRET", "test-secret"); });
afterEach(() => vi.unstubAllEnvs());
const request = () => new NextRequest("http://localhost/api/stripe/webhook", {
  method: "POST", headers: { "stripe-signature": "signature" }, body: "raw-body",
});

describe("Stripe-Webhook-Zuordnung", () => {
  it.each(["checkout.session.completed", "checkout.session.async_payment_succeeded"])("verarbeitet %s über denselben Abgleich", async type => {
    mocks.construct.mockReturnValue({ type, data: { object: { id: "cs_1" } } });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.construct).toHaveBeenCalledWith("raw-body", "signature", "test-secret");
    expect(mocks.fulfill).toHaveBeenCalledWith("cs_1");
  });

  it("kennzeichnet einen signierten asynchronen Fehlschlag", async () => {
    mocks.construct.mockReturnValue({ type: "checkout.session.async_payment_failed", data: { object: { id: "cs_1" } } });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.fulfill).toHaveBeenCalledWith("cs_1", true);
  });

  it("fordert bei einem Verarbeitungs-/Versandfehler eine erneute Zustellung an", async () => {
    mocks.construct.mockReturnValue({ type: "checkout.session.completed", data: { object: { id: "cs_1" } } });
    mocks.fulfill.mockRejectedValue(new Error("retry"));
    expect((await POST(request())).status).toBe(500);
  });

  it("verarbeitet keine ungültige Signatur", async () => {
    mocks.construct.mockImplementation(() => { throw new Error("signature"); });
    expect((await POST(request())).status).toBe(400);
    expect(mocks.fulfill).not.toHaveBeenCalled();
  });

  it("ignoriert spätere Rücklastschriften wie vereinbart", async () => {
    mocks.construct.mockReturnValue({ type: "charge.dispute.created", data: { object: { id: "dp_1" } } });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.fulfill).not.toHaveBeenCalled();
  });
});

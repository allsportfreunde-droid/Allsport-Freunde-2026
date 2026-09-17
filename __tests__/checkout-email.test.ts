import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("resend", () => ({ Resend: class { emails = { send: mocks.send }; } }));

beforeEach(() => { vi.resetModules(); vi.resetAllMocks(); vi.stubEnv("RESEND_API_KEY", "test-only"); });

describe("Checkout-Mailversand", () => {
  it("behandelt auch einen zurückgegebenen Provider-Fehler als fehlgeschlagenen Versand", async () => {
    const { sendCheckoutEmail } = await import("../lib/email");
    mocks.send.mockResolvedValue({ data: null, error: { message: "rejected" } });
    await expect(sendCheckoutEmail({ from: "a@example.com", to: "b@example.com", subject: "test", html: "test" }, "notice-1"))
      .rejects.toThrow("nicht bestätigt");
    vi.unstubAllEnvs();
  });

  it("gibt den stabilen Idempotenzschlüssel an den Provider weiter", async () => {
    const { sendCheckoutEmail } = await import("../lib/email");
    const message = { from: "a@example.com", to: "b@example.com", subject: "test", html: "test" };
    mocks.send.mockResolvedValue({ data: { id: "mail-1" }, error: null });
    await sendCheckoutEmail(message, "notice-1");
    expect(mocks.send).toHaveBeenCalledWith(message, { idempotencyKey: "notice-1" });
    vi.unstubAllEnvs();
  });
});

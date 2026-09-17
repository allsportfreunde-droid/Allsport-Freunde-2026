import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import {
  CheckoutBlockedError, checkoutDisplayState, closePreviousCheckouts,
  stripeCheckoutState, synchronizeRegistrationCheckouts,
} from "../lib/checkout-status";
import type { CheckoutPaymentState, SavedCheckout } from "../lib/db/checkout";

const mocks = vi.hoisted(() => ({
  retrieve: vi.fn(), expire: vi.fn(), stripe: vi.fn(), fulfill: vi.fn(),
  saved: vi.fn(), recordState: vi.fn(), creationPending: vi.fn(),
}));
vi.mock("@/lib/stripe", () => ({ getStripe: mocks.stripe }));
vi.mock("@/lib/db", () => ({
  getRegistrationCheckouts: mocks.saved, recordCheckoutState: mocks.recordState, hasCheckoutCreation: mocks.creationPending,
}));
// Die Erkennung der Zahlungsart bleibt echt; nur die Verbuchung selbst wird beobachtet.
vi.mock("@/lib/checkout-fulfillment", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/checkout-fulfillment")>()), fulfillCheckout: mocks.fulfill,
}));

type Session = Stripe.Checkout.Session;
/** Standard: abgeschlossene Session mit laufendem SEPA-Einzug. `intent: null` = ohne PaymentIntent. */
function session(overrides: Partial<Omit<Session, "payment_intent">> & {
  intent?: Partial<Stripe.PaymentIntent> | null; method?: string;
} = {}): Session {
  const { intent, method = "sepa_debit", ...rest } = overrides;
  return {
    id: "cs_1", mode: "payment", status: "complete", payment_status: "unpaid",
    client_reference_id: "1", metadata: { registration_id: "1" },
    payment_intent: intent === null ? null : { id: "pi_1", status: "processing", payment_method: { type: method }, ...intent },
    ...rest,
  } as unknown as Session;
}
const saved = (state: CheckoutPaymentState, prices: Record<string, number> | null = { a: 1000 }, id = `cs_${state}`): SavedCheckout =>
  ({ session_id: id, payment_state: state, person_prices: prices });
const stripe = () => mocks.stripe() as Stripe;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.stripe.mockReturnValue({ checkout: { sessions: { retrieve: mocks.retrieve, expire: mocks.expire } } });
  mocks.saved.mockResolvedValue([]);
  mocks.creationPending.mockResolvedValue(false);
});

describe("Zustand einer Stripe-Session", () => {
  it.each([
    ["bezahlt", session({ payment_status: "paid" }), "paid"],
    ["laufender SEPA-Einzug", session(), "processing"],
    ["laufende Kartenzahlung", session({ method: "card" }), "checking"],
    ["fehlgeschlagener SEPA-Einzug", session({ intent: { status: "requires_payment_method" } }), "failed"],
    ["abgebrochene Kartenzahlung", session({ method: "card", intent: { status: "requires_payment_method" } }), "checking"],
    ["offener Zahlungslink", session({ status: "open", intent: null }), "open"],
    ["abgelaufener Zahlungslink", session({ status: "expired", intent: null }), "open"],
    ["offener Link mit gerade laufender Zahlung", session({ status: "open" }), "checking"],
    ["SEPA-Einzug ohne aufgelöste Zahlungsmethode", session({ intent: { payment_method: "pm_1" } }), "checking"],
  ])("erkennt %s", (_label, current, expected) => {
    expect(stripeCheckoutState(current)).toBe(expected);
  });
});

describe("Anzeigezustand aus gespeicherten Checkouts", () => {
  it("lässt eine verbuchte Zahlung über jeden gespeicherten Zwischenstand gewinnen", () => {
    expect(checkoutDisplayState("2026-09-15T10:00:00Z", [saved("failed"), saved("processing")], true))
      .toEqual({ payment_state: "paid", checkout_amount: null });
  });

  it("summiert laufende Einzüge und verschweigt den Betrag bei unvollständiger Aufteilung", () => {
    expect(checkoutDisplayState(null, [saved("processing", { a: 1000, b: 400 }), saved("processing", { c: 200 }, "cs_2")]))
      .toEqual({ payment_state: "processing", checkout_amount: 16 });
    expect(checkoutDisplayState(null, [saved("processing", null), saved("processing")]))
      .toEqual({ payment_state: "processing", checkout_amount: null });
  });

  it("lässt einen laufenden Einzug vor einem älteren Fehlschlag gewinnen", () => {
    expect(checkoutDisplayState(null, [saved("failed"), saved("processing")]).payment_state).toBe("processing");
  });

  it("meldet Prüfung, solange ein Checkout angelegt wird oder eine Zahlung noch nicht verbucht ist", () => {
    expect(checkoutDisplayState(null, [], true).payment_state).toBe("checking");
    expect(checkoutDisplayState(null, [saved("paid")]).payment_state).toBe("checking");
    expect(checkoutDisplayState(null, [saved("checking")]).payment_state).toBe("checking");
  });

  it("zeigt einen Fehlschlag nur, wenn er der jüngste Vorgang ist", () => {
    expect(checkoutDisplayState(null, [saved("failed")]).payment_state).toBe("failed");
    expect(checkoutDisplayState(null, [saved("open"), saved("failed")]).payment_state).toBe("open");
    expect(checkoutDisplayState(null, []).payment_state).toBe("open");
  });
});

describe("Abgleich der Checkouts einer Anmeldung", () => {
  it("löst mit einem fremden Rückkehrlink keine Verbuchung aus – auch nicht für eigene Sessions", async () => {
    mocks.saved.mockResolvedValue([saved("checking", null, "cs_own")]);
    mocks.retrieve.mockImplementation(async (id: string) => id === "cs_foreign"
      ? session({ id, client_reference_id: "2", metadata: { registration_id: "2" }, payment_status: "paid" })
      : session({ id, payment_status: "paid" }));
    await expect(synchronizeRegistrationCheckouts(1, "cs_foreign")).rejects.toThrow("gehört nicht");
    expect(mocks.fulfill).not.toHaveBeenCalled();
  });

  it("bricht bei einer Session ohne jede Zuordnung ab", async () => {
    mocks.retrieve.mockResolvedValue(session({ client_reference_id: null, metadata: {}, payment_status: "paid" }));
    await expect(synchronizeRegistrationCheckouts(1, "cs_1")).rejects.toThrow("gehört nicht");
    expect(mocks.fulfill).not.toHaveBeenCalled();
  });

  it("verbucht eine angegebene Session auch ohne gespeicherten Eintrag", async () => {
    mocks.retrieve.mockResolvedValue(session({ id: "cs_new", payment_status: "paid" }));
    await synchronizeRegistrationCheckouts(1, "cs_new");
    expect(mocks.fulfill).toHaveBeenCalledWith("cs_new", false);
  });

  it("kennzeichnet einen fehlgeschlagenen SEPA-Einzug beim Abgleich", async () => {
    mocks.saved.mockResolvedValue([saved("processing", null, "cs_1")]);
    mocks.retrieve.mockResolvedValue(session({ intent: { status: "requires_payment_method" } }));
    await synchronizeRegistrationCheckouts(1);
    expect(mocks.fulfill).toHaveBeenCalledWith("cs_1", true);
  });

  it("hält eine noch laufende Kartenzahlung als Prüfung fest, ohne zu bestätigen", async () => {
    mocks.saved.mockResolvedValue([saved("open", null, "cs_1")]);
    mocks.retrieve.mockResolvedValue(session({ method: "card" }));
    await synchronizeRegistrationCheckouts(1);
    expect(mocks.recordState).toHaveBeenCalledWith("cs_1", 1, "checking", "pi_1");
    expect(mocks.fulfill).not.toHaveBeenCalled();
  });

  it("fragt Stripe ohne bekannte Sessions gar nicht erst an", async () => {
    mocks.stripe.mockReturnValue(null);
    await expect(synchronizeRegistrationCheckouts(1)).resolves.toBeUndefined();
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });

  it("bricht ohne Stripe-Konfiguration hörbar ab, statt still nichts zu tun", async () => {
    mocks.stripe.mockReturnValue(null);
    await expect(synchronizeRegistrationCheckouts(1, "cs_1")).rejects.toThrow("nicht verfügbar");
  });

  it("gibt einen Stripe-Ausfall weiter", async () => {
    mocks.retrieve.mockRejectedValue(new Error("stripe down"));
    await expect(synchronizeRegistrationCheckouts(1, "cs_1")).rejects.toThrow("stripe down");
  });
});

describe("Schließen früherer Zahlungslinks", () => {
  it("schließt offene Links, bevor ein neuer entsteht", async () => {
    mocks.retrieve.mockResolvedValue(session({ id: "cs_old", status: "open", intent: null }));
    mocks.expire.mockResolvedValue(session({ id: "cs_old", status: "expired", intent: null }));
    await closePreviousCheckouts(stripe(), 1, ["cs_old"]);
    expect(mocks.expire).toHaveBeenCalledWith("cs_old");
    expect(mocks.fulfill).not.toHaveBeenCalled();
  });

  it("blockiert, wenn ein offener Link nicht geschlossen werden konnte", async () => {
    mocks.retrieve.mockResolvedValue(session({ status: "open", intent: null }));
    mocks.expire.mockRejectedValue(new Error("stripe down"));
    await expect(closePreviousCheckouts(stripe(), 1, ["cs_1"])).rejects.toThrow("konnte noch nicht geschlossen");
  });

  it("hält einen Link für offen, wenn Stripe das Schließen nicht bestätigt", async () => {
    mocks.retrieve.mockResolvedValue(session({ status: "open", intent: null }));
    mocks.expire.mockResolvedValue(session({ status: "open", intent: null }));
    await expect(closePreviousCheckouts(stripe(), 1, ["cs_1"])).rejects.toThrow("konnte noch nicht geschlossen");
  });

  it("erkennt eine Zahlung, die beim Schließen gerade gewinnt, und verbucht sie", async () => {
    mocks.retrieve
      .mockResolvedValueOnce(session({ status: "open", intent: null }))
      .mockResolvedValue(session({ payment_status: "paid" }));
    mocks.expire.mockRejectedValue(new Error("session already complete"));
    const error = await closePreviousCheckouts(stripe(), 1, ["cs_1"]).catch(e => e);
    expect(error).toBeInstanceOf(CheckoutBlockedError);
    expect(error.paymentState).toBe("paid");
    expect(mocks.fulfill).toHaveBeenCalledWith("cs_1", false);
  });

  it("verhindert einen zweiten Checkout während eines laufenden SEPA-Einzugs", async () => {
    mocks.retrieve.mockResolvedValue(session());
    const error = await closePreviousCheckouts(stripe(), 1, ["cs_1"]).catch(e => e);
    expect(error).toBeInstanceOf(CheckoutBlockedError);
    expect(error.paymentState).toBe("processing");
    expect(mocks.expire).not.toHaveBeenCalled();
  });

  it("lässt nach einem fehlgeschlagenen Einzug erneut bezahlen", async () => {
    mocks.retrieve.mockResolvedValue(session({ intent: { status: "requires_payment_method" } }));
    await expect(closePreviousCheckouts(stripe(), 1, ["cs_1"])).resolves.toBeUndefined();
    expect(mocks.fulfill).toHaveBeenCalledWith("cs_1", true);
  });

  it("meldet bei mehreren Vorgängen die bezahlte Session, nicht den laufenden Einzug", async () => {
    mocks.retrieve.mockImplementation(async (id: string) => id === "cs_paid" ? session({ id, payment_status: "paid" }) : session({ id }));
    const error = await closePreviousCheckouts(stripe(), 1, ["cs_sepa", "cs_paid"]).catch(e => e);
    expect(error.paymentState).toBe("paid");
  });
});

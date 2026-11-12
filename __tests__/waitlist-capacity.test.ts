import { beforeEach, describe, expect, it, vi } from "vitest";
import { toPublicEvent, type EventWithRegistrations } from "../lib/types";

const mocks = vi.hoisted(() => ({
  isEventFull: vi.fn(),
  getEvent: vi.fn(),
  getWaitlistRecipients: vi.fn(),
  getOpenEventCheckouts: vi.fn(),
  retrieve: vi.fn(),
  expire: vi.fn(),
  buildMail: vi.fn(),
  sendBatch: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  isEventFull: mocks.isEventFull,
  getEvent: mocks.getEvent,
  getWaitlistRecipients: mocks.getWaitlistRecipients,
  getOpenEventCheckouts: mocks.getOpenEventCheckouts,
}));
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({ checkout: { sessions: { retrieve: mocks.retrieve, expire: mocks.expire } } }),
}));
vi.mock("@/lib/email", () => ({
  buildWaitlistSpotFreedEmail: mocks.buildMail,
  sendEmailBatch: mocks.sendBatch,
}));

const { onCapacityChanged } = await import("../lib/waitlist");

const paidEvent = {
  id: 7, title: "Sportabend", date: "2099-09-20", time: "18:00", location: "Sporthalle",
  status: "published", max_participants: 2, price: "8 €", entry_price: 8, child_entry_price: null,
};

const recipient = (id: number, email: string) => ({
  registration_id: id, email, status_token: `token-${id}`,
  persons: [{ first_name: "Ada", last_name: `Gast${id}`, is_child: false, discount: null }],
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isEventFull.mockResolvedValue(false);
  mocks.getEvent.mockResolvedValue(paidEvent);
  mocks.getWaitlistRecipients.mockResolvedValue([recipient(1, "a@example.com"), recipient(2, "b@example.com")]);
  mocks.getOpenEventCheckouts.mockResolvedValue([]);
  mocks.buildMail.mockImplementation(async (data: { to: string }) => ({ to: data.to }));
  mocks.sendBatch.mockResolvedValue(true);
});

describe("Platz wird frei", () => {
  it("schreibt alle Unbezahlten an, wenn das Event von voll auf frei wechselt", async () => {
    await onCapacityChanged(7, true);

    expect(mocks.buildMail).toHaveBeenCalledTimes(2);
    expect(mocks.buildMail).toHaveBeenCalledWith(expect.objectContaining({
      to: "a@example.com", statusToken: "token-1", priceLabel: expect.stringContaining("8,00"),
    }));
    expect(mocks.sendBatch).toHaveBeenCalledWith(
      [{ to: "a@example.com" }, { to: "b@example.com" }],
      expect.stringMatching(/^waitlist-spot-freed\/7\//)
    );
  });

  it("mailt nicht, wenn das Event vorher schon frei war", async () => {
    await onCapacityChanged(7, false);
    expect(mocks.getWaitlistRecipients).not.toHaveBeenCalled();
    expect(mocks.sendBatch).not.toHaveBeenCalled();
  });

  it("mailt nicht, solange das Event weiter voll ist", async () => {
    mocks.isEventFull.mockResolvedValue(true);
    await onCapacityChanged(7, true);
    expect(mocks.sendBatch).not.toHaveBeenCalled();
  });

  it.each([
    ["kostenlos", { price: "Kostenlos", entry_price: null }],
    ["vergangen", { date: "2000-01-01" }],
    ["nicht veröffentlicht", { status: "cancelled" }],
  ])("mailt nicht bei einem Event, das %s ist", async (_label, overrides) => {
    mocks.getEvent.mockResolvedValue({ ...paidEvent, ...overrides });
    await onCapacityChanged(7, true);
    expect(mocks.sendBatch).not.toHaveBeenCalled();
  });

  it("wirft nie – eine Stornierung darf am Mailversand nicht scheitern", async () => {
    mocks.getWaitlistRecipients.mockRejectedValue(new Error("DB weg"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(onCapacityChanged(7, true)).resolves.toBeUndefined();
  });
});

describe("Event wird voll", () => {
  beforeEach(() => mocks.isEventFull.mockResolvedValue(true));

  it("schließt die offenen Bezahlfenster der übrigen Anmeldungen", async () => {
    mocks.getOpenEventCheckouts.mockResolvedValue([
      { session_id: "cs_open", registration_id: 1 },
      { session_id: "cs_done", registration_id: 2 },
    ]);
    mocks.retrieve.mockImplementation(async (id: string) => ({ id, status: id === "cs_open" ? "open" : "complete" }));

    await onCapacityChanged(7, false);

    expect(mocks.expire).toHaveBeenCalledTimes(1);
    expect(mocks.expire).toHaveBeenCalledWith("cs_open");
    expect(mocks.sendBatch).not.toHaveBeenCalled();
  });

  it("macht weiter, wenn Stripe ein Fenster nicht schließen kann", async () => {
    mocks.getOpenEventCheckouts.mockResolvedValue([
      { session_id: "cs_1", registration_id: 1 },
      { session_id: "cs_2", registration_id: 2 },
    ]);
    mocks.retrieve.mockImplementation(async (id: string) => ({ id, status: "open" }));
    mocks.expire.mockRejectedValueOnce(new Error("gerade abgeschlossen"));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(onCapacityChanged(7, false)).resolves.toBeUndefined();
    expect(mocks.expire).toHaveBeenCalledWith("cs_2");
  });
});

describe("Öffentliche Belegung", () => {
  const event = (current: number, pending: number) => ({
    id: 1, max_participants: 10, current_participants: current, pending_participants: pending,
  }) as EventWithRegistrations;

  it("zählt nur bestätigte Anmeldungen – offene reservieren nichts", () => {
    expect(toPublicEvent(event(5, 5))).toMatchObject({ occupancy_percentage: 50, is_full: false });
    expect(toPublicEvent(event(10, 0))).toMatchObject({ occupancy_percentage: 100, is_full: true });
  });

  it("gibt keine Rohzahlen an den Browser", () => {
    const pub = toPublicEvent(event(3, 2));
    expect(pub).not.toHaveProperty("current_participants");
    expect(pub).not.toHaveProperty("pending_participants");
    expect(pub).not.toHaveProperty("max_participants");
  });
});

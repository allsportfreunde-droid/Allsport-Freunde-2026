import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getReviewTokenInfo: vi.fn(), isPostgresConfigured: vi.fn(), saveReview: vi.fn(),
  checkRateLimit: vi.fn(), getClientIp: vi.fn(), invalidateCache: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  getReviewTokenInfo: mocks.getReviewTokenInfo, isPostgresConfigured: mocks.isPostgresConfigured, saveReview: mocks.saveReview,
}));
vi.mock("@/lib/ratelimit", () => ({
  checkRateLimit: mocks.checkRateLimit, getClientIp: mocks.getClientIp,
  RATE_LIMITS: { review: { limit: 60, windowMs: 10 * 60 * 1000 } },
}));
vi.mock("@/lib/cache", () => ({ invalidateCache: mocks.invalidateCache }));

const { GET, POST } = await import("../app/api/review/[token]/route");
const answer = { rating: 4, would_return: "ja", comment: "Super!", publish_consent: true };
const publicInfo = {
  first_name: "Ahmet", event_title: "Fußball", event_date: "2026-10-18",
  deadline: "2026-11-01T12:00:00.000Z", is_open: true, review: answer,
};
const internalInfo = { ...publicInfo, registration_id: 42, event_id: 7, email: "geheim@example.com" };
const storedReview = { ...answer, id: 11, registration_id: 42, event_id: 7, published_by: "admin@example.com" };
const context = () => ({ params: Promise.resolve({ token: "geheimer-token" }) });
function get() {
  return GET(new NextRequest("http://localhost/api/review/geheimer-token?rating=5"), context());
}
function post(body: unknown = { rating: 4 }) {
  return POST(new NextRequest("http://localhost/api/review/geheimer-token", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }), context());
}

async function expectResponse(response: Response, status: number, value: unknown) {
  expect(response.status).toBe(status);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual(value);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.isPostgresConfigured.mockReturnValue(true);
  mocks.checkRateLimit.mockReturnValue(true);
  mocks.getClientIp.mockReturnValue("test-ip");
  mocks.getReviewTokenInfo.mockResolvedValue(internalInfo);
  mocks.saveReview.mockResolvedValue({ review: storedReview, unpublished: false });
});
afterEach(() => vi.restoreAllMocks());

describe.each([{ name: "GET", call: get }, { name: "POST", call: () => post() }])("Öffentliche Review-API: $name", ({ call }) => {
  it("weist unbekannte oder nicht eingeladene Tokens zurück", async () => {
    mocks.getReviewTokenInfo.mockResolvedValue(null);
    await expectResponse(await call(), 404, { error: "Dieser Link ist ungültig." });
    expect(mocks.saveReview).not.toHaveBeenCalled();
  });
  it("antwortet ohne Datenbank wie bei einem unbekannten Token", async () => {
    mocks.isPostgresConfigured.mockReturnValue(false);
    await expectResponse(await call(), 404, { error: "Dieser Link ist ungültig." });
    expect(mocks.getReviewTokenInfo).not.toHaveBeenCalled();
    expect(mocks.saveReview).not.toHaveBeenCalled();
  });
  it("begrenzt Anfragen vor dem Datenbankzugriff", async () => {
    mocks.checkRateLimit.mockReturnValue(false);
    await expectResponse(await call(), 429, { error: "Zu viele Anfragen. Bitte später erneut versuchen." });
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("test-ip", { limit: 60, windowMs: 600000 });
    expect(mocks.getReviewTokenInfo).not.toHaveBeenCalled();
    expect(mocks.saveReview).not.toHaveBeenCalled();
  });
  it("protokolliert Fehler ohne interne Details zu veröffentlichen", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getReviewTokenInfo.mockRejectedValue(new Error("Interne Datenbankdetails."));
    await expectResponse(await call(), 500, { error: "Ein Fehler ist aufgetreten." });
    expect(error).toHaveBeenCalled();
  });
});

describe("GET Review", () => {
  it("liefert nur öffentliche Angaben und speichert auch mit rating im Link nichts", async () => {
    mocks.getReviewTokenInfo.mockResolvedValue({ ...internalInfo, review: storedReview });
    await expectResponse(await get(), 200, publicInfo);
    expect(mocks.getReviewTokenInfo).toHaveBeenCalledWith("geheimer-token");
    expect(mocks.saveReview).not.toHaveBeenCalled();
    expect(mocks.invalidateCache).not.toHaveBeenCalled();
  });
  it("liefert auch geschlossene und noch unbeantwortete Einladungen", async () => {
    mocks.getReviewTokenInfo.mockResolvedValue({ ...internalInfo, is_open: false, review: null });
    await expectResponse(await get(), 200, { ...publicInfo, is_open: false, review: null });
  });
});

describe("POST Review", () => {
  it("sperrt nach Ende des Antwortfensters mit 410", async () => {
    mocks.getReviewTokenInfo.mockResolvedValue({ ...internalInfo, is_open: false });
    await expectResponse(await post(), 410, { error: "Die Bewertungsfrist für dieses Event ist abgelaufen." });
    expect(mocks.saveReview).not.toHaveBeenCalled();
  });
  it.each([0, 6, 2.5, "4", null])("weist die ungültige Sternezahl %s zurück", async (rating) => {
    const response = await post({ rating });
    await expectResponse(response, 400, { error: "Bitte wähle eine ganze Anzahl von 1 bis 5 Sternen." });
    expect(mocks.getReviewTokenInfo).not.toHaveBeenCalled();
    expect(mocks.saveReview).not.toHaveBeenCalled();
  });
  it("weist unlesbares JSON mit 400 zurück", async () => {
    const response = await POST(new NextRequest("http://localhost/api/review/token", { method: "POST", body: "{" }), context());
    await expectResponse(response, 400, { error: "Bitte übermittle eine gültige Bewertung." });
    expect(mocks.saveReview).not.toHaveBeenCalled();
  });
  it("speichert beim Sternklick ausschließlich die Sternezahl und liefert keine internen Daten", async () => {
    await expectResponse(await post(), 200, { review: answer });
    expect(mocks.saveReview).toHaveBeenCalledExactlyOnceWith(42, 7, { rating: 4 });
    expect(mocks.invalidateCache).not.toHaveBeenCalled();
  });
  it("übernimmt optionale Antworten und ausdrücklich geleerte Felder", async () => {
    await post({ rating: 5, would_return: null, comment: "  Gut!  ", publish_consent: false, registration_id: 99, event_id: 999 });
    expect(mocks.saveReview).toHaveBeenCalledExactlyOnceWith(42, 7, { rating: 5, would_return: null, comment: "Gut!", publish_consent: false });
  });
  it("leert den Testimonials-Cache bei automatischem Entzug der Freigabe", async () => {
    mocks.saveReview.mockResolvedValue({ review: storedReview, unpublished: true });
    await expectResponse(await post(), 200, { review: answer });
    expect(mocks.invalidateCache).toHaveBeenCalledExactlyOnceWith("testimonials");
  });
  it("behandelt Speicherfehler als 500 und leert den Cache nicht", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.saveReview.mockRejectedValue(new Error("Speichern fehlgeschlagen."));
    await expectResponse(await post(), 500, { error: "Ein Fehler ist aufgetreten." });
    expect(mocks.invalidateCache).not.toHaveBeenCalled();
  });
});

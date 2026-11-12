import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFromCache, invalidateCache, setCache } from "../lib/cache";

const mocks = vi.hoisted(() => ({ getPublicTestimonials: vi.fn(), isPostgresConfigured: vi.fn() }));
vi.mock("@/lib/db", () => ({ getPublicTestimonials: mocks.getPublicTestimonials, isPostgresConfigured: mocks.isPostgresConfigured }));
const { GET, dynamic } = await import("../app/api/testimonials/route");
const empty = { average: null, count: 0, items: [] };
const data = { average: 4.6, count: 10, items: [{
  id: 11, name: "Ahmet K.", rating: 5, comment: "Super!", event_title: "Fußball", event_category: "fussball", event_date: "2026-10-18",
}] };

beforeEach(() => {
  vi.resetAllMocks(); invalidateCache();
  mocks.isPostgresConfigured.mockReturnValue(true);
  mocks.getPublicTestimonials.mockResolvedValue(data);
});
afterEach(() => { vi.restoreAllMocks(); invalidateCache(); });

async function expectResponse(value: unknown) {
  const response = await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual(value);
}

describe("Öffentliche Testimonials-API", () => {
  it("wird dynamisch ausgeführt", () => { expect(dynamic).toBe("force-dynamic"); });
  it("liefert ohne Datenbank eine leere Antwort ohne Datenbankzugriff", async () => {
    mocks.isPostgresConfigured.mockReturnValue(false);
    setCache("testimonials:public", data);
    await expectResponse(empty);
    expect(mocks.getPublicTestimonials).not.toHaveBeenCalled();
  });
  it("liefert einen Cache-Treffer ohne erneute Datenbankabfrage", async () => {
    setCache("testimonials:public", data);
    await expectResponse(data);
    expect(mocks.getPublicTestimonials).not.toHaveBeenCalled();
  });
  it("lädt höchstens sechs Kommentare und speichert die Antwort unter dem passenden Präfix", async () => {
    await expectResponse(data);
    expect(mocks.getPublicTestimonials).toHaveBeenCalledExactlyOnceWith(6);
    expect(getFromCache("testimonials:public")).toEqual(data);
    await expectResponse(data);
    expect(mocks.getPublicTestimonials).toHaveBeenCalledTimes(1);
    invalidateCache("testimonials");
    await expectResponse(data);
    expect(mocks.getPublicTestimonials).toHaveBeenCalledTimes(2);
  });
  it("antwortet bei Fehlern mit 200 und leerer Liste und speichert den Fehler nicht im Cache", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getPublicTestimonials.mockRejectedValueOnce(new Error("Datenbank nicht erreichbar."));
    await expectResponse(empty);
    expect(log).toHaveBeenCalledWith("Fehler beim Laden der Teilnehmerstimmen:", expect.any(Error));
    expect(getFromCache("testimonials:public")).toBeNull();
    await expectResponse(data);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { EventReview, EventReviewDashboard, ReviewOverviewResponse } from "../lib/types";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(), getUser: vi.fn(), isPostgresConfigured: vi.fn(),
  getEventReviewDashboard: vi.fn(), getReviewOverview: vi.fn(), setReviewPublished: vi.fn(),
  sendEventReviewRequests: vi.fn(), logAudit: vi.fn(), invalidateCache: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/db", () => ({
  isPostgresConfigured: mocks.isPostgresConfigured,
  getEventReviewDashboard: mocks.getEventReviewDashboard, getReviewOverview: mocks.getReviewOverview,
  setReviewPublished: mocks.setReviewPublished, logAudit: mocks.logAudit,
}));
vi.mock("@/lib/review-sending", () => ({ sendEventReviewRequests: mocks.sendEventReviewRequests }));
vi.mock("@/lib/cache", () => ({ invalidateCache: mocks.invalidateCache }));

const { GET: getDashboard } = await import("../app/api/admin/events/[id]/review/route");
const { POST: sendReviews, maxDuration } = await import("../app/api/admin/events/[id]/review/send/route");
const { GET: getOverview } = await import("../app/api/admin/reviews/route");
const { PATCH: publishReview } = await import("../app/api/admin/reviews/[reviewId]/route");

const dashboard: EventReviewDashboard = {
  event: { id: 7, title: "Fußball", date: "2026-10-18", status: "published" },
  can_send: true, send_blocked_reason: null,
  checked_in_registrations: 3, without_email: 0, requested: 0, pending_initial: 3,
  first_requested_at: null, reminder_sent_at: null, reminder_candidates: 0,
  stats: { responses: 0, average: null, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, would_return: { ja: 0, vielleicht: 0, nein: 0 } },
  reviews: [],
};
const overview: ReviewOverviewResponse = { events: [], pending_approval: [], published: [] };
const review: EventReview = {
  id: 11, event_id: 7, registration_id: 42, rating: 5, would_return: "ja", comment: "Super!",
  publish_consent: true, published_at: "2026-10-19T10:00:00.000Z",
  created_at: "2026-10-18T12:00:00.000Z", updated_at: "2026-10-19T10:00:00.000Z",
};

function request(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method, headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function dashboardRequest(id = "7") {
  return getDashboard(request("GET", `/api/admin/events/${id}/review`), { params: Promise.resolve({ id }) });
}

function sendRequest(body: unknown = { kind: "initial" }, id = "7") {
  return sendReviews(request("POST", `/api/admin/events/${id}/review/send`, body), { params: Promise.resolve({ id }) });
}

function publishRequest(body: unknown = { published: true }, reviewId = "11") {
  return publishReview(request("PATCH", `/api/admin/reviews/${reviewId}`, body), { params: Promise.resolve({ reviewId }) });
}

const endpoints = [
  { name: "Event-Dashboard", call: () => dashboardRequest(), operation: mocks.getEventReviewDashboard },
  { name: "Versand", call: () => sendRequest(), operation: mocks.sendEventReviewRequests },
  { name: "Übersicht", call: () => getOverview(), operation: mocks.getReviewOverview },
  { name: "Veröffentlichung", call: () => publishRequest(), operation: mocks.setReviewPublished },
];

async function expectResponse(response: Response, status: number, body: unknown) {
  expect(response.status).toBe(status);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual(body);
}

function expectNoOperations() {
  for (const endpoint of endpoints) expect(endpoint.operation).not.toHaveBeenCalled();
  expect(mocks.logAudit).not.toHaveBeenCalled();
  expect(mocks.invalidateCache).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser } });
  mocks.getUser.mockResolvedValue({ data: { user: { email: "admin@example.com" } } });
  mocks.isPostgresConfigured.mockReturnValue(true);
  mocks.getEventReviewDashboard.mockResolvedValue(dashboard);
  mocks.getReviewOverview.mockResolvedValue(overview);
  mocks.sendEventReviewRequests.mockResolvedValue({ ok: true, result: { kind: "initial", sent: 3, failed: 0 } });
  mocks.setReviewPublished.mockResolvedValue({ ok: true, review });
});

afterEach(() => vi.restoreAllMocks());

describe.each(endpoints)("Gemeinsame Regeln: $name", ({ call, operation }) => {
  it("weist nicht angemeldete Aufrufe mit 401 zurück", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    await expectResponse(await call(), 401, { error: "Nicht autorisiert." });
    expect(mocks.isPostgresConfigured).not.toHaveBeenCalled();
    expectNoOperations();
  });

  it("antwortet ohne Datenbank mit 503", async () => {
    mocks.isPostgresConfigured.mockReturnValue(false);
    await expectResponse(await call(), 503, { error: "Reviews benötigen eine Datenbank (POSTGRES_URL)." });
    expectNoOperations();
  });

  it("protokolliert interne Fehler und gibt keine internen Details zurück", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    operation.mockRejectedValue(new Error("Interne Datenbankdetails."));
    await expectResponse(await call(), 500, { error: "Ein Fehler ist aufgetreten." });
    expect(logged).toHaveBeenCalledWith(expect.stringContaining("Fehler"), expect.any(Error));
  });

  it("behandelt auch Fehler der Authentifizierung als interne Fehler", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getUser.mockRejectedValue(new Error("Authentifizierung nicht erreichbar."));
    await expectResponse(await call(), 500, { error: "Ein Fehler ist aufgetreten." });
    expectNoOperations();
  });
});

describe("Event-Review-Dashboard", () => {
  it("gibt das Dashboard ohne zusätzliche Hülle zurück", async () => {
    await expectResponse(await dashboardRequest(), 200, dashboard);
    expect(mocks.getEventReviewDashboard).toHaveBeenCalledExactlyOnceWith(7);
  });

  it("meldet ein unbekanntes Event mit 404", async () => {
    mocks.getEventReviewDashboard.mockResolvedValue(null);
    await expectResponse(await dashboardRequest(), 404, { error: "Event nicht gefunden." });
  });
});

describe.each([
  { name: "Dashboard", call: (id: string) => dashboardRequest(id), error: "Ungültige Event-ID." },
  { name: "Versand", call: (id: string) => sendRequest({ kind: "initial" }, id), error: "Ungültige Event-ID." },
  { name: "Veröffentlichung", call: (id: string) => publishRequest({ published: true }, id), error: "Ungültige Review-ID." },
])("ID-Prüfung: $name", ({ call, error }) => {
  it.each(["abc", "7abc", "0", "-1", "1.5", "Infinity", "9007199254740993", "1e2", "0x10"])("weist %s als ungültige ID zurück", async (id) => {
    await expectResponse(await call(id), 400, { error });
    expectNoOperations();
  });
});

describe("Review-Versand", () => {
  it("erlaubt 60 Sekunden für mehrere Versand-Batches", () => {
    expect(maxDuration).toBe(60);
  });

  it.each(["initial", "reminder"])("reicht %s und die Admin-Adresse weiter und gibt das Ergebnis direkt zurück", async (kind) => {
    const result = { kind, sent: 3, failed: 1 };
    mocks.sendEventReviewRequests.mockResolvedValue({ ok: true, result });
    await expectResponse(await sendRequest({ kind }), 200, result);
    expect(mocks.sendEventReviewRequests).toHaveBeenCalledExactlyOnceWith(7, kind, "admin@example.com");
  });

  it("reicht eine fehlende Admin-Adresse als null weiter", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: {} } });
    await sendRequest();
    expect(mocks.sendEventReviewRequests).toHaveBeenCalledWith(7, "initial", null);
  });

  it.each([{}, null, [], "initial", { kind: "foo" }, { kind: 1 }, { kind: null }])("weist einen ungültigen Versandkörper zurück: %s", async (body) => {
    await expectResponse(await sendRequest(body), 400, { error: "Ungültige Versandart." });
    expectNoOperations();
  });

  it("weist unlesbares JSON zurück", async () => {
    const response = await sendReviews(new NextRequest("http://localhost/api/admin/events/7/review/send", { method: "POST", body: "{" }), { params: Promise.resolve({ id: "7" }) });
    await expectResponse(response, 400, { error: "Ungültige Versandart." });
    expectNoOperations();
  });

  it.each([404, 409])("reicht den Status %s und den Fehler der Versandlogik durch", async (status) => {
    mocks.sendEventReviewRequests.mockResolvedValue({ ok: false, status, error: "Das Event wurde abgesagt." });
    await expectResponse(await sendRequest(), status, { error: "Das Event wurde abgesagt." });
  });
});

describe("Review-Übersicht", () => {
  it("gibt die Übersicht ohne zusätzliche Hülle zurück", async () => {
    await expectResponse(await getOverview(), 200, overview);
    expect(mocks.getReviewOverview).toHaveBeenCalledExactlyOnceWith();
  });
});

describe("Review-Veröffentlichung", () => {
  it.each([
    ["not_found", 404, "Review nicht gefunden."],
    ["no_consent", 409, "Ohne Einwilligung darf der Kommentar nicht veröffentlicht werden."],
    ["no_comment", 409, "Ohne Kommentar gibt es nichts zu veröffentlichen."],
  ])("übersetzt %s in die vorgesehene Fehlerantwort", async (reason, status, error) => {
    mocks.setReviewPublished.mockResolvedValue({ ok: false, reason });
    await expectResponse(await publishRequest(), Number(status), { error });
    expect(mocks.invalidateCache).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it.each([true, false])("aktualisiert Freigabe, Cache und Audit-Log (veröffentlicht: %s)", async (published) => {
    const saved = { ...review, published_at: published ? review.published_at : null };
    mocks.setReviewPublished.mockResolvedValue({ ok: true, review: saved });
    await expectResponse(await publishRequest({ published }), 200, { review: saved });
    expect(mocks.setReviewPublished).toHaveBeenCalledExactlyOnceWith(11, published, "admin@example.com");
    expect(mocks.invalidateCache).toHaveBeenCalledExactlyOnceWith("testimonials");
    expect(mocks.logAudit).toHaveBeenCalledExactlyOnceWith("admin@example.com", published ? "PUBLISH_REVIEW" : "UNPUBLISH_REVIEW", "event_review", 11);
    expect(mocks.setReviewPublished.mock.invocationCallOrder[0]).toBeLessThan(mocks.invalidateCache.mock.invocationCallOrder[0]);
  });

  it("reicht eine fehlende Admin-Adresse auch beim Audit-Log als null weiter", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: {} } });
    await publishRequest();
    expect(mocks.setReviewPublished).toHaveBeenCalledWith(11, true, null);
    expect(mocks.logAudit).toHaveBeenCalledWith(null, "PUBLISH_REVIEW", "event_review", 11);
  });

  it.each([{}, null, [], true, { published: "true" }, { published: 1 }, { published: null }])("weist einen ungültigen Veröffentlichungskörper zurück: %s", async (body) => {
    await expectResponse(await publishRequest(body), 400, { error: "Ungültiger Veröffentlichungsstatus." });
    expectNoOperations();
  });

  it("weist unlesbares JSON zurück", async () => {
    const response = await publishReview(new NextRequest("http://localhost/api/admin/reviews/11", { method: "PATCH", body: "{" }), { params: Promise.resolve({ reviewId: "11" }) });
    await expectResponse(response, 400, { error: "Ungültiger Veröffentlichungsstatus." });
    expectNoOperations();
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

interface RecordedQuery {
  text: string;
  values: unknown[];
}

const recorded: RecordedQuery[] = [];

// Rückgabewerte für die nächsten ausgeführten Queries (FIFO); Default: leer.
let results: unknown[][] = [];

/**
 * Verhält sich wie der neon-Tag: verschachtelte Queries werden in den
 * Query-Text eingebettet (und nicht ausgeführt), alles andere wird als
 * Parameter gebunden. Ausgeführt wird erst beim `await`.
 */
class Query implements PromiseLike<unknown[]> {
  readonly text: string;
  readonly values: unknown[];

  constructor(strings: TemplateStringsArray, values: unknown[]) {
    let text = "";
    const flat: unknown[] = [];
    strings.forEach((chunk, i) => {
      text += chunk;
      if (i < values.length) {
        const value = values[i];
        if (value instanceof Query) {
          text += value.text;
          flat.push(...value.values);
        } else {
          text += `$${flat.length + 1}`;
          flat.push(value);
        }
      }
    });
    this.text = text;
    this.values = flat;
  }

  then<T1 = unknown[], T2 = never>(
    onfulfilled?: ((rows: unknown[]) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null
  ): PromiseLike<T1 | T2> {
    recorded.push({ text: this.text, values: this.values });
    return Promise.resolve(results.shift() ?? []).then(onfulfilled, onrejected);
  }
}

function fakeSql(strings: TemplateStringsArray, ...values: unknown[]) {
  return new Query(strings, values);
}

fakeSql.transaction = async (queries: Query[]) => {
  const rows: unknown[][] = [];
  for (const query of queries) rows.push(await query);
  return rows;
};

vi.mock("../lib/db/utils", () => ({ getSQL: () => fakeSql }));

const {
  getReviewRecipients, claimReviewRequests, releaseReviewRequests,
  claimReviewReminders, releaseReviewReminders, claimEventReviewReminder, releaseEventReviewReminder,
  saveReview, setReviewPublished, getEventReviewDashboard, getReviewTokenInfo, getReviewOverview, getPublicTestimonials,
} = await import("../lib/db/reviews");

const review = {
  id: 11, registration_id: 42, event_id: 7, rating: 4, would_return: "ja", comment: "Super!",
  publish_consent: true, published_at: null,
  created_at: "2026-07-01T12:00:00+02:00", updated_at: new Date("2026-07-02T10:00:00Z"),
};

beforeEach(() => {
  recorded.length = 0;
  results = [];
});

afterEach(() => vi.useRealTimers());

describe("Review-Empfänger und Reservierungen", () => {
  it("prüft genehmigte Anmeldungen mit E-Mail und aktiv eingecheckter Person", async () => {
    results = [[{ registration_id: 42, email: "a@example.com", status_token: "token", first_name: "Ahmet", review_requested_at: null }]];
    expect(await getReviewRecipients(7, "initial")).toHaveLength(1);
    const query = recorded[0];
    expect(query.text).toContain("r.status = 'approved'");
    expect(query.text).toContain("NULLIF(BTRIM(r.email), '') IS NOT NULL");
    expect(query.text).toContain("rp.registration_id = r.id AND rp.checked_in_at IS NOT NULL AND rp.cancelled_at IS NULL");
    expect(query.text).toContain("r.review_requested_at IS NULL");
    expect(query.text).toContain("ORDER BY rp.created_at LIMIT 1");
    expect(query.text).not.toMatch(/\br\.checked_in_at/);
    expect(query.values).toContain(7);
  });

  it("erinnert nur offene Einladungen ohne Antwort und ohne frühere Erinnerung", async () => {
    results = [[{ registration_id: 42, email: "a@example.com", status_token: "token", first_name: "Ahmet", review_requested_at: new Date("2026-07-01T10:00:00Z") }]];
    expect((await getReviewRecipients(7, "reminder"))[0].review_requested_at).toBe("2026-07-01T10:00:00.000Z");
    expect(recorded[0].text).toContain("r.review_requested_at IS NOT NULL AND r.review_reminded_at IS NULL");
    expect(recorded[0].text).toContain("NOT EXISTS (SELECT 1 FROM event_reviews er WHERE er.registration_id = r.id)");
    expect(recorded[0].text).toContain("r.review_requested_at > NOW() - INTERVAL '14 days'");
  });

  it("gibt nur die tatsächlich reservierten IDs zurück", async () => {
    results = [[{ id: 42 }], [{ id: 43 }]];
    expect(await claimReviewRequests([41, 42, 43])).toEqual([42]);
    expect(await claimReviewReminders([41, 42, 43])).toEqual([43]);
    expect(recorded[0].text).toContain("AND review_requested_at IS NULL RETURNING id");
    expect(recorded[0].values).toEqual([[41, 42, 43]]);
    expect(recorded[1].text).toContain("AND review_reminded_at IS NULL RETURNING id");
  });

  it("reserviert den Erinnerungslauf nur einmal und kann Reservierungen freigeben", async () => {
    results = [[{ id: 7 }], []];
    expect(await claimEventReviewReminder(7)).toBe(true);
    expect(await claimEventReviewReminder(7)).toBe(false);
    expect(recorded[0].text).toContain("AND review_reminder_sent_at IS NULL RETURNING id");
    await releaseReviewRequests([42]);
    await releaseReviewReminders([42]);
    await releaseEventReviewReminder(7);
    expect(recorded[2].text).toContain("SET review_requested_at = NULL");
    expect(recorded[3].text).toContain("SET review_reminded_at = NULL");
    expect(recorded[4].text).toContain("SET review_reminder_sent_at = NULL");
  });

  it("führt bei leeren ID-Listen keine Abfragen aus", async () => {
    expect(await claimReviewRequests([])).toEqual([]);
    expect(await claimReviewReminders([])).toEqual([]);
    await releaseReviewRequests([]);
    await releaseReviewReminders([]);
    expect(recorded).toEqual([]);
  });
});

describe("Bewertungen speichern und veröffentlichen", () => {
  it("erkennt die erste Speicherung ohne vorherige Bewertung", async () => {
    results = [[{ id: 42 }], [], [{ ...review, comment: null, would_return: null, publish_consent: false }]];
    expect(await saveReview(42, 7, { rating: 4 })).toMatchObject({ unpublished: false, review: { rating: 4 } });
  });

  it("meldet bei unverändert veröffentlichter Bewertung keinen Entzug", async () => {
    const publishedAt = "2026-07-02T12:00:00Z";
    results = [[{ id: 42 }], [{ published_at: publishedAt }], [{ ...review, published_at: publishedAt }]];
    expect(await saveReview(42, 7, { rating: 5, would_return: "vielleicht" })).toMatchObject({
      unpublished: false, review: { published_at: "2026-07-02T12:00:00.000Z" },
    });
    expect(recorded[2].text).toMatch(/comment\s*=\s*event_reviews\.comment/);
    expect(recorded[2].text).toMatch(/would_return\s*=\s*EXCLUDED\.would_return/);
  });

  it("erhält beim Sternklick vorhandene optionale Antworten und Einwilligung", async () => {
    results = [[{ id: 42 }], [{ published_at: null }], [{ ...review, published_by: "admin@example.com" }]];
    const saved = await saveReview(42, 7, { rating: 4 });
    const query = recorded[2];
    expect(query.text).toContain("ON CONFLICT (registration_id) DO UPDATE");
    expect(query.text).toMatch(/would_return\s*=\s*event_reviews\.would_return/);
    expect(query.text).toMatch(/comment\s*=\s*event_reviews\.comment/);
    expect(query.text).toMatch(/publish_consent\s*=\s*event_reviews\.publish_consent/);
    expect(query.text).toContain("updated_at = NOW()");
    expect(saved.unpublished).toBe(false);
    expect(saved.review.comment).toBe("Super!");
    expect(saved.review.created_at).toBe("2026-07-01T10:00:00.000Z");
    expect(saved.review.updated_at).toBe("2026-07-02T10:00:00.000Z");
    expect(saved.review).not.toHaveProperty("published_by");
    expect(saved.review).not.toHaveProperty("unpublished");
  });

  it("übernimmt ausdrücklich geleerte Antworten und entzieht die Freigabe atomar", async () => {
    results = [[{ id: 42 }], [{ published_at: "2026-07-02T10:00:00Z" }], [{ ...review, comment: null, would_return: null, publish_consent: false }]];
    const saved = await saveReview(42, 7, { rating: 3, comment: null, would_return: null, publish_consent: false });
    const query = recorded[2];
    expect(query.text).toMatch(/comment\s*=\s*EXCLUDED\.comment/);
    expect(query.text).toMatch(/would_return\s*=\s*EXCLUDED\.would_return/);
    expect(query.text).toMatch(/publish_consent\s*=\s*EXCLUDED\.publish_consent/);
    expect(query.text).toContain("event_reviews.comment IS DISTINCT FROM EXCLUDED.comment");
    expect(query.text).toContain("NOT EXCLUDED.publish_consent");
    expect(query.text).toMatch(/published_at = CASE WHEN[\s\S]*THEN NULL ELSE event_reviews.published_at END/);
    expect(query.text).toMatch(/published_by = CASE WHEN[\s\S]*THEN NULL ELSE event_reviews.published_by END/);
    expect(recorded[0].text).toContain("SELECT id FROM registrations");
    expect(recorded[0].text).toContain("FOR UPDATE");
    expect(recorded[1].text).toContain("SELECT published_at FROM event_reviews");
    expect(recorded[1].text).toContain("FOR UPDATE");
    expect(saved).toMatchObject({ unpublished: true, review: { comment: null, would_return: null, publish_consent: false } });
  });

  it.each(["no_consent", "no_comment"] as const)("verweigert die Freigabe mit %s", async (reason) => {
    results = [[{ ...review, reason }]];
    expect(await setReviewPublished(11, true, "admin@example.com")).toEqual({ ok: false, reason });
    expect(recorded[0].text).toContain("c.publish_consent AND c.comment IS NOT NULL");
    expect(recorded[0].text).toContain("FOR UPDATE");
    expect(recorded[0].values).toContain(true);
    expect(recorded[0].values).toContain("admin@example.com");
  });

  it("meldet fehlende Bewertungen und erlaubt Entzug ohne Einwilligung", async () => {
    expect(await setReviewPublished(99, true, null)).toEqual({ ok: false, reason: "not_found" });
    results = [[{ ...review, publish_consent: false, comment: null, reason: null }]];
    expect(await setReviewPublished(11, false, null)).toMatchObject({ ok: true, review: { published_at: null } });
    expect(recorded[1].text).toContain("published_at = NULL");
    expect(recorded[1].values).toEqual([11, null, false]);
  });
});

describe("Review-Auswertungen", () => {
  it("liefert null für unbekannte Events", async () => {
    expect(await getEventReviewDashboard(99)).toBeNull();
    expect(recorded).toHaveLength(1);
  });

  it("liefert getrennte Anmeldezahlen, gerundete Statistik und ISO-Zeitpunkte", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T22:30:00Z"));
    results = [
      [{ id: 7, title: "Sport", date: "2026-07-02", status: "published", review_reminder_sent_at: null }],
      [{ checked_in_registrations: 5, without_email: 1, requested: 3, pending_initial: 1, first_requested_at: "2026-07-01T12:00:00+02:00", reminder_candidates: 1 }],
      [
        { ...review, first_name: "Ahmet", last_name: "Kaya", email: "a@example.com" },
        { ...review, id: 12, rating: 3, would_return: null, first_name: "Ayşe", last_name: "Kaya", email: null },
        { ...review, id: 13, rating: 3, would_return: "nein", first_name: "Ali", last_name: "Kaya", email: null },
      ],
    ];
    const dashboard = await getEventReviewDashboard(7);
    expect(dashboard).toMatchObject({
      can_send: true, send_blocked_reason: null, checked_in_registrations: 5, without_email: 1,
      requested: 3, pending_initial: 1, first_requested_at: "2026-07-01T10:00:00.000Z", reminder_candidates: 1,
      stats: { responses: 3, average: 3.3, distribution: { 1: 0, 2: 0, 3: 2, 4: 1, 5: 0 }, would_return: { ja: 1, vielleicht: 0, nein: 1 } },
    });
    expect(recorded[1].text).toContain("rp.cancelled_at IS NULL");
    expect(recorded[1].text).toContain("COUNT(*) FILTER (WHERE checked_in)::int");
    expect(recorded[2].text).toContain("ORDER BY er.created_at DESC");
    expect(dashboard?.reviews[0].email).toBe("a@example.com");
  });

  it("zeigt ohne Antworten leere Verteilungen und keinen Durchschnitt", async () => {
    results = [
      [{ id: 7, title: "Sport", date: "2099-07-02", status: "published", review_reminder_sent_at: null }],
      [{ checked_in_registrations: 0, without_email: 0, requested: 0, pending_initial: 0, first_requested_at: null, reminder_candidates: 0 }], [],
    ];
    expect(await getEventReviewDashboard(7)).toMatchObject({
      can_send: false, send_blocked_reason: "event_in_future", stats: { responses: 0, average: null }, reviews: [],
    });
  });

  it("weist unbekannte und nicht eingeladene Tokens zurück", async () => {
    expect(await getReviewTokenInfo("unbekannt")).toBeNull();
    expect(recorded[0].text).toContain("r.review_requested_at IS NOT NULL");
    results = [[{ review_requested_at: null }]];
    expect(await getReviewTokenInfo("nicht-eingeladen")).toBeNull();
  });

  it("berechnet Frist und Offenstatus und gibt nur Teilnehmerantworten zurück", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T10:00:00Z"));
    results = [[{ ...review, first_name: "Ahmet", event_title: "Sport", event_date: "2026-07-01", review_requested_at: "2026-07-01T12:00:00+02:00" }]];
    expect(await getReviewTokenInfo("token")).toEqual({
      registration_id: 42, event_id: 7, first_name: "Ahmet", event_title: "Sport", event_date: "2026-07-01",
      deadline: "2026-07-15T10:00:00.000Z", is_open: false,
      review: { rating: 4, would_return: "ja", comment: "Super!", publish_consent: true },
    });
  });

  it("trennt Freigabewarteschlange und veröffentlichte Bewertungen", async () => {
    results = [
      [{ event_id: 7, title: "Sport", date: "2026-07-01", category: "fitness", requested: 3, responses: 2, response_rate: 2 / 3, average: 3.3333, would_return_yes_rate: 0.5 }],
      [
        { ...review, first_name: "Ahmet", last_name: "Kaya", email: null, event_title: "Sport" },
        { ...review, id: 12, first_name: "Ali", last_name: "Kaya", email: null, published_at: new Date("2026-07-03T10:00:00Z") },
      ],
    ];
    const overview = await getReviewOverview();
    expect(overview.events[0]).toMatchObject({ average: 3.3333, response_rate: 2 / 3, would_return_yes_rate: 0.5 });
    expect(overview.pending_approval.map((row) => row.id)).toEqual([11]);
    expect(overview.published.map((row) => row.id)).toEqual([12]);
    expect(recorded[0].text).toContain("NULLIF(COUNT(would_return), 0)");
    expect(recorded[0].text).toContain("ORDER BY e.date DESC");
  });

  it("gibt öffentliche Kommentare ohne interne Daten und Durchschnitt erst ab fünf Antworten aus", async () => {
    const item = { id: 11, rating: 4, comment: "Super!", first_name: " Ahmet ", last_name: "kaya", event_title: "Sport", event_category: "fitness", event_date: "2026-07-01", email: "geheim@example.com", registration_id: 42 };
    results = [[{ count: 4, average: 4.25 }], [item]];
    const publicData = await getPublicTestimonials();
    expect(publicData).toEqual({ count: 4, average: null, items: [{
      id: 11, name: "Ahmet K.", rating: 4, comment: "Super!", event_title: "Sport", event_category: "fitness", event_date: "2026-07-01",
    }] });
    expect(recorded[0].text).not.toContain("WHERE");
    expect(recorded[1].text).toContain("er.published_at IS NOT NULL AND er.publish_consent AND er.comment IS NOT NULL");
    expect(recorded[1].text).toContain("ORDER BY er.published_at DESC");
    expect(recorded[1].values).toEqual([6]);
    results = [[{ count: 5, average: 4.24 }], []];
    expect(await getPublicTestimonials(2)).toEqual({ count: 5, average: 4.2, items: [] });
    expect(recorded[3].values).toEqual([2]);
  });
});


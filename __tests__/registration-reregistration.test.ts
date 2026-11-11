import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { formatEuro } from "../lib/finance";

interface RecordedQuery {
  text: string;
  values: unknown[];
}

const recorded: RecordedQuery[] = [];
let results: unknown[][] = [];

class Query implements PromiseLike<unknown[]> {
  readonly text: string;
  readonly values: unknown[];

  constructor(strings: TemplateStringsArray, values: unknown[]) {
    this.text = strings.reduce((text, chunk, index) =>
      text + chunk + (index < values.length ? `$${index + 1}` : ""), "");
    this.values = values;
  }

  then<T1 = unknown[], T2 = never>(
    onfulfilled?: ((rows: unknown[]) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    recorded.push({ text: this.text, values: this.values });
    return Promise.resolve(results.shift() ?? []).then(onfulfilled, onrejected);
  }
}

function fakeSql(strings: TemplateStringsArray, ...values: unknown[]) {
  return new Query(strings, values);
}

const mocks = vi.hoisted(() => ({
  getEvent: vi.fn(),
  getRegistrationCount: vi.fn(),
  findRegistration: vi.fn(),
  getRecognizableDiscounts: vi.fn(),
  receivedMail: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getEvent: mocks.getEvent,
  getRegistrationCount: mocks.getRegistrationCount,
  findRegistration: mocks.findRegistration,
  getRecognizableDiscounts: mocks.getRecognizableDiscounts,
}));
vi.mock("@/lib/db/utils", () => ({ getSQL: () => fakeSql }));
vi.mock("@/lib/email", () => ({
  sendRegistrationReceivedEmail: mocks.receivedMail,
  sendWaitlistReceivedEmail: vi.fn(),
}));
vi.mock("@/lib/ratelimit", () => ({
  checkRateLimit: () => true,
  getClientIp: () => "test",
  RATE_LIMITS: { registration: {} },
}));
vi.mock("@/lib/honeypot", () => ({ honeypotFailure: () => null }));

const { POST } = await import("../app/api/registrations/route");

beforeEach(() => {
  vi.clearAllMocks();
  recorded.length = 0;
  results = [[{ id: 22 }], [], []];
  mocks.getEvent.mockResolvedValue({
    id: 7,
    title: "Sportabend",
    date: "2099-09-20",
    time: "18:00",
    location: "Sporthalle",
    status: "published",
    max_participants: 20,
    max_per_email: 5,
    price: "7,50 €",
    entry_price: 7.5,
    child_entry_price: null,
    cancellation_deadline: null,
  });
  mocks.getRegistrationCount.mockResolvedValue(0);
  mocks.findRegistration.mockResolvedValue({ id: 11, status: "cancelled", status_token: "old-token" });
  mocks.getRecognizableDiscounts.mockResolvedValue([]);
});

function registrationRequest(persons: object[], extra: object = {}) {
  return new NextRequest("http://localhost/api/registrations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_id: 7, email: "GAST@example.com", phone: "0151 12345678", persons, ...extra }),
  });
}

const personInserts = () => recorded.filter(query => query.text.includes("INSERT INTO registration_persons"));

describe("Wiederanmeldung nach bezahlter Stornierung", () => {
  it("legt für zwei Personen eine neue unbezahlte Anmeldung an und lässt die alte Zahlungshistorie unangetastet", async () => {
    const request = new NextRequest("http://localhost/api/registrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: 7,
        email: "GAST@example.com",
        phone: "0151 12345678",
        persons: [
          { firstName: "Ada", lastName: "Alt" },
          { firstName: "Bea", lastName: "Neu" },
        ],
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    const registrationInsert = recorded.find(query => query.text.includes("INSERT INTO registrations"));
    expect(registrationInsert).toBeDefined();
    expect(registrationInsert?.values).toEqual([
      7,
      "gast@example.com",
      "0151 12345678",
      expect.any(String),
      false,
    ]);
    expect(recorded.some(query => query.text.includes("UPDATE registrations"))).toBe(false);
    expect(recorded.some(query => query.text.includes("DELETE FROM registration_persons"))).toBe(false);

    expect(personInserts()).toHaveLength(2);
    expect(personInserts()[0].values).toEqual([22, "Ada", "Alt", false, null]);
    expect(personInserts()[1].values).toEqual([22, "Bea", "Neu", false, null]);
    expect(mocks.receivedMail).toHaveBeenCalledWith(expect.objectContaining({
      to: "gast@example.com",
      statusToken: expect.any(String),
      priceLabel: expect.stringContaining("15,00"),
    }));
  });
});

describe("Ermäßigung bei der Anmeldung", () => {
  it("übernimmt die Ermäßigung je Person serverseitig aus der Liste", async () => {
    mocks.getRecognizableDiscounts.mockResolvedValue([
      { first_name: "Ada", last_name: "Alt", discount: "reduced_50" },
    ]);
    const response = await POST(registrationRequest([
      { firstName: " ada ", lastName: "ALT" },
      { firstName: "Bea", lastName: "Neu" },
    ]));

    expect(response.status).toBe(201);
    expect(mocks.getRecognizableDiscounts).toHaveBeenCalledWith("gast@example.com", expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(personInserts()[0].values).toEqual([22, "ada", "ALT", false, "reduced_50"]);
    expect(personInserts()[1].values).toEqual([22, "Bea", "Neu", false, null]);
    // 7,50 € + 3,75 € (−50 %); formatEuro setzt ein geschütztes Leerzeichen vor €.
    expect(mocks.receivedMail).toHaveBeenCalledWith(expect.objectContaining({
      priceLabel: `1 Person × ${formatEuro(7.5)} + 1 Person (−50 %) × ${formatEuro(3.75)} = ${formatEuro(11.25)}`,
    }));
  });

  it("ignoriert eine vom Formular mitgeschickte Ermäßigung", async () => {
    const response = await POST(registrationRequest([
      { firstName: "Ada", lastName: "Alt", discount: "reduced_50" },
    ], { discount: "reduced_50" }));

    expect(response.status).toBe(201);
    expect(personInserts()[0].values).toEqual([22, "Ada", "Alt", false, null]);
  });

  it("meldet trotzdem an, wenn der Abgleich scheitert – dann zum vollen Preis", async () => {
    mocks.getRecognizableDiscounts.mockRejectedValue(new Error("Tabelle fehlt"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await POST(registrationRequest([{ firstName: "Ada", lastName: "Alt" }]));

    expect(response.status).toBe(201);
    expect(personInserts()[0].values).toEqual([22, "Ada", "Alt", false, null]);
  });
});

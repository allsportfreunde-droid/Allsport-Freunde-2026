/**
 * Tests für Walk-in-Anmeldungen, die über das Check-In-Dashboard angelegt
 * werden ("Teilnehmer hinzufügen" → "Teilnehmer einchecken").
 *
 * Dabei muss nicht nur die Anmeldung selbst, sondern jede einzelne Person
 * als eingecheckt gespeichert werden – Statistik und Einnahmen zählen auf
 * Personenebene (registration_persons.checked_in_at).
 *
 * Der neon-SQL-Tag wird durch einen Recorder ersetzt, der die erzeugten
 * Queries mitschreibt. Verschachtelte Fragmente (sql`NOW()`) werden dabei
 * wie beim echten Treiber in den Query-Text eingesetzt.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

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

vi.mock("../lib/db/utils", () => ({
  isPostgresConfigured: () => true,
  getSQL: () => fakeSql,
  logAudit: async () => {},
}));

const { createWalkInRegistration } = await import("../lib/db/checkins");

function personInserts() {
  return recorded.filter((q) => q.text.includes("INSERT INTO registration_persons"));
}

beforeEach(() => {
  recorded.length = 0;
  // findRegistration (kein Treffer) → [], danach der INSERT mit RETURNING id
  results = [[], [{ id: 42 }]];
});

describe("createWalkInRegistration", () => {
  it("checkt beim Dashboard-Walk-in jede Person ein, nicht nur die Anmeldung", async () => {
    const result = await createWalkInRegistration({
      event_id: 7,
      persons: [
        { firstName: "Ali", lastName: "Yilmaz" },
        { firstName: "Ayse", lastName: "Yilmaz" },
      ],
      email: "ali@example.com",
      phone: null,
      notes: null,
      checked_in_by: "admin@example.com",
    });

    expect(result).toEqual({ id: 42, alreadyExists: false });

    const inserts = personInserts();
    expect(inserts).toHaveLength(2);
    for (const insert of inserts) {
      expect(insert.text).toContain("checked_in_at");
      expect(insert.text).toContain("NOW()");
      expect(insert.text).not.toContain("NULL");
    }
    expect(inserts[0].values).toEqual([42, "Ali", "Yilmaz"]);
    expect(inserts[1].values).toEqual([42, "Ayse", "Yilmaz"]);
  });

  it("lässt Personen bei Self-Service-Walk-ins ohne Check-In-Zeitstempel", async () => {
    await createWalkInRegistration({
      event_id: 7,
      persons: [{ firstName: "Ali", lastName: "Yilmaz" }],
      email: "ali@example.com",
      phone: null,
      notes: null,
      checked_in_by: null,
    });

    const inserts = personInserts();
    expect(inserts).toHaveLength(1);
    expect(inserts[0].text).toContain("NULL");
    expect(inserts[0].text).not.toContain("NOW()");
  });

  it("legt bei bereits vorhandener E-Mail keine neue Anmeldung an", async () => {
    results = [[{ id: 5, status: "approved", status_token: "tok" }]];

    const result = await createWalkInRegistration({
      event_id: 7,
      persons: [{ firstName: "Ali", lastName: "Yilmaz" }],
      email: "ali@example.com",
      phone: null,
      notes: null,
      checked_in_by: "admin@example.com",
    });

    expect(result).toEqual({ id: 5, alreadyExists: true });
    expect(personInserts()).toHaveLength(0);
  });
});

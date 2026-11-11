import { describe, expect, it } from "vitest";
import { personRevenueCents } from "../lib/finance";
import { personRevenueSql } from "../lib/db/person-revenue";
import { DISCOUNTS } from "../lib/discounts";
import { createLocalEvent, createLocalWalkInRegistration, getLocalCheckinEvents, getLocalRegistrationByToken, resetLocalData } from "../lib/local-data";

describe("Umsatz je Person", () => {
  const event = { entry_price: 10, child_entry_price: 4 };
  const adult = { id: "adult", is_child: false };
  const child = { id: "child", is_child: true };

  it("verwendet Erwachsenen- und Kinderpreis", () => {
    expect(personRevenueCents(event, adult)).toBe(1000);
    expect(personRevenueCents(event, child)).toBe(400);
  });

  it("unterscheidet fehlenden Kinderpreis von kostenlos", () => {
    expect(personRevenueCents({ entry_price: 10 }, child)).toBe(1000);
    expect(personRevenueCents({ entry_price: 10, child_entry_price: 0 }, child)).toBe(0);
  });

  it("erhält gezahlte Beträge auch nach einer Preisänderung", () => {
    expect(personRevenueCents({ entry_price: 99, child_entry_price: 88 }, child, { child: 400 })).toBe(400);
    expect(personRevenueCents(event, child, { child: 0 })).toBe(0);
  });

  it("zählt im lokalen Dashboard nur aktive beziehungsweise eingecheckte Personen", () => {
    resetLocalData([]);
    const { id } = createLocalEvent({
      title: "Sport", category: "fussball", description: "", date: "2099-06-01", time: "12:00",
      location: "Halle", dress_code: "Sport", max_participants: 10, price: "10 €",
      entry_price: 10, child_entry_price: 4, publish: true,
    });
    const reg = createLocalWalkInRegistration({
      event_id: id, email: "test@example.com", phone: null, notes: null, checked_in_by: null,
      persons: [
        { firstName: "A", lastName: "Test", isChild: false },
        { firstName: "B", lastName: "Test", isChild: true },
        { firstName: "C", lastName: "Test", isChild: true },
      ],
    });
    const persons = getLocalRegistrationByToken(reg.status_token)!.persons;
    persons[1].checked_in_at = "2099-06-01T10:00:00Z";
    persons[2].cancelled_at = "2099-05-01T10:00:00Z";
    expect(getLocalCheckinEvents().upcoming[0]).toMatchObject({
      approved_count: 2, checked_in_count: 1, expected_revenue: 14, actual_revenue: 4,
    });
  });
});

describe("Umsatz je Person mit Ermäßigung", () => {
  it("zieht die Ermäßigung wie im Checkout ab", () => {
    const event = { entry_price: 7.25, child_entry_price: 4 };
    expect(personRevenueCents(event, { id: "a", is_child: false, discount: "reduced_50" })).toBe(363);
    expect(personRevenueCents(event, { id: "b", is_child: false, discount: "reduced_30" })).toBe(508);
    expect(personRevenueCents(event, { id: "c", is_child: true, discount: "reduced_50" })).toBe(200);
    // Ein gespeicherter Zahlungsanteil hat weiter Vorrang.
    expect(personRevenueCents(event, { id: "a", is_child: false, discount: "reduced_50" }, { a: 725 })).toBe(725);
  });

  it("verwendet in SQL dieselben Faktoren wie DISCOUNTS", () => {
    const text = personRevenueSql(((strings: TemplateStringsArray) => strings.join("")) as unknown as Parameters<typeof personRevenueSql>[0]) as unknown as string;
    for (const [key, { percent }] of Object.entries(DISCOUNTS)) {
      expect(text).toContain(`WHEN '${key}' THEN ${100 - percent}`);
    }
  });
});

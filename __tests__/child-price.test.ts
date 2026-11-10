import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../app/api/admin/events/route";
import { PUT } from "../app/api/admin/events/[id]/route";
import { getLocalEventFull, resetLocalData } from "../lib/local-data";

// Ohne Stripe-Schlüssel: Der Abgleich wird übersprungen, gespeichert wird trotzdem.
vi.mock("@/lib/stripe", () => ({ getStripe: () => null, stripeProductUrl: () => null }));
vi.mock("@/lib/db", async () => {
  const local = await import("../lib/local-data");
  return {
    createEvent: local.createLocalEvent,
    updateEvent: local.updateLocalEvent,
    getEventFull: local.getLocalEventFull,
    getAllEvents: local.getLocalAllEvents,
    deleteEvent: local.deleteLocalEvent,
    saveEventStripeCatalog: local.saveLocalEventStripeCatalog,
  };
});

const eventInput = {
  title: "Kinderpreis-Test", category: "fussball", description: "Test",
  date: "2099-06-01", time: "15:00", location: "Sporthalle", price: "10 €",
  entry_price: 10, dress_code: "Sportkleidung", max_participants: 20,
};

function request(body: object, method = "POST") {
  return new NextRequest("http://localhost/api/admin/events", {
    method, body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
  });
}

const params = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

beforeEach(() => {
  resetLocalData([]);
});

describe("Kinderpreis im Admin speichern", () => {
  it.each([0, 4.5])("speichert einen Kinderbetrag von %s Euro", async (amount) => {
    const response = await POST(request({ ...eventInput, child_entry_price: amount }));
    expect(response.status).toBe(201);
    const { id, stripe } = await response.json();
    expect(stripe).toEqual({ status: "skipped" });
    expect(getLocalEventFull(id)).toMatchObject({ child_entry_price: amount, child_price: null });
  });

  it("übernimmt ohne Kinderbetrag den Erwachsenenpreis", async () => {
    const response = await POST(request({ ...eventInput, child_entry_price: null }));
    expect(response.status).toBe(201);
    const { id } = await response.json();
    expect(getLocalEventFull(id)).toMatchObject({ child_entry_price: null, entry_price: 10 });
  });

  it("speichert Freitext zusammen mit dem festen Kinderbetrag", async () => {
    const response = await POST(request({ ...eventInput, child_entry_price: 3, child_price: "Kinderbeitrag" }));
    expect(response.status).toBe(201);
    const { id } = await response.json();
    expect(getLocalEventFull(id)).toMatchObject({ child_entry_price: 3, child_price: "Kinderbeitrag" });
  });

  it("verlangt für Freitext einen gültigen festen Betrag", async () => {
    for (const amount of [null, -1, "kein Betrag"]) {
      const response = await POST(request({ ...eventInput, child_price: "Kinderbeitrag", child_entry_price: amount }));
      expect(response.status).toBe(400);
    }
  });

  it("ändert den Kinderbetrag und kehrt zum Erwachsenenpreis zurück", async () => {
    const { id } = await (await POST(request({ ...eventInput, child_entry_price: 4 }))).json();

    expect((await PUT(request({ ...eventInput, child_entry_price: 2, child_price: "Kinderbeitrag" }, "PUT"), params(id))).status).toBe(200);
    expect(getLocalEventFull(id)).toMatchObject({ child_entry_price: 2, child_price: "Kinderbeitrag" });

    expect((await PUT(request({ ...eventInput, child_entry_price: null }, "PUT"), params(id))).status).toBe(200);
    expect(getLocalEventFull(id)).toMatchObject({ child_entry_price: null, child_price: null, entry_price: 10 });
  });

  it("erhält den Kinderpreis bei einem älteren Formular ohne Kinderfeld", async () => {
    const { id } = await (await POST(request({ ...eventInput, child_entry_price: 0 }))).json();
    const response = await PUT(request(eventInput, "PUT"), params(id));
    expect(response.status).toBe(200);
    expect(getLocalEventFull(id)).toMatchObject({ child_entry_price: 0 });
  });
});

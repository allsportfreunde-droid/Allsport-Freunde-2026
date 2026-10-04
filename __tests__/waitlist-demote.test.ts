/**
 * Tests für "Auf Warteliste setzen" (/api/checkin/waitlist/demote).
 *
 * Wer sich anmeldet, aber nicht online zahlt, blockiert sonst einen Platz.
 * Das Team setzt solche Anmeldungen zurück auf die Warteliste – nur offene,
 * unbezahlte, und die E-Mail geht genau einmal raus.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const getUser = vi.fn();
const getRegistrationDetail = vi.fn();
const moveToWaitlist = vi.fn();
const sendWaitlistMovedEmail = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/db", () => ({ getRegistrationDetail, moveToWaitlist }));
vi.mock("@/lib/email", () => ({ sendWaitlistMovedEmail }));

const { POST } = await import("@/app/api/checkin/waitlist/demote/route");

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/checkin/waitlist/demote", {
      method: "POST",
      body: JSON.stringify(body),
    })
  );
}

const registration = {
  id: 7,
  email: "ali@example.com",
  status: "pending",
  is_waitlist: false,
  paid_at: null,
  status_token: "tok-7",
  first_name: "Ali",
  last_name: "Yilmaz",
  event_title: "Fußball",
  event_date: "2026-10-10",
  event_time: "18:00:00",
  event_location: "Sportpark",
  persons: [
    { first_name: "Ali", last_name: "Yilmaz" },
    { first_name: "Can", last_name: "Yilmaz" },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "admin" } } });
  getRegistrationDetail.mockResolvedValue(registration);
  moveToWaitlist.mockResolvedValue(true);
});

describe("POST /api/checkin/waitlist/demote", () => {
  it("setzt eine offene Anmeldung auf die Warteliste und schickt die Mail", async () => {
    const res = await post({ registrationId: 7 });

    expect(res.status).toBe(200);
    expect(moveToWaitlist).toHaveBeenCalledWith(7);
    expect(sendWaitlistMovedEmail).toHaveBeenCalledTimes(1);
    expect(sendWaitlistMovedEmail.mock.calls[0][0]).toMatchObject({
      to: "ali@example.com",
      statusToken: "tok-7",
      persons: [
        { firstName: "Ali", lastName: "Yilmaz" },
        { firstName: "Can", lastName: "Yilmaz" },
      ],
    });
  });

  it("verschickt keine zweite Mail, wenn nichts zu tun war", async () => {
    moveToWaitlist.mockResolvedValue(false);

    const res = await post({ registrationId: 7 });

    expect(res.status).toBe(200);
    expect(sendWaitlistMovedEmail).not.toHaveBeenCalled();
  });

  it.each([
    ["bestätigt", { status: "approved" }],
    ["schon auf der Warteliste", { is_waitlist: true }],
    ["bereits bezahlt", { paid_at: "2026-10-01T10:00:00Z" }],
  ])("lehnt ab, wenn die Anmeldung %s ist", async (_label, patch) => {
    getRegistrationDetail.mockResolvedValue({ ...registration, ...patch });

    const res = await post({ registrationId: 7 });

    expect(res.status).toBe(409);
    expect(moveToWaitlist).not.toHaveBeenCalled();
    expect(sendWaitlistMovedEmail).not.toHaveBeenCalled();
  });

  it("verlangt einen angemeldeten Admin", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const res = await post({ registrationId: 7 });

    expect(res.status).toBe(401);
    expect(moveToWaitlist).not.toHaveBeenCalled();
  });

  it("meldet 404 für unbekannte Anmeldungen", async () => {
    getRegistrationDetail.mockResolvedValue(null);

    const res = await post({ registrationId: 99 });

    expect(res.status).toBe(404);
  });
});

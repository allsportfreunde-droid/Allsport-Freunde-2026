/**
 * Tests für lib/cancellation.ts – Stornofrist mit und ohne eigenen Zeitpunkt.
 */

import { describe, it, expect } from "vitest";
import {
  CANCELLATION_DEADLINE_HOURS,
  canCancelRegistration,
  cancellationBlockedReason,
  cancellationDeadline,
  eventStart,
  cancellationSourceFromRegistration,
  formatDeadline,
  hasEventStarted,
  isCancellationOpen,
  parseDeadlineInput,
  validateCancellationDeadline,
} from "../lib/cancellation";

const event = (extra: { cancellation_deadline?: string | null } = {}) => ({
  event_date: "2026-09-15",
  event_time: "18:00",
  ...extra,
});

describe("eventStart", () => {
  it("liest Datum und Uhrzeit als deutsche Ortszeit (Sommerzeit)", () => {
    // 15. September, 18:00 Berlin = 16:00 UTC (MESZ, UTC+2)
    expect(eventStart("2026-09-15", "18:00")?.toISOString()).toBe(
      "2026-09-15T16:00:00.000Z"
    );
  });

  it("berücksichtigt die Winterzeit", () => {
    // 15. Januar, 18:00 Berlin = 17:00 UTC (MEZ, UTC+1)
    expect(eventStart("2026-01-15", "18:00")?.toISOString()).toBe(
      "2026-01-15T17:00:00.000Z"
    );
  });

  it("verträgt Sekunden in der Uhrzeit", () => {
    expect(eventStart("2026-09-15", "18:00:00")?.toISOString()).toBe(
      "2026-09-15T16:00:00.000Z"
    );
  });

  it("gibt null bei unlesbaren Werten", () => {
    expect(eventStart("", "")).toBeNull();
    expect(eventStart("15.09.2026", "18:00")).toBeNull();
  });
});

describe("cancellationDeadline – Standard", () => {
  it("liegt genau 24 Stunden vor Beginn", () => {
    const start = eventStart("2026-09-15", "18:00")!;
    const deadline = cancellationDeadline(event())!;
    expect(start.getTime() - deadline.getTime()).toBe(
      CANCELLATION_DEADLINE_HOURS * 60 * 60 * 1000
    );
  });

  it("gilt auch, wenn kein eigener Zeitpunkt gesetzt ist", () => {
    expect(cancellationDeadline(event({ cancellation_deadline: null }))).toEqual(
      cancellationDeadline(event())
    );
  });
});

describe("cancellationDeadline – eigener Zeitpunkt", () => {
  it("hat Vorrang vor der 24-Stunden-Regel", () => {
    // 15.09. um 12:00 Berlin = 10:00 UTC
    const deadline = cancellationDeadline(
      event({ cancellation_deadline: "2026-09-15T12:00" })
    );
    expect(deadline?.toISOString()).toBe("2026-09-15T10:00:00.000Z");
  });

  it("versteht auch das Format der Datenbank", () => {
    expect(
      cancellationDeadline(
        event({ cancellation_deadline: "2026-09-15 12:00:00" })
      )?.toISOString()
    ).toBe("2026-09-15T10:00:00.000Z");
  });

  it("darf später liegen als die 24-Stunden-Regel", () => {
    // Noch zwei Stunden vor Beginn stornierbar
    const deadline = cancellationDeadline(
      event({ cancellation_deadline: "2026-09-15T16:00" })
    );
    expect(deadline?.toISOString()).toBe("2026-09-15T14:00:00.000Z");
  });

  it("fällt bei unlesbarem Zeitpunkt auf die 24-Stunden-Regel zurück", () => {
    expect(
      cancellationDeadline(event({ cancellation_deadline: "morgen mittag" }))
    ).toEqual(cancellationDeadline(event()));
  });
});

describe("isCancellationOpen", () => {
  it("erlaubt Storno deutlich vor der Frist", () => {
    expect(isCancellationOpen(event(), new Date("2026-09-10T12:00:00Z"))).toBe(true);
  });

  it("erlaubt Storno eine Minute vor der Frist", () => {
    expect(isCancellationOpen(event(), new Date("2026-09-14T15:59:00Z"))).toBe(true);
  });

  it("sperrt Storno genau auf der Frist", () => {
    expect(isCancellationOpen(event(), new Date("2026-09-14T16:00:00Z"))).toBe(false);
  });

  it("sperrt Storno nach dem Event", () => {
    expect(isCancellationOpen(event(), new Date("2026-09-20T10:00:00Z"))).toBe(false);
  });

  it("richtet sich nach dem eigenen Zeitpunkt, wenn gesetzt", () => {
    const withCustom = event({ cancellation_deadline: "2026-09-15T12:00" });
    // Nach der 24-Stunden-Frist, aber vor dem eigenen Zeitpunkt
    expect(isCancellationOpen(withCustom, new Date("2026-09-15T09:00:00Z"))).toBe(true);
    // Auf dem eigenen Zeitpunkt
    expect(isCancellationOpen(withCustom, new Date("2026-09-15T10:00:00Z"))).toBe(false);
  });

  it("sperrt niemanden aus, wenn das Datum unlesbar ist", () => {
    expect(isCancellationOpen({ event_date: "", event_time: "" }, new Date())).toBe(true);
  });
});

describe("formatDeadline", () => {
  it("nennt die Frist in deutscher Ortszeit", () => {
    const deadline = cancellationDeadline(
      event({ cancellation_deadline: "2026-09-15T12:00" })
    )!;
    expect(formatDeadline(deadline)).toBe("15.09.2026 um 12:00 Uhr");
  });

  it("rechnet auch die Standardfrist korrekt um", () => {
    // Event 15.09. 18:00 → Frist 14.09. 18:00 Ortszeit
    expect(formatDeadline(cancellationDeadline(event())!)).toBe(
      "14.09.2026 um 18:00 Uhr"
    );
  });
});

describe("cancellationSourceFromRegistration", () => {
  // Die Anmelde-Abfragen benennen das Feld `event_cancellation_deadline`.
  // Ohne Übersetzung greift stillschweigend die 24-Stunden-Regel.
  const registration = {
    event_date: "2026-09-15",
    event_time: "18:00",
    event_cancellation_deadline: "2026-09-15T12:00",
  };

  it("übernimmt den eigenen Zeitpunkt der Anmeldung", () => {
    expect(
      cancellationDeadline(cancellationSourceFromRegistration(registration))
    ).toEqual(new Date("2026-09-15T10:00:00Z"));
  });

  it("fällt ohne eigenen Zeitpunkt auf die 24-Stunden-Regel zurück", () => {
    expect(
      cancellationDeadline(
        cancellationSourceFromRegistration({
          ...registration,
          event_cancellation_deadline: null,
        })
      )
    ).toEqual(new Date("2026-09-14T16:00:00Z"));
  });
});

describe("canCancelRegistration", () => {
  it("wendet die bestehende Frist auch auf einen laufenden SEPA-Einzug an", () => {
    const registration = { event_date: "2026-06-01", event_time: "12:00", paid_at: null, payment_in_progress: true };
    expect(canCancelRegistration(registration, new Date("2026-05-30T10:00:00Z"))).toBe(true);
    expect(canCancelRegistration(registration, new Date("2026-05-31T11:00:00Z"))).toBe(false);
    expect(canCancelRegistration({ ...registration, payment_in_progress: false }, new Date("2026-05-31T11:00:00Z"))).toBe(true);
  });
  const afterDeadline = new Date("2026-09-15T10:00:00Z");

  it("erlaubt unbezahlten Anmeldungen auch nach der Frist zu stornieren", () => {
    expect(canCancelRegistration(event(), afterDeadline)).toBe(true);
    expect(
      canCancelRegistration({ ...event(), paid_at: null }, afterDeadline)
    ).toBe(true);
  });

  it("sperrt bezahlte Anmeldungen nach der Frist", () => {
    expect(
      canCancelRegistration(
        { ...event(), paid_at: "2026-09-01T10:00:00Z" },
        afterDeadline
      )
    ).toBe(false);
  });

  it("erlaubt bezahlten Anmeldungen vor der Frist", () => {
    expect(
      canCancelRegistration(
        { ...event(), paid_at: "2026-09-01T10:00:00Z" },
        new Date("2026-09-10T10:00:00Z")
      )
    ).toBe(true);
  });
});

/**
 * Der Eventbeginn als harte Grenze.
 *
 * Die Frist allein reicht nicht: sie kann nach dem Beginn liegen (am Event
 * eingetragener Zeitpunkt) oder sich gar nicht ableiten lassen (Uhrzeit nicht
 * im Format "HH:MM"). In beiden Fällen war Stornieren nach der Veranstaltung
 * möglich – auch für bezahlte Anmeldungen.
 */
describe("hasEventStarted", () => {
  // Event am 15.09.2026, 18:00 Berlin = 16:00 UTC
  const kurzVorher = new Date("2026-09-15T15:59:00Z");
  const punktBeginn = new Date("2026-09-15T16:00:00Z");

  it("meldet den Beginn erst ab dem Startzeitpunkt", () => {
    expect(hasEventStarted(event(), kurzVorher)).toBe(false);
    expect(hasEventStarted(event(), punktBeginn)).toBe(true);
  });

  it("nimmt ohne brauchbare Uhrzeit das Ende des Eventtages", () => {
    const ohneZeit = { event_date: "2026-09-15", event_time: "" };
    // Am Eventtag um 20:00 Berlin (18:00 UTC) läuft der Tag noch
    expect(hasEventStarted(ohneZeit, new Date("2026-09-15T18:00:00Z"))).toBe(false);
    // Nach Mitternacht ist der Tag vorbei
    expect(hasEventStarted(ohneZeit, new Date("2026-09-16T00:30:00Z"))).toBe(true);
  });

  it("gilt auch für eine Uhrzeit in einem anderen Format", () => {
    const freitext = { event_date: "2026-09-15", event_time: "ab 18 Uhr" };
    expect(hasEventStarted(freitext, new Date("2026-09-18T12:00:00Z"))).toBe(true);
  });

  it("behauptet bei unlesbarem Datum keinen Beginn", () => {
    expect(hasEventStarted({ event_date: "", event_time: "" }, new Date())).toBe(false);
  });
});

describe("Storno nach dem Eventbeginn", () => {
  // Drei Tage nach der Veranstaltung
  const nachEvent = new Date("2026-09-18T12:00:00Z");
  const bezahlt = "2026-09-01T10:00:00Z";

  it("sperrt eine bezahlte Anmeldung, deren eigene Frist nach dem Beginn liegt", () => {
    const spaeteFrist = {
      ...event({ cancellation_deadline: "2026-09-30T23:59" }),
      paid_at: bezahlt,
    };
    // Der eingetragene Zeitpunkt wäre noch offen …
    expect(parseDeadlineInput("2026-09-30T23:59")!.getTime()).toBeGreaterThan(
      nachEvent.getTime()
    );
    // … gilt aber nur bis zum Beginn, und der ist vorbei
    expect(cancellationDeadline(spaeteFrist)).toEqual(
      eventStart("2026-09-15", "18:00")
    );
    expect(canCancelRegistration(spaeteFrist, nachEvent)).toBe(false);
    expect(isCancellationOpen(spaeteFrist, nachEvent)).toBe(false);
  });

  it("sperrt eine bezahlte Anmeldung, wenn sich keine Frist ableiten lässt", () => {
    const ohneZeit = {
      event_date: "2026-09-15",
      event_time: "",
      cancellation_deadline: null,
      paid_at: bezahlt,
    };
    expect(cancellationDeadline(ohneZeit)).toBeNull();
    expect(canCancelRegistration(ohneZeit, nachEvent)).toBe(false);
  });

  it("sperrt auch eine unbezahlte Anmeldung", () => {
    expect(canCancelRegistration({ ...event(), paid_at: null }, nachEvent)).toBe(false);
    expect(canCancelRegistration(event(), nachEvent)).toBe(false);
  });

  it("sperrt schon ab der ersten Minute der Veranstaltung", () => {
    const beginn = new Date("2026-09-15T16:00:00Z");
    expect(canCancelRegistration({ ...event(), paid_at: null }, beginn)).toBe(false);
    expect(
      canCancelRegistration(
        { ...event({ cancellation_deadline: "2026-09-30T23:59" }), paid_at: bezahlt },
        beginn
      )
    ).toBe(false);
  });

  it("lässt unbezahlte Anmeldungen bis zum Beginn weiter zurücktreten", () => {
    // Nach der 24-Stunden-Frist, aber eine Minute vor dem Beginn
    expect(
      canCancelRegistration(
        { ...event(), paid_at: null },
        new Date("2026-09-15T15:59:00Z")
      )
    ).toBe(true);
  });

  it("sperrt niemanden aus, dessen Eventdatum unlesbar ist", () => {
    expect(
      canCancelRegistration(
        { event_date: "", event_time: "", paid_at: bezahlt },
        nachEvent
      )
    ).toBe(true);
  });
});

describe("cancellationBlockedReason", () => {
  const nachEvent = new Date("2026-09-18T12:00:00Z");
  const bezahlt = "2026-09-01T10:00:00Z";

  it("schweigt, solange storniert werden darf", () => {
    expect(
      cancellationBlockedReason(
        { ...event(), paid_at: bezahlt },
        new Date("2026-09-10T12:00:00Z")
      )
    ).toBeNull();
  });

  it("nennt den Beginn, wenn die Veranstaltung schon läuft", () => {
    expect(cancellationBlockedReason({ ...event(), paid_at: bezahlt }, nachEvent)).toBe(
      "Die Veranstaltung hat bereits begonnen – eine Stornierung ist nicht mehr möglich."
    );
  });

  it("nennt die Frist, wenn nur sie abgelaufen ist", () => {
    // Nach der 24-Stunden-Frist, aber vor dem Beginn
    expect(
      cancellationBlockedReason(
        { ...event(), paid_at: bezahlt },
        new Date("2026-09-15T10:00:00Z")
      )
    ).toBe("Die Stornofrist ist abgelaufen – sie endete am 14.09.2026 um 18:00 Uhr.");
  });

  it("bleibt verständlich, wenn sich keine Frist ableiten lässt", () => {
    // Datum lesbar, Uhrzeit nicht: die Sperre greift über das Tagesende
    expect(
      cancellationBlockedReason(
        { event_date: "2026-09-15", event_time: "", paid_at: bezahlt },
        nachEvent
      )
    ).toBe(
      "Die Veranstaltung hat bereits begonnen – eine Stornierung ist nicht mehr möglich."
    );
  });
});

describe("cancellationDeadline – Kappung auf den Beginn", () => {
  it("kappt einen eigenen Zeitpunkt nach dem Beginn auf den Beginn", () => {
    const deadline = cancellationDeadline(
      event({ cancellation_deadline: "2026-09-30T23:59" })
    );
    expect(deadline).toEqual(eventStart("2026-09-15", "18:00"));
  });

  it("kappt auch einen Zeitpunkt genau auf dem Beginn nicht darüber hinaus", () => {
    expect(
      cancellationDeadline(event({ cancellation_deadline: "2026-09-15T18:00" }))
    ).toEqual(eventStart("2026-09-15", "18:00"));
  });

  it("lässt einen eigenen Zeitpunkt vor dem Beginn unangetastet", () => {
    expect(
      cancellationDeadline(
        event({ cancellation_deadline: "2026-09-15T16:00" })
      )?.toISOString()
    ).toBe("2026-09-15T14:00:00.000Z");
  });

  it("nennt den eigenen Zeitpunkt, wenn der Beginn unlesbar ist", () => {
    expect(
      cancellationDeadline({
        event_date: "2026-09-15",
        event_time: "",
        cancellation_deadline: "2026-09-14T12:00",
      })?.toISOString()
    ).toBe("2026-09-14T10:00:00.000Z");
  });
});

describe("parseDeadlineInput", () => {
  it("liest das Format des Formulars", () => {
    expect(parseDeadlineInput("2026-09-14T12:00")?.toISOString()).toBe(
      "2026-09-14T10:00:00.000Z"
    );
  });

  it("liest das Format der Datenbank", () => {
    expect(parseDeadlineInput("2026-09-14 12:00:00")?.toISOString()).toBe(
      "2026-09-14T10:00:00.000Z"
    );
  });

  it("gibt bei Freitext und Leerwerten null", () => {
    expect(parseDeadlineInput("morgen mittag")).toBeNull();
    expect(parseDeadlineInput("")).toBeNull();
    expect(parseDeadlineInput(null)).toBeNull();
    expect(parseDeadlineInput(undefined)).toBeNull();
  });
});

describe("validateCancellationDeadline", () => {
  const eingabe = (cancellation_deadline: string | null) => ({
    date: "2026-09-15",
    time: "18:00",
    cancellation_deadline,
  });

  it("nimmt eine Frist vor dem Beginn an", () => {
    expect(validateCancellationDeadline(eingabe("2026-09-14T12:00"))).toBeNull();
  });

  it("nimmt eine leere Frist an – dann gilt der Standard", () => {
    expect(validateCancellationDeadline(eingabe(null))).toBeNull();
    expect(validateCancellationDeadline(eingabe("  "))).toBeNull();
  });

  it("lehnt eine Frist nach dem Beginn ab", () => {
    expect(validateCancellationDeadline(eingabe("2026-09-30T23:59"))).toBe(
      "Die Stornofrist muss vor dem Beginn der Veranstaltung liegen."
    );
  });

  it("lehnt eine Frist genau auf dem Beginn ab", () => {
    expect(validateCancellationDeadline(eingabe("2026-09-15T18:00"))).toBe(
      "Die Stornofrist muss vor dem Beginn der Veranstaltung liegen."
    );
  });

  it("lehnt einen unlesbaren Zeitpunkt ab", () => {
    expect(validateCancellationDeadline(eingabe("morgen mittag"))).toBe(
      "Die Stornofrist konnte nicht gelesen werden. Bitte Datum und Uhrzeit angeben."
    );
  });
});

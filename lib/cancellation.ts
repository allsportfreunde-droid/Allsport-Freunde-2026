/**
 * Bis wann darf storniert werden?
 *
 * Standard ist 24 Stunden vor Beginn. Ein Event kann stattdessen einen festen
 * Zeitpunkt vorgeben (`cancellation_deadline`) – etwa "15.09. um 12:00", wenn
 * Material oder Hallenzeit vorher verbindlich bestellt werden muss.
 *
 * Alle Zeitangaben sind als deutsche Ortszeit gemeint und ohne Zeitzone
 * gespeichert. Die Umrechnung passiert hier an einer Stelle, damit die Frist
 * nicht davon abhängt, in welcher Zeitzone der Server zufällig läuft.
 */

export const CANCELLATION_DEADLINE_HOURS = 24;

/** Raised by the database operation after checking the current, locked state. */
export class CancellationBlockedError extends Error {}

/** Zeitzone, in der alle Event-Zeitangaben gemeint sind. */
const EVENT_TIME_ZONE = "Europe/Berlin";

/** Was zur Fristberechnung von einem Event bekannt sein muss. */
export interface CancellationSource {
  /** "YYYY-MM-DD" */
  event_date: string;
  /** "HH:MM" oder "HH:MM:SS" */
  event_time: string;
  /** Fester Zeitpunkt "YYYY-MM-DDTHH:MM" – null = 24-Stunden-Regel */
  cancellation_deadline?: string | null;
  /** Zeitpunkt der erfolgreichen Zahlung. */
  paid_at?: string | null;
  /** Ein bereits gestarteter SEPA-Einzug unterliegt ebenfalls der Stornofrist. */
  payment_in_progress?: boolean;
}

/**
 * Liest eine Ortszeit ohne Zeitzone als deutschen Zeitpunkt.
 *
 * Erst als UTC lesen, dann um den Versatz der Zielzone korrigieren. Beide
 * Vergleichswerte werden gleich geparst, dadurch fällt die Zeitzone des
 * Servers heraus.
 */
export function localDateTime(
  date: string,
  time: string,
  timeZone: string = EVENT_TIME_ZONE
): Date | null {
  const d = (date ?? "").slice(0, 10);
  const t = (time ?? "").slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{2}:\d{2}$/.test(t)) return null;

  const asUtc = new Date(`${d}T${t}:00Z`);
  if (Number.isNaN(asUtc.getTime())) return null;

  const utcView = new Date(asUtc.toLocaleString("en-US", { timeZone: "UTC" }));
  const zoneView = new Date(asUtc.toLocaleString("en-US", { timeZone }));

  return new Date(asUtc.getTime() - (zoneView.getTime() - utcView.getTime()));
}

/** Beginn der Veranstaltung als echter Zeitpunkt. */
export function eventStart(
  eventDate: string,
  eventTime: string,
  timeZone?: string
): Date | null {
  return localDateTime(eventDate, eventTime, timeZone);
}

/**
 * Hat die Veranstaltung schon begonnen?
 *
 * Fehlt die Uhrzeit am Event, gilt das Ende des Veranstaltungstages – sonst
 * bliebe die Stornierung bei einem lückenhaften Datensatz für immer offen.
 * Ist auch das Datum unlesbar, wird großzügig entschieden: dieselbe Linie wie
 * bei der Frist, damit ein Datenfehler niemanden aussperrt.
 */
export function hasEventStarted(
  event: CancellationSource,
  now: Date = new Date(),
  timeZone?: string
): boolean {
  const start =
    eventStart(event.event_date, event.event_time, timeZone) ??
    localDateTime(event.event_date, "23:59", timeZone);
  if (!start) return false;
  return now.getTime() >= start.getTime();
}

/**
 * Liest einen gespeicherten Frist-Zeitpunkt ("2026-09-15T12:00" oder
 * "2026-09-15 12:00:00") als deutschen Zeitpunkt. Null bei Freitext.
 *
 * Exportiert, weil die Event-Routen denselben Rohwert prüfen müssen, bevor er
 * gespeichert wird – `cancellationDeadline` kappt ihn und käme dort zu spät.
 */
export function parseDeadlineInput(
  value: string | null | undefined,
  timeZone?: string
): Date | null {
  const match = (value ?? "").trim().match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  return match ? localDateTime(match[1], match[2], timeZone) : null;
}

/**
 * Letzter Zeitpunkt, zu dem noch storniert werden kann.
 *
 * Ein am Event hinterlegter Zeitpunkt hat Vorrang; sonst gilt 24 Stunden vor
 * Beginn. Null, wenn sich aus den Daten nichts ableiten lässt.
 *
 * Über den Beginn hinaus reicht keine Frist: ein versehentlich zu spät
 * eingetragener Zeitpunkt wird auf den Beginn gekappt. Sonst nennten
 * Anmeldebestätigung und Statusseite eine Frist, die niemand einhält.
 */
export function cancellationDeadline(
  event: CancellationSource,
  timeZone?: string
): Date | null {
  const start = eventStart(event.event_date, event.event_time, timeZone);

  const custom = parseDeadlineInput(event.cancellation_deadline, timeZone);
  if (custom) {
    if (!start) return custom;
    return custom.getTime() < start.getTime() ? custom : start;
  }

  if (!start) return null;
  return new Date(start.getTime() - CANCELLATION_DEADLINE_HOURS * 60 * 60 * 1000);
}

/**
 * Darf jetzt noch storniert werden?
 *
 * Nach dem Beginn der Veranstaltung nie. Lässt sich davor keine Frist
 * ableiten, wird großzügig entschieden – ein unlesbares Datum soll niemanden
 * aussperren.
 */
export function isCancellationOpen(
  event: CancellationSource,
  now: Date = new Date(),
  timeZone?: string
): boolean {
  // Nach dem Beginn ist Schluss – auch wenn ein am Event hinterlegter
  // Zeitpunkt versehentlich später liegt oder sich gar keine Frist ableiten
  // lässt. Eine gelaufene Veranstaltung kann niemand mehr absagen.
  if (hasEventStarted(event, now, timeZone)) return false;

  const deadline = cancellationDeadline(event, timeZone);
  if (!deadline) return true;
  return now.getTime() < deadline.getTime();
}

/**
 * Die Frist als deutscher Text: "15.09.2026 um 12:00 Uhr".
 *
 * Bewusst hier und nicht in den Komponenten: die Frist wird auch in
 * Fehlermeldungen der API genannt, und dort gibt es keinen Browser, dessen
 * Zeitzone man verwenden dürfte.
 */
export function formatDeadline(deadline: Date): string {
  const formatted = new Intl.DateTimeFormat("de-DE", {
    timeZone: EVENT_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(deadline);
  // Intl liefert "15.09.2026, 12:00" – daraus wird ein lesbarer Satz.
  return formatted.replace(", ", " um ") + " Uhr";
}

/**
 * Baut die Fristangaben aus einer Anmeldung.
 *
 * Die Anmelde-Abfragen liefern die Event-Felder mit `event_`-Präfix; ohne
 * diese Übersetzung liest `cancellationDeadline` einen leeren Wert und fällt
 * stillschweigend auf die 24-Stunden-Regel zurück.
 */
export function cancellationSourceFromRegistration(registration: {
  event_date: string;
  event_time: string;
  event_cancellation_deadline?: string | null;
  paid_at?: string | null;
  payment_in_progress?: boolean;
}): CancellationSource {
  return {
    event_date: registration.event_date,
    event_time: registration.event_time,
    cancellation_deadline: registration.event_cancellation_deadline ?? null,
    paid_at: registration.paid_at ?? null,
    payment_in_progress: registration.payment_in_progress ?? false,
  };
}

/**
 * Darf diese Anmeldung jetzt storniert werden?
 *
 * Die Frist gilt für bezahlte Anmeldungen und laufende SEPA-Einzüge.
 * Ohne Zahlung/Einzug bleibt die bisherige Stornierung bis zum Beginn möglich.
 */
export function canCancelRegistration(
  registration: CancellationSource,
  now: Date = new Date(),
  timeZone?: string
): boolean {
  // Der Beginn gilt für alle: auch die kostenlose Anmeldung kann man nicht
  // rückwirkend zurückziehen, wenn die Veranstaltung schon läuft.
  if (hasEventStarted(registration, now, timeZone)) return false;
  if (!registration.paid_at && !registration.payment_in_progress) return true;
  return isCancellationOpen(registration, now, timeZone);
}

/**
 * Warum jetzt nicht storniert werden kann – null, wenn es erlaubt ist.
 *
 * Die beiden Sperren fühlen sich unterschiedlich an und sollen deshalb auch
 * unterschiedlich heißen; die Routen geben diesen Text direkt weiter.
 */
export function cancellationBlockedReason(
  registration: CancellationSource,
  now: Date = new Date(),
  timeZone?: string
): string | null {
  if (canCancelRegistration(registration, now, timeZone)) return null;

  if (hasEventStarted(registration, now, timeZone)) {
    return "Die Veranstaltung hat bereits begonnen – eine Stornierung ist nicht mehr möglich.";
  }

  const deadline = cancellationDeadline(registration, timeZone);
  return deadline
    ? `Die Stornofrist ist abgelaufen – sie endete am ${formatDeadline(deadline)}.`
    : "Die Stornofrist ist abgelaufen.";
}

/**
 * Prüft die Stornofrist aus dem Event-Formular – null, wenn sie in Ordnung ist.
 *
 * Eine Frist nach dem Beginn ist immer ein Versehen: `cancellationDeadline`
 * kappt sie zwar beim Lesen, aber dann steht in der Datenbank etwas anderes,
 * als tatsächlich gilt. Deshalb schon beim Speichern ablehnen.
 */
export function validateCancellationDeadline(
  event: { date: string; time: string; cancellation_deadline?: string | null },
  timeZone?: string
): string | null {
  const raw = event.cancellation_deadline?.trim();
  if (!raw) return null;

  const deadline = parseDeadlineInput(raw, timeZone);
  if (!deadline) {
    return "Die Stornofrist konnte nicht gelesen werden. Bitte Datum und Uhrzeit angeben.";
  }

  const start = eventStart(event.date, event.time, timeZone);
  if (start && deadline.getTime() >= start.getTime()) {
    return "Die Stornofrist muss vor dem Beginn der Veranstaltung liegen.";
  }

  return null;
}

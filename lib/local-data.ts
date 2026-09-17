import { personRevenueCents } from "./finance";
import type {
  EventWithRegistrations,
  Registration,
  AdminStats,
  EventCreateInput,
  RegistrationWithEvent,
  RegistrationStatusInfo,
  RegistrationStatus,
  CancelEventResult,
  PublishEventResult,
  EventTemplate,
  EventTemplateInput,
  EventImage,
  EventImageInput,
  EventPerson,
  CheckoutInfo,
} from "./types";
import { toPublicEvent } from "./types";

const NOW = new Date().toISOString();
const seedEvents: EventWithRegistrations[] = [
  { id: 1, title: "Freundschaftskick im Park", category: "fussball", description: "Lockeres Fußballspiel für alle Altersgruppen. Kommt vorbei und kickt mit!", date: "2026-04-12", time: "15:00", location: "Sportpark am Main, Frankfurt", parking_location: "Parkplatz Sportpark, Maastrichter Str., Frankfurt", price: "Kostenlos", dress_code: "Sportkleidung & Fußballschuhe (Rasen)", max_participants: 20, max_per_email: 5, status: "published", cancellation_reason: null, published_at: NOW, created_at: NOW, current_participants: 5, pending_participants: 0 },
  { id: 2, title: "HIIT Outdoor Training", category: "fitness", description: "Hochintensives Intervalltraining an der frischen Luft. Für Anfänger und Fortgeschrittene.", date: "2026-04-05", time: "10:00", location: "Grüneburgpark, Frankfurt", parking_location: "Parkplatz Grüneburgpark, Miquelallee, Frankfurt", price: "5 €", entry_price: 5, dress_code: "Sportkleidung & Laufschuhe", max_participants: 15, max_per_email: 5, status: "published", cancellation_reason: null, published_at: NOW, created_at: NOW, current_participants: 8, pending_participants: 0 },
  { id: 3, title: "Schwimmtraining für Anfänger", category: "schwimmen", description: "Grundlagen des Schwimmens lernen in entspannter Atmosphäre. Trainer vor Ort.", date: "2026-04-08", time: "18:00", location: "Hallenbad Höchst, Frankfurt", parking_location: null, price: "Spende willkommen", dress_code: "Badebekleidung & Handtuch", max_participants: 12, max_per_email: 5, status: "published", cancellation_reason: null, published_at: NOW, created_at: NOW, current_participants: 10, pending_participants: 0 },
  { id: 4, title: "Fußball-Turnier: Rhein-Main Cup", category: "fussball", description: "Kleines Turnier mit gemischten Teams. Spaß und Fairplay stehen im Vordergrund!", date: "2026-04-19", time: "11:00", location: "Sportanlage Niederrad, Frankfurt", parking_location: "P+R Niederrad, Schwarzwaldstraße, Frankfurt", price: "Kostenlos", dress_code: "Sportkleidung & Hallenschuhe", max_participants: 24, max_per_email: 5, status: "published", cancellation_reason: null, published_at: NOW, created_at: NOW, current_participants: 22, pending_participants: 0 },
  { id: 5, title: "Yoga & Stretching am Morgen", category: "fitness", description: "Sanfter Start in den Tag mit Yoga und Dehnübungen für Körper und Geist.", date: "2026-04-15", time: "08:00", location: "Vereinsraum, Offenbach", parking_location: null, price: "Kostenlos", dress_code: "Bequeme Kleidung & Yogamatte (falls vorhanden)", max_participants: 20, max_per_email: 5, status: "published", cancellation_reason: null, published_at: NOW, created_at: NOW, current_participants: 0, pending_participants: 2 },
  { id: 6, title: "Aqua-Fitness Kurs", category: "schwimmen", description: "Gelenkschonendes Training im Wasser. Ideal für Einsteiger und Senioren.", date: "2026-04-22", time: "17:00", location: "Rebstockbad, Frankfurt", parking_location: "Parkplatz Rebstockbad, August-Euler-Str. 5, Frankfurt", price: "8 €", entry_price: 8, dress_code: "Badebekleidung & Handtuch", max_participants: 16, max_per_email: 5, status: "published", cancellation_reason: null, published_at: NOW, created_at: NOW, current_participants: 0, pending_participants: 0 },
  { id: 7, title: "Familien-Fußballfest", category: "fussball", description: "Ein Nachmittag für die ganze Familie! Kleine Spiele, Torwandschießen und mehr.", date: "2026-05-03", time: "14:00", location: "Sportpark Preungesheim, Frankfurt", parking_location: null, price: "Kostenlos", dress_code: "Sportkleidung & Turnschuhe", max_participants: 30, max_per_email: 5, status: "draft", cancellation_reason: null, published_at: null, created_at: NOW, current_participants: 0, pending_participants: 0 },
  { id: 8, title: "Kraulschwimmen Technik-Workshop", category: "schwimmen", description: "Verbessere deine Kraultechnik mit unserem erfahrenen Trainer. Grundkenntnisse erforderlich.", date: "2026-04-29", time: "19:00", location: "Stadionbad, Frankfurt", parking_location: "Parkplatz Stadionbad, Mörfelder Landstr. 362, Frankfurt", price: "10 €", entry_price: 10, dress_code: "Badebekleidung, Schwimmbrille & Handtuch", max_participants: 10, max_per_email: 5, status: "published", cancellation_reason: null, published_at: NOW, created_at: NOW, current_participants: 10, pending_participants: 0 },
];

// Internal type keeps legacy fields for local dev/test data
type LocalReg = Registration & { first_name: string; last_name: string; guests: number; paid_person_prices?: Record<string, number> | null };

let localEvents = [...seedEvents];
let localRegistrations: LocalReg[] = [];
let nextRegistrationId = 1;
let nextEventId = 9;

// ─── Images ──────────────────────────────────────────────
let localImages: EventImage[] = [];
let nextImageId = 1;

// ─── Template Images ─────────────────────────────────────
interface TemplateImage { id: number; template_id: number; url: string; alt_text: string; position: number; }
let localTemplateImages: TemplateImage[] = [];
let nextTemplateImageId = 1;

function initSeedRegistrations() {
  const mapping: { eventId: number; count: number; prefix: string; emailPrefix: string; status: RegistrationStatus }[] = [
    { eventId: 1, count: 5, prefix: "Spieler", emailPrefix: "spieler", status: "approved" },
    { eventId: 2, count: 8, prefix: "Sportler", emailPrefix: "sportler", status: "approved" },
    { eventId: 3, count: 10, prefix: "Teilnehmer", emailPrefix: "teilnehmer", status: "approved" },
    { eventId: 4, count: 22, prefix: "Kicker", emailPrefix: "kicker", status: "approved" },
    { eventId: 5, count: 2, prefix: "Yogi", emailPrefix: "yogi", status: "pending" },
    { eventId: 8, count: 10, prefix: "Schwimmer", emailPrefix: "schwimmer", status: "approved" },
  ];
  for (const m of mapping) {
    for (let i = 1; i <= m.count; i++) {
      localRegistrations.push({
        id: nextRegistrationId++,
        event_id: m.eventId,
        first_name: m.prefix,
        last_name: String(i),
        email: `${m.emailPrefix}${i}@beispiel.de`,
        phone: `0151${String(i).padStart(8, "0")}`,
        guests: 0,
        status: m.status,
        status_token: crypto.randomUUID(),
        status_changed_at: m.status === "approved" ? new Date().toISOString() : null,
        status_note: null,
        created_at: new Date().toISOString(),
        qr_code: null,
        qr_token: null,
        checked_in_at: null,
        checked_in_by: null,
        reminder_sent_at: null,
        is_walk_in: false,
        is_waitlist: false,
        notes: null,
      });
    }
  }
}
initSeedRegistrations();

// Helper to recompute event participant counts
function recomputeParticipants(eventId: number) {
  const event = localEvents.find((e) => e.id === eventId);
  if (!event) return;
  event.current_participants = localRegistrations
    .filter((r) => r.event_id === eventId && r.status === "approved")
    .reduce((sum, r) => sum + 1 + r.guests, 0);
  event.pending_participants = localRegistrations
    .filter((r) => r.event_id === eventId && r.status === "pending")
    .reduce((sum, r) => sum + 1 + r.guests, 0);
}

function toRegistrationWithEvent(r: LocalReg): RegistrationWithEvent {
  const event = localEvents.find((e) => e.id === r.event_id);
  return {
    ...r,
    event_title: event?.title ?? "Unbekannt",
    event_date: event?.date ?? "",
    event_category: event?.category ?? "",
    first_name: r.first_name,
    last_name: r.last_name,
    person_count: r.guests + 1,
    child_count: r.persons?.filter((p) => p.is_child && !p.cancelled_at).length ?? 0,
  };
}

function getImagesForEvent(eventId: number): EventImage[] {
  return localImages
    .filter((i) => i.event_id === eventId)
    .sort((a, b) => a.position - b.position);
}

export function setLocalTemplateImages(templateId: number, images: EventImageInput[]): void {
  localTemplateImages = localTemplateImages.filter((i) => i.template_id !== templateId);
  images.forEach((img, idx) => {
    localTemplateImages.push({
      id: nextTemplateImageId++,
      template_id: templateId,
      url: img.url,
      alt_text: img.alt_text,
      position: img.position ?? idx,
    });
  });
}

function getTemplateImages(templateId: number): EventImageInput[] {
  return localTemplateImages
    .filter((i) => i.template_id === templateId)
    .sort((a, b) => a.position - b.position)
    .map((i) => ({ url: i.url, alt_text: i.alt_text, position: i.position }));
}

export function setLocalEventImages(eventId: number, images: EventImageInput[]): void {
  localImages = localImages.filter((i) => i.event_id !== eventId);
  images.forEach((img, idx) => {
    localImages.push({
      id: nextImageId++,
      event_id: eventId,
      url: img.url,
      alt_text: img.alt_text,
      position: img.position ?? idx,
    });
  });
}

// ─── Check-In (local fallback) ───────────────────────────

export function getLocalCheckinEvents() {
  const todayStr = new Date().toISOString().split("T")[0];

  function buildRow(e: EventWithRegistrations) {
    const regs = localRegistrations.filter(
      (r) => r.event_id === e.id && r.status === "approved"
    );
    const entries = regs.flatMap((reg) =>
      (getLocalRegistrationByToken(reg.status_token)?.persons ?? [])
        .filter((person) => !person.cancelled_at)
        .map((person) => ({ person, cents: personRevenueCents(e, person, reg.paid_person_prices) }))
    );
    const checkedIn = entries.filter(({ person }) => person.checked_in_at != null);
    const approved_count = entries.length;
    const checked_in_count = checkedIn.length;
    const entry_price = (e as { entry_price?: number | null }).entry_price ?? null;
    return {
      id: e.id,
      title: e.title,
      category: e.category,
      date: e.date,
      time: e.time,
      location: e.location,
      entry_price,
      approved_count,
      checked_in_count,
      total_costs: 0,
      total_donations: 0,
      expected_revenue: entries.reduce((sum, entry) => sum + entry.cents, 0) / 100,
      actual_revenue: checkedIn.reduce((sum, entry) => sum + entry.cents, 0) / 100,
    };
  }

  const published = localEvents.filter((e) => e.status === "published");
  const upcoming = published
    .filter((e) => e.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
    .map(buildRow);
  const past = published
    .filter((e) => e.date < todayStr)
    .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time))
    .slice(0, 10)
    .map(buildRow);

  return {
    today: upcoming.filter((r) => r.date === todayStr),
    upcoming: upcoming.filter((r) => r.date > todayStr),
    past,
  };
}

// ─── Public ──────────────────────────────────────────────

export function getLocalEvents(): EventWithRegistrations[] {
  return localEvents
    .filter((e) => e.status === "published" && e.date >= new Date().toISOString().split("T")[0])
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
    .map((e) => toPublicEvent({ ...e, images: getImagesForEvent(e.id) }));
}

export function getLocalEvent(id: number) {
  return localEvents.find((e) => e.id === id);
}

export function getLocalRegistrationCount(eventId: number): number {
  // Approved *and* pending sign-ups count towards the taken spots – see
  // getRegistrationCount / toPublicEvent for the rationale.
  return localRegistrations
    .filter(
      (r) =>
        r.event_id === eventId &&
        (r.status === "approved" || r.status === "pending")
    )
    .reduce((sum, r) => sum + 1 + r.guests, 0);
}

export function findLocalRegistration(eventId: number, email: string) {
  const e = email.toLowerCase();
  return localRegistrations.find(
    (r) => r.event_id === eventId && r.email?.toLowerCase() === e
  );
}

export function createLocalRegistration(data: {
  event_id: number;
  email: string;
  phone: string;
  status_token: string;
}): void {
  const registration: LocalReg = {
    id: nextRegistrationId++,
    event_id: data.event_id,
    first_name: "",
    last_name: "",
    email: data.email,
    phone: data.phone,
    guests: 0,
    status: "pending",
    status_token: data.status_token,
    status_changed_at: null,
    status_note: null,
    created_at: new Date().toISOString(),
    qr_code: null,
    qr_token: null,
    checked_in_at: null,
    checked_in_by: null,
    reminder_sent_at: null,
    is_walk_in: false,
    is_waitlist: false,
    notes: null,
  };
  localRegistrations.push(registration);
  recomputeParticipants(data.event_id);
}

export function createLocalWalkInRegistration(data: {
  event_id: number;
  persons: Array<{ firstName: string; lastName: string; isChild?: boolean }>;
  email: string | null;
  phone: string | null;
  notes: string | null;
  checked_in_by: string | null;
}): { id: number; status_token: string; alreadyExists: boolean } {
  if (data.email) {
    const existing = localRegistrations.find(
      (r) => r.event_id === data.event_id && r.email?.toLowerCase() === data.email!.toLowerCase()
    );
    if (existing) return { id: existing.id, status_token: existing.status_token, alreadyExists: true };
  }

  const first = data.persons[0] ?? { firstName: "", lastName: "" };
  const now = new Date().toISOString();
  const registration: LocalReg = {
    id: nextRegistrationId++,
    event_id: data.event_id,
    first_name: first.firstName,
    last_name: first.lastName,
    email: data.email,
    phone: data.phone,
    guests: Math.max(0, data.persons.length - 1),
    status: "approved",
    status_token: crypto.randomUUID(),
    status_changed_at: now,
    status_note: null,
    created_at: now,
    qr_code: null,
    qr_token: null,
    checked_in_at: data.checked_in_by ? now : null,
    checked_in_by: data.checked_in_by ?? null,
    reminder_sent_at: null,
    is_walk_in: true,
    is_waitlist: false,
    notes: data.notes,
  };
  localRegistrations.push(registration);
  recomputeParticipants(data.event_id);
  registration.persons = data.persons.map((person, index) => ({
    id: `local-${registration.id}-${index}`,
    registration_id: registration.id,
    first_name: person.firstName,
    last_name: person.lastName,
    is_child: person.isChild === true,
    checked_in_at: registration.checked_in_at,
    cancelled_at: null,
    created_at: now,
  }));
  return { id: registration.id, status_token: registration.status_token, alreadyExists: false };
}

// ─── Status Page ─────────────────────────────────────────

export function getLocalRegistrationByToken(token: string): RegistrationStatusInfo | null {
  const reg = localRegistrations.find((r) => r.status_token === token);
  if (!reg) return null;
  const event = localEvents.find((e) => e.id === reg.event_id);
  if (!event) return null;

  const persons: RegistrationStatusInfo["persons"] = reg.persons ?? [
    {
      id: `local-${reg.id}-0`,
      registration_id: reg.id,
      first_name: reg.first_name,
      last_name: reg.last_name,
      is_child: false,
      checked_in_at: reg.checked_in_at,
      cancelled_at: null,
      created_at: reg.created_at,
    },
    ...Array.from({ length: reg.guests }, (_, i) => ({
      id: `local-${reg.id}-${i + 1}`,
      registration_id: reg.id,
      first_name: "Begleitperson",
      last_name: `${i + 1}`,
      is_child: false,
      checked_in_at: null,
      cancelled_at: null,
      created_at: reg.created_at,
    })),
  ];

  return {
    id: reg.id,
    first_name: reg.first_name,
    last_name: reg.last_name,
    email: reg.email ?? "",
    guests: reg.guests,
    status: reg.status,
    is_waitlist: reg.is_waitlist,
    paid_at: null,
    status_note: reg.status_note,
    status_changed_at: reg.status_changed_at,
    created_at: reg.created_at,
    event_title: event.title,
    event_date: event.date,
    event_time: event.time,
    event_location: event.location,
    event_category: event.category,
    event_cancellation_deadline: event.cancellation_deadline ?? null,
    event_price: event.price,
    event_entry_price: event.entry_price ?? null,
    event_child_entry_price: event.child_entry_price ?? null,
    event_child_price: event.child_price ?? null,
    amount_paid: null,
    event_dress_code: event.dress_code,
    qr_code: reg.qr_code,
    checked_in_at: reg.checked_in_at,
    persons,
  };
}

export function cancelLocalRegistrationByToken(token: string): RegistrationStatusInfo | null {
  const reg = localRegistrations.find((r) => r.status_token === token);
  if (!reg || (reg.status !== "pending" && reg.status !== "approved")) return null;
  reg.status = "cancelled";
  reg.status_changed_at = new Date().toISOString();
  reg.status_note = null;
  recomputeParticipants(reg.event_id);
  return getLocalRegistrationByToken(token);
}

export function getLocalCheckoutInfo(token: string): CheckoutInfo | null {
  const reg = localRegistrations.find((r) => r.status_token === token);
  if (!reg) return null;
  const event = localEvents.find((e) => e.id === reg.event_id);
  if (!event) return null;
  const persons = getLocalRegistrationByToken(token)!.persons.filter((p) => !p.cancelled_at);

  return {
    registration_id: reg.id,
    email: reg.email,
    status: reg.status,
    is_waitlist: reg.is_waitlist,
    event_id: event.id,
    event_title: event.title,
    event_date: event.date,
    price: event.price,
    paid_at: null,
    entry_price: event.entry_price ?? null,
    child_entry_price: event.child_entry_price ?? null,
    stripe_child_price_id: event.stripe_child_price_id ?? null,
    stripe_price_id: event.stripe_price_id ?? null,
    person_count: persons.length,
    child_count: persons.filter((p) => p.is_child).length,
    persons: persons.map(({ id, is_child }) => ({ id, is_child })),
  };
}

// ─── Admin: Stats ────────────────────────────────────────

export function getLocalAdminStats(): AdminStats {
  const today = new Date().toISOString().split("T")[0];
  const upcoming = localEvents.filter((e) => e.date >= today);
  const totalRegs = localRegistrations.reduce((sum, r) => sum + 1 + r.guests, 0);
  const pendingRegs = localRegistrations.filter((r) => r.status === "pending").reduce((sum, r) => sum + 1 + r.guests, 0);
  const approvedUpcoming = upcoming.reduce((sum, e) => sum + (e.current_participants ?? 0), 0);
  const totalMax = upcoming.reduce((sum, e) => sum + e.max_participants, 0);
  const avgUtil = totalMax === 0 ? 0 : Math.round((approvedUpcoming / totalMax) * 100);

  return {
    total_events: localEvents.length,
    upcoming_events: upcoming.length,
    total_registrations: totalRegs,
    pending_registrations: pendingRegs,
    avg_utilization: avgUtil,
  };
}

// ─── Admin: Events ───────────────────────────────────────

export function getLocalAllEvents(): EventWithRegistrations[] {
  return [...localEvents]
    .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time))
    .map((e) => ({ ...e, images: getImagesForEvent(e.id) }));
}

export function getLocalEventFull(id: number): EventWithRegistrations | null {
  const event = localEvents.find((e) => e.id === id);
  if (!event) return null;
  return { ...event, images: getImagesForEvent(id) };
}

export function createLocalEvent(data: EventCreateInput & { publish?: boolean }): { id: number } {
  const id = nextEventId++;
  const status = data.publish ? "published" : "draft";
  const published_at = data.publish ? new Date().toISOString() : null;
  const { images, publish, parking_location, max_per_email, ...eventFields } = data;
  localEvents.push({
    id,
    ...eventFields,
    parking_location: parking_location ?? null,
    max_per_email: max_per_email ?? 5,
    status,
    cancellation_reason: null,
    published_at,
    created_at: new Date().toISOString(),
    current_participants: 0,
    pending_participants: 0,
  });
  if (images?.length) {
    setLocalEventImages(id, images);
  }
  return { id };
}

export function publishLocalEvent(id: number): PublishEventResult {
  const event = localEvents.find((e) => e.id === id);
  if (!event) return { success: false };
  event.status = "published";
  event.published_at = new Date().toISOString();
  return { success: true };
}

export function unpublishLocalEvent(id: number): PublishEventResult {
  const event = localEvents.find((e) => e.id === id);
  if (!event) return { success: false };
  const registrationCount = localRegistrations.filter((r) => r.event_id === id).length;
  if (registrationCount > 0) return { success: false, registrationCount };
  event.status = "draft";
  event.published_at = null;
  return { success: true };
}

/** For testing: reset all in-memory data to a clean empty state */
export function resetLocalData(
  events: EventWithRegistrations[] = [],
  registrations: Registration[] = [],
  templates: EventTemplate[] = [],
  images: EventImage[] = []
): void {
  localEvents = [...events];
  localRegistrations = registrations.map((r) => {
    const lr = r as LocalReg;
    return {
      ...(r as Registration),
      first_name: lr.first_name ?? "",
      last_name: lr.last_name ?? "",
      guests: lr.guests ?? 0,
    };
  });
  localTemplates = [...templates];
  localImages = [...images];
  localTemplateImages = [];
  nextRegistrationId = registrations.length > 0 ? Math.max(...registrations.map((r) => r.id)) + 1 : 1;
  nextEventId = events.length > 0 ? Math.max(...events.map((e) => e.id)) + 1 : 1;
  nextTemplateId = templates.length > 0 ? Math.max(...templates.map((t) => t.id)) + 1 : 1;
  nextImageId = images.length > 0 ? Math.max(...images.map((i) => i.id)) + 1 : 1;
  nextTemplateImageId = 1;
}

export function cancelLocalEvent(id: number, reason?: string): CancelEventResult {
  const event = localEvents.find((e) => e.id === id);
  if (!event) return { alreadyCancelled: false, event: null, registrations: [] };
  if (event.status === "cancelled") return { alreadyCancelled: true, event: { title: event.title, date: event.date, time: event.time, location: event.location }, registrations: [] };

  event.status = "cancelled";
  event.cancellation_reason = reason ?? null;

  const registrations = localRegistrations
    .filter((r) => r.event_id === id)
    .map((r) => ({ email: r.email, first_name: r.first_name, last_name: r.last_name, status_token: r.status_token }));

  return {
    alreadyCancelled: false,
    event: { title: event.title, date: event.date, time: event.time, location: event.location },
    registrations,
  };
}

export function updateLocalEvent(id: number, data: EventCreateInput): void {
  const event = localEvents.find((e) => e.id === id);
  if (event) {
    const { images, ...eventFields } = data;
    Object.assign(event, eventFields);
    if (images !== undefined) setLocalEventImages(id, images);
  }
}

export function deleteLocalEvent(id: number): void {
  localImages = localImages.filter((i) => i.event_id !== id);
  localRegistrations = localRegistrations.filter((r) => r.event_id !== id);
  localEvents = localEvents.filter((e) => e.id !== id);
}

// ─── Admin: Registrations ────────────────────────────────

export function getLocalAllRegistrations(): RegistrationWithEvent[] {
  return localRegistrations
    .map(toRegistrationWithEvent)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function getLocalEventRegistrations(eventId: number): RegistrationWithEvent[] {
  return localRegistrations
    .filter((r) => r.event_id === eventId)
    .map(toRegistrationWithEvent)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function getLocalEventPersons(eventId: number): EventPerson[] {
  const regs = localRegistrations.filter((r) => r.event_id === eventId);
  const persons: EventPerson[] = [];
  for (const r of regs) {
    persons.push({
      person_id: `local-${r.id}-0`,
      registration_id: r.id,
      first_name: r.first_name,
      last_name: r.last_name,
      is_child: false,
      checked_in_at: r.checked_in_at,
      cancelled_at: null,
      email: r.email,
      phone: r.phone,
      status: r.status,
      is_walk_in: r.is_walk_in,
      created_at: r.created_at,
    });
    for (let i = 0; i < r.guests; i++) {
      persons.push({
        person_id: `local-${r.id}-${i + 1}`,
        registration_id: r.id,
        first_name: "Begleitperson",
        last_name: `${i + 1}`,
        is_child: false,
        checked_in_at: null,
        cancelled_at: null,
        email: r.email,
        phone: r.phone,
        status: r.status,
        is_walk_in: r.is_walk_in,
        created_at: r.created_at,
      });
    }
  }
  return persons;
}

export function deleteLocalRegistration(id: number): void {
  const reg = localRegistrations.find((r) => r.id === id);
  if (reg) {
    localRegistrations = localRegistrations.filter((r) => r.id !== id);
    recomputeParticipants(reg.event_id);
  }
}

// ─── Admin: Status Changes ──────────────────────────────

export function updateLocalRegistrationStatus(id: number, status: RegistrationStatus, note?: string): RegistrationWithEvent | null {
  const reg = localRegistrations.find((r) => r.id === id);
  if (!reg) return null;
  reg.status = status;
  reg.status_changed_at = new Date().toISOString();
  reg.status_note = note || null;
  recomputeParticipants(reg.event_id);
  return toRegistrationWithEvent(reg);
}

export function getLocalRegistrationWithEvent(id: number): RegistrationWithEvent | null {
  const reg = localRegistrations.find((r) => r.id === id);
  if (!reg) return null;
  return toRegistrationWithEvent(reg);
}

export function bulkUpdateLocalRegistrationStatus(ids: number[], status: RegistrationStatus, note?: string): RegistrationWithEvent[] {
  const results: RegistrationWithEvent[] = [];
  for (const id of ids) {
    const result = updateLocalRegistrationStatus(id, status, note);
    if (result) results.push(result);
  }
  return results;
}

// ─── Templates ───────────────────────────────────────────

const seedTemplates: EventTemplate[] = [
  {
    id: 1,
    name: "Monatliches Vereinstraining",
    title: "Vereinstraining",
    category: "fussball",
    description: "Regelmäßiges Training für alle Mitglieder. Anfänger und Fortgeschrittene willkommen.",
    location: "Sportpark am Main, Frankfurt",
    price: "Kostenlos",
    dress_code: "Sportkleidung & Fußballschuhe",
    max_participants: 20,
    last_used_at: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 2,
    name: "Aqua-Fitness Standard",
    title: "Aqua-Fitness",
    category: "schwimmen",
    description: "Gelenkschonendes Training im Wasser. Ideal für Einsteiger und Senioren.",
    location: "Rebstockbad, Frankfurt",
    price: "8 €",
    dress_code: "Badebekleidung & Handtuch",
    max_participants: 16,
    last_used_at: null,
    created_at: new Date().toISOString(),
  },
];

let localTemplates: EventTemplate[] = [...seedTemplates];
let nextTemplateId = seedTemplates.length + 1;

export function getLocalAllTemplates(): EventTemplate[] {
  return [...localTemplates]
    .sort((a, b) => {
      if (a.last_used_at && b.last_used_at) return b.last_used_at.localeCompare(a.last_used_at);
      if (a.last_used_at) return -1;
      if (b.last_used_at) return 1;
      return b.created_at.localeCompare(a.created_at);
    })
    .map((t) => ({ ...t, images: getTemplateImages(t.id) }));
}

export function getLocalTemplate(id: number): EventTemplate | null {
  const tpl = localTemplates.find((t) => t.id === id);
  if (!tpl) return null;
  return { ...tpl, images: getTemplateImages(id) };
}

export function createLocalTemplate(data: EventTemplateInput): { id: number } {
  const id = nextTemplateId++;
  const { images, template_costs, ...templateFields } = data;
  localTemplates.push({
    id,
    ...templateFields,
    template_costs: (template_costs ?? []).map((c, i) => ({ id: i + 1, template_id: id, ...c })),
    last_used_at: null,
    created_at: new Date().toISOString(),
  });
  if (images?.length) setLocalTemplateImages(id, images);
  return { id };
}

export function updateLocalTemplate(id: number, data: EventTemplateInput): void {
  const tpl = localTemplates.find((t) => t.id === id);
  if (tpl) {
    const { images, template_costs, ...templateFields } = data;
    Object.assign(tpl, templateFields);
    if (template_costs !== undefined) {
      tpl.template_costs = template_costs.map((c, i) => ({ id: i + 1, template_id: id, ...c }));
    }
    if (images !== undefined) setLocalTemplateImages(id, images);
  }
}

export function deleteLocalTemplate(id: number): void {
  localTemplateImages = localTemplateImages.filter((i) => i.template_id !== id);
  localTemplates = localTemplates.filter((t) => t.id !== id);
}

export function touchLocalTemplate(id: number): void {
  const tpl = localTemplates.find((t) => t.id === id);
  if (tpl) tpl.last_used_at = new Date().toISOString();
}

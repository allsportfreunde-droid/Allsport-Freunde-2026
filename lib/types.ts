export type EventStatus = "draft" | "published" | "cancelled";

export interface Event {
  id: number;
  title: string;
  category: "fussball" | "fitness" | "schwimmen";
  description: string;
  date: string;
  time: string;
  location: string;
  parking_location: string | null;
  price: string;
  /** Numeric entry price per person in Euro (null = free / not set) */
  entry_price?: number | null;
  /** Stripe Price ID the amount came from (null = manually maintained) */
  stripe_price_id?: string | null;
  /** Kinderbetrag in Euro: null = Erwachsenenpreis, 0 = kostenlos. */
  child_entry_price?: number | null;
  /** Optionaler Anzeigetext; der feste Kinderbetrag gilt weiterhin. */
  child_price?: string | null;
  /** Stripe Price ID für Kinder, auch für einen Preis von 0 Euro. */
  stripe_child_price_id?: string | null;
  dress_code: string;
  max_participants: number;
  /** Max persons per email address (default 5) */
  max_per_email: number;
  status: EventStatus;
  cancellation_reason: string | null;
  published_at: string | null;
  created_at: string;
  /** Optional URL for post-event feedback survey */
  survey_url?: string | null;
  /** Eigener Stornozeitpunkt "YYYY-MM-DDTHH:MM" (null = 24 Stunden vor Beginn) */
  cancellation_deadline?: string | null;
}

export interface EventImage {
  id: number;
  event_id: number;
  url: string;
  alt_text: string;
  position: number;
}

export interface EventImageInput {
  url: string;
  alt_text: string;
  position: number;
}

export interface EventWithRegistrations extends Event {
  current_participants: number;
  pending_participants?: number;
  images?: EventImage[];
  /**
   * Occupancy as a percentage (0–100). Used by the public site instead of the
   * raw participant counts, so the exact number of spots is never exposed.
   */
  occupancy_percentage?: number;
  /** Whether the event is fully booked. Public flag that avoids exposing raw counts. */
  is_full?: boolean;
  /** Finance summary – included in admin getAllEvents query */
  total_costs?: number;
  expected_revenue?: number;
  actual_revenue?: number;
  total_donations?: number;
  /** Physical cash count entered at end of event (from events.cash_counted) */
  cash_counted?: number | null;
  cash_counted_at?: string | null;
  /** Check-in summary for past events – included in admin getAllEvents query */
  total_registrations?: number;  // approved non-walk-in registrations
  checkin_count?: number;        // checked-in non-walk-in registrations
  walk_in_count?: number;        // approved walk-in registrations
}

/**
 * Strip raw participant counts from an event and replace them with a percentage
 * + full flag. Used for the public events list so the exact number of spots
 * (max / current / pending) is never sent to the browser.
 */
export function toPublicEvent(e: EventWithRegistrations): EventWithRegistrations {
  // Count both approved and still-pending sign-ups towards the occupancy. A
  // pending sign-up already reserves a spot, so ignoring it made the event
  // look emptier than it really is and confused visitors. Now the public
  // indicator reflects how many spots are effectively taken.
  const occupied = (e.current_participants ?? 0) + (e.pending_participants ?? 0);
  const max = e.max_participants ?? 0;
  const isFull = max > 0 && occupied >= max;
  // Never round up to 100 % unless the event is actually full.
  let occupancy = 0;
  if (max > 0) {
    occupancy = isFull ? 100 : Math.min(99, Math.round((occupied / max) * 100));
  }

  // Remove the raw counts so they never reach the public client.
  const {
    max_participants: _max,
    current_participants: _current,
    pending_participants: _pending,
    ...rest
  } = e;

  return {
    ...rest,
    occupancy_percentage: occupancy,
    is_full: isFull,
  } as EventWithRegistrations;
}

export type RegistrationStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface RegistrationPerson {
  id: string;
  registration_id: number;
  first_name: string;
  last_name: string;
  /** true = Kind (U18). Wird bei der Anmeldung per Toggle gesetzt, Default false. */
  is_child: boolean;
  checked_in_at: string | null;
  cancelled_at: string | null;
  created_at: string;
}

export interface Registration {
  id: number;
  event_id: number;
  email: string | null;
  phone: string | null;
  status: RegistrationStatus;
  status_token: string;
  status_changed_at: string | null;
  status_note: string | null;
  created_at: string;
  qr_code: string | null;
  qr_token: string | null;
  checked_in_at: string | null;
  checked_in_by: string | null;
  is_walk_in: boolean;
  /** Angemeldet, als das Event bereits voll war – darf (noch) nicht zahlen */
  is_waitlist: boolean;
  notes: string | null;
  reminder_sent_at: string | null;
  persons?: RegistrationPerson[];
}

export interface CancellationToken {
  id: string;
  token: string;
  registration_id: number;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface WalkInInput {
  event_id: number;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  notes?: string;
}

export interface RegistrationRequest {
  event_id: number;
  email: string;
  phone: string;
  persons: Array<{ firstName: string; lastName: string; isChild?: boolean }>;
}

export interface RegistrationWithEvent extends Registration {
  payment_failed?: boolean;
  event_title: string;
  event_date: string;
  event_category: string;
  /** From JOIN with registration_persons (first person) */
  first_name: string;
  last_name: string;
  /** Total person count for this registration */
  person_count: number;
  /** Davon als Kind (U18) markiert – Teilmenge von person_count */
  child_count: number;
}

export interface RegistrationDetail extends RegistrationWithEvent {
  checkout_notices?: Array<{
    kind: "approval" | "payment_failed" | "refund_due";
    data: { reason?: string; amount?: number };
    created_at: string;
    sent_at: string | null;
    delivery_uncertain: boolean;
    payment_state: string | null;
    stripe_url: string | null;
  }>;
  event_time: string;
  event_location: string;
  /** Zahlungsdaten – null, solange nicht bezahlt wurde */
  paid_at: string | null;
  amount_paid: number | null;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  /** Fertiger Link ins Stripe-Dashboard, serverseitig gebaut */
  stripe_dashboard_url?: string | null;
  /**
   * Was aus Stornierungen zu erstatten ist – zugesagt per E-Mail, ausgezahlt
   * von Hand im Stripe-Dashboard. Ohne diese Anzeige wüsste niemand, welcher
   * Betrag dort einzutragen ist.
   */
  refund_due?: { amount: number; persons: number } | null;
  /** All persons registered under this email (incl. main person), ordered by created_at */
  persons: RegistrationPerson[];
}

export interface EventPerson {
  person_id: string;
  registration_id: number;
  first_name: string;
  last_name: string;
  /** true = Kind (U18) */
  is_child: boolean;
  checked_in_at: string | null;
  cancelled_at: string | null;
  email: string | null;
  phone: string | null;
  status: RegistrationStatus;
  is_walk_in: boolean;
  created_at: string;
}

export interface RegistrationStatusInfo {
  payment_state?: "open" | "processing" | "paid" | "failed" | "checking";
  checkout_amount?: number | null;
  payment_in_progress?: boolean;
  id: number;
  /** From JOIN with registration_persons (first person) */
  first_name: string;
  last_name: string;
  email: string;
  /** Companion count = person_count - 1 */
  guests: number;
  status: RegistrationStatus;
  status_note: string | null;
  status_changed_at: string | null;
  created_at: string;
  event_title: string;
  event_date: string;
  event_time: string;
  event_location: string;
  event_category: string;
  is_waitlist: boolean;
  /** Zeitpunkt der Zahlung (null = noch nicht bezahlt) */
  paid_at: string | null;
  /** Eigener Stornozeitpunkt des Events (null = 24-Stunden-Regel) */
  event_cancellation_deadline: string | null;
  event_price: string;
  /** Betrag pro Person in Euro – Grundlage für die Zahlung (null = keiner) */
  event_entry_price: number | null;
  event_child_entry_price?: number | null;
  event_child_price?: string | null;
  /** Tatsächlich gezahlter Betrag; unabhängig vom aktuellen Eventpreis. */
  amount_paid?: number | null;
  event_dress_code: string;
  qr_code: string | null;
  checked_in_at: string | null;
  persons: RegistrationPerson[];
}

export interface CheckinParticipant {
  id: number;
  /** From JOIN with registration_persons (first person) */
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  /** Active person count - 1 (companions) */
  guests: number;
  /** Registration-level check-in timestamp (set when QR scanned) */
  checked_in_at: string | null;
  checked_in_by: string | null;
  is_walk_in: boolean;
  notes: string | null;
  /**
   * Zeitpunkt der Zahlung – null heißt offen. Am Eingang wichtig, weil
   * Walk-ins und QR-Selbstanmeldungen schon in der Liste stehen, bevor
   * bezahlt wurde.
   */
  paid_at: string | null;
  /** All persons for this registration with individual check-in state */
  persons: RegistrationPerson[];
}

/**
 * A still-pending registration for an event. Everyone who signed up while the
 * event was already fully booked lands here – the team confirms these entries
 * from the check-in dashboard.
 */
export interface WaitlistEntry {
  id: number;
  /** From JOIN with registration_persons (first person) */
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  /** When the registration came in – defines the waitlist order */
  created_at: string;
  /** false = ein Platz wurde bereits angeboten, die Anmeldung kann zahlen */
  is_waitlist: boolean;
  /** All active persons for this registration with individual check-in state */
  persons: RegistrationPerson[];
}

export interface CheckinStatusResponse {
  total: number;
  checked_in: number;
  missing: number;
  total_registrations: number;
  total_guests: number;
  walk_in_registrations: number;
  walk_in_guests: number;
  participants: CheckinParticipant[];
  /** Pending registrations for this event, oldest first */
  waitlist: WaitlistEntry[];
  waitlist_registrations: number;
  /** Total persons across all waitlist registrations */
  waitlist_persons: number;
}

/** Event summary as delivered by /api/admin/checkin/events */
export interface CheckinEvent {
  id: number;
  title: string;
  category: string;
  date: string;
  time: string;
  location: string;
  approved_count: number;
  checked_in_count: number;
  entry_price: number | null;
  total_costs: number;
  total_donations: number;
  expected_revenue: number;
  actual_revenue: number;
}

export interface CheckinEventsResponse {
  today: CheckinEvent[];
  upcoming: CheckinEvent[];
  past: CheckinEvent[];
}

export interface AdminStats {
  total_events: number;
  upcoming_events: number;
  total_registrations: number;
  pending_registrations: number;
  avg_utilization: number;
}

export interface PublishEventResult {
  success: boolean;
  /** Only set when unpublish is blocked */
  registrationCount?: number;
}

export interface CancelEventResult {
  alreadyCancelled: boolean;
  event: { title: string; date: string; time: string; location: string } | null;
  registrations: Array<{ email: string | null; first_name: string; last_name: string; status_token: string }>;
}

export interface TemplateCost {
  id: number;
  template_id: number;
  description: string;
  amount: number;
}

export interface TemplateCostInput {
  description: string;
  amount: number;
}

export interface EventTemplate {
  id: number;
  /** Display name of the template, e.g. "Monatliches Vereinstraining" */
  name: string;
  /** Default event title pre-filled when using this template */
  title: string;
  category: "fussball" | "fitness" | "schwimmen";
  description: string;
  location: string;
  price: string;
  entry_price?: number | null;
  dress_code: string;
  max_participants: number;
  max_per_email?: number;
  last_used_at: string | null;
  created_at: string;
  images?: EventImageInput[];
  template_costs?: TemplateCost[];
}

export interface EventTemplateInput {
  name: string;
  title: string;
  category: "fussball" | "fitness" | "schwimmen";
  description: string;
  location: string;
  price: string;
  entry_price?: number | null;
  dress_code: string;
  max_participants: number;
  images?: EventImageInput[];
  template_costs?: TemplateCostInput[];
}

export interface EventCreateInput {
  title: string;
  category: "fussball" | "fitness" | "schwimmen";
  description: string;
  date: string;
  time: string;
  location: string;
  parking_location?: string;
  price: string;
  entry_price?: number | null;
  /** Stripe Price ID the amount came from (null = manually maintained) */
  stripe_price_id?: string | null;
  /** Kinderbetrag in Euro: null = Erwachsenenpreis, 0 = kostenlos. */
  child_entry_price?: number | null;
  child_price?: string | null;
  /** Stripe Price ID für Kinder, auch für einen Preis von 0 Euro. */
  stripe_child_price_id?: string | null;
  dress_code: string;
  max_participants: number;
  /** Max persons per email address (default 5) */
  max_per_email?: number;
  /** Optional URL for post-event feedback survey */
  survey_url?: string | null;
  /** Eigener Stornozeitpunkt "YYYY-MM-DDTHH:MM" (null = 24 Stunden vor Beginn) */
  cancellation_deadline?: string | null;
  images?: EventImageInput[];
}

/**
 * Alles, was eine Stripe Checkout Session braucht – ausschließlich aus der
 * Datenbank ermittelt. Der Browser schickt nur den Token, nie einen Betrag
 * und nie eine Personenanzahl.
 */
export interface CheckoutInfo {
  registration_created_unix?: number;
  registration_id: number;
  email: string | null;
  status: RegistrationStatus;
  event_id: number;
  event_title: string;
  event_date: string;
  price: string;
  paid_at: string | null;
  /** Betrag pro Person in Euro (null = kein Betrag hinterlegt) */
  entry_price: number | null;
  /** Stripe Price ID, falls der Betrag von dort stammt */
  stripe_price_id: string | null;
  child_entry_price: number | null;
  stripe_child_price_id: string | null;
  /** Warteliste: es gab bei der Anmeldung keinen freien Platz */
  is_waitlist: boolean;
  /** Aktive, also nicht stornierte Personen dieser Anmeldung */
  person_count: number;
  child_count: number;
  persons: Array<{ id: string; is_child: boolean }>;
}

/**
 * Alles, was für eine Erstattung nach einer Stornierung gebraucht wird:
 * die Zahlung, die betroffenen Personen und die Angaben für die E-Mail.
 *
 * Bewusst getrennt von CheckoutInfo – dort geht Geld rein, hier raus.
 * Zurückgezahlt wird von Hand im Stripe-Dashboard; hier entsteht nur der
 * Betrag, der dem Teilnehmer zugesagt und dem Admin angezeigt wird.
 */
export interface RefundContext {
  stripe_session_id?: string | null;
  registration_id: number;
  email: string | null;
  status_token: string;
  /** Vorname der ersten Person – die Anrede in der E-Mail */
  first_name: string;
  /** Zeitpunkt der Zahlung. null = nie bezahlt, dann gibt es nichts zu erstatten. */
  paid_at: string | null;
  amount_paid: number | null;
  /** Gezahlt je Personen-ID in Cent. Fehlt bei Zahlungen vor Einführung der Aufteilung. */
  paid_person_prices?: Record<string, number> | null;
  stripe_payment_intent_id: string | null;
  /** Personen, für die damals gezahlt wurde */
  paid_persons: number;
  /** Cent, die für diese Zahlung bereits als Erstattung zugesagt sind */
  announced_cents: number;
  /** Bezahlte Personen, die storniert sind und deren Anteil noch offen ist */
  pending_persons: RefundPerson[];
  /** Bezahlte Personen, die weiterhin angemeldet sind */
  active_paid_persons: number;
  /** Alle noch angemeldeten Personen – entscheidet, ob nur ein Teil storniert wurde */
  active_persons: number;
  event_title: string;
  event_date: string;
  event_time: string;
  event_location: string;
  event_cancellation_deadline: string | null;
}

/** Eine Person, deren Anteil erstattet wird. */
export interface RefundPerson {
  cancelled_at?: string | null;
  id: string;
  first_name: string;
  last_name: string;
}

// ─── Finance ──────────────────────────────────────────────

export interface EventCost {
  id: number;
  event_id: number;
  description: string;
  amount: number;
  created_at: string;
  updated_at: string;
}

export interface EventDonation {
  id: number;
  event_id: number;
  registration_id: number | null;
  donor_name: string;
  amount: number;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export interface EventFinancials {
  entry_price: number | null;
  child_entry_price?: number | null;
  total_costs: number;
  /** Approved registrations + their guests */
  approved_persons: number;
  approved_guests: number;
  expected_revenue: number;
  /** Checked-in registrations + their guests */
  checkedin_persons: number;
  checkedin_guests: number;
  actual_revenue: number;
  /** Sum of all donations */
  total_donations: number;
  donation_count: number;
  /** Actual revenue + donations − costs */
  balance: number;
  costs: EventCost[];
  donations: EventDonation[];
  /** Physical cash count entered at end of event */
  cash_counted: number | null;
  cash_counted_at: string | null;
}

// ─── Contact / Inquiry ───────────────────────────────────

export type InquiryStatus = "open" | "answered" | "resolved";
export type MessageSender = "user" | "admin";

export interface ContactInquiry {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string;
  whatsapp_number: string | null;
  message: string;
  event_id: number | null;
  status: InquiryStatus;
  conversation_token: string;
  consent_to_store: boolean;
  delete_at: string;
  created_at: string;
  updated_at: string;
}

export interface ContactInquiryWithEvent extends ContactInquiry {
  event_title: string | null;
}

export interface InquiryMessage {
  id: number;
  inquiry_id: number;
  sender: MessageSender;
  message: string;
  sent_at: string;
}

export interface ContactInquiryDetail extends ContactInquiryWithEvent {
  messages: InquiryMessage[];
}

export interface ContactFormInput {
  first_name?: string;
  last_name?: string;
  email: string;
  whatsapp_number?: string;
  message: string;
  event_id?: number | null;
  consent_to_store?: boolean;
}

// ─── Helfer ───────────────────────────────────────────────

export type HelperQualification = "TRAINER" | "AUFSICHT" | "RETTUNGSSCHWIMMER";

export const HELPER_QUALIFICATION_LABELS: Record<HelperQualification, string> = {
  TRAINER: "Trainer",
  AUFSICHT: "Aufsicht",
  RETTUNGSSCHWIMMER: "Rettungsschwimmer",
};

export interface Helper {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  qualifications: HelperQualification[];
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface HelperInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  qualifications: HelperQualification[];
  notes?: string | null;
  is_active?: boolean;
}

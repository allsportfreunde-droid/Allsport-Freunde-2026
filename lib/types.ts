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
  persons: Array<{ firstName: string; lastName: string }>;
}

export interface RegistrationWithEvent extends Registration {
  event_title: string;
  event_date: string;
  event_category: string;
  /** From JOIN with registration_persons (first person) */
  first_name: string;
  last_name: string;
  /** Total person count for this registration */
  person_count: number;
}

export interface RegistrationDetail extends RegistrationWithEvent {
  event_time: string;
  event_location: string;
  /** All persons registered under this email (incl. main person), ordered by created_at */
  persons: RegistrationPerson[];
}

export interface EventPerson {
  person_id: string;
  registration_id: number;
  first_name: string;
  last_name: string;
  checked_in_at: string | null;
  cancelled_at: string | null;
  email: string | null;
  phone: string | null;
  status: RegistrationStatus;
  is_walk_in: boolean;
  created_at: string;
}

export interface RegistrationStatusInfo {
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
  event_price: string;
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
  /** All persons for this registration with individual check-in state */
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
  /** Numeric entry price per person in Euro (null/undefined = free) */
  entry_price?: number | null;
  dress_code: string;
  max_participants: number;
  /** Max persons per email address (default 5) */
  max_per_email?: number;
  /** Optional URL for post-event feedback survey */
  survey_url?: string | null;
  images?: EventImageInput[];
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

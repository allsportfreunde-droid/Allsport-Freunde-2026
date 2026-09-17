import { Resend } from "resend";
import { RegistrationReceivedEmail } from "@/emails/registration-received";
import { WaitlistReceivedEmail } from "@/emails/waitlist-received";
import { WaitlistSpotOfferedEmail } from "@/emails/waitlist-spot-offered";
import { RegistrationApprovedEmail } from "@/emails/registration-approved";
import { RegistrationRejectedEmail } from "@/emails/registration-rejected";
import { RegistrationCancelledEmail } from "@/emails/registration-cancelled";
import { EventCancelledEmail } from "@/emails/event-cancelled";
import { ContactReceivedEmail } from "@/emails/contact-received";
import { ContactAdminEmail } from "@/emails/contact-admin";
import { ContactResponseEmail } from "@/emails/contact-response";
import { ReminderEmail } from "@/emails/reminder";
import { SurveyEmail } from "@/emails/survey";
import { RefundDueAdminEmail } from "@/emails/refund-due-admin";
import { formatEuro } from "@/lib/finance";
import { render } from "@react-email/components";
import type { CheckoutMessage } from "@/lib/db/checkout";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const fromEmail = process.env.EMAIL_FROM || "Allsport Freunde 2026 e.V. <noreply@allsport-freunde.com>";
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/** Für Checkout-Webhooks: Fehler weiterreichen, damit Stripe den Versand erneut anstößt. */
export async function createCheckoutEmail(subject: string, to: string, react: React.ReactElement): Promise<CheckoutMessage> {
  if (!to) throw new Error("Empfänger der Checkout-Benachrichtigung fehlt.");
  return { from: fromEmail, to, subject, html: await render(react) };
}

export async function sendCheckoutEmail(message: CheckoutMessage, idempotencyKey: string): Promise<void> {
  if (!resend) throw new Error("RESEND_API_KEY für Checkout-Benachrichtigungen fehlt.");
  const result = await resend.emails.send(message, { idempotencyKey });
  if (result.error || !result.data?.id) throw new Error("Checkout-E-Mail wurde vom Versanddienst nicht bestätigt.");
}

function formatDateDE(date: string): string {
  return new Date(date).toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

interface EmailData {
  to: string;
  firstName: string;
  lastName: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  eventLocation: string;
  statusToken: string;
  /** All persons in this registration */
  persons?: Array<{ firstName: string; lastName: string }>;
}

async function sendEmail(subject: string, to: string, react: React.ReactElement) {
  if (!resend) {
    console.log(`[Email] An: ${to}`);
    console.log(`[Email] Betreff: ${subject}`);
    console.log("[Email] (RESEND_API_KEY nicht gesetzt – E-Mail nur geloggt)");
    return;
  }

  try {
    await resend.emails.send({
      from: fromEmail,
      to,
      subject,
      react,
    });
  } catch (error) {
    console.error("[Email] Fehler beim Senden:", error);
  }
}

export async function sendRegistrationReceivedEmail(
  data: EmailData & { priceLabel?: string; cancellationLabel?: string }
) {
  const statusUrl = `${appUrl}/status/${data.statusToken}`;
  const subject = `Anmeldung eingegangen – ${data.eventTitle}`;

  sendEmail(
    subject,
    data.to,
    RegistrationReceivedEmail({
      firstName: data.firstName,
      eventTitle: data.eventTitle,
      eventDate: formatDateDE(data.eventDate),
      eventTime: data.eventTime,
      eventLocation: data.eventLocation,
      statusUrl,
      persons: data.persons,
      priceLabel: data.priceLabel,
      cancellationLabel: data.cancellationLabel,
    })
  );
}

export async function sendWaitlistReceivedEmail(data: EmailData) {
  const statusUrl = `${appUrl}/status/${data.statusToken}`;
  const subject = `Du stehst auf der Warteliste – ${data.eventTitle}`;

  sendEmail(
    subject,
    data.to,
    WaitlistReceivedEmail({
      firstName: data.firstName,
      eventTitle: data.eventTitle,
      eventDate: formatDateDE(data.eventDate),
      eventTime: data.eventTime,
      eventLocation: data.eventLocation,
      statusUrl,
      persons: data.persons,
    })
  );
}

/**
 * Ein Platz auf der Warteliste ist frei geworden. Anders als die
 * Bestätigungsmail verspricht diese noch nichts – sie fordert zur Zahlung
 * auf, mit der der Platz erst verbindlich wird.
 */
export async function sendWaitlistSpotOfferedEmail(
  data: EmailData & { priceLabel?: string }
) {
  const statusUrl = `${appUrl}/status/${data.statusToken}`;
  const subject = `Ein Platz ist frei geworden – ${data.eventTitle}`;

  sendEmail(
    subject,
    data.to,
    WaitlistSpotOfferedEmail({
      firstName: data.firstName,
      eventTitle: data.eventTitle,
      eventDate: formatDateDE(data.eventDate),
      eventTime: data.eventTime,
      eventLocation: data.eventLocation,
      statusUrl,
      persons: data.persons,
      priceLabel: data.priceLabel,
    })
  );
}

export async function sendRegistrationApprovedEmail(data: EmailData & { qrCode?: string }) {
  const statusUrl = `${appUrl}/status/${data.statusToken}`;
  const subject = `Anmeldung bestätigt – ${data.eventTitle}`;

  sendEmail(
    subject,
    data.to,
    RegistrationApprovedEmail({
      firstName: data.firstName,
      eventTitle: data.eventTitle,
      eventDate: formatDateDE(data.eventDate),
      eventTime: data.eventTime,
      eventLocation: data.eventLocation,
      statusUrl,
      qrCode: data.qrCode,
    })
  );
}

/**
 * Stornobestätigung – und, wenn bezahlt wurde, die Erstattung.
 *
 * Wer nur eine von mehreren Personen abmeldet, bekommt genau das bestätigt:
 * wer abgemeldet ist, wer angemeldet bleibt und welcher Anteil zurückgeht.
 * Der Betrag wird nicht hier gerechnet, sondern kommt aus dem, was bei der
 * Stornierung als Erstattung festgehalten wurde – so kann die E-Mail keine
 * andere Zahl nennen als die, die der Admin im Dashboard zurücküberweist.
 */
export async function sendRegistrationCancelledEmail(
  data: EmailData & {
    /** Namen der jetzt abgemeldeten Personen */
    cancelledPersons?: string[];
    /** Personen, die weiterhin angemeldet bleiben */
    remainingPersons?: number;
    /** Betrag in Euro, der erstattet wird (nicht gesetzt = keine Erstattung) */
    refundAmount?: number;
  }
) {
  const statusUrl = `${appUrl}/status/${data.statusToken}`;
  const partial = (data.remainingPersons ?? 0) > 0;
  const subject = partial
    ? `Teilstornierung – ${data.eventTitle}`
    : `Anmeldung storniert – ${data.eventTitle}`;

  sendEmail(
    subject,
    data.to,
    RegistrationCancelledEmail({
      firstName: data.firstName,
      eventTitle: data.eventTitle,
      eventDate: formatDateDE(data.eventDate),
      eventTime: data.eventTime,
      eventLocation: data.eventLocation,
      statusUrl,
      cancelledPersons: data.cancelledPersons,
      remainingPersons: data.remainingPersons ?? 0,
      refundLabel:
        data.refundAmount != null && data.refundAmount > 0
          ? formatEuro(data.refundAmount)
          : null,
    })
  );
}




/**
 * Meldet dem Team, dass Geld zurückzuzahlen ist.
 *
 * Erstattet wird von Hand im Stripe-Dashboard – ohne diese Nachricht müsste
 * jemand von sich aus nachsehen, ob storniert wurde, und genau das geht im
 * Alltag unter. Dem Teilnehmer ist der Betrag zu diesem Zeitpunkt bereits
 * zugesagt.
 *
 * Die drei Links sind der ganze Zweck: zur Zahlung, zu der die Rückzahlung
 * gehört, zur Anmeldung im Admin-Panel und zu der Seite, die der Teilnehmer
 * selbst sieht.
 */
export async function sendRefundDueAdminEmail(data: {
  adminEmail: string;
  eventTitle: string;
  eventDate: string;
  participantEmail: string;
  personNames: string[];
  /** Betrag in Euro */
  amount: number;
  remainingPersons: number;
  stripeUrl: string | null;
  statusToken: string;
}) {
  const amountLabel = formatEuro(data.amount);
  const namen =
    data.personNames.length === 1
      ? data.personNames[0]
      : `${data.personNames.length} Personen`;

  sendEmail(
    `Erstattung fällig: ${amountLabel} – ${data.eventTitle}`,
    data.adminEmail,
    RefundDueAdminEmail({
      eventTitle: data.eventTitle,
      eventDate: formatDateDE(data.eventDate),
      participantEmail: data.participantEmail,
      personNames: data.personNames.length > 0 ? data.personNames : [namen],
      amountLabel,
      remainingPersons: data.remainingPersons,
      stripeUrl: data.stripeUrl,
      statusUrl: `${appUrl}/status/${data.statusToken}`,
      // Die Suche ist vorbelegt, damit die Anmeldung nicht zwischen allen
      // anderen gesucht werden muss.
      adminUrl: `${appUrl}/admin/registrations?suche=${encodeURIComponent(data.participantEmail)}`,
    })
  );
}

export async function sendEventCancelledEmail(
  data: EmailData & { cancellationReason?: string }
) {
  const statusUrl = `${appUrl}/status/${data.statusToken}`;
  const subject = `Veranstaltung abgesagt: ${data.eventTitle}`;

  sendEmail(
    subject,
    data.to,
    EventCancelledEmail({
      firstName: data.firstName,
      eventTitle: data.eventTitle,
      eventDate: formatDateDE(data.eventDate),
      eventTime: data.eventTime,
      eventLocation: data.eventLocation,
      cancellationReason: data.cancellationReason,
      statusUrl,
    })
  );
}

export async function sendRegistrationRejectedEmail(
  data: EmailData & { note?: string }
) {
  const statusUrl = `${appUrl}/status/${data.statusToken}`;
  const subject = `Anmeldung abgelehnt – ${data.eventTitle}`;

  sendEmail(
    subject,
    data.to,
    RegistrationRejectedEmail({
      firstName: data.firstName,
      eventTitle: data.eventTitle,
      eventDate: formatDateDE(data.eventDate),
      eventTime: data.eventTime,
      eventLocation: data.eventLocation,
      statusUrl,
      note: data.note,
    })
  );
}

// ─── Survey Email ────────────────────────────────────────

export async function sendEventSurveyEmail(data: {
  to: string;
  firstName: string;
  eventTitle: string;
  eventDate: string;
  surveyUrl: string;
}) {
  const subject = `Wie war das Event? Dein Feedback zu ${data.eventTitle}`;

  sendEmail(
    subject,
    data.to,
    SurveyEmail({
      firstName: data.firstName,
      eventTitle: data.eventTitle,
      eventDate: formatDateDE(data.eventDate),
      surveyUrl: data.surveyUrl,
    })
  );
}

// ─── Contact Emails ──────────────────────────────────────

export async function sendContactReceivedEmail(data: {
  to: string;
  firstName?: string;
  eventTitle?: string;
  conversationToken: string;
}) {
  const conversationUrl = `${appUrl}/conversation/${data.conversationToken}`;
  sendEmail(
    "Deine Anfrage ist eingegangen – Allsport Freunde",
    data.to,
    ContactReceivedEmail({
      firstName: data.firstName,
      eventTitle: data.eventTitle,
      conversationUrl,
    })
  );
}

export async function sendContactAdminEmail(data: {
  adminEmail: string;
  senderName: string;
  senderEmail: string;
  eventTitle?: string;
  messagePreview: string;
  inquiryId: number;
}) {
  const adminUrl = `${appUrl}/admin/contact/${data.inquiryId}`;
  sendEmail(
    `Neue Kontaktanfrage von ${data.senderName}`,
    data.adminEmail,
    ContactAdminEmail({
      senderName: data.senderName,
      senderEmail: data.senderEmail,
      eventTitle: data.eventTitle,
      messagePreview: data.messagePreview,
      adminUrl,
    })
  );
}

export async function sendContactResponseEmail(data: {
  to: string;
  firstName?: string;
  responseText: string;
  conversationToken: string;
}) {
  const conversationUrl = `${appUrl}/conversation/${data.conversationToken}`;
  sendEmail(
    "Antwort auf deine Anfrage – Allsport Freunde",
    data.to,
    ContactResponseEmail({
      firstName: data.firstName,
      responseText: data.responseText,
      conversationUrl,
    })
  );
}

// ─── Reminder Email ──────────────────────────────────────

export async function sendEventReminderEmail(data: {
  to: string;
  firstName: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  eventLocation: string;
  statusToken: string;
  cancellationToken: string;
}) {
  const statusUrl = `${appUrl}/status/${data.statusToken}`;
  const cancelUrl = `${appUrl}/cancel-registration?token=${data.cancellationToken}`;
  const subject = `Erinnerung: ${data.eventTitle} findet morgen statt`;

  sendEmail(
    subject,
    data.to,
    ReminderEmail({
      firstName: data.firstName,
      eventTitle: data.eventTitle,
      eventDate: formatDateDE(data.eventDate),
      eventTime: data.eventTime,
      eventLocation: data.eventLocation,
      statusUrl,
      cancelUrl,
    })
  );
}

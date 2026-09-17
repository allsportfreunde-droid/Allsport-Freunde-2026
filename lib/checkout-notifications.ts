import {
  getCheckoutNotifications, prepareCheckoutMessage, markCheckoutNotificationSent,
  getRegistrationDetail, getEvent, getCheckoutPricing,
  cancelCheckoutNotification,
} from "@/lib/db";
import { createCheckoutEmail, sendCheckoutEmail } from "@/lib/email";
import { RegistrationApprovedEmail } from "@/emails/registration-approved";
import { PaymentFailedAdminEmail } from "@/emails/payment-failed-admin";
import { RefundDueAdminEmail } from "@/emails/refund-due-admin";
import { generateAndSaveCheckinQR } from "@/lib/checkin-qr";
import { stripePaymentUrl } from "@/lib/stripe";
import { formatEuro } from "@/lib/finance";
import { personPricesTotal } from "@/lib/payment-prices";

/** Ein dauerhafter DB-Nachweis ergänzt Resends auf 24 Stunden begrenzte Idempotenz. */
export async function deliverCheckoutNotifications(registrationId: number) {
  const notices = await getCheckoutNotifications(registrationId);
  const errors: unknown[] = [];
  for (const notice of notices) {
    try {
      let prepared = notice;
      const registration = await getRegistrationDetail(registrationId);
      if (!registration) throw new Error("Anmeldung für Checkout-Benachrichtigung fehlt.");
      if (notice.kind === "approval" && (registration.status !== "approved" || !registration.email)) {
        await cancelCheckoutNotification(notice.id);
        continue;
      }
      if (!prepared.message) {
        const event = await getEvent(registration.event_id);
        if (!event) throw new Error("Event für Checkout-Benachrichtigung fehlt.");
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const statusUrl = `${appUrl}/status/${registration.status_token}`;
        const adminUrl = `${appUrl}/admin/registrations?suche=${encodeURIComponent(registration.email ?? "")}`;
        const eventDate = new Date(`${event.date}T12:00:00`).toLocaleDateString("de-DE");
        let message;
        if (notice.kind === "approval") {
          // Eine zwischenzeitliche Stornierung/Ablehnung niemals rückgängig machen.
          if (registration.status !== "approved" || !registration.email) continue;
          const qrCode = registration.qr_code ?? await generateAndSaveCheckinQR(registrationId, event, true);
          if (!qrCode) throw new Error("QR-Code fehlt; Bestätigung wird erneut versucht.");
          message = await createCheckoutEmail(`Anmeldung bestätigt – ${event.title}`, registration.email,
            RegistrationApprovedEmail({ firstName: registration.first_name, eventTitle: event.title,
              eventDate, eventTime: event.time, eventLocation: event.location, statusUrl, qrCode }));
        } else {
          const adminEmail = process.env.ADMIN_EMAIL ?? "";
          if (notice.kind === "payment_failed") {
            const prices = await getCheckoutPricing(notice.session_id, registrationId);
            message = await createCheckoutEmail(`SEPA-Einzug fehlgeschlagen – ${event.title}`, adminEmail,
              PaymentFailedAdminEmail({ eventTitle: event.title, participantEmail: registration.email ?? "",
                amountLabel: notice.data.amount != null ? formatEuro(notice.data.amount)
                  : prices ? formatEuro(personPricesTotal(prices) / 100) : "siehe Stripe",
                reason: notice.data.reason ?? "Stripe meldet einen fehlgeschlagenen Einzug.", adminUrl,
                stripeUrl: stripePaymentUrl(notice.data.paymentIntentId ?? null) }));
          } else {
            message = await createCheckoutEmail(`Erstattung fällig – ${event.title}`, adminEmail,
              RefundDueAdminEmail({ eventTitle: event.title, eventDate, participantEmail: registration.email ?? "",
                personNames: notice.data.personNames ?? [], amountLabel: formatEuro(notice.data.amount ?? 0),
                remainingPersons: registration.person_count, stripeUrl: stripePaymentUrl(registration.stripe_payment_intent_id),
                statusUrl, adminUrl, paymentArrivedAfterCancellation: true }));
          }
        }
        prepared = await prepareCheckoutMessage(notice.id, message);
      }
      if (prepared.sent_at) continue;
      // Ein unbekannter Versandausgang nach Ablauf des Provider-Fensters darf keine zweite Mail erzeugen.
      if (!prepared.first_attempt_at || Date.now() - new Date(prepared.first_attempt_at).getTime() >= 23 * 60 * 60 * 1000) {
        throw new Error("Checkout-Mail: Versandstatus muss im Adminbereich geprüft werden; Idempotenzfenster abgelaufen.");
      }
      if (!prepared.message) throw new Error("Checkout-Mailinhalt fehlt.");
      await sendCheckoutEmail(prepared.message, notice.id);
      await markCheckoutNotificationSent(notice.id);
    } catch (error) {
      // Ein gestörter Teilnehmer-Versand darf die Admin-Meldung nicht verhindern.
      errors.push(error);
    }
  }
  if (errors.length) throw errors[0];
}

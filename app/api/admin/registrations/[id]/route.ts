import { deleteRegistration, getRefundDue, getRegistrationDetail, getCheckoutAdminNotices, getRegistrationEventId, isEventFull } from "@/lib/db";
import { stripePaymentUrl } from "@/lib/stripe";
import { onCapacityChanged } from "@/lib/waitlist";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const registration = await getRegistrationDetail(Number(id));
    if (!registration) {
      return NextResponse.json({ error: "Anmeldung nicht gefunden." }, { status: 404 });
    }
    const refundDue = await getRefundDue(Number(id));
    const notices = await getCheckoutAdminNotices(Number(id));
    return NextResponse.json({
      ...registration,
      stripe_dashboard_url: stripePaymentUrl(registration.stripe_payment_intent_id),
      refund_due: refundDue.amount > 0 ? refundDue : null,
      checkout_notices: notices.map(notice => ({ ...notice,
        stripe_url: stripePaymentUrl(notice.payment_intent_id as string | null) })),
    });
  } catch (error) {
    console.error("Fehler beim Laden der Anmeldung:", error);
    return NextResponse.json({ error: "Anmeldung konnte nicht geladen werden." }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // Löschen einer bestätigten Anmeldung kann einen Platz freimachen.
    const eventId = await getRegistrationEventId(Number(id));
    const wasFull = eventId ? await isEventFull(eventId) : false;
    await deleteRegistration(Number(id));
    if (eventId) await onCapacityChanged(eventId, wasFull);
    return NextResponse.json({ message: "Anmeldung gelöscht!" });
  } catch (error) {
    console.error("Fehler beim Löschen der Anmeldung:", error);
    return NextResponse.json({ error: "Anmeldung konnte nicht gelöscht werden." }, { status: 500 });
  }
}

import { getSQL, isPostgresConfigured } from "./utils";
import { withRegistrationLock } from "./registration-lock";

export type CheckoutPaymentState = "open" | "processing" | "paid" | "failed" | "checking";
export interface SavedCheckout {
  session_id: string;
  payment_state: CheckoutPaymentState;
  person_prices: import("../payment-prices").PersonPrices | null;
}

export async function getRegistrationCheckouts(registrationId: number): Promise<SavedCheckout[]> {
  if (!isPostgresConfigured()) return [];
  const sql = getSQL();
  return await sql`SELECT session_id, payment_state, person_prices FROM checkout_pricing
    WHERE registration_id = ${registrationId} ORDER BY created_at DESC, session_id` as SavedCheckout[];
}
export interface CheckoutMessage {
  from: string;
  to: string;
  subject: string;
  html: string;
}
export interface CheckoutNotification {
  id: string;
  registration_id: number;
  session_id: string;
  kind: "approval" | "payment_failed" | "refund_due";
  data: { reason?: string; amount?: number; personNames?: string[]; paymentIntentId?: string | null };
  message: CheckoutMessage | null;
  first_attempt_at: string | null;
  sent_at: string | null;
}

/** Erfolgreiche Zahlungen bleiben endgültig; verspätetes processing überschreibt keinen Fehlschlag. */
export async function recordCheckoutState(
  sessionId: string, registrationId: number, state: Exclude<CheckoutPaymentState, "open">,
  paymentIntentId: string | null,
): Promise<CheckoutPaymentState> {
  return withRegistrationLock(registrationId, async (sql) => {
    const rows = await sql`
    INSERT INTO checkout_pricing (session_id, registration_id, person_prices, payment_state, payment_intent_id)
    VALUES (${sessionId}, ${registrationId}, NULL, ${state}, ${paymentIntentId})
    ON CONFLICT (session_id) DO UPDATE SET
      payment_state = CASE
        WHEN checkout_pricing.payment_state = 'paid' THEN 'paid'
        WHEN checkout_pricing.payment_state = 'failed' AND EXCLUDED.payment_state = 'processing' THEN 'failed'
        ELSE EXCLUDED.payment_state END,
      payment_intent_id = COALESCE(checkout_pricing.payment_intent_id, EXCLUDED.payment_intent_id)
    WHERE checkout_pricing.registration_id = EXCLUDED.registration_id
    RETURNING payment_state
  `;
    if (!rows[0]) throw new Error("Checkout gehört zu einer anderen Anmeldung.");
    return (rows[0] as { payment_state: CheckoutPaymentState }).payment_state;
  });
}

/** Statuswechsel und Versandauftrag sind eine atomare Operation. Manuelle Bestätigungen bleiben erhalten. */
export async function approveCheckoutRegistration(registrationId: number, sessionId: string) {
  const sql = getSQL();
  await sql`
    WITH approved AS (
      UPDATE registrations SET status = 'approved', status_changed_at = NOW()
      WHERE id = ${registrationId} AND status = 'pending' AND NOT is_waitlist
        AND EXISTS (SELECT 1 FROM checkout_pricing cp WHERE cp.session_id = ${sessionId}
          AND cp.registration_id = registrations.id AND cp.payment_state IN ('processing', 'paid'))
      RETURNING id, status_token
    )
    INSERT INTO checkout_notifications (id, registration_id, session_id, kind)
    SELECT 'checkout-approval/' || id || '/' || status_token, id, ${sessionId}, 'approval' FROM approved
    ON CONFLICT (id) DO NOTHING
  `;
}

export async function queueCheckoutFailure(registrationId: number, sessionId: string, reason: string, amount: number, paymentIntentId: string | null) {
  const sql = getSQL();
  await sql`
    INSERT INTO checkout_notifications (id, registration_id, session_id, kind, data)
    SELECT ${`checkout-failed/${sessionId}`}, ${registrationId}, ${sessionId}, 'payment_failed',
      ${JSON.stringify({ reason, amount, paymentIntentId })}::jsonb
    FROM checkout_pricing WHERE session_id = ${sessionId} AND registration_id = ${registrationId}
      AND payment_state = 'failed'
    ON CONFLICT (id) DO NOTHING
  `;
}

/** Erstattungsbetrag und Admin-Auftrag gemeinsam sichern, bevor ein Webhook erneut eintreffen kann. */
export async function queueCheckoutRefund(
  registrationId: number, sessionId: string,
  shares: Array<{ personId: string; amount: number; name: string }>,
) {
  if (!shares.length) return;
  const sql = getSQL();
  await sql`
    WITH shares AS (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(shares)}::jsonb)
        AS x("personId" TEXT, amount NUMERIC, name TEXT)
    ), claimed AS (
      UPDATE registration_persons rp SET refund_announced_at = NOW(), refund_amount = shares.amount
      FROM shares WHERE rp.id = shares."personId"::uuid AND rp.registration_id = ${registrationId}
        AND rp.cancelled_at IS NOT NULL AND rp.refund_announced_at IS NULL
      RETURNING shares.amount, shares.name
    )
    INSERT INTO checkout_notifications (id, registration_id, session_id, kind, data)
    SELECT ${`checkout-refund/${sessionId}`}, ${registrationId}, ${sessionId}, 'refund_due',
      jsonb_build_object('amount', SUM(amount), 'personNames', jsonb_agg(name ORDER BY name))
    FROM claimed HAVING SUM(amount) > 0
    ON CONFLICT (id) DO NOTHING
  `;
}

export async function getCheckoutNotifications(registrationId: number): Promise<CheckoutNotification[]> {
  if (!isPostgresConfigured()) return [];
  const sql = getSQL();
  return await sql`SELECT * FROM checkout_notifications
    WHERE registration_id = ${registrationId} AND sent_at IS NULL AND cancelled_at IS NULL ORDER BY created_at, id` as CheckoutNotification[];
}

export async function cancelCheckoutNotification(id: string) {
  const sql = getSQL();
  await sql`UPDATE checkout_notifications SET cancelled_at = COALESCE(cancelled_at, NOW()) WHERE id = ${id} AND sent_at IS NULL`;
}

/** Parallele Zusteller verwenden denselben eingefrorenen Inhalt und denselben Provider-Schlüssel. */
export async function prepareCheckoutMessage(id: string, message: CheckoutMessage): Promise<CheckoutNotification> {
  const sql = getSQL();
  const rows = await sql`UPDATE checkout_notifications
    SET message = COALESCE(message, ${JSON.stringify(message)}::jsonb),
        first_attempt_at = COALESCE(first_attempt_at, NOW())
    WHERE id = ${id} RETURNING *`;
  if (!rows[0]) throw new Error("Versandauftrag fehlt.");
  return rows[0] as CheckoutNotification;
}

export async function markCheckoutNotificationSent(id: string) {
  const sql = getSQL();
  await sql`UPDATE checkout_notifications SET sent_at = COALESCE(sent_at, NOW()) WHERE id = ${id}`;
}

export async function getCheckoutAdminNotices(registrationId: number) {
  if (!isPostgresConfigured()) return [];
  const sql = getSQL();
  return await sql`
    SELECT n.kind, n.data, n.created_at, n.sent_at,
      (n.first_attempt_at < NOW() - INTERVAL '23 hours' AND n.sent_at IS NULL) AS delivery_uncertain,
      cp.payment_intent_id, cp.payment_state
    FROM checkout_notifications n
    LEFT JOIN checkout_pricing cp ON cp.session_id = n.session_id
    WHERE n.registration_id = ${registrationId}
      AND n.cancelled_at IS NULL
      AND (n.kind = 'payment_failed' OR (n.sent_at IS NULL AND n.first_attempt_at < NOW() - INTERVAL '23 hours'))
    ORDER BY n.created_at DESC
  `;
}
